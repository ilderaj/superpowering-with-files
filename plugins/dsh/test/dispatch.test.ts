// Slice 2 worker dispatch integration (plan items 1/2/3/4/5) over a mock
// ctx.subagents + mock ctx.approval: provider routing, mandatory visible
// worker evidence, budget caps, dual-layer gates, and the candidate accept
// flow. This Codex environment cannot run a real dsh session; the flow is
// proven with mocks and the first real human accept is a Slice 3 rollout item.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Agent } from '@deepseek-ai/dsh-agent';

import { createDispatcher } from '../src/dispatch.js';
import { readEvidence, readPacket } from '../src/packet.js';
import {
  createSwfCommands,
  parseSwfCommand
} from '../src/commands.js';
import { createSessionTracker } from '../src/detect.js';
import { makeMockCtx, makePacketInputFor, runCommand, withTmpRoot } from './helpers.js';

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
      expect(dispatcher.budgetOf().activeWorkers).toBe(0);
    });
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
