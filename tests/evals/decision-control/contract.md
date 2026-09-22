# Decision-control evaluation contract

This directory defines offline aggregation only. It does not create T1.5 results, call a model, activate a gate, write Trio/Linear, or claim accuracy.

T1 contract replay uses the frozen `cases.json` and independent `ground-truth.json`. The runner rejects missing, duplicate, extra, or mixed case IDs. `waiting-human` and `policy_gate` map to `escalate` only at the comparison boundary. Null answers are unevaluable, not disagreements. Reported metrics are conditionalAgreement (correct/answered), coverage (answered/all), correctOverAll, abstentionRate, falseDoneRate with its own denominator and coverage, and prematureExecutionRate with its own denominator and coverage. `legacyReferenceAccuracy` is an author-authored historical reference.

T1.5 is a blinded protocol: the raw task and visible evidence are frozen before prediction; operator answers, truth, and later outcomes are absent. Chief labels first, then two independent reviewers use the same rubric and hashes. Conflict remains ambiguous. Baseline and bundled methods receive the same raw input, model, effort, tool budget, and Host evidence. Without authenticated Host evidence, comparability is unknown. No fixture in this repository is a T1.5 result.

T2 profile accounting sums all input/output usage for both arms, including decision, evidence, worker, retry, review, and integration events. `totalTokens = input + output`; `freshTokens = input - cachedInput + output`; missing usage is never zero. Shared overhead must be complete and symmetrically excluded. The total-token ratio must be at most 1.05. A ratio in (1, 1.05] is covered only after the preregistered efficiency improvement reproduces on two rounds and independent holdout. Otherwise the profile is `unproven`; above 1.05 is `not_supported`.

## Corrected measured-input profile (2026-09-22 Chief review)

The preceding phrase “symmetrically excluded” is superseded: **all attributable overhead is included**, `sharedOverhead.attribution=complete` and `symmetricExclusion=false`. Unknown attribution is unproven. Primary output tokens come only from Host output usage, not fresh tokens.

Each `runs` event has unique `eventId`, `caseId`, `arm=baseline|swf`, a role, `startedAt`, `modelEvidenceRef`, and `usage={input,output,cachedInput}`. The event manifest covers decision preparation, workers, retries, review and integration. `coverage={allEventsIncluded:true,matchedExecutionBudget:true,evidenceRef}` attests a separately reviewable complete manifest; the aggregator cannot authenticate a reference. Unknown cache usage only makes fresh tokens unknown, not known input/output totals.

`cases` has unique caseId, taskId, partition development|holdout, round1|2, and baseline/swf metrics (`roundsToResolution`, `repairLoops`, `decisionAccuracy` in0..1, `qualityPass`). Output metrics are derived from events. Groups must not leak between development and holdout. Missing arm, quality failure, absent metric or unknown event coverage prevents supported.

`registration` freezes primaryMetric, baselineHash, swfHash, rubricHash, registeredAt and evidenceRef before every measured event. Improvement is computed from paired observations, not `effectMet`/`reproduced` booleans. Require both development rounds and independent holdout to meet the preregistered threshold, minimum6 pairs per group and paired bootstrap95% interval above zero. Intervals are seeded descriptive pilot estimates, not a statistical power guarantee. Other primary metrics may not regress; uncertain/incomplete profiles remain unproven. Small datasets cannot establish equivalence. `evidenceKind=synthetic` always leaves final verdict unproven, even when arithmetic supports an effect.

Run `node --test tests/evals/decision-control/profile.test.mjs` and `node scripts/evaluate-decision-profile.mjs <profile.json>`. Unit data that exercise the live branch are explicitly synthetic tests, not actual live results. No monetary savings are claimed without verified provider prices.

Each usage event also has a unique `usageEvidenceRef` pointing at its original Host/provider receipt. Re-identifying the same receipt must not count twice. Multiple different events per case/arm are expected (decision, worker, retry, review), so case/arm itself is not a usage uniqueness key. The offline validator cannot detect fabricated distinct receipts; Chief must inspect source coverage. Repeated rounds of the same task are clustered by task for interval/effect calculation; at least6 independent tasks per group are required, not6 duplicated rows.

`blind-protocol.mjs` validates the pre-label manifest: fixed raw-input hash, task-disjoint partitions, unique case IDs, no truth/operator/prediction fields, unknown Host evidence remains unknown. Free text still requires human semantic leakage review. Empty t15-blind.json is protocol-only, never an independent evaluation result.
