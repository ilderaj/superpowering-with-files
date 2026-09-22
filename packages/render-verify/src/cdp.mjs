import { access, mkdtemp, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export class RenderVerifyEnvironmentError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'RenderVerifyEnvironmentError';
    this.code = 'ERR_RENDER_VERIFY_ENVIRONMENT';
  }
}

export class RenderVerifyTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RenderVerifyTimeoutError';
    this.code = 'ERR_RENDER_VERIFY_TIMEOUT';
  }
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new RenderVerifyTimeoutError(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function findChrome() {
  const candidates = process.env.RENDER_VERIFY_CHROME
    ? [process.env.RENDER_VERIFY_CHROME]
    : [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/opt/google/chrome/google-chrome',
      ];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  throw new RenderVerifyEnvironmentError(`Chrome executable is unavailable; checked ${candidates.join(', ')}`);
}

function killProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }, 500).unref();
}

async function waitForExit(child, timeoutMs = 2500) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}

async function removeUserDataDir(userDataDir) {
  try {
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  } catch {}
}

async function waitForEndpoint(child, timeoutMs) {
  let output = '';
  let settled = false;
  let resolveEndpoint;
  let rejectEndpoint;
  const promise = new Promise((resolve, reject) => { resolveEndpoint = resolve; rejectEndpoint = reject; });
  const consume = (chunk) => {
    output += chunk.toString();
    const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (!settled && match) { settled = true; resolveEndpoint(match[1]); }
  };
  const onExit = (code, signal) => {
    if (!settled) { settled = true; rejectEndpoint(new RenderVerifyEnvironmentError(`Chrome exited before CDP became available (code=${code}, signal=${signal})`)); }
  };
  child.stdout?.on('data', consume);
  child.stderr?.on('data', consume);
  const onError = (error) => rejectEndpoint(new RenderVerifyEnvironmentError('Chrome failed to start', error));
  child.once('error', onError);
  child.once('exit', onExit);
  try {
    return await withTimeout(promise, timeoutMs, 'Timed out waiting for Chrome DevTools endpoint');
  } catch (error) {
    if (error.code === 'ERR_RENDER_VERIFY_TIMEOUT') {
      throw new RenderVerifyEnvironmentError(`${error.message}; Chrome output: ${output.slice(-1000)}`);
    }
    throw error;
  } finally {
    child.stdout?.off('data', consume);
    child.stderr?.off('data', consume);
    child.off('exit', onExit);
    child.off('error', onError);
  }
}

export class CdpConnection {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.socket = null;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect(timeoutMs) {
    if (typeof WebSocket !== 'function') throw new RenderVerifyEnvironmentError('Node global WebSocket is unavailable; Node 22 or newer is required');
    const socket = new WebSocket(this.endpoint);
    this.socket = socket;
    try { await withTimeout(new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new RenderVerifyEnvironmentError('CDP WebSocket failed to open')), { once: true });
    }), timeoutMs, 'Timed out opening the CDP WebSocket'); } catch (error) { this.close(); throw error; }
    socket.addEventListener('message', (event) => void this.#message(event.data).catch((error) => {
      for (const { reject } of this.pending.values()) reject(error);
      this.pending.clear();
      this.close();
    }));
    socket.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new RenderVerifyEnvironmentError('CDP WebSocket closed'));
      this.pending.clear();
    });
    return this;
  }

  async #message(raw) {
    const text = typeof raw === 'string' ? raw : await raw.text();
    const message = JSON.parse(text);
    const key = `${message.sessionId ?? ''}:${message.method ?? ''}`;
    for (const listener of this.listeners.get(key) ?? []) listener(message.params);
    if (!message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(`CDP ${message.error.code}: ${message.error.message}`));
    else pending.resolve(message.result ?? {});
  }

  on(method, listener, sessionId = '') {
    const key = `${sessionId}:${method}`;
    const listeners = this.listeners.get(key) ?? [];
    listeners.push(listener);
    this.listeners.set(key, listeners);
    return () => this.listeners.set(key, (this.listeners.get(key) ?? []).filter((item) => item !== listener));
  }

  send(method, params = {}, sessionId, timeoutMs = 10000) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new RenderVerifyEnvironmentError('CDP WebSocket is not open'));
    const id = ++this.nextId;
    return withTimeout(new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
      catch (error) { reject(error); }
    }), timeoutMs, `CDP command ${method} timed out`).finally(() => this.pending.delete(id));
  }

  close() {
    try { this.socket?.close(); } catch {}
  }
}

export class CdpPage {
  constructor(connection, sessionId, targetId) {
    this.connection = connection;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.pageErrors = [];
    this.mainDocumentResponse = null;
    this.mainFrameId = null;
    this.connection.on('Runtime.exceptionThrown', (params) => {
      const details = params?.exceptionDetails ?? {};
      const description = details.exception?.description ?? details.text ?? 'uncaught page exception';
      this.pageErrors.push({ description, url: details.url ?? null, lineNumber: details.lineNumber ?? null });
    }, sessionId);
    this.connection.on('Network.responseReceived', (params) => {
      if (params?.type === 'Document' && params.frameId === this.mainFrameId) this.mainDocumentResponse = { status: params.response?.status ?? null, url: params.response?.url ?? null };
    }, sessionId);
  }

  send(method, params = {}) { return this.connection.send(method, params, this.sessionId); }

  waitForEvent(method, timeoutMs = 10000, predicate = () => true) {
    let unsubscribe;
    return withTimeout(new Promise((resolve) => {
      unsubscribe = this.connection.on(method, (params) => {
        if (predicate(params)) resolve(params);
      }, this.sessionId);
    }), timeoutMs, `Timed out waiting for CDP event ${method}`).finally(() => unsubscribe?.());
  }

  async navigate(url, timeoutMs = 15000) {
    this.mainDocumentResponse = null;
    const frameTree = await this.send('Page.getFrameTree');
    this.mainFrameId = frameTree.frameTree?.frame?.id ?? null;
    // Observe both promises immediately: the load event may time out before
    // the navigation response arrives, or navigation may fail before load.
    const loaded = this.waitForEvent('Page.loadEventFired', timeoutMs);
    const navigated = withTimeout(this.send('Page.navigate', { url }), timeoutMs, 'Navigation command timed out').then((result) => {
      if (result.errorText) throw new Error(`Navigation failed: ${result.errorText}`);
      return result;
    });
    await Promise.all([loaded, navigated]);
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false,
      screenWidth: width, screenHeight: height,
    });
  }

  evaluate(expression, timeoutMs = 10000) {
    return withTimeout(this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }), timeoutMs, 'Timed out evaluating page measurement').then((result) => {
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Page evaluation failed');
      return result.result?.value;
    });
  }

  async terminateExecution() {
    try { await this.connection.send('Runtime.terminateExecution', {}, this.sessionId, 500); } catch {}
  }

  async screenshot(outputPath) {
    const result = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(outputPath, Buffer.from(result.data, 'base64'));
  }
}

export async function launchChrome({ chromePath, timeoutMs = 10000 } = {}) {
  const executable = chromePath ?? await findChrome();
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'swf-render-verify-chrome-'));
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-renderer-backgrounding', '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank',
  ];
  let child;
  try {
    child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const endpoint = await waitForEndpoint(child, timeoutMs);
    const connection = await new CdpConnection(endpoint).connect(timeoutMs);
    const browser = {
      connection,
      child,
      userDataDir,
      async newPage() {
        const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true });
        const page = new CdpPage(connection, sessionId, targetId);
        await page.send('Page.enable');
        await page.send('Network.enable');
        await page.send('Runtime.enable');
        await page.send('Log.enable').catch(() => {});
        return page;
      },
      async close(page) {
        try { if (page) await connection.send('Target.closeTarget', { targetId: page.targetId }, undefined, 500); } catch {}
        try { await connection.send('Browser.close', {}, undefined, 500); } catch {}
        connection.close();
        killProcess(child);
        await waitForExit(child);
        killProcess(child);
        await waitForExit(child, 750);
        await removeUserDataDir(userDataDir);
      },
    };
    return browser;
  } catch (error) {
    if (child) killProcess(child);
    if (child) await waitForExit(child);
    await removeUserDataDir(userDataDir);
    if (error.code === 'ENOENT') throw new RenderVerifyEnvironmentError(`Unable to start Chrome: ${executable}`, error);
    throw error;
  }
}
