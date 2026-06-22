## Scenario
The patch adds a forwarding wrapper over an existing helper without introducing any policy, translation, or lifecycle boundary.

## Findings
tag: delete
surface: `src/run-with-wrapper.ts`
change: remove the forwarding wrapper and call `runTask()` directly from the caller
why: the wrapper adds another layer to read and test without changing behavior

## Summary
net: -18 lines possible.
