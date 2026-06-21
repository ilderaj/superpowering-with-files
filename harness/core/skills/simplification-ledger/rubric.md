# Simplification Ledger Rubric

## Hard Checks
- Every output contains `## Scenario`, `## Ledger`, and `## Summary`
- Every matched row includes `file`, `line`, `simplification`, `ceiling`, and `upgrade trigger`
- Missing upgrade triggers are reported as `no-trigger`
- Outputs stay read-only and do not suggest rewriting markers or adding a runtime / installer command
- Unsupported marker locations such as prose and block comments are ignored in V1

## What Good Looks Like
- The ledger groups rows by file
- The row format is compact and scannable
- The report makes temporary ceilings visible without widening scope into automation
