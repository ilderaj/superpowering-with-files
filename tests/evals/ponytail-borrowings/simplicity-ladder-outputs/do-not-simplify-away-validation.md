## Scenario
task: Shrink an input adapter that validates user-supplied paths.
options:
- option-a: Keep validation and trim only redundant branching around the adapter.
- option-b: Remove validation to make the diff smaller.

## Decision Ladder
1. no work / less work: We do not need a redesign, but we still need a safe edit.
2. stdlib: Neutral; stdlib use does not decide this case.
3. native: Neutral; platform features are not the bottleneck.
4. installed dependencies: Neutral; no package choice changes the risk.
5. smallest working diff: Prefer option-a because option-b is not a working simplification once it drops trust-boundary validation.

## Recommendation
decision: option-a
winning step: smallest working diff
reject: option-b because a smaller diff that removes validation is not a working simplification.

## Guardrails
keep: keep validation, keep trust-boundary checks, and only remove redundant branching.
note: if a simplification deletes safety checks, reject it; that is not a working simplification.
