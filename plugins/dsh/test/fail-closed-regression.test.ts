// Slice 3 fail-closed regression matrix (plan item 4).
//
// Consolidated coverage of every fail-closed path from Slice 0-3:
//
//   binding_mismatch            - core route + bind (no write) + dispatch (no
//                                 dispatch) + accept (no human grant)
//   dispatch_record_unavailable - dispatch without a formable record: run
//                                 disposed, evidence stays unknown
//   budget_exceeded             - over-cap reserve and over-limit meter both
//                                 stop with manual_pending
//   gate_approval_required      - gated categories without an approval grant
//   provider_unavailable        - registry provider not resolvable
//   unsupported_provider        - packet requests a provider outside the
//                                 registry
//   deep_tier_confirmation_required - deep tier without explicit confirmation
//   unknown evidence discipline - unknown is never authenticated; audit
//                                 rejects silent worker records
//
// Every path must resolve to manual_pending (or a fail-closed refusal), never
// to a silent dispatch or a mislabeled evidence record.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';

import {
  createSwfCommands,
  parseSwfCommand
} from '../src/commands.js';
import { createSessionTracker } from '../src/detect.js';
import { createDispatcher } from '../src/dispatch.js';
import {
  classifyEvidenceState,
  decideBudget,
  deepTierGate,
  evidenceRecord,
  resolveDispatchProvider
} from '../src/core/index.js';
import { auditEvidenceDirectory } from '../src/evidenceAudit.js';
import { readEvidence } from '../src/packet.js';
import { makeMockCtx, makePacketInputFor, runCommand, withTmpRoot } from './helpers.js';

const PARENT = { id: 'agent-1', session: { id: 'session-1' } } as unknown as Agent;

async function boundTask(root: string, taskId: string, capability: Record<string, unknown> = {}): Promise<void> {
  const { ctx, commands } = makeMockCtx();
  for (const def of createSwfCommands(ctx, createSessionTracker(ctx))) {
    ctx.commands.register(def);
  }
  const input = await makePacketInputFor(root, taskId, { capability });
  const result = await runCommand(commands, 'bind ' + taskId + ' ' + JSON.stringify(input));
  expect(result.kind).toBe('success');
}

describe('fail-closed regression matrix (Slice 0-3)', () => {
  it('binding_mismatch: dispatch stops before any dispatch attempt', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'bm-task');
      await writeFile(join(root, 'planning', 'active', 'bm-task', 'task_plan.md'), 'tampered\n', 'utf8');
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({ authorityRoot: root, taskId: 'bm-task', parent: PARENT, prompt: 'x' });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('binding_mismatch');
      expect(harness.subagents.started).toHaveLength(0);
    });
  });

  it('binding_mismatch: bind refuses to write a packet', async () => {
    await withTmpRoot(async (root) => {
      const { ctx, commands } = makeMockCtx();
      for (const def of createSwfCommands(ctx, createSessionTracker(ctx))) {
        ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 'bm2-task');
      await writeFile(join(root, 'planning', 'active', 'bm2-task', 'task_plan.md'), 'tampered\n', 'utf8');
      const result = await runCommand(commands, 'bind bm2-task ' + JSON.stringify(input));
      expect(result.kind).toBe('error');
      expect((result as { text: string }).text).toContain('binding_mismatch');
      await expect(readFile(join(root, 'planning', 'active', 'bm2-task', 'swf-packet.json'), 'utf8')).rejects.toThrow();
    });
  });

  it('binding_mismatch: accept refuses before any human grant', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'bm3-task');
      await writeFile(join(root, 'planning', 'active', 'bm3-task', 'progress.md'), 'tampered\n', 'utf8');
      const { ctx, commands } = makeMockCtx({ approvalOutcome: 'allowed-once' });
      for (const def of createSwfCommands(ctx, createSessionTracker(ctx))) {
        ctx.commands.register(def);
      }
      const result = await runCommand(commands, 'accept bm3-task ' + root);
      expect(result.kind).toBe('error');
      expect((result as { text: string }).text).toContain('binding_mismatch');
    });
  });

  it('dispatch_record_unavailable: run disposed, evidence unknown with a failure note, audit clean', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'rec-task');
      const harness = makeMockCtx({ subagents: { runs: [{ id: null }], emitStartEvent: false } });
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({ authorityRoot: root, taskId: 'rec-task', parent: PARENT, prompt: 'x' });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('dispatch_record_unavailable');
      expect(harness.subagents.disposeCalls.length).toBeGreaterThan(0);
      const worker = await readEvidence(root, 'rec-task', 'worker');
      expect(worker!.state).toBe('unknown');
      expect(worker!.authenticated).toBe(false);
      expect((worker!.extra as { failure: string }).failure).toBe('dispatch_record_unavailable');
      const audit = await auditEvidenceDirectory(root, 'rec-task');
      expect(audit.ok).toBe(true);
    });
  });

  it('budget_exceeded: over-limit meter and over-cap reserve both fail closed', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'bud-task');
      const harness = makeMockCtx({ tokenMeterTotal: 90_000 });
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({ authorityRoot: root, taskId: 'bud-task', parent: PARENT, prompt: 'x' });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('budget_exceeded');
      expect(harness.subagents.started).toHaveLength(0);

      // Pure core path: requested tokens over the cap.
      const core = decideBudget({ spentTokens: 0, requestedTokens: 200_000, budget: 100_000, activeWorkers: 0 });
      expect(core.allowed).toBe(false);
      expect(core.reason).toBe('budget_exceeded');
    });
  });

  it('gate_approval_required: gated category without a grant stops, approval channel recorded', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'gate-task', { gateCategories: ['security'] });
      const harness = makeMockCtx({ approvalOutcome: 'rejected' });
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({ authorityRoot: root, taskId: 'gate-task', parent: PARENT, prompt: 'x' });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('gate_approval_required');
      expect(harness.subagents.started).toHaveLength(0);
      expect(harness.approvalCalls[0]!.toolName).toBe('swf.dispatch');
      const gate = await readEvidence(root, 'gate-task', 'gate');
      expect((gate!.extra as { outcome: string }).outcome).toBe('rejected');
    });
  });

  it('provider_unavailable: registry provider not resolvable on the host', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'prov-task');
      const harness = makeMockCtx({ subagents: { providers: ['subagent-codex'] } });
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({ authorityRoot: root, taskId: 'prov-task', parent: PARENT, prompt: 'x' });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('provider_unavailable');
      expect(harness.subagents.started).toHaveLength(0);
    });
  });

  it('unsupported_provider: packet provider outside the registry is rejected, never dispatched', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'gem-task', { provider: 'gemini', model: 'gemini-2.5' });
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({ authorityRoot: root, taskId: 'gem-task', parent: PARENT, prompt: 'x' });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('unsupported_provider');
      expect(harness.subagents.started).toHaveLength(0);
      // Pure core agrees.
      expect(() => resolveDispatchProvider({ capability: { provider: 'gemini', model: 'gemini-2.5' } }))
        .toThrow('Unsupported dispatch provider: gemini');
    });
  });

  it('deep_tier_confirmation_required: deep tier without explicit confirmation stops', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'deep-task', { complexity: 'max' });
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({ authorityRoot: root, taskId: 'deep-task', parent: PARENT, prompt: 'x' });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('deep_tier_confirmation_required');
      expect(harness.subagents.started).toHaveLength(0);
      expect(deepTierGate('deep', false).reason).toBe('deep_tier_confirmation_required');
      expect(deepTierGate('deep', true).allowed).toBe(true);
    });
  });

  it('unknown evidence discipline: never authenticated, audit rejects silent workers', async () => {
    // Core: an empty record is unknown, not authenticated.
    expect(classifyEvidenceState({})).toBe('unknown');
    expect(evidenceRecord({}).authenticated).toBe(false);
    // A claimed-but-unverifiable record fails closed to unknown.
    expect(classifyEvidenceState({ authenticated: true })).toBe('unknown');
    await withTmpRoot(async (root) => {
      // A silently-written unknown worker record is flagged by the audit.
      const { mkdir } = await import('node:fs/promises');
      const dir = join(root, 'planning', 'active', 'silent-task', 'evidence');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'worker.json'), JSON.stringify({
        state: 'unknown', authenticated: false, evidenceRef: null,
        sessionId: null, provider: null, declaredModel: null,
        actualModel: null, actualEffort: null, kind: 'worker',
        taskId: 'silent-task', recordedAt: '2026-08-15T00:00:00.000Z', extra: {}
      }), 'utf8');
      const audit = await auditEvidenceDirectory(root, 'silent-task');
      expect(audit.ok).toBe(false);
      expect(audit.checks.unrecordedDispatchRejected).toBe(false);
    });
  });
});

