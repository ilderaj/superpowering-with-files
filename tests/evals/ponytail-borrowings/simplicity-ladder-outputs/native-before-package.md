## Scenario
task: Add one HTTP call in a runtime that already has `fetch`.
options:
- option-a: Use the built-in runtime `fetch` directly.
- option-b: Add a convenience wrapper package around `fetch`.

## Decision Ladder
1. no work / less work: We still need to add the request, so a no-change answer does not close the task.
2. stdlib: Neutral; there is no narrower stdlib helper than the platform call itself.
3. native: Prefer option-a because the built-in runtime already provides `fetch` without a wrapper package.
4. installed dependencies: Existing dependencies do not improve the call enough to beat the native path.
5. smallest working diff: Option-a stays local to the request site and avoids package, adapter, and docs churn.

## Recommendation
decision: option-a
winning step: native
reject: option-b because it widens the surface around a platform feature we already have.

## Guardrails
keep: use the built-in runtime directly and leave existing validation behavior unchanged.
note: simpler here means fewer layers, not fewer checks.
