## Scenario
The patch introduces a tiny wrapper dependency even though the target platform already exposes the needed capability.

## Findings
tag: native
surface: `src/fs-watch.ts`
change: use the native file watching API instead of the dependency wrapper
why: the dependency only forwards options to the native API and expands the support surface

## Summary
net: -22 lines possible.
