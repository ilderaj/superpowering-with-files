---
name: risk-assessment-before-destructive-changes
description: Use when destructive changes, cleanup commands, hard resets, broad deletes, or permission changes need a recorded risk assessment before execution
---

# Risk Assessment Before Destructive Changes

## Overview
Destructive work starts only after the rollback path is written down. The active task plan must capture the exact command, target, blast radius, checkpoint, and rollback steps before execution.

## When to Use
- `rm -rf`, `git clean`, `git reset --hard`, `chmod`, `chown`, cleanup scripts, or broad file rewrites
- Commands that can delete, rewrite, or desync more than one generated file
- Any time a safety hook asks because risk assessment is missing

## Quick Reference
| Step | Required record |
| --- | --- |
| 1 | Exact command and target path |
| 2 | Workspace-boundary note |
| 3 | `./scripts/harness checkpoint . --quiet` output path |
| 4 | Non-empty row under `## Risk Assessment` in `planning/active/<task-id>/task_plan.md` |
| 5 | Rollback steps and where they were logged |

## Implementation
1. Identify the exact destructive command and every target path.
2. State whether the command touches only the current workspace.
3. Run `./scripts/harness checkpoint . --quiet` and capture the resulting checkpoint path.
4. Add a filled table row under `## Risk Assessment` in the active task plan.
5. Record the checkpoint path and rollback steps in `progress.md` or `findings.md`.
6. Execute the command only after the written record is complete.

## Common Mistakes
- Adding the heading without a filled table row
- Running checkpoint but not recording the path
- Writing “cleanup” without the exact command and target
- Treating generated directories as automatically safe without a rollback note

## Red Flags
- “It is only DerivedData”
- “I can recreate this later”
- “The hook already knows what I mean”

Any of these means: stop, checkpoint, and write the missing Risk Assessment row first.
