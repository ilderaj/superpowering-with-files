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
// (3) deep-tier confirmation, (4) Corleone persona resolution from the packet
// capability, (5) Trio gate registry + dsh approval channel, (6) subagents
// service/provider availability + persona capability, (7) budget cap,
// (8) dispatch with mandatory evidence write.

import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { Session } from '@deepseek-ai/dsh-session';
import type { SubagentRunInfo, SubagentRuntime } from '@deepseek-ai/dsh-subagent';

import { BudgetTracker, writeBudgetEvidence, type BudgetSnapshot } from './budget.js';
import type { SwfDshContext } from './context.js';
import { subagentsServiceOf, modelSelectionStartOf } from './context.js';
import {
  classifyGateCategories,
  deepTierGate,
  DISPATCH_PROVIDER_REGISTRY_NAMES,
  dispatchTierOf,
  MAX_PARALLEL_WORKERS,
  resolveDispatchProvider,
  validateMaxTokens,
  type DispatchTier
} from './core/dispatch.js';
import {
  evidenceRecord,
  packetDigestOf,
  resolveCorleoneRole,
  type CorleoneRoleSelection,
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
  effort?: string;
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

interface WorkerEvidenceExtraInput {
  runId: string | null;
  registryProvider: string;
  tier: DispatchTier;
  corleoneRole: CorleoneRoleSelection;
  requestedTokens: number;
  requestedEffort?: string;
  requestedModel?: string;
  packetDigest: string | null;
  startEventObserved: boolean;
  observedRegistryProvider: string | null;
}

/**
 * Format the existing worker evidence extras without owning dispatch policy.
 * This seam is deliberately local and pure: all inputs are already-resolved
 * values, and the function performs no I/O, context access, or gate work.
 */
function workerEvidenceExtra(input: WorkerEvidenceExtraInput): Record<string, unknown> {
  return {
    runId: input.runId,
    registryProvider: input.registryProvider,
    tier: input.tier,
    requestedRole: input.corleoneRole.agentType,
    requestedPersona: input.corleoneRole.persona,
    requestedDisplayName: input.corleoneRole.displayName,
    requestedTokens: input.requestedTokens,
    ...(input.requestedEffort ? { requestedEffort: input.requestedEffort, requestedModel: input.requestedModel } : {}),
    packetDigest: input.packetDigest,
    startEventObserved: input.startEventObserved,
    observedRegistryProvider: input.observedRegistryProvider,
    registryMismatch: input.observedRegistryProvider !== null
      && input.observedRegistryProvider !== input.registryProvider
  };
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
  // Host-wide worker admission: README documents at most two parallel
  // workers per host, so the cap is a dispatcher-wide counter, not a
  // per-task one. Token spending stays per task (ledgers above).
  let hostActive = 0;
  // Run settlement bookkeeping: auto-settlement (run.result) and manual
  // settle() both release slots idempotently per run id. Multiple runs may
  // be concurrently active for one task, so each key holds a SET of active
  // run ids; releasing only ever removes the run that actually settles.
  const activeRunsByKey = new Map<string, Set<string>>();

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

  function beginHostWorker(): boolean {
    if (hostActive >= MAX_PARALLEL_WORKERS) return false;
    hostActive += 1;
    return true;
  }

  function endHostWorker(): void {
    if (hostActive > 0) hostActive -= 1;
  }

  function activeRunSet(key: string): Set<string> {
    const existing = activeRunsByKey.get(key);
    if (existing) return existing;
    const set = new Set<string>();
    activeRunsByKey.set(key, set);
    return set;
  }

  /** Release one admitted run exactly once: frees the host slot and the
   *  task's worker slot. No-op for unknown/stale run ids. */
  function releaseSlot(key: string, runId: string, ledger: BudgetTracker): void {
    const runs = activeRunsByKey.get(key);
    if (!runs || !runs.delete(runId)) return;
    if (runs.size === 0) activeRunsByKey.delete(key);
    ledger.endWorker();
    endHostWorker();
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

    // 1b. Ticket integrity: the stored ticket content must match its recorded
    // digest. A hand-edited swf-packet.json (for example, removing a gated
    // operation) would still pass the Trio binding check, so the digest is
    // the guard that prevents an edited ticket from bypassing the gates.
    if (packetDigestOf(packetFile.packet) !== packetFile.packetDigest) {
      return pending(ledger, 'packet_digest_mismatch', 'Rebind the assignment ticket with /swf bind: the stored ticket content does not match its recorded digest.');
    }

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
    const capability = packetFile.packet.capability as { maxTokens?: unknown } | undefined;

    // 4. Tier classification + deep-tier explicit confirmation.
    const tier = dispatchTierOf(packetFile.packet.capability);
    const tierGate = deepTierGate(tier, options.deepConfirmed);
    if (!tierGate.allowed) {
      return pending(ledger, tierGate.reason ?? 'deep_tier_confirmation_required', 'Confirm the deep tier explicitly before dispatching.');
    }

    // 5. Corleone persona/role resolution: the visible worker identity is
    // derived from the packet capability (workRole / complexity /
    // primaryExecution) exactly like the harness Corleone selector. A packet
    // that cannot resolve to a Corleone execution role fails closed BEFORE
    // any approval request or start attempt — an unbound dispatch is never
    // admissible.
    let corleoneRole: CorleoneRoleSelection;
    try {
      corleoneRole = resolveCorleoneRole(capability);
    } catch (error) {
      return pending(ledger, 'corleone_role_unavailable', 'The packet capability does not resolve to a Corleone execution role: ' + (error as Error).message);
    }

    // 6. Dual-layer gate: Trio gate registry decides, dsh approval is the
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

    // 7. The ctx.subagents seam must be mounted and the registry provider
    // resolvable AND persona-capable. Fail closed before any dispatch
    // attempt: a Corleone-bound worker must never start without its persona.
    const subagents: SubagentRuntime | undefined = subagentsServiceOf(ctx);
    if (!subagents) {
      return pending(ledger, 'subagents_service_unavailable', 'The dsh host did not mount the ctx.subagents service.');
    }
    if (!subagents.list().includes(registryProvider)) {
      return pending(ledger, 'provider_unavailable', 'Registry provider ' + registryProvider + ' is not resolvable on this dsh host.');
    }
    const subagentProvider = subagents.getProvider(registryProvider);
    if (!subagentProvider || subagentProvider.capabilities.persona !== true) {
      return pending(ledger, 'persona_capability_unavailable', 'Registry provider ' + registryProvider + ' does not advertise persona support; the Corleone visible worker cannot start unbound.');
    }

    const selectionStart = resolution.effort ? modelSelectionStartOf(ctx) : undefined;
    if (resolution.effort && !selectionStart) {
      return pending(ledger, 'model_effort_controls_unavailable',
        'This Host must implement subagents.startWithModelSelection to bind the requested model and effort before the first child request; no default-effort fallback is allowed.');
    }

    // 8. Budget cap: reconcile the tokenMeter measurement, claim a parallel
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
    // Host-wide parallel cap first; the per-task ledger slot is secondary
    // accounting (spent tokens and per-task active count stay per task).
    const hostAdmitted = beginHostWorker();
    if (!hostAdmitted || !ledger.beginWorker()) {
      if (hostAdmitted) endHostWorker();
      await writeBudgetEvidence(authorityRoot, taskId, ledger.snapshot(), { blockedBy: 'parallel_worker_cap_exceeded' });
      await writePacketBudget(authorityRoot, taskId, ledger.snapshot());
      return pending(ledger, 'parallel_worker_cap_exceeded', 'Wait for an active worker to settle before dispatching another.');
    }
    let requestedTokens: number;
    try {
      requestedTokens = validateMaxTokens(options.maxTokens ?? capability?.maxTokens);
    } catch (error) {
      ledger.endWorker();
      endHostWorker();
      return pending(ledger, 'invalid_max_tokens', (error as Error).message);
    }
    const reserve = ledger.reserve(requestedTokens);
    if (!reserve.allowed) {
      ledger.endWorker();
      endHostWorker();
      await writeBudgetEvidence(authorityRoot, taskId, ledger.snapshot(), { blockedBy: reserve.reason ?? 'budget_blocked' });
      await writePacketBudget(authorityRoot, taskId, ledger.snapshot());
      return pending(ledger, reserve.reason ?? 'budget_blocked', 'Raise the task budget cap or reduce spent context before dispatching.');
    }

    // 9. Observe subagent/start BEFORE starting so the mandatory
    // {SessionId, provider} record can be formed from the host event.
    const startInfos: SubagentRunInfo[] = [];
    const disposeObserver = ctx.on('subagent/start', (info: SubagentRunInfo) => {
      startInfos.push(info);
    });

    // 10. Dispatch through ctx.subagents (the visible worker seam). The
    // resolved Corleone persona is passed as a top-level start field so the
    // child shadows the deployment persona with the frozen worker identity.
    let run;
    try {
      const request = {
        label: options.label ?? 'SWF task ' + taskId,
        persona: corleoneRole.persona,
        prompt: [{ type: 'text', text: prompt }] as ContentBlock[],
        parent,
        signal: options.signal ?? new AbortController().signal,
        agentOptions: {
          provider: resolution.provider,
          model: resolution.model,
          maxTokens: requestedTokens
        }
      };
      run = selectionStart && resolution.effort
        ? await selectionStart(registryProvider, request, {
          provider: resolution.provider, model: resolution.model, reasoningEffort: resolution.effort
        })
        : await subagents.start(registryProvider, request);
    } catch (error) {
      disposeObserver();
      ledger.endWorker();
      endHostWorker();
      await writeBudgetEvidence(authorityRoot, taskId, ledger.snapshot(), { blockedBy: 'dispatch_start_rejected' });
      await writePacketBudget(authorityRoot, taskId, ledger.snapshot());
      return pending(ledger, 'dispatch_start_rejected', 'The subagent provider rejected the start before publication: ' + (error as Error).message);
    }
    disposeObserver();

    // 11. Mandatory visible-worker record: {SessionId, provider, declared
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
      endHostWorker();
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

    // 12. Attach host-owned completion IMMEDIATELY after the record is
    // formed — before any persistence — so a persistence failure can never
    // orphan a running worker: whenever the run settles, its slot is
    // released, the worker-result is reported, and the run is disposed.
    // Each key holds a set of active run ids (two runs may run concurrently
    // for one task) and settlement only ever releases the run that settles.
    const key = ledgerKey(authorityRoot, taskId);
    activeRunSet(key).add(sessionId);
    void run.result
      .then((terminal) =>
        settle({ authorityRoot, taskId, runId: sessionId, stopReason: terminal.stopReason })
          .catch(() => undefined)
          .then(() => run.dispose().catch(() => undefined))
      );

    // 13. Persist the three-state worker evidence (host-claimed: dsh records
    // the visible dispatch but provides no authenticated evidence ref) and
    // the budget status. Any failure here ends the slot and disposes the
    // run — the worker must never keep running without its mandatory
    // evidence record.
    let evidence: EvidenceFile;
    try {
      const record: WorkerEvidenceRecord = evidenceRecord({ sessionId, provider: observedProvider, declaredModel });
      evidence = await writeEvidence({
        authorityRoot,
        taskId,
        kind: 'worker',
        record,
        extra: workerEvidenceExtra({
          runId: startInfos[0]?.runId ? String(startInfos[0].runId) : null,
          registryProvider,
          tier,
          corleoneRole,
          requestedTokens,
          requestedEffort: resolution.effort,
          requestedModel: resolution.requestedModel,
          packetDigest: packetDigestOf(packetFile.packet),
          startEventObserved: startInfos.length > 0,
          observedRegistryProvider
        })
      });
      const budget = ledger.snapshot();
      await writeBudgetEvidence(authorityRoot, taskId, budget);
      await writePacketBudget(authorityRoot, taskId, budget);
    } catch (error) {
      releaseSlot(key, sessionId, ledger);
      await run.dispose().catch(() => undefined);
      await writeBudgetEvidence(authorityRoot, taskId, ledger.snapshot(), { blockedBy: 'dispatch_persistence_failed' }).catch(() => undefined);
      return pending(ledger, 'dispatch_persistence_failed', 'The worker started but its mandatory evidence could not be persisted; the run was disposed: ' + (error as Error).message);
    }

    return {
      status: 'dispatched',
      provider: resolution.provider,
      model: resolution.model,
      ...(resolution.effort ? { effort: resolution.effort } : {}),
      registryProvider,
      tier,
      runId: sessionId,
      sessionId,
      evidence,
      budget: ledger.snapshot()
    };
  }

  async function settle(options: SettleOptions): Promise<void> {
    const key = ledgerKey(options.authorityRoot, options.taskId);
    const packetFile = await readPacket(options.authorityRoot, options.taskId);
    const binding = packetFile
      ? (packetFile.packet.authority as { binding?: unknown } | undefined)?.binding as TrioBinding
      : null;
    const observation = binding ? await verifyTrioOnDisk(binding) : null;
    // worker settlement is a report, not a gate: release the slot (exactly
    // once per admitted run) and record the terminal stop reason with the
    // prior three-state worker record.
    releaseSlot(key, options.runId, ledgerFor(options.authorityRoot, options.taskId, packetFile?.budget ?? null));
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
