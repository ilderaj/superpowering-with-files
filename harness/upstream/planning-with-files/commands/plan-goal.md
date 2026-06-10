---
description: "Bridge Claude Code's /goal to the active plan. Derives a goal condition from task_plan.md and invokes /goal so Claude keeps working until the plan is complete. Available since v2.38.0."
disable-model-invocation: true
allowed-tools: "Read Bash"
---

Bridge the active plan to Claude Code's `/goal` primitive.

Steps:

1. Resolve the active plan: prefer `${PLAN_ID}` env var, then `.planning/.active_plan`, then newest `.planning/<dir>/`, then legacy `./task_plan.md`.
2. Read the resolved `task_plan.md`, plus `progress.md` and `findings.md` from the same active task directory.
3. Before issuing `/goal`, apply the Goal Round Start Protocol for the current round:
   - restore planning context from the active task files
   - reclassify the round as `quick`, `tracked`, or `deep-reasoning`
   - keep quick rounds lightweight
   - keep `planning/active/<task-id>/` authoritative for tracked rounds
   - for deep-reasoning rounds, require reviewer-gated companion plans when they are new or materially revised, then execute approved plans with normal Superpowers execution and worktree discipline
4. Derive a goal condition from the plan content:
   - Default: "all phases in task_plan.md report Status: complete and check-complete.sh reports ALL PHASES COMPLETE"
   - If user passed an argument: use that as an additional clause (e.g., `/plan-goal until all tests pass`)
5. Issue Claude Code's `/goal <condition>` with the derived text.
6. Confirm to the user: print the goal condition + the active plan ID + remind that `/goal clear` cancels.

If `task_plan.md` does not exist, refuse and direct user to run `/plan` first.

Why this exists:

`/goal` runs the agent until a small fast model confirms the condition is met. It evaluates the transcript only, not files. By deriving the condition from the plan file, this command turns the file-based plan into a measurable termination criterion for `/goal`, so the loop terminates when the plan is actually done, not when the conversation looks done.

Notes:

- `/plan-goal` does not replace `/goal`. It composes with it. Users can still run `/goal "any text"` directly.
- The derived condition stays under the 4000-char limit `/goal` enforces by quoting only phase headers + acceptance criteria, not full task body.
- Combine with `/plan-loop` for a "babysit until done" workflow: `/plan-loop` cadence + `/plan-goal` termination.
- `/goal` remains the native executor. This wrapper adds repo-owned round-start discipline; it does not introduce a second runner.
