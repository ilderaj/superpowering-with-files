## Scenario
The feature adds future-facing extension points and configuration branches that no current caller needs.

## Findings
tag: yagni
surface: `src/workflow-router.ts`
change: remove the speculative plugin registry and keep the single in-scope execution path
why: the extra extension surface increases branching and maintenance before any real use case exists

## Summary
Verify the bounded cut preserves the required behavior; no line estimate is asserted.
