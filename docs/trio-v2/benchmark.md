# Trio v2 Wave 7 Shadow Evaluation

> **Deterministic shadow evidence; not a matched Host/model/billing benchmark.**

This report is derived from the corrected observed read-only run written at `2026-08-03T15:21:45.755Z`. It replays twelve fixed local proof contracts with one immutable packet per scenario. It does not claim a real Host task run, authenticated model or effort, per-scenario token attribution, billing savings, human intervention, or scope drift.

## Scenario set

The evaluator ran this exact ordered set once per replay:

1. `quick-bug`
2. `tracked-feature`
3. `complex-debug`
4. `broad-refactor`
5. `cross-session-recovery`
6. `two-worker`
7. `plan-mismatch`
8. `luna-to-terra`
9. `host-unavailable`
10. `source-backed-document`
11. `formula-spreadsheet`
12. `high-risk-cleanup`

Each result recorded the fixed argv, exit code, duration, normalized stdout/stderr hashes, packet SHA-256, contract status, and evidence completeness. The proof commands are hard-coded in the evaluator; fixture data cannot supply shell fragments or commands.

## Context proxy

Both arms included identical packet bytes. The legacy arm read the current `AGENTS.md`; the Trio arm read `harness/trio/templates/entry-policy.md`, `harness/trio/skill/SKILL.md`, and the scenario's one capability pack. Every source record stores its path, byte count, SHA-256, and the formula `ceil(UTF-8 bytes / 4)`.

- Median context-token reduction: `55.9003603286607%`
- Threshold: `25%`
- `costProxyVerdict`: `pass`
- `shadowVerdict`: `pass` (12/12 accepted deterministic replays)

This is an instruction-surface proxy only. It is not a measure of reasoning quality, output tokens, model pricing, or accepted task cost.

## Task-level orchestration proxy

The corrected observed run used explicit Chief session `019fc2b5-d7e5-74a3-8983-f18f119b2e43`, date window `2026-08-02T13:40:00Z` through the current snapshot, and explicit delegate include `019fc2c3-0b93-7640-89db-4332ad20d4ec`. Selection first included every unique session whose token-audit `taskId` exactly matched `trio-v2-refactor-20260802` (27 sessions including the Chief), then appended the one explicit generic exception. The token-audit service reported:

- Exact-task selected sessions: `27`
- Explicit generic additions: `1`
- Total selected sessions: `28`
- Chief fresh proxy: `8,232,765`
- Delegate fresh proxy: `69,889,708`
- Chief fresh share: `10.538280066991734%`
- Threshold: `<15%`
- `orchestrationProxyVerdict`: `pass`

This aggregation is cumulative for the selected window. Exact task ID matching remains heuristic task attribution; the delegate was explicitly included because its heuristic task label is generic. The values are not billing data or authenticated actual-model evidence, and no raw session file paths are emitted. The explicit generic addition was not used to tune the threshold.

## Gate result

The shadow, context proxy, and task-level orchestration proxy layers pass for this read-only snapshot. `cutoverVerdict` remains `pending_full_preconditions`; this worker does not turn it into an acceptance or default-runtime decision. Chief must independently verify the full precondition matrix. The selection rule remains fixed: exact task-ID matching is heuristic attribution, and the explicit generic addition is a manual exception rather than a billing or model-quality adjustment.

## Limitations

- `actualModel` and `actualEffort` remain `unknown` because no authenticated Host fields were supplied.
- `mainTokens`, `workerTokens`, `freshTokenProxy`, `trustworthyCost`, `humanIntervention`, and `scopeDrift` remain JSON `null` for every scenario.
- The replay uses local proof commands and does not execute a Host worker, native subagent, external connector, or durable runtime.
- Generated result evidence is a candidate artifact for Chief review, not a release, cutover, or billing record.
