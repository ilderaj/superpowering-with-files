# Overengineering Review Rubric

## Hard Checks
- Every actionable fixture output contains `## Scenario`, `## Findings`, and `## Summary`
- Every actionable fixture output uses exactly one supported tag: `delete`, `stdlib`, `native`, `yagni`, or `shrink`
- Every actionable finding contains `surface`, `change`, and `why`
- Every output ends with `net: -<N> lines possible.`
- The correctness-only fixture stays out of scope and does not fabricate an overengineering tag

## What Good Looks Like
- The finding proposes a smaller shape, not a broader rewrite
- The rationale explains why the current shape is over-built
- The output stays focused on complexity cuts instead of correctness, security, or performance review
