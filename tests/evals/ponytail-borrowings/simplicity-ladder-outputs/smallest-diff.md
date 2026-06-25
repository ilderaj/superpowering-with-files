## Scenario
task: Add one optional flag to an existing command.
options:
- option-a: Patch the parser and one output test in two files.
- option-b: Refactor the command framework across eight files before adding the same flag.

## Decision Ladder
1. no work / less work: We cannot avoid the change, but we can avoid the refactor detour.
2. stdlib: Neutral; both options use the same existing runtime features.
3. native: Neutral; no platform capability changes the trade-off.
4. installed dependencies: Neutral; neither option needs a new package.
5. smallest working diff: Prefer option-a because it changes two files, preserves the same behavior, and lands the flag without widening scope.

## Recommendation
decision: option-a
winning step: smallest working diff
reject: option-b because it spends review budget on a framework rewrite before the user-visible need is met.

## Guardrails
keep: preserve the same behavior and validation path while taking the smaller change.
note: simpler here means less surface area, not a weaker contract.
