import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { access, chmod, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { fileURLToPath } from 'node:url';

import { startStaticServer } from '../../packages/render-verify/src/static-server.mjs';

const candidateRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const cli = join(candidateRoot, 'packages/render-verify/bin/render-verify.mjs');
const fixtureRoot = join(candidateRoot, 'tests/fixtures/render-verify');
const chromeCandidates = process.env.RENDER_VERIFY_CHROME
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

let chromePath;
for (const candidate of chromeCandidates) {
  try { await access(candidate, constants.X_OK); chromePath = candidate; break; } catch {}
}

const browserOptions = chromePath
  ? { env: { ...process.env, RENDER_VERIFY_CHROME: chromePath } }
  : process.env.RENDER_VERIFY_REQUIRED === '1'
    ? {}
    : { skip: 'Chrome executable is unavailable; browser checks are skipped.' };
const temporaryRoots = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

function runCli(args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: candidateRoot,
      env: { ...process.env, RENDER_VERIFY_CHROME: chromePath ?? '/definitely/missing/chrome', ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    // A backstop above the CLI's own budgets (a cold browser launch plus the
    // settle wait), so a hung CLI reports its own diagnostic before this fires.
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`CLI exceeded test deadline: ${args.join(' ')}`));
    }, 45000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => { clearTimeout(timer); resolvePromise({ code, signal, stdout, stderr }); });
  });
}

async function writeSpec(root, fixtureName, check) {
  const specPath = join(root, `${fixtureName}.json`);
  await writeFile(specPath, JSON.stringify({
    fixture: fixtureName,
    state: 'default',
    viewport: { width: 800, height: 600 },
    settleTimeoutMs: 3000,
    coverage: { page: fixtureName, states: ['default'], unverified: ['other viewports', 'interaction flows'] },
    checks: [check],
  }, null, 2));
  return specPath;
}

const cases = [
  ['centered-pass.html', { invariant: 'centered', selector: '#target', parentSelector: 'body' }],
  ['centered-fail.html', { invariant: 'centered', selector: '#target', parentSelector: 'body' }],
  ['leading-flush-pass.html', { invariant: 'leading-flush', selector: '#target', parentSelector: 'body' }],
  ['leading-flush-fail.html', { invariant: 'leading-flush', selector: '#target', parentSelector: 'body' }],
  ['equal-to-probe-pass.html', { invariant: 'equal-to-probe', selector: '#target', property: 'margin-top', probe: '--expected-gap' }],
  ['equal-to-probe-fail.html', { invariant: 'equal-to-probe', selector: '#target', property: 'margin-top', probe: '--expected-gap' }],
  ['no-overflow-pass.html', { invariant: 'no-horizontal-overflow', selector: 'body' }],
  ['no-overflow-fail.html', { invariant: 'no-horizontal-overflow', selector: 'body' }],
  ['no-clip-pass.html', { invariant: 'no-clip', selector: '#copy', textSelector: '#copy' }],
  ['no-clip-fail.html', { invariant: 'no-clip', selector: '#copy', textSelector: '#copy' }],
  ['no-clip-visible-overflow-pass.html', { invariant: 'no-clip', selector: '#copy', textSelector: '#copy' }],
  ['single-layer-pass.html', { invariant: 'single-layer', selector: '#target', property: 'margin-top', ownership: { ownerLayer: 'base', owners: [{ layer: 'base', selector: '.layer-base' }], candidates: [{ layer: 'base', selector: '.layer-base' }, { layer: 'theme', selector: '.layer-theme' }] } }],
  ['single-layer-fail.html', { invariant: 'single-layer', selector: '#target', property: 'margin-top', ownership: { ownerLayer: null, owners: [{ layer: 'base', selector: '.layer-base' }, { layer: 'theme', selector: '.layer-theme' }], candidates: [{ layer: 'base', selector: '.layer-base' }, { layer: 'theme', selector: '.layer-theme' }] } }],
  ['min-size-pass.html', { invariant: 'min-size', selector: '#target', minWidth: 44, minHeight: 44 }],
  ['min-size-fail.html', { invariant: 'min-size', selector: '#target', minWidth: 44, minHeight: 44 }],
  ['rule-present-pass.html', { invariant: 'rule-present', pattern: '\\.required-rule\\s*\\{' }],
  ['rule-present-fail.html', { invariant: 'rule-present', pattern: '\\.required-rule\\s*\\{' }],
  ['no-page-errors-pass.html', { invariant: 'no-page-errors' }],
  ['no-page-errors-fail.html', { invariant: 'no-page-errors' }],
];

for (const [fixtureName, check] of cases) {
  const expectedPass = fixtureName.endsWith('-pass.html');
  test(`browser ${check.invariant} ${expectedPass ? 'PASS' : 'FAIL'} fixture`, browserOptions, async () => {
    const outputRoot = await mkdtemp('/tmp/swf-render-verify-test-');
    temporaryRoots.push(outputRoot);
    const specPath = await writeSpec(outputRoot, fixtureName, check);
    const outputPath = join(outputRoot, 'report.json');
    const result = await runCli(['--spec', specPath, '--file', join(fixtureRoot, fixtureName), '--viewport', '800x600', '--json', '--out', outputPath]);
    assert.equal(result.code, expectedPass ? 0 : 2, result.stderr || result.stdout);
    const report = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(report.status, expectedPass ? 'passed' : 'failed');
    assert.equal(report.results.length, 1);
    const record = report.results[0];
    assert.equal(record.invariant, check.invariant);
    assert.equal(record.passed, expectedPass);
    assert.ok('selector' in record);
    assert.ok('measured' in record);
    assert.ok('expected' in record);
    assert.equal(record.unit, 'CSS px');
    assert.equal(record.viewport, '800x600');
    assert.match(report.coverage.page, new RegExp(fixtureName.replace('.', '\\.' )));
    assert.deepEqual(report.coverage.unverified, ['other viewports', 'interaction flows']);
    assert.match(result.stdout, /"status"\s*:/);
  });
}

test('no-clip accepts visible overflow while hidden overflow still fails', browserOptions, async () => {
  const outputRoot = await mkdtemp('/tmp/swf-render-verify-visible-overflow-');
  temporaryRoots.push(outputRoot);
  const specPath = await writeSpec(outputRoot, 'no-clip-visible-overflow-pass.html', { invariant: 'no-clip', selector: '#copy', textSelector: '#copy' });
  const result = await runCli(['--spec', specPath, '--file', join(fixtureRoot, 'no-clip-visible-overflow-pass.html'), '--json']);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).status, 'passed');
});

test('shared element selectors retain each check text selector', browserOptions, async () => {
  const outputRoot = await mkdtemp('/tmp/swf-render-verify-text-selectors-');
  temporaryRoots.push(outputRoot);
  const specPath = join(outputRoot, 'text-selectors.json');
  await writeFile(specPath, JSON.stringify({
    file: join(fixtureRoot, 'no-page-errors-pass.html'),
    viewport: { width: 800, height: 600 },
    checks: [
      { invariant: 'no-clip', selector: '#target', textSelector: '#visible' },
      { invariant: 'no-clip', selector: '#target', textSelector: '#clipped' },
    ],
  }));
  const result = await runCli(['--spec', specPath, '--file', join(fixtureRoot, 'shared-text-selectors.html'), '--json']);
  assert.equal(result.code, 2, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.results.map((item) => item.passed), [true, false]);
});

test('HTTP error targets fail closed', browserOptions, async () => {
  const server = await startStaticServer(fixtureRoot);
  try {
    const result = await runCli(['--url', `${server.url}/does-not-exist.html`, '--json']);
    assert.equal(result.code, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'failed');
    assert.equal(report.error, undefined);
    assert.match(report.results[0].message, /HTTP|status|target/i);
  } finally {
    await server.close();
  }
});

test('explicit URL overrides the file declared by a spec', browserOptions, async () => {
  const outputRoot = await mkdtemp('/tmp/swf-render-verify-url-override-');
  temporaryRoots.push(outputRoot);
  const specPath = join(outputRoot, 'url-override.json');
  await writeFile(specPath, JSON.stringify({
    file: join(fixtureRoot, 'no-page-errors-pass.html'),
    viewport: { width: 800, height: 600 },
    checks: [{ invariant: 'no-page-errors' }],
  }));
  const server = await startStaticServer(fixtureRoot);
  try {
    const result = await runCli([
      '--spec', specPath,
      '--url', `${server.url}/no-page-errors-fail.html`,
      '--json',
    ]);
    assert.equal(result.code, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.target.url, `${server.url}/no-page-errors-fail.html`);
    assert.equal(report.target.file, undefined);
  } finally {
    await server.close();
  }
});

test('launch timeout is an independent knob and fails closed as environment-limited', browserOptions, async () => {
  const outputRoot = await mkdtemp('/tmp/swf-render-verify-launch-');
  temporaryRoots.push(outputRoot);
  const specPath = await writeSpec(outputRoot, 'centered-pass.html', { invariant: 'no-page-errors' });
  const result = await runCli(['--spec', specPath, '--file', join(fixtureRoot, 'centered-pass.html'), '--launch-timeout', '1', '--json']);
  assert.equal(result.code, 3, result.stderr || result.stdout);
  assert.match(result.stdout, /ERR_RENDER_VERIFY_ENVIRONMENT/);
});

test('static server rejects traversal and symlink escape', async () => {
  const root = await mkdtemp('/tmp/swf-render-verify-server-');
  temporaryRoots.push(root);
  await writeFile(join(root, 'index.html'), 'ok');
  const outside = await mkdtemp('/tmp/swf-render-verify-outside-');
  temporaryRoots.push(outside);
  await writeFile(join(outside, 'secret.txt'), 'secret');
  await symlink(join(outside, 'secret.txt'), join(root, 'link.txt'));
  const server = await startStaticServer(root);
  try {
    assert.equal((await fetch(`${server.url}/`)).status, 200);
    const rawRequest = (requestPath) => new Promise((resolvePromise, reject) => {
      const parsed = new URL(server.url);
      const request = httpRequest({ hostname: parsed.hostname, port: parsed.port, path: requestPath, method: 'GET' }, (response) => {
        response.resume();
        response.once('end', () => resolvePromise(response.statusCode));
      });
      request.once('error', reject);
      request.end();
    });
    assert.equal(await rawRequest('/../secret.txt'), 403);
    assert.equal(await rawRequest('/%2e%2e/secret.txt'), 403);
    assert.equal((await fetch(`${server.url}/link.txt`)).status, 403);
  } finally {
    await server.close();
  }
});

test('missing Chrome is an explicit environment-limited exit 3', async () => {
  const result = await runCli(['--file', join(fixtureRoot, 'no-page-errors-pass.html'), '--json'], { env: { RENDER_VERIFY_CHROME: '/definitely/missing/chrome' } });
  assert.equal(result.code, 3);
  assert.match(result.stdout, /environment|chrome/i);
  assert.doesNotMatch(result.stdout, /"status"\s*:\s*"passed"/);
});

test('settle records fonts and image readiness and --shot writes a PNG', browserOptions, async () => {
  const outputRoot = await mkdtemp('/tmp/swf-render-verify-settle-');
  temporaryRoots.push(outputRoot);
  const specPath = await writeSpec(outputRoot, 'settle-pass.html', { invariant: 'no-page-errors' });
  const reportPath = join(outputRoot, 'report.json');
  const shotPath = join(outputRoot, 'shot.png');
  const result = await runCli(['--spec', specPath, '--file', join(fixtureRoot, 'settle-pass.html'), '--json', '--out', reportPath, '--shot', shotPath]);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.settle.fonts, 'loaded');
  assert.equal(report.settle.images, 1);
  assert.deepEqual((await readFile(shotPath)).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
});

test('settle timeout is bounded and returns environment-limited exit 3', browserOptions, async () => {
  const outputRoot = await mkdtemp('/tmp/swf-render-verify-timeout-');
  temporaryRoots.push(outputRoot);
  const specPath = await writeSpec(outputRoot, 'settle-timeout.html', { invariant: 'no-page-errors' });
  const started = Date.now();
  const result = await runCli(['--spec', specPath, '--file', join(fixtureRoot, 'settle-timeout.html'), '--timeout', '100', '--json']);
  assert.equal(result.code, 3);
  assert.match(result.stdout, /settle|timeout/i);
  assert.ok(Date.now() - started < 10000, 'settle timeout must be bounded');
});

test('combined checks retain one selector measurement for multiple invariants', browserOptions, async () => {
  const outputRoot = await mkdtemp('/tmp/swf-render-verify-combined-');
  temporaryRoots.push(outputRoot);
  const specPath = join(outputRoot, 'combined.json');
  await writeFile(specPath, JSON.stringify({
    page: 'combined-selector.html', state: 'default', viewport: { width: 800, height: 600 },
    checks: [
      { invariant: 'centered', selector: '#target', parentSelector: 'body' },
      { invariant: 'min-size', selector: '#target', minWidth: 44, minHeight: 44 },
    ],
  }));
  const reportPath = join(outputRoot, 'report.json');
  const result = await runCli(['--spec', specPath, '--file', join(fixtureRoot, 'combined-selector.html'), '--viewport', '800x600', '--json', '--out', reportPath]);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.results.length, 2);
  assert.ok(report.results.every((record) => record.passed));
  assert.equal(Object.keys(report.measurement.elements).length, 2);
});

test('malformed explicit checks fail closed instead of defaulting to no-page-errors', async () => {
  const outputRoot = await mkdtemp('/tmp/swf-render-verify-invalid-spec-');
  temporaryRoots.push(outputRoot);
  const specPath = join(outputRoot, 'invalid.json');
  await writeFile(specPath, JSON.stringify({ file: join(fixtureRoot, 'no-page-errors-pass.html'), checks: [] }));
  const result = await runCli(['--spec', specPath, '--json']);
  assert.equal(result.code, 3);
  assert.match(result.stdout, /checks must be a non-empty array/i);
  assert.doesNotMatch(result.stdout, /"status"\s*:\s*"passed"/);
});
