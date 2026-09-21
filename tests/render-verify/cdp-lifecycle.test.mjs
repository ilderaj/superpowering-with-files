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
  const page = new CdpPage({ on() { return () => {}; }, async send() { return { errorText: 'failed' }; } }, 'test', 'test');
  await assert.rejects(page.navigate('http://localhost', 5), /Navigation failed/);
  await new Promise((resolve) => setTimeout(resolve, 20));
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
