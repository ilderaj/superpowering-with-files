// Budget ledger and persistence (Slice 2, plan item 3).
//
// In-memory per-task ledger: ≤2 parallel workers, a per-task token cap
// (default ~100k), tokenMeter reconciliation, and fail-closed over-limit
// manual_pending. Budget snapshots are written as evidence (kind 'budget')
// and into the packet FILE envelope (see writePacketBudget in packet.ts);
// the bound assignment packet content itself never changes, so the digest stays
// stable.

import {
  decideBudget,
  MAX_PARALLEL_WORKERS,
  TASK_TOKEN_BUDGET_DEFAULT,
  type BudgetDecision
} from './core/dispatch.js';
import { writeEvidence } from './packet.js';

export interface BudgetSnapshot {
  cap: number;
  spentTokens: number;
  activeWorkers: number;
  totalDispatches: number;
  overLimit: boolean;
  checkedAt: string;
  source: 'tokenMeter' | 'ledger';
}

export class BudgetTracker {
  private readonly cap: number;
  private spent: number;
  private active = 0;
  private dispatches = 0;

  /**
   * @param cap task token cap (defaults to the documented per-task 100k).
   * @param initialSpent spent tokens carried over from the persisted packet
   * budget envelope, so a restarted dispatcher keeps charging the same task
   * against its already-consumed budget instead of resetting the ledger.
   */
  constructor(cap: number = TASK_TOKEN_BUDGET_DEFAULT, initialSpent: number = 0) {
    this.cap = cap;
    this.spent = Number.isFinite(initialSpent) && initialSpent > 0 ? initialSpent : 0;
  }

  /** Reserve tokens for one dispatch; fails closed on budget_exceeded. */
  reserve(requestedTokens: number): BudgetDecision {
    const decision = decideBudget({
      spentTokens: this.spent,
      requestedTokens,
      budget: this.cap,
      activeWorkers: this.active,
      maxParallelWorkers: MAX_PARALLEL_WORKERS
    });
    if (!decision.allowed) return decision;
    this.spent += requestedTokens;
    this.dispatches += 1;
    return decision;
  }

  /** Claim one parallel worker slot; false when the cap is already met. */
  beginWorker(): boolean {
    if (this.active >= MAX_PARALLEL_WORKERS) return false;
    this.active += 1;
    return true;
  }

  endWorker(): void {
    if (this.active > 0) this.active -= 1;
  }

  /**
   * Reconcile the ledger against the tokenMeter measurement: spent is the max
   * of what was reserved and what the meter measured, so context pressure can
   * only push the task toward manual_pending, never hide it.
   */
  settle(measuredTokens: number): void {
    if (Number.isFinite(measuredTokens) && measuredTokens > this.spent) {
      this.spent = measuredTokens;
    }
  }

  snapshot(): BudgetSnapshot {
    return {
      cap: this.cap,
      spentTokens: this.spent,
      activeWorkers: this.active,
      totalDispatches: this.dispatches,
      overLimit: this.spent > this.cap,
      checkedAt: new Date().toISOString(),
      source: 'ledger'
    };
  }
}

/** Persist one budget snapshot as evidence kind 'budget'. */
export async function writeBudgetEvidence(
  authorityRoot: string,
  taskId: string,
  snapshot: BudgetSnapshot,
  extra: Record<string, unknown> = {}
): Promise<void> {
  await writeEvidence({
    authorityRoot,
    taskId,
    kind: 'budget',
    record: {
      state: 'unknown',
      authenticated: false,
      evidenceRef: null,
      sessionId: null,
      provider: null,
      declaredModel: null,
      actualModel: null,
      actualEffort: null
    },
    extra: { snapshot, ...extra }
  });
}
