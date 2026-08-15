// Slice 1 gate smoke: minimal mock cordis ctx + apply(ctx) + one bounded task.
// Covers auto-detect trigger, transparent passthrough, packet/evidence write,
// and the three-state evidence flow (unknown -> host-claimed -> human accept).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { evidenceRecord } from '../src/core/index.js';
import { apply } from '../src/index.js';
import { writeEvidence } from '../src/packet.js';
import {
  makeMockCtx,
  makePacketInputFor,
  makeSession,
  makeTrioProject,
  runCommand,
  withTmpRoot
} from './helpers.js';

describe('Slice 1 smoke (apply on a minimal mock cordis ctx)', () => {
  it('apply(ctx) runs without throwing on the minimal mock service surface', () => {
    const harness = makeMockCtx();
    expect(() => apply(harness.ctx)).not.toThrow();
    expect(harness.commands.has('swf')).toBe(true);
  });

  it('full bounded flow: detect -> bind -> status -> accept, with passthrough untouched', async () => {
    await withTmpRoot(async (root) => {
      const harness = makeMockCtx({ approvalOutcome: 'allowed-once' });
      apply(harness.ctx);

      // A bounded SWF project (planning trio under planning/active/smoke-task/).
      const swfDir = join(root, 'swf-project');
      await makeTrioProject(swfDir, 'smoke-task');
      const swfSession = makeSession('swf-session', swfDir);
      const plainSession = makeSession('plain-session', join(root, 'plain-project'));
      await harness.emit('session/created', swfSession);
      await harness.emit('session/created', plainSession);

      // 1. bind a valid packet (8-field core shape) against the on-disk trio.
      const input = await makePacketInputFor(swfDir, 'smoke-task');
      const bind = await runCommand(harness.commands, 'bind smoke-task ' + JSON.stringify(input));
      expect(bind.kind).toBe('success');
      const bound = JSON.parse((bind as { text: string }).text);
      expect(bound.status).toBe('bound');
      expect(bound.bindingObservation.status).toBe('match');

      // 2. status reports the packet and the intercepted SWF session state.
      const status = await runCommand(harness.commands, 'status smoke-task ' + swfDir + ' --session=swf-session');
      expect(status.kind).toBe('success');
      const statusBody = JSON.parse((status as { text: string }).text);
      expect(statusBody.bindingObservation.status).toBe('match');
      expect(statusBody.session?.mode).toBe('swf');
      expect(statusBody.session?.taskId).toBe('smoke-task');
      expect(statusBody.workerEvidence?.state).toBe('unknown');

      // Passthrough session was never intercepted: no session state, no files.
      const passthrough = await runCommand(harness.commands, 'status smoke-task ' + swfDir + ' --session=plain-session');
      const passthroughBody = JSON.parse((passthrough as { text: string }).text);
      expect(passthroughBody.session).toBeNull();

      // 3. host-claimed dispatch record (visible worker dispatch semantics).
      await writeEvidence({
        authorityRoot: swfDir,
        taskId: 'smoke-task',
        kind: 'worker',
        record: evidenceRecord({ sessionId: 'swf-session', provider: 'dsh-sdk', declaredModel: 'deepseek-v4-flash' })
      });

      // 4. human accept via the dsh approval channel -> durable acceptance evidence.
      const accept = await runCommand(harness.commands, 'accept smoke-task ' + swfDir);
      expect(accept.kind).toBe('success');
      const accepted = JSON.parse((accept as { text: string }).text);
      expect(accepted.accepted).toBe(true);
      expect(accepted.evidenceState).toBe('host-claimed');
      expect(accepted.humanConfirmed).toBe(true);

      // Durable artifacts on disk: packet + evidence/worker + evidence/acceptance.
      const worker = JSON.parse(await readFile(join(swfDir, 'planning', 'active', 'smoke-task', 'evidence', 'worker.json'), 'utf8'));
      expect(worker.state).toBe('host-claimed');
      expect(worker.authenticated).toBe(false);
      const acceptance = JSON.parse(await readFile(join(swfDir, 'planning', 'active', 'smoke-task', 'evidence', 'acceptance.json'), 'utf8'));
      expect(acceptance.extra.humanConfirmed).toBe(true);

      // Passthrough project directory has no planning/ artifacts at all.
      await expect(
        readFile(join(root, 'plain-project', 'planning', 'active', 'smoke-task', 'swf-packet.json'))
      ).rejects.toThrow();
    });
  });

  it('binding_mismatch smoke: tampered trio stops the flow without writing a packet', async () => {
    await withTmpRoot(async (root) => {
      const harness = makeMockCtx();
      apply(harness.ctx);
      const swfDir = join(root, 'swf-project');
      const input = await makePacketInputFor(swfDir, 'smoke-task');
      // Tamper with the trio after the binding was computed.
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(swfDir, 'planning', 'active', 'smoke-task', 'task_plan.md'), 'tampered\\n', 'utf8');
      const bind = await runCommand(harness.commands, 'bind smoke-task ' + JSON.stringify(input));
      expect(bind.kind).toBe('error');
      expect((bind as { text: string }).text).toContain('binding_mismatch');
    });
  });

  it('acceptance without a recorded worker fails closed even with approval', async () => {
    await withTmpRoot(async (root) => {
      const harness = makeMockCtx({ approvalOutcome: 'allowed-once' });
      apply(harness.ctx);
      const swfDir = join(root, 'swf-project');
      const input = await makePacketInputFor(swfDir, 'smoke-task');
      await runCommand(harness.commands, 'bind smoke-task ' + JSON.stringify(input));
      const accept = await runCommand(harness.commands, 'accept smoke-task ' + swfDir);
      expect(accept.kind).toBe('error');
      expect((accept as { text: string }).text).toContain('unknown');
    });
  });
});
