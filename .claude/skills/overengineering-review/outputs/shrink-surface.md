## Scenario
The change is directionally correct, but it touches more files and helpers than the behavior requires.

## Findings
tag: shrink
surface: `src/install-flow.ts`
change: keep the behavior in the existing file and remove the extra helper split introduced only for this narrow change
why: the split expands the diff and file surface without paying back in reuse or clarity

## Summary
net: -9 lines possible.
