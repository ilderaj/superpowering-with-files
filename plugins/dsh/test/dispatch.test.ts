// Slice 2 worker dispatch integration (plan items 1/2/3/4/5) over a mock
// ctx.subagents + mock ctx.approval: provider routing, mandatory visible
// worker evidence, budget caps, dual-layer gates, and the candidate accept
// flow. This Codex environment cannot run a real dsh session; the flow is
// proven with mocks and the first real human accept is a Slice 3 rollout item.

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Agent } from '@deepseek-ai/dsh-agent';

import { createDispatcher } from '../src/dispatch.js';
import { readEvidence, readPacket } from '../src/packet.js';
import { resolveCorleoneRole } from '../src/core/index.js';
import {
  createSwfCommands,
  parseSwfCommand
} from '../src/commands.js';
import { createSessionTracker } from '../src/detect.js';
import { makeMockCtx, makePacketInputFor, runCommand, withTmpRoot } from './helpers.js';
// Harness parity fixture: the dsh Corleone resolver must behave exactly like
// the harness selector (same convention as test/parity.test.ts).
import { selectCorleoneRole as harnessSelectCorleoneRole } from '../../harness/trio/hosts/codex.mjs';

// The parent agent carries its live session so dispatch() exercises the real
// ctx.tokenMeter.measure path (the mock meter ignores the session argument).
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

describe('dispatchWorker over mock ctx.subagents (Slice 2)', () => {
  it('dispatches with the default dsh-sdk provider and records host-claimed worker evidence', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'alpha-task');
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'alpha-task',
        parent: PARENT,
        prompt: 'execute the slice'
      });
      expect(result.status).toBe('dispatched');
      expect(result.provider).toBe('dsh-sdk');
      expect(result.model).toBe('deepseek-v4-flash');
      expect(result.registryProvider).toBe('subagent-dsh-sdk');
      expect(result.sessionId).toBeTruthy();

      expect(harness.subagents.started).toHaveLength(1);
      const start = harness.subagents.started[0]!;
      expect(start.name).toBe('subagent-dsh-sdk');
      const agentOptions = start.request.agentOptions as { provider: string; model: string; maxTokens: number };
      expect(agentOptions.provider).toBe('dsh-sdk');
      expect(agentOptions.model).toBe('deepseek-v4-flash');
      expect(agentOptions.maxTokens).toBeGreaterThan(0);

      const worker = await readEvidence(root, 'alpha-task', 'worker');
      expect(worker!.state).toBe('host-claimed');
      expect(worker!.authenticated).toBe(false);
      expect(worker!.sessionId).toBeTruthy();
      expect(worker!.provider).toBe('dsh-sdk');
      expect(worker!.declaredModel).toBe('deepseek-v4-flash');

      const budget = await readEvidence(root, 'alpha-task', 'budget');
      expect(budget).not.toBeNull();
      const packet = await readPacket(root, 'alpha-task');
      expect(packet!.budget).toBeDefined();
      expect(worker!.extra).toEqual({
        runId: 'run-1',
        registryProvider: 'subagent-dsh-sdk',
        tier: 'standard',
        requestedRole: 'buttonman_neri',
        requestedPersona: 'buttonman_neri',
        requestedDisplayName: 'Button Man Al Neri',
        requestedTokens: 32_000,
        packetDigest: packet!.packetDigest,
        startEventObserved: true,
        observedRegistryProvider: 'subagent-dsh-sdk',
        registryMismatch: false
      });
    });
  });

  it('routes an explicitly declared codex provider to the codex registry name', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'codex-task', { provider: 'codex', model: 'gpt-5.6' });
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'codex-task',
        parent: PARENT,
        prompt: 'execute'
      });
      expect(result.status).toBe('dispatched');
      expect(result.provider).toBe('codex');
      expect(result.registryProvider).toBe('subagent-codex');
      expect(harness.subagents.started[0]!.name).toBe('subagent-codex');
    });
  });

  it('rejects an unsupported provider without dispatching', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'bad-task', { provider: 'gemini' });
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'bad-task',
        parent: PARENT,
        prompt: 'execute'
      });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('unsupported_provider');
      expect(harness.subagents.started).toHaveLength(0);
    });
  });

  it('fails closed when no dispatch record can be formed (no SessionId)', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'norecord-task');
      const harness = makeMockCtx({ subagents: { runs: [{ id: null }], emitStartEvent: false } });
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'norecord-task',
        parent: PARENT,
        prompt: 'execute'
      });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('dispatch_record_unavailable');
      expect(harness.subagents.disposeCalls.length).toBeGreaterThan(0);
      const worker = await readEvidence(root, 'norecord-task', 'worker');
      expect(worker!.state).toBe('unknown');
      expect(worker!.authenticated).toBe(false);
      const budget = await readEvidence(root, 'norecord-task', 'budget');
      expect((budget!.extra as { snapshot: { activeWorkers: number } }).snapshot.activeWorkers).toBe(0);
    });
  });

  it('fails closed when the provider start rejects before publication', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'startfail-task');
      const harness = makeMockCtx({ subagents: { startThrows: new Error('provider down') } });
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'startfail-task',
        parent: PARENT,
        prompt: 'execute'
      });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('dispatch_start_rejected');
      const worker = await readEvidence(root, 'startfail-task', 'worker');
      expect(worker!.state).toBe('unknown');
    });
  });

  it('fails closed before dispatch when the registry provider is unavailable', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'noprov-task');
      const harness = makeMockCtx({ subagents: { providers: ['subagent-codex'] } });
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'noprov-task',
        parent: PARENT,
        prompt: 'execute'
      });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('provider_unavailable');
      expect(harness.subagents.started).toHaveLength(0);
    });
  });

  it('fails closed when the subagents service omits getProvider', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'no-get-provider-task');
      const harness = makeMockCtx();
      delete (harness.ctx.subagents as unknown as { getProvider?: unknown }).getProvider;
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'no-get-provider-task',
        parent: PARENT,
        prompt: 'execute'
      });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('subagents_service_unavailable');
      expect(harness.subagents.started).toHaveLength(0);
    });
  });

  it('fails closed with budget_exceeded and never dispatches', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'budget-task');
      const harness = makeMockCtx({ tokenMeterTotal: 90_000 });
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'budget-task',
        parent: PARENT,
        prompt: 'execute'
      });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('budget_exceeded');
      expect(harness.subagents.started).toHaveLength(0);
      const budget = await readEvidence(root, 'budget-task', 'budget');
      const extra = budget!.extra as { snapshot: { spentTokens: number }; blockedBy: string };
      expect(extra.snapshot.spentTokens).toBe(90_000);
      expect(extra.blockedBy).toBe('budget_exceeded');
    });
  });

  it('stops a gated category without approval and never dispatches', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'gated-task', { gateCategories: ['security'] });
      const harness = makeMockCtx({ approvalOutcome: 'rejected' });
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'gated-task',
        parent: PARENT,
        prompt: 'execute'
      });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('gate_approval_required');
      expect(harness.subagents.started).toHaveLength(0);
      expect(harness.approvalCalls[0]!.toolName).toBe('swf.dispatch');
      const gate = await readEvidence(root, 'gated-task', 'gate');
      expect(gate).not.toBeNull();
      expect((gate!.extra as { outcome: string }).outcome).toBe('rejected');
    });
  });

  it('proceeds past a gated category when approval grants the dispatch', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'gated-ok-task', { gateCategories: ['send'] });
      const harness = makeMockCtx({ approvalOutcome: 'allowed-once' });
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'gated-ok-task',
        parent: PARENT,
        prompt: 'execute'
      });
      expect(result.status).toBe('dispatched');
      expect(harness.subagents.started).toHaveLength(1);
      const gate = await readEvidence(root, 'gated-ok-task', 'gate');
      expect((gate!.extra as { outcome: string }).outcome).toBe('allowed-once');
    });
  });

  it('requires explicit confirmation for the deep tier', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'deep-task', { complexity: 'max' });
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);
      const denied = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'deep-task',
        parent: PARENT,
        prompt: 'execute'
      });
      expect(denied.status).toBe('manual_pending');
      expect(denied.blocker).toBe('deep_tier_confirmation_required');
      expect(harness.subagents.started).toHaveLength(0);

      const granted = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'deep-task',
        parent: PARENT,
        prompt: 'execute',
        deepConfirmed: true
      });
      expect(granted.status).toBe('dispatched');
    });
  });

  it('stops on binding_mismatch before any dispatch', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'tamper-task');
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(root, 'planning', 'active', 'tamper-task', 'task_plan.md'), 'tampered\n', 'utf8');
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'tamper-task',
        parent: PARENT,
        prompt: 'execute'
      });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('binding_mismatch');
      expect(harness.subagents.started).toHaveLength(0);
    });
  });

  it('settles a dispatched worker with its terminal stop reason and releases the slot', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'settle-task');
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'settle-task',
        parent: PARENT,
        prompt: 'execute'
      });
      expect(result.status).toBe('dispatched');
      await dispatcher.settle({
        authorityRoot: root,
        taskId: 'settle-task',
        runId: result.runId!,
        stopReason: 'completed'
      });
      const settled = await readEvidence(root, 'settle-task', 'worker-result');
      expect(settled).not.toBeNull();
      expect((settled!.extra as { stopReason: string }).stopReason).toBe('completed');
      expect((settled!.extra as { trioVerified: boolean }).trioVerified).toBe(true);
      expect(dispatcher.budgetOf(root, 'settle-task').activeWorkers).toBe(0);
    });
  });

  it('auto-settles the worker when the host completes the run and releases the slot', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'autosettle-task');
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'autosettle-task',
        parent: PARENT,
        prompt: 'execute'
      });
      expect(result.status).toBe('dispatched');
      expect(dispatcher.budgetOf(root, 'autosettle-task').activeWorkers).toBe(1);

      await harness.completeRun(0, 'completed');

      const settled = await readEvidence(root, 'autosettle-task', 'worker-result');
      expect(settled).not.toBeNull();
      expect((settled!.extra as { stopReason: string }).stopReason).toBe('completed');
      expect((settled!.extra as { runId: string }).runId).toBe(result.sessionId);
      expect(dispatcher.budgetOf(root, 'autosettle-task').activeWorkers).toBe(0);
      expect(harness.subagents.disposeCalls).toContain(result.sessionId);
    });
  });

  it('settles a non-completed stop reason but never produces an acceptable candidate', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'failed-run-task');
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'failed-run-task',
        parent: PARENT,
        prompt: 'execute'
      });
      expect(result.status).toBe('dispatched');

      await harness.completeRun(0, 'error');

      const settled = await readEvidence(root, 'failed-run-task', 'worker-result');
      expect(settled).not.toBeNull();
      expect((settled!.extra as { stopReason: string }).stopReason).toBe('error');
      expect(dispatcher.budgetOf(root, 'failed-run-task').activeWorkers).toBe(0);
    });
  });

  it('keeps a separate budget ledger per task (spent tokens never bleed across tasks)', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'spender-task');
      await boundTask(root, 'fresh-task');
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);

      const spent = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'spender-task',
        parent: PARENT,
        prompt: 'x',
        measuredTokens: 96_000
      });
      expect(spent.status).toBe('manual_pending');
      expect(spent.blocker).toBe('budget_exceeded');

      const fresh = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'fresh-task',
        parent: PARENT,
        prompt: 'x',
        measuredTokens: 0
      });
      expect(fresh.status).toBe('dispatched');
      expect(harness.subagents.started).toHaveLength(1);
    });
  });

  it('initializes a restarted dispatcher ledger from the persisted packet budget', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'persist-task');
      const first = createDispatcher(makeMockCtx().ctx);
      const dispatched = await first.dispatch({
        authorityRoot: root,
        taskId: 'persist-task',
        parent: PARENT,
        prompt: 'x',
        measuredTokens: 0,
        maxTokens: 50_000
      });
      expect(dispatched.status).toBe('dispatched');

      const second = createDispatcher(makeMockCtx().ctx);
      const overBudget = await second.dispatch({
        authorityRoot: root,
        taskId: 'persist-task',
        parent: PARENT,
        prompt: 'x',
        measuredTokens: 0,
        maxTokens: 51_000
      });
      expect(overBudget.status).toBe('manual_pending');
      expect(overBudget.blocker).toBe('budget_exceeded');
      expect(overBudget.budget!.spentTokens).toBe(50_000);
    });
  });

  it('gates an array-form allowedOperations push without approval (regression: no gate bypass)', async () => {
    await withTmpRoot(async (root) => {
      const harness = makeMockCtx({ approvalOutcome: 'rejected' });
      for (const def of createSwfCommands(harness.ctx, createSessionTracker(harness.ctx))) {
        harness.ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 'arraygate-task');
      input.allowedOperations = ['push origin main'];
      await runCommand(harness.commands, 'bind arraygate-task ' + JSON.stringify(input));

      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'arraygate-task',
        parent: PARENT,
        prompt: 'x'
      });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('gate_approval_required');
      expect(harness.subagents.started).toHaveLength(0);
      const gate = await readEvidence(root, 'arraygate-task', 'gate');
      expect((gate!.extra as { categories: string[] }).categories).toContain('merge-push-release');
    });
  });

  it('rejects a ticket whose content no longer matches its recorded digest', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'tamper-ticket-task');
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);
      const ticketPath = join(root, 'planning', 'active', 'tamper-ticket-task', 'swf-packet.json');
      const stored = JSON.parse(await readFile(ticketPath, 'utf8'));
      stored.packet.allowedOperations = ['push origin main'];
      await writeFile(ticketPath, JSON.stringify(stored, null, 2) + '\n', 'utf8');

      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'tamper-ticket-task',
        parent: PARENT,
        prompt: 'x'
      });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('packet_digest_mismatch');
      expect(harness.subagents.started).toHaveLength(0);
    });
  });

  it('enforces the parallel worker cap across tasks on one dispatcher', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'cap-a-task');
      await boundTask(root, 'cap-b-task');
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);

      const a = await dispatcher.dispatch({ authorityRoot: root, taskId: 'cap-a-task', parent: PARENT, prompt: 'x' });
      expect(a.status).toBe('dispatched');

      const b = await dispatcher.dispatch({ authorityRoot: root, taskId: 'cap-b-task', parent: PARENT, prompt: 'x' });
      expect(b.status).toBe('dispatched');

      const c = await dispatcher.dispatch({ authorityRoot: root, taskId: 'cap-a-task', parent: PARENT, prompt: 'x' });
      expect(c.status).toBe('manual_pending');
      expect(c.blocker).toBe('parallel_worker_cap_exceeded');
      expect(harness.subagents.started).toHaveLength(2);

      await harness.completeRun(0, 'completed');
      const d = await dispatcher.dispatch({ authorityRoot: root, taskId: 'cap-b-task', parent: PARENT, prompt: 'x' });
      expect(d.status).toBe('dispatched');
    });
  });

  it('tracks multiple concurrent runs per task and releases each slot exactly once', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'multi-task');
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);

      const r1 = await dispatcher.dispatch({ authorityRoot: root, taskId: 'multi-task', parent: PARENT, prompt: 'x' });
      const r2 = await dispatcher.dispatch({ authorityRoot: root, taskId: 'multi-task', parent: PARENT, prompt: 'x' });
      expect(r1.status).toBe('dispatched');
      expect(r2.status).toBe('dispatched');
      expect(dispatcher.budgetOf(root, 'multi-task').activeWorkers).toBe(2);

      const r3 = await dispatcher.dispatch({ authorityRoot: root, taskId: 'multi-task', parent: PARENT, prompt: 'x' });
      expect(r3.status).toBe('manual_pending');
      expect(r3.blocker).toBe('parallel_worker_cap_exceeded');

      await harness.completeRun(0, 'completed');
      expect(dispatcher.budgetOf(root, 'multi-task').activeWorkers).toBe(1);

      await harness.completeRun(1, 'completed');
      expect(dispatcher.budgetOf(root, 'multi-task').activeWorkers).toBe(0);

      const r4 = await dispatcher.dispatch({ authorityRoot: root, taskId: 'multi-task', parent: PARENT, prompt: 'x' });
      expect(r4.status).toBe('dispatched');
    });
  });

  it('disposes the run and releases the slot when post-start persistence fails', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'persistfail-task');
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);
      const evidenceDir = join(root, 'planning', 'active', 'persistfail-task', 'evidence');
      await mkdir(evidenceDir, { recursive: true });
      await chmod(evidenceDir, 0o555);
      await chmod(join(evidenceDir, 'worker.json'), 0o444);
      try {
        const result = await dispatcher.dispatch({
          authorityRoot: root,
          taskId: 'persistfail-task',
          parent: PARENT,
          prompt: 'x'
        });
        expect(result.status).toBe('manual_pending');
        expect(result.blocker).toBe('dispatch_persistence_failed');
        expect(harness.subagents.started).toHaveLength(1);
        expect(harness.subagents.disposeCalls.length).toBeGreaterThan(0);
        expect(dispatcher.budgetOf(root, 'persistfail-task').activeWorkers).toBe(0);
      } finally {
        await chmod(join(evidenceDir, 'worker.json'), 0o644);
        await chmod(evidenceDir, 0o755);
      }
    });
  });
});

describe('dispatchWorker Corleone persona binding (bridge repair)', () => {
  it('passes the packet-derived Corleone persona to subagents.start and records it in evidence extras', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'persona-task');
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'persona-task',
        parent: PARENT,
        prompt: 'execute'
      });
      expect(result.status).toBe('dispatched');
      expect(harness.subagents.started).toHaveLength(1);
      const start = harness.subagents.started[0]!;
      expect(start.name).toBe('subagent-dsh-sdk');
      // executing/high selects Button Man Al Neri; the persona is a top-level
      // start field, not an agentOption.
      expect(start.request.persona).toBe('buttonman_neri');
      const worker = await readEvidence(root, 'persona-task', 'worker');
      const extra = worker!.extra as {
        requestedRole: string;
        requestedPersona: string;
        requestedDisplayName: string;
      };
      expect(extra.requestedRole).toBe('buttonman_neri');
      expect(extra.requestedPersona).toBe('buttonman_neri');
      expect(extra.requestedDisplayName).toBe('Button Man Al Neri');
    });
  });

  it('derives Don Michael persona for a visible-worker-required slice', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'strict-persona-task', { primaryExecution: 'visible_worker_required' });
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'strict-persona-task',
        parent: PARENT,
        prompt: 'execute'
      });
      expect(result.status).toBe('dispatched');
      expect(harness.subagents.started[0]!.request.persona).toBe('don_michael');
    });
  });

  it('fails closed before start when the provider lacks the persona capability', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'nopersona-task');
      const harness = makeMockCtx({ subagents: { personaCapability: false } });
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'nopersona-task',
        parent: PARENT,
        prompt: 'execute'
      });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('persona_capability_unavailable');
      expect(harness.subagents.started).toHaveLength(0);
    });
  });

  it('fails closed before start when the packet capability cannot resolve a Corleone role', async () => {
    await withTmpRoot(async (root) => {
      // Chief slices pass the bind-time capability policy (a Chief role
      // carries no complexity) but can never resolve to a Corleone execution
      // role, so dispatch must fail closed before any start attempt.
      await boundTask(root, 'norole-task', { workRole: 'chief', complexity: undefined });
      const harness = makeMockCtx();
      const dispatcher = createDispatcher(harness.ctx);
      const result = await dispatcher.dispatch({
        authorityRoot: root,
        taskId: 'norole-task',
        parent: PARENT,
        prompt: 'execute'
      });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('corleone_role_unavailable');
      expect(harness.subagents.started).toHaveLength(0);
    });
  });

  it('maps packet capabilities to Corleone roles exactly like the harness selector', () => {
    const matrix = [
      { workRole: 'executing', complexity: 'high' },
      { workRole: 'executing', complexity: 'xhigh' },
      { workRole: 'executing', complexity: 'max' },
      { workRole: 'coding', complexity: 'high' },
      { workRole: 'coding', complexity: 'xhigh' },
      { workRole: 'coding', complexity: 'max' },
      { workRole: 'searching', complexity: 'high' },
      { workRole: 'researching', complexity: 'xhigh' },
      { workRole: 'exploring', complexity: 'max' },
      { workRole: 'repetitive_execution', complexity: 'max' },
      { workRole: 'coding', complexity: 'high', primaryExecution: 'visible_worker_required' },
      { workRole: 'repetitive_execution', complexity: 'high', primaryExecution: 'visible_worker_required' }
    ];
    for (const capability of matrix) {
      const ported = resolveCorleoneRole(capability);
      const harness = harnessSelectCorleoneRole(capability);
      expect({ agentType: ported.agentType, tier: ported.tier, ordinal: ported.ordinal }).toEqual({
        agentType: harness.agentType,
        tier: harness.tier,
        ordinal: harness.ordinal
      });
      expect(ported.persona).toBe(ported.agentType);
    }
    const invalid = [
      { workRole: 'chief' },
      { workRole: 'chief', primaryExecution: 'visible_worker_required' },
      { workRole: 'coding' },
      {}
    ];
    for (const capability of invalid) {
      expect(() => resolveCorleoneRole(capability)).toThrow();
      expect(() => harnessSelectCorleoneRole(capability)).toThrow();
    }
  });

  it('fails closed on explicitly invalid ordinals exactly like the harness selector', () => {
    // An explicitly provided ordinal that is not a positive safe integer must
    // NEVER silently fall back to 1: the resolver throws the same error as
    // the harness allocateCorleoneCallsign path.
    const invalidOrdinals = ['bad', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1] as Array<string | number>;
    const base = { workRole: 'coding', complexity: 'high' };
    for (const ordinal of invalidOrdinals) {
      const capability = { ...base, ordinal };
      expect(() => resolveCorleoneRole(capability)).toThrow(/positive safe integer/i);
      expect(() => harnessSelectCorleoneRole(capability)).toThrow(/positive safe integer/i);
    }
    // Don Michael is reserved at ordinal 1 for strict visible-worker slices,
    // even when the supplied ordinal is a valid positive integer.
    const donOrdinalTwo = {
      workRole: 'coding',
      complexity: 'high',
      primaryExecution: 'visible_worker_required',
      ordinal: 2
    };
    expect(() => resolveCorleoneRole(donOrdinalTwo)).toThrow(/Don Michael|ordinal/i);
    expect(() => harnessSelectCorleoneRole(donOrdinalTwo)).toThrow(/Don Michael|ordinal/i);
    // visible_worker_required/Don treats an EXPLICIT null ordinal exactly
    // like any other non-1 ordinal and fails closed: explicit null never
    // means "default" on the strict Don lane.
    const donOrdinalNull = {
      workRole: 'coding',
      complexity: 'high',
      primaryExecution: 'visible_worker_required',
      ordinal: null
    };
    expect(() => resolveCorleoneRole(donOrdinalNull)).toThrow(/Don Michael|ordinal/i);
    expect(() => harnessSelectCorleoneRole(donOrdinalNull)).toThrow(/Don Michael|ordinal/i);
    // Don + a non-numeric explicit ordinal also uses the harness strict-Don
    // error: the tier-1 reservation is checked before the positive-safe-
    // integer validation, exactly like selectCorleoneRole.
    const donOrdinalBad = {
      workRole: 'coding',
      complexity: 'high',
      primaryExecution: 'visible_worker_required',
      ordinal: 'bad'
    };
    expect(() => resolveCorleoneRole(donOrdinalBad)).toThrow(/Don Michael|ordinal/i);
    expect(() => harnessSelectCorleoneRole(donOrdinalBad)).toThrow(/Don Michael|ordinal/i);
  });

  it('resolves legal ordinals and the default ordinal exactly like the harness selector', () => {
    const cases = [
      { workRole: 'coding', complexity: 'high', ordinal: 2 },
      { workRole: 'coding', complexity: 'high' },
      { workRole: 'coding', complexity: 'high', ordinal: null },
      { workRole: 'executing', complexity: 'xhigh', ordinal: 2 }
    ];
    for (const capability of cases) {
      const ported = resolveCorleoneRole(capability);
      const harness = harnessSelectCorleoneRole(capability);
      expect({ agentType: ported.agentType, tier: ported.tier, ordinal: ported.ordinal }).toEqual({
        agentType: harness.agentType,
        tier: harness.tier,
        ordinal: harness.ordinal
      });
      expect(ported.persona).toBe(ported.agentType);
    }
    // Default ordinal 1 picks the named first member: buttonman_neri for
    // coding/high, buttonman_brasi for ordinal 2, capo_lampone for capo 2.
    expect(resolveCorleoneRole({ workRole: 'coding', complexity: 'high' }).agentType).toBe('buttonman_neri');
    expect(resolveCorleoneRole({ workRole: 'coding', complexity: 'high', ordinal: 2 }).agentType).toBe('buttonman_brasi');
    // On non-Don tiers explicit null still means the default ordinal 1
    // (harness 'input.ordinal ?? 1'), so the first named member is selected.
    expect(resolveCorleoneRole({ workRole: 'coding', complexity: 'high', ordinal: null }).agentType).toBe('buttonman_neri');
    expect(resolveCorleoneRole({ workRole: 'executing', complexity: 'xhigh', ordinal: 2 }).agentType).toBe('capo_lampone');
  });
});

describe('/swf dispatch command surface (Slice 2)', () => {
  it('parses the dispatch subcommand', () => {
    expect(parseSwfCommand('dispatch alpha-task /root --deep-confirmed').subcommand).toBe('dispatch');
    expect(() => parseSwfCommand('frobnicate x')).toThrow('Usage: /swf');
  });

  it('dispatches through the command and records durable evidence', async () => {
    await withTmpRoot(async (root) => {
      const harness = makeMockCtx();
      for (const def of createSwfCommands(harness.ctx, createSessionTracker(harness.ctx))) {
        harness.ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 'alpha-task');
      await runCommand(harness.commands, 'bind alpha-task ' + JSON.stringify(input));
      const result = await runCommand(harness.commands, 'dispatch alpha-task ' + root);
      expect(result.kind).toBe('success');
      const body = JSON.parse((result as { text: string }).text);
      expect(body.status).toBe('dispatched');
      expect(body.provider).toBe('dsh-sdk');
      expect(body.registryProvider).toBe('subagent-dsh-sdk');
      const worker = JSON.parse(await readFile(join(root, 'planning', 'active', 'alpha-task', 'evidence', 'worker.json'), 'utf8'));
      expect(worker.state).toBe('host-claimed');
      expect(worker.authenticated).toBe(false);
    });
  });
});

describe('/swf accept with Trio hash verification (plan item 5)', () => {
  it('accepts a dispatched host-claimed candidate after explicit human approval', async () => {
    await withTmpRoot(async (root) => {
      const harness = makeMockCtx({ approvalOutcome: 'allowed-once' });
      for (const def of createSwfCommands(harness.ctx, createSessionTracker(harness.ctx))) {
        harness.ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 'alpha-task');
      await runCommand(harness.commands, 'bind alpha-task ' + JSON.stringify(input));
      await runCommand(harness.commands, 'dispatch alpha-task ' + root);
      // The host completes the run; the settle chain writes the worker-result
      // candidate that /swf accept now requires before any approval request.
      await harness.completeRun(0, 'completed');
      const result = await runCommand(harness.commands, 'accept alpha-task ' + root);
      expect(result.kind).toBe('success');
      const body = JSON.parse((result as { text: string }).text);
      expect(body.accepted).toBe(true);
      expect(body.evidenceState).toBe('host-claimed');
      expect(body.humanConfirmed).toBe(true);
      const acceptance = JSON.parse(await readFile(join(root, 'planning', 'active', 'alpha-task', 'evidence', 'acceptance.json'), 'utf8'));
      expect(acceptance.extra.humanConfirmed).toBe(true);
    });
  });

  it('refuses acceptance while the dispatched run is still executing', async () => {
    await withTmpRoot(async (root) => {
      const harness = makeMockCtx({ approvalOutcome: 'allowed-once' });
      for (const def of createSwfCommands(harness.ctx, createSessionTracker(harness.ctx))) {
        harness.ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 'running-task');
      await runCommand(harness.commands, 'bind running-task ' + JSON.stringify(input));
      await runCommand(harness.commands, 'dispatch running-task ' + root);

      const denied = await runCommand(harness.commands, 'accept running-task ' + root);
      expect(denied.kind).toBe('error');
      expect((denied as { text: string }).text).toContain('no completed worker-result candidate');
      expect(harness.approvalCalls).toHaveLength(0);

      await harness.completeRun(0, 'completed');
      const accepted = await runCommand(harness.commands, 'accept running-task ' + root);
      expect(accepted.kind).toBe('success');
      expect(harness.approvalCalls).toHaveLength(1);
    });
  });

  it('refuses acceptance when the run settled with a non-completed stop reason', async () => {
    await withTmpRoot(async (root) => {
      const harness = makeMockCtx({ approvalOutcome: 'allowed-once' });
      for (const def of createSwfCommands(harness.ctx, createSessionTracker(harness.ctx))) {
        harness.ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 'errored-task');
      await runCommand(harness.commands, 'bind errored-task ' + JSON.stringify(input));
      await runCommand(harness.commands, 'dispatch errored-task ' + root);
      await harness.completeRun(0, 'error');

      const result = await runCommand(harness.commands, 'accept errored-task ' + root);
      expect(result.kind).toBe('error');
      expect((result as { text: string }).text).toContain('not a completed candidate');
      expect(harness.approvalCalls).toHaveLength(0);
    });
  });

  it('refuses acceptance when the ticket digest no longer matches', async () => {
    await withTmpRoot(async (root) => {
      const harness = makeMockCtx({ approvalOutcome: 'allowed-once' });
      for (const def of createSwfCommands(harness.ctx, createSessionTracker(harness.ctx))) {
        harness.ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 'alpha-task');
      await runCommand(harness.commands, 'bind alpha-task ' + JSON.stringify(input));
      await runCommand(harness.commands, 'dispatch alpha-task ' + root);
      await harness.completeRun(0, 'completed');

      const ticketPath = join(root, 'planning', 'active', 'alpha-task', 'swf-packet.json');
      const stored = JSON.parse(await readFile(ticketPath, 'utf8'));
      stored.packet.allowedOperations = ['push origin main'];
      await writeFile(ticketPath, JSON.stringify(stored, null, 2) + '\n', 'utf8');

      const result = await runCommand(harness.commands, 'accept alpha-task ' + root);
      expect(result.kind).toBe('error');
      expect((result as { text: string }).text).toContain('packet_digest_mismatch');
      expect(harness.approvalCalls).toHaveLength(0);
    });
  });

  it('stops on binding_mismatch before asking for human acceptance', async () => {
    await withTmpRoot(async (root) => {
      const harness = makeMockCtx({ approvalOutcome: 'allowed-once' });
      for (const def of createSwfCommands(harness.ctx, createSessionTracker(harness.ctx))) {
        harness.ctx.commands.register(def);
      }
      const input = await makePacketInputFor(root, 'alpha-task');
      await runCommand(harness.commands, 'bind alpha-task ' + JSON.stringify(input));
      await runCommand(harness.commands, 'dispatch alpha-task ' + root);
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(root, 'planning', 'active', 'alpha-task', 'task_plan.md'), 'tampered\n', 'utf8');
      const result = await runCommand(harness.commands, 'accept alpha-task ' + root);
      expect(result.kind).toBe('error');
      expect((result as { text: string }).text).toContain('binding_mismatch');
      expect(harness.approvalCalls).toHaveLength(0);
    });
  });
});

describe('modern model and effort Host controls', () => {
  it('fails closed before start when the pinned one-shot Host cannot bind effort', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'explicit-effort', { requestedModel: 'main/gpt-6-astra', requestedEffort: 'medium' });
      const host = makeMockCtx();
      const result = await createDispatcher(host.ctx).dispatch({ authorityRoot: root, taskId: 'explicit-effort', parent: PARENT, prompt: 'bounded slice' });
      expect(result.status).toBe('manual_pending');
      expect(result.blocker).toBe('model_effort_controls_unavailable');
      expect(host.subagents.started).toHaveLength(0);
      expect(result.resumeCondition).toContain('startWithModelSelection');
    });
  });

  it('passes exact model and effort to a Host control seam and records only requested evidence', async () => {
    await withTmpRoot(async (root) => {
      await boundTask(root, 'explicit-effort', { requestedModel: 'p646e20/gpt-6-astra', requestedEffort: 'medium' });
      const host = makeMockCtx();
      const selections: unknown[] = [];
      Object.assign(host.ctx.subagents, {
        startWithModelSelection: async (provider: string, request: Parameters<typeof host.ctx.subagents.start>[1], selection: unknown) => {
          selections.push(selection);
          return host.ctx.subagents.start(provider, request);
        }
      });
      const result = await createDispatcher(host.ctx).dispatch({ authorityRoot: root, taskId: 'explicit-effort', parent: PARENT, prompt: 'bounded slice' });
      expect(result.status).toBe('dispatched');
      expect(result.effort).toBe('medium');
      expect(selections).toEqual([{ provider: 'openai', model: 'gpt-6-astra', reasoningEffort: 'medium' }]);
      expect(host.subagents.started[0]!.request.agentOptions).toMatchObject({ provider: 'openai', model: 'gpt-6-astra' });
      const evidence = await readEvidence(root, 'explicit-effort', 'worker');
      expect(evidence!.authenticated).toBe(false);
      expect(evidence!.extra).toMatchObject({ requestedModel: 'p646e20/gpt-6-astra', requestedEffort: 'medium' });
      await host.completeRun(0);
    });
  });
});
