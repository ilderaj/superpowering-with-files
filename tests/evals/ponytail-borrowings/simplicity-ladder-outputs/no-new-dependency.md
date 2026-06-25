## Scenario
task: Normalize relative paths in one command helper.
options:
- option-a: Use `node:path` plus a small local helper.
- option-b: Add a lightweight path utility package.

## Decision Ladder
1. no work / less work: Both options require a code change, so there is no true no-work path.
2. stdlib: Prefer option-a because `node:path` already covers the normalization we need with no new dependency.
3. native: Neutral after the stdlib win; the built-in runtime is already enough.
4. installed dependencies: No installed package adds unique value here, so option-b would only create lockfile churn.
5. smallest working diff: Option-a stays in one helper file and the lockfile stays untouched.

## Recommendation
decision: option-a
winning step: stdlib
reject: option-b because it adds a dependency for work the runtime already does.

## Guardrails
keep: no new dependency, no lockfile churn, and no trust-boundary checks removed.
note: simpler here means reusing the runtime, not skipping validation.
