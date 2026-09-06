## Scenario
The implementation ships a hand-rolled parser for behavior already covered by the standard library.

## Findings
tag: stdlib
surface: `src/parse-args.ts`
change: replace the custom token split and trim loop with the standard library parser already available in the runtime
why: the custom parser is longer, harder to trust, and duplicates built-in behavior

## Summary
Verify the bounded cut preserves the required behavior; no line estimate is asserted.
