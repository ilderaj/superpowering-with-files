---
name: safe-bypass-flow
description: Use when starting bypass, autopilot, or long-running risky coding work that should be isolated from the main checkout before execution
---

# Safe Bypass Flow

## Overview
Bypass-style work belongs in an isolated worktree with a recovery path and a remote backup. The main checkout stays clean; risky execution happens only in the dedicated branch/worktree.

## When to Use
- Long-running agent sessions
- Risky refactors, wide edits, or destructive cleanups
- Any workflow described as bypass, autopilot, or “let it run”

## Quick Reference
| Step | Required action |
| --- | --- |
| 1 | `./scripts/harness worktree-preflight --task <task-id> --safety` when multiple active tasks exist |
| 2 | Record `Worktree base: <ref> @ <sha>` in planning |
| 3 | `git worktree add <path> -b <branch> <base>` |
| 4 | Start the session only inside that worktree |
| 5 | Prefer `./scripts/harness checkpoint-push --message="..."` before cleanup or merge |

## Implementation
1. Run `./scripts/harness worktree-preflight --task <task-id> --safety` when multiple active tasks exist.
2. Record the reported base ref and SHA in the active task files.
3. Create a dedicated worktree and branch for the risky session.
4. Let SessionStart checkpoint the worktree before destructive work continues.
5. After the milestone, prefer `./scripts/harness checkpoint-push --message="..."` so recovery exists off-machine with review evidence; if that command is unavailable or not yet adopted in the repo, fall back to `git push -u origin <branch>`.
6. Merge from the main repo checkout, then remove the worktree only after the push and merge succeed.

## Common Mistakes
- Starting from the main checkout because it is already open
- Skipping the remote push because the branch is “temporary”
- Deleting the worktree before confirming the remote backup
- Guessing the base branch instead of recording the explicit preflight result

## Red Flags
- “I will clean it up in place”
- “I can push later”
- “The main repo is basically the same as a worktree”

Any of these means: stop and create the isolated worktree first.
