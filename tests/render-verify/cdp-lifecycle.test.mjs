import test from 'node:test';
import assert from 'node:assert/strict';
import { CdpPage, CdpConnection } from '../../packages/render-verify/src/cdp.mjs';

test('navigation timeout is caught while the navigation command is still pending', async () => {
  let removed = 0;
  const connection = {
    on(method) { return () => { if (method === 'Page.loadEventFired') removed++; }; },
    send() { return new Promise((resolve) => setTimeout(() => resolve({}), 40)); },
  };
  const page = new CdpPage(connection, 'test', 'test');
  await assert.rejects(page.navigate('http://localhost', 5), { code: 'ERR_RENDER_VERIFY_TIMEOUT' });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(removed, 1);
});

test('failed navigation does not leave an unhandled load-event timeout', async () => {
  const page = new CdpPage({ on() { return () => {}; }, async send(method) { return method === 'Page.getFrameTree' ? { frameTree: { frame: { id: 'main' } } } : { errorText: 'failed' }; } }, 'test', 'test');
  await assert.rejects(page.navigate('http://localhost', 5), /Navigation failed/);
  await new Promise((resolve) => setTimeout(resolve, 20));
});

test('navigation response capture ignores iframe documents and keeps the main-frame final redirect response', async () => {
  const listeners = new Map();
  const connection = {
    on(method, listener) { listeners.set(method, listener); return () => listeners.delete(method); },
    async send(method) {
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main' } } };
      if (method === 'Page.navigate') {
        listeners.get('Network.responseReceived')({ type: 'Document', frameId: 'iframe', response: { status: 404, url: 'http://target/frame' } });
        listeners.get('Network.responseReceived')({ type: 'Document', frameId: 'main', response: { status: 302, url: 'http://target/start' } });
        listeners.get('Network.responseReceived')({ type: 'Document', frameId: 'main', response: { status: 200, url: 'http://target/final' } });
        listeners.get('Page.loadEventFired')({});
        return {};
      }
      return {};
    },
  };
  const page = new CdpPage(connection, 'test', 'test');
  await page.navigate('http://target/start', 50);
  assert.deepEqual(page.mainDocumentResponse, { status: 200, url: 'http://target/final' });
});

test('navigation response capture resets before a subsequent navigation', async () => {
  const listeners = new Map();
  let navigation = 0;
  const connection = {
    on(method, listener) { listeners.set(method, listener); return () => listeners.delete(method); },
    async send(method) {
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main' } } };
      if (method === 'Page.navigate') {
        navigation += 1;
        if (navigation === 1) listeners.get('Network.responseReceived')({ type: 'Document', frameId: 'main', response: { status: 500, url: 'http://target/first' } });
        listeners.get('Page.loadEventFired')({});
        return {};
      }
      return {};
    },
  };
  const page = new CdpPage(connection, 'test', 'test');
  await page.navigate('http://target/first', 50);
  assert.equal(page.mainDocumentResponse.status, 500);
  await page.navigate('http://target/second', 50);
  assert.equal(page.mainDocumentResponse, null);
});

// A responsive WebSocket can still leave a command unanswered.
test('unanswered CDP commands time out and remove their pending request', async () => {
  const connection = new CdpConnection('ws://unused');
  connection.socket = { readyState: WebSocket.OPEN, send() {} };
  await assert.rejects(connection.send('Runtime.evaluate', {}, undefined, 5), { code: 'ERR_RENDER_VERIFY_TIMEOUT' });
  assert.equal(connection.pending.size, 0);
});

test('synchronous socket send failure removes its pending request', async () => {
  const connection = new CdpConnection('ws://unused');
  connection.socket = { readyState: WebSocket.OPEN, send() { throw new Error('closed'); } };
  await assert.rejects(connection.send('Page.enable'), /closed/);
  assert.equal(connection.pending.size, 0);
});
