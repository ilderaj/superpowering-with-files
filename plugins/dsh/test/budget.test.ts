// Slice 2 budget ledger (plan item 3): in-memory tracker, budget evidence
// persistence, and packet budget refresh (budget status written into the
// packet FILE envelope while the immutable assignment packet stays stable).

import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildAssignmentPacket } from '../src/core/index.js';
import { BudgetTracker, writeBudgetEvidence } from '../src/budget.js';
import { readEvidence, readPacket, verifyTrioOnDisk, writePacket, writePacketBudget } from '../src/packet.js';
import { makePacketInputFor, withTmpRoot } from './helpers.js';

describe('BudgetTracker (Slice 2, plan item 3)', () => {
  it('reserves tokens within the cap and reports a snapshot', () => {
    const tracker = new BudgetTracker(100_000);
    expect(tracker.reserve(32_000).allowed).toBe(true);
    const snapshot = tracker.snapshot();
    expect(snapshot.spentTokens).toBe(32_000);
    expect(snapshot.overLimit).toBe(false);
    expect(snapshot.cap).toBe(100_000);
  });

  it('fails closed with budget_exceeded and does not charge the rejected reserve', () => {
    const tracker = new BudgetTracker(50_000);
    tracker.reserve(40_000);
    const decision = tracker.reserve(20_000);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('budget_exceeded');
    expect(tracker.snapshot().spentTokens).toBe(40_000);
    expect(tracker.snapshot().overLimit).toBe(false);
  });

  it('enforces the parallel worker cap', () => {
    const tracker = new BudgetTracker();
    expect(tracker.beginWorker()).toBe(true);
    expect(tracker.beginWorker()).toBe(true);
    expect(tracker.beginWorker()).toBe(false);
    tracker.endWorker();
    expect(tracker.beginWorker()).toBe(true);
  });

  it('reconciles spent tokens against the tokenMeter measurement', () => {
    const tracker = new BudgetTracker();
    tracker.reserve(10_000);
    tracker.settle(120_000);
    expect(tracker.snapshot().spentTokens).toBe(120_000);
    expect(tracker.snapshot().overLimit).toBe(true);
  });

  it('counts dispatches and active workers in the snapshot', () => {
    const tracker = new BudgetTracker();
    tracker.beginWorker();
    tracker.reserve(32_000);
    const snapshot = tracker.snapshot();
    expect(snapshot.activeWorkers).toBe(1);
    expect(snapshot.totalDispatches).toBe(1);
  });
});

describe('budget persistence (Slice 2, plan item 3)', () => {
  it('writes and reads a budget evidence record', async () => {
    await withTmpRoot(async (root) => {
      const tracker = new BudgetTracker(100_000);
      tracker.reserve(32_000);
      await writeBudgetEvidence(root, 'alpha-task', tracker.snapshot());
      const stored = await readEvidence(root, 'alpha-task', 'budget');
      expect(stored).not.toBeNull();
      expect(stored!.kind).toBe('budget');
      expect((stored!.extra as { snapshot: { spentTokens: number } }).snapshot.spentTokens).toBe(32_000);
    });
  });

  it('writes the budget status into the packet file envelope without changing the packet digest', async () => {
    await withTmpRoot(async (root) => {
      const input = await makePacketInputFor(root, 'alpha-task');
      const packet = buildAssignmentPacket(input);
      const observation = await verifyTrioOnDisk(input.authority.binding as never);
      await writePacket({ authorityRoot: root, taskId: 'alpha-task', packet, bindingObservation: observation });
      const digestBefore = (await readPacket(root, 'alpha-task'))!.packetDigest;

      const tracker = new BudgetTracker(100_000);
      tracker.reserve(32_000);
      const outcome = await writePacketBudget(root, 'alpha-task', tracker.snapshot());
      expect(outcome.status).toBe('updated');

      const stored = await readPacket(root, 'alpha-task');
      expect(stored!.packetDigest).toBe(digestBefore);
      expect(stored!.packet).toEqual(packet);
      expect(stored!.budget).toBeDefined();
      expect(stored!.budget!.spentTokens).toBe(32_000);
    });
  });

  it('refuses to refresh the packet budget on a Trio binding mismatch', async () => {
    await withTmpRoot(async (root) => {
      const input = await makePacketInputFor(root, 'alpha-task');
      const packet = buildAssignmentPacket(input);
      const observation = await verifyTrioOnDisk(input.authority.binding as never);
      await writePacket({ authorityRoot: root, taskId: 'alpha-task', packet, bindingObservation: observation });
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(root, 'planning', 'active', 'alpha-task', 'task_plan.md'), 'tampered\n', 'utf8');

      const outcome = await writePacketBudget(root, 'alpha-task', new BudgetTracker().snapshot());
      expect(outcome.status).toBe('mismatch');
      const stored = await readPacket(root, 'alpha-task');
      expect(stored!.budget).toBeUndefined();
    });
  });
});
