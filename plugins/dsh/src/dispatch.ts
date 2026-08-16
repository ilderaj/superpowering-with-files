// Worker dispatch orchestration (Slice 2, plan items 1/2/3/4/5).
//
// Host adaptation (feasibility report decision 4 + assets/dsh-host-adaptation.md
// rules 1/4): under dsh the visible execution worker IS a subagent dispatched
// through ctx.subagents with a recorded {SessionId, provider, declared model}
// evidence record; there is no Codex-style visible-worker seam on a dsh host,
// and the entry policy's "never substitute a native subagent for the execution
// worker" is restated as "never substitute an UNRECORDED subagent for the
// visible worker". Every dispatch goes through this module. A dispatch whose
// record cannot be formed is failed closed (manual_pending) and the run is
// disposed: never a silent dispatch, never an unrecorded visible worker.
//
// Gate order per plan: (1) packet + Trio binding, (2) provider resolution,
// (3) deep-tier confirmation, (4) Trio gate registry + dsh approval channel,
// (5) subagents service/provider availability, (6) budget cap, (7) dispatch
// with mandatory evidence write.

import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { Session } from '@deepseek-ai/dsh-session';
import type { SubagentRunInfo, SubagentRuntime } from '@deepseek-ai/dsh-subagent';

import { BudgetTracker, writeBudgetEvidence, type BudgetSnapshot } from './budget.js';
import type { SwfDshContext } from './context.js';
import { subagentsServiceOf } from './context.js';
import {
  classifyGateCategories,
  deepTierGate,
  DISPATCH_PROVIDER_REGISTRY_NAMES,
  dispatchTierOf,
  resolveDispatchProvider,
  validateMaxTokens,
  type DispatchTier
} from './core/dispatch.js';
import {
  evidenceRecord,
  packetDigestOf,
  type TrioBinding,
  type WorkerEvidenceRecord
} from './core/index.js';
import {
  readPacket,
  readEvidence,
  verifyTrioOnDisk,
  writeEvidence,
  writePacketBudget,
  type EvidenceFile,
  type PacketBudget
} from './packet.js';

export interface DispatchOptions {
  authorityRoot: string;
  taskId: string;
  parent: Agent;
  prompt: string;
  label?: string;
  signal?: AbortSignal;
  deepConfirmed?: unknown;
  maxTokens?: number;
  /** tokenMeter measurement override (tests/embedders); defaults to ctx.tokenMeter. */
  measuredTokens?: number;
}

export interface DispatchResult {
  status: 'dispatched' | 'manual_pending';
  blocker?: string;
  resumeCondition?: string;
  provider: string;
  model: string;
  registryProvider: string;
  tier: DispatchTier;
  runId?: string;
  sessionId?: string;
  evidence?: EvidenceFile;
  budget?: BudgetSnapshot;
}

export interface SettleOptions {
  authorityRoot: string;
  taskId: string;
  runId: string;
  stopReason: string;
}

export interface WorkerDispatcher {
  dispatch(options: DispatchOptions): Promise<DispatchResult>;
  settle(options: SettleOptions): Promise<void>;
  budgetOf(authorityRoot: string, taskId: string): BudgetSnapshot;
}

export function createDispatcher(ctx: SwfDshContext): WorkerDispatcher {
  // Per-task ledgers: one dispatcher serves every authorityRoot/taskId pair,
  // so the 100k cap and spent tokens must never bleed across tasks. Ledgers
  // are keyed by authorityRoot + taskId and initialized from the persisted
  // packet budget envelope when one exists.
  const ledgers = new Map<string, BudgetTracker>();
  // Run settlement bookkeeping: auto-settlement (run.result) and manual
  // settle() are both idempotent per run id, and only the run that still
  // holds a task's worker slot releases it (a stale completion must never
  // free a successor run's slot).
  const settledRunIds = new Set<string>();
  const activeRunByKey = new Map<string, string>();

  function ledgerKey(authorityRoot: string, taskId: string): string {
    return authorityRoot + '\u0000' + taskId;
  }

  function ledgerFor(authorityRoot: string, taskId: string, storedBudget?: PacketBudget | null): BudgetTracker {
    const key = ledgerKey(authorityRoot, taskId);
    const existing = ledgers.get(key);
    if (existing) return existing;
    const ledger = new BudgetTracker(storedBudget?.cap, storedBudget?.spentTokens);
    ledgers.set(key, ledger);
    return ledger;
  }

  function pending(ledger: BudgetTracker, blocker: string, resumeCondition?: string): DispatchResult {
    return {
      status: 'manual_pending',
      blocker,
      resumeCondition,
      provider: '',
      model: '',
      registryProvider: '',
      tier: 'standard',
      budget: ledger.snapshot()
    };
  }

  async function dispatch(options: DispatchOptions): Promise<DispatchResult> {
    const { authorityRoot, taskId, parent, prompt } = options;

    // 1. The assignment ticket must exist. It is a DERIVED, rebindable copy
    //    of the bind-time assignment — not a durable authority surface. The
    //    Trio planning files are the sole durable task authority and are
    //    re-verified against the binding on every dispatch (step 2).
    const packetFile = await readPacket(authorityRoot, taskId);
    if (!packetFile) {
      return pending(
        ledgerFor(authorityRoot, taskId),
        'no_packet',
        'Bind the assignment ticket with /swf bind before dispatching. The Trio planning files remain the sole durable task authority.'
      );
    }
    const ledger = ledgerFor(authorityRoot, taskId, packetFile.budget);

    // 2. Trio binding verification: binding_mismatch stops immediately.
    const binding = (packetFile.packet.authority as { binding?: unknown } | undefined)?.binding as TrioBinding;
    const observation = await verifyTrioOnDisk(binding);
    if (observation.status === 'mismatch') {
      return pending(ledger, 'binding_mismatch', 'Restore the planning trio to the binding before dispatching: ' + observation.mismatches.join(', '));
    }
    if (observation.status === 'unavailable') {
      return pending(ledger, 'binding_unavailable', 'Trio files are missing; restore planning/active/<task>/ before dispatching.');
    }

    // 3. Provider routing (default dsh-sdk; explicit-only codex/claude-code).
    let resolution;
    try {
      resolution = resolveDispatchProvider(packetFile.packet);
    } catch (error) {
      return pending(ledger, 'unsupported_provider', (error as Error).message);
    }
    const registryProvider = DISPATCH_PROVIDER_REGISTRY_NAMES[resolution.provider] ?? '';

    // 4. Tier classification + deep-tier explicit confirmation.
    const tier = dispatchTierOf(packetFile.packet.capability);
    const tierGate = deepTierGate(tier, options.deepConfirmed);
    if (!tierGate.allowed) {
      return pending(ledger, tierGate.reason ?? 'deep_tier_confirmation_required', 'Confirm the deep tier explicitly before dispatching.');
    }

    // 5. Dual-layer gate: Trio gate registry decides, dsh approval is the
    // interactive channel. Gated categories without a grant stop here.
    const gateCategories = classifyGateCategories(packetFile.packet);
    if (gateCategories.length > 0) {
      const outcome = await ctx.approval.request({
        agent: parent,
        toolName: 'swf.dispatch',
        reason: 'SWF gated dispatch (' + gateCategories.join(', ') + ') for task ' + taskId,
        signal: options.signal
      });
      await writeEvidence({
        authorityRoot,
        taskId,
        kind: 'gate',
        record: evidenceRecord({ sessionId: null, provider: null, declaredModel: null }),
        extra: { categories: gateCategories, outcome, taskId, requestedProvider: resolution.provider }
      });
      if (outcome !== 'allowed-once') {
        return pending(ledger, 'gate_approval_required', 'Gated categories require an explicit human approval grant: ' + gateCategories.join(', '));
      }
    }

    // 6. The ctx.subagents seam must be mounted and the registry provider
    // resolvable. Fail closed before any dispatch attempt.
    const subagents: SubagentRuntime | undefined = subagentsServiceOf(ctx);
    if (!subagents) {
      return pending(ledger, 'subagents_service_unavailable', 'The dsh host did not mount the ctx.subagents service.');
    }
    if (!subagents.list().includes(registryProvider)) {
      return pending(ledger, 'provider_unavailable', 'Registry provider ' + registryProvider + ' is not resolvable on this dsh host.');
    }

    // 7. Budget cap: reconcile the tokenMeter measurement, claim a parallel
    // slot, then reserve tokens. Over-limit or over-cap => manual_pending.
    let measured = options.measuredTokens;
    if (measured === undefined) {
      const session = (parent as { session?: Session }).session;
      try {
        measured = session ? ctx.tokenMeter.measure(session).totalTokens : 0;
      } catch {
        measured = 0;
      }
    }
    ledger.settle(measured ?? 0);
    if (!ledger.beginWorker()) {
      await writeBudgetEvidence(authorityRoot, taskId, ledger.snapshot(), { blockedBy: 'parallel_worker_cap_exceeded' });
      await writePacketBudget(authorityRoot, taskId, ledger.snapshot());
      return pending(ledger, 'parallel_worker_cap_exceeded', 'Wait for an active worker to settle before dispatching another.');
    }
    const capability = packetFile.packet.capability as { maxTokens?: unknown } | undefined;
    let requestedTokens: number;
    try {
      requestedTokens = validateMaxTokens(options.maxTokens ?? capability?.maxTokens);
    } catch (error) {
      ledger.endWorker();
      return pending(ledger, 'invalid_max_tokens', (error as Error).message);
    }
    const reserve = ledger.reserve(requestedTokens);
    if (!reserve.allowed) {
      ledger.endWorker();
      await writeBudgetEvidence(authorityRoot, taskId, ledger.snapshot(), { blockedBy: reserve.reason ?? 'budget_blocked' });
      await writePacketBudget(authorityRoot, taskId, ledger.snapshot());
      return pending(ledger, reserve.reason ?? 'budget_blocked', 'Raise the task budget cap or reduce spent context before dispatching.');
    }

    // 8. Observe subagent/start BEFORE starting so the mandatory
    // {SessionId, provider} record can be formed from the host event.
    const startInfos: SubagentRunInfo[] = [];
    const disposeObserver = ctx.on('subagent/start', (info: SubagentRunInfo) => {
      startInfos.push(info);
    });

    // 9. Dispatch through ctx.subagents (the visible worker seam).
    let run;
    try {
      run = await subagents.start(registryProvider, {
        label: options.label ?? 'SWF task ' + taskId,
        prompt: [{ type: 'text', text: prompt }] as ContentBlock[],
        parent,
        signal: options.signal ?? new AbortController().signal,
        agentOptions: {
          provider: resolution.provider,
          model: resolution.model,
          maxTokens: requestedTokens
        }
      });
    } catch (error) {
      disposeObserver();
      ledger.endWorker();
      await writeBudgetEvidence(authorityRoot, taskId, ledger.snapshot(), { blockedBy: 'dispatch_start_rejected' });
      await writePacketBudget(authorityRoot, taskId, ledger.snapshot());
      return pending(ledger, 'dispatch_start_rejected', 'The subagent provider rejected the start before publication: ' + (error as Error).message);
    }
    disposeObserver();

    // 10. Mandatory visible-worker record: {SessionId, provider, declared
    // model}. Without all three the dispatch fails closed and the run is
    // disposed — never a silent dispatch.
    const sessionId = run.id ? String(run.id) : null;
    // The evidence provider is the packet-facing semantic provider (report
    // vocabulary: dsh-sdk / codex / claude-code). The host start event's
    // provider is the registry name (subagent-*); it is recorded as an
    // observation and cross-checked, never used as the semantic provider.
    const observedProvider = resolution.provider;
    const declaredModel = resolution.model;
    const observedRegistryProvider = startInfos[0]?.provider ?? null;
    if (!sessionId || !observedProvider || !declaredModel) {
      await run.dispose();
      ledger.endWorker();
      await writeEvidence({
        authorityRoot,
        taskId,
        kind: 'worker',
        record: evidenceRecord({ sessionId: null, provider: null, declaredModel: null }),
        extra: {
          failure: 'dispatch_record_unavailable',
          note: 'start resolved but no {SessionId, provider, declared model} record could be formed; run disposed',
          packetDigest: packetDigestOf(packetFile.packet)
        }
      });
      await writeBudgetEvidence(authorityRoot, taskId, ledger.snapshot(), { blockedBy: 'dispatch_record_unavailable' });
      await writePacketBudget(authorityRoot, taskId, ledger.snapshot());
      return pending(ledger, 'dispatch_record_unavailable', 'A visible worker requires a recorded {SessionId, provider, declared model}; the run was disposed and the dispatch failed closed.');
    }

    // 11. Write the three-state worker evidence (host-claimed: dsh records
    // the visible dispatch but provides no authenticated evidence ref).
    const record: WorkerEvidenceRecord = evidenceRecord({ sessionId, provider: observedProvider, declaredModel });
    const evidence = await writeEvidence({
      authorityRoot,
      taskId,
      kind: 'worker',
      record,
      extra: {
        runId: startInfos[0]?.runId ? String(startInfos[0].runId) : null,
        registryProvider,
        tier,
        requestedTokens,
        packetDigest: packetDigestOf(packetFile.packet),
        startEventObserved: startInfos.length > 0,
        observedRegistryProvider,
        registryMismatch: observedRegistryProvider !== null && observedRegistryProvider !== registryProvider
      }
    });

    // 12. Persist budget status into evidence and the packet file envelope.
    const budget = ledger.snapshot();
    await writeBudgetEvidence(authorityRoot, taskId, budget);
    await writePacketBudget(authorityRoot, taskId, budget);

    // 13. Host-owned completion: attach the run's terminal result so the
    // worker slot settles automatically when the run finishes. The command
    // surface returns while the worker is still executing; /swf accept only
    // proceeds once this settles the completed worker-result candidate.
    // The run id currently holding the task's slot is recorded first so a
    // stale completion can never release a successor run's slot.
    const key = ledgerKey(authorityRoot, taskId);
    activeRunByKey.set(key, sessionId);
    void run.result
      .then((terminal) =>
        settle({ authorityRoot, taskId, runId: sessionId, stopReason: terminal.stopReason })
          .catch(() => undefined)
          .then(() => run.dispose().catch(() => undefined))
      );

    return {
      status: 'dispatched',
      provider: resolution.provider,
      model: resolution.model,
      registryProvider,
      tier,
      runId: sessionId,
      sessionId,
      evidence,
      budget
    };
  }

  async function settle(options: SettleOptions): Promise<void> {
    const key = ledgerKey(options.authorityRoot, options.taskId);
    const packetFile = await readPacket(options.authorityRoot, options.taskId);
    const binding = packetFile
      ? (packetFile.packet.authority as { binding?: unknown } | undefined)?.binding as TrioBinding
      : null;
    const observation = binding ? await verifyTrioOnDisk(binding) : null;
    // worker settlement is a report, not a gate: end the slot and record the
    // terminal stop reason with the prior three-state worker record. Slot
    // release is idempotent per run id and only the run that still holds the
    // task's slot releases it.
    if (!settledRunIds.has(options.runId)) {
      settledRunIds.add(options.runId);
      if (activeRunByKey.get(key) === options.runId) {
        activeRunByKey.delete(key);
        ledgerFor(options.authorityRoot, options.taskId, packetFile?.budget ?? null).endWorker();
      }
    }
    const prior = await readEvidence(options.authorityRoot, options.taskId, 'worker');
    const record: WorkerEvidenceRecord = prior
      ? {
          state: prior.state,
          authenticated: prior.authenticated,
          evidenceRef: prior.evidenceRef,
          sessionId: prior.sessionId,
          provider: prior.provider,
          declaredModel: prior.declaredModel,
          actualModel: prior.actualModel,
          actualEffort: prior.actualEffort
        }
      : evidenceRecord({ sessionId: null, provider: null, declaredModel: null });
    await writeEvidence({
      authorityRoot: options.authorityRoot,
      taskId: options.taskId,
      kind: 'worker-result',
      record,
      extra: {
        runId: options.runId,
        stopReason: options.stopReason,
        trioVerified: observation?.status === 'match',
        packetDigest: packetFile?.packetDigest ?? null
      }
    });
    const budget = ledgerFor(options.authorityRoot, options.taskId, packetFile?.budget ?? null).snapshot();
    await writeBudgetEvidence(options.authorityRoot, options.taskId, budget);
    await writePacketBudget(options.authorityRoot, options.taskId, budget);
  }

  return {
    dispatch,
    settle,
    budgetOf: (authorityRoot: string, taskId: string) => ledgerFor(authorityRoot, taskId).snapshot()
  };
}
