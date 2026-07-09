---
name: goal2plan
description: Use when sparse, high-complexity intent needs an intake-sufficiency audit and a reviewed implementation plan before execution, using a native Codex `/goal` loop instead of a custom runner
---

# Goal2Plan

Goal2Plan is a skill-first Mode B workflow for turning sparse, high-effort intent into one reviewed implementation plan before execution starts. It first checks whether intake is actually insufficient and whether Goal2Plan is still the lightest sufficient path before it commits the task to a full planning loop, and it keeps that loop externally legible by asking for named checkpoints plus a short progress log instead of treating planning as one opaque burst.

## Outcome Contract
- **Outcome:** return or prepare exactly one native Codex `/goal` prompt whose objective is to produce a reviewed implementation plan, then stop at that reviewed plan unless the user explicitly asks to continue into execution.
- **Done when:** the generated prompt keeps `planning/active/<task-id>/task_plan.md`, `findings.md`, and `progress.md` authoritative; audits intake sufficiency before drafting; saves the plan artifact to `docs/superpowers/plans/<date>-<task-id>.md`; requires `1` read-only reviewer subagent for every new or materially revised plan; defines checkpoints plus a short `progress.md` log for the planning loop; caps plan-polishing at `3` review rounds; and tells the loop to stop Goal2Plan and reclassify if the reviewed plan proves direct or tracked execution is sufficient.
- **Evidence:** `scripts/evaluate-goal2plan.mjs`, `tests/core/goal2plan-eval.test.mjs`, projection/profile/sync tests, and the local-skill contract test all pass.
- **Mode B Contract:** this skill does not execute implementation and does not implement a runner or external runner. It prepares and governs a native Codex `/goal` prompt, while Codex `/goal` remains the long-running executor.
- **Authority Boundary:** `planning/active/<task-id>/` stays the only durable task memory. The companion plan under `docs/superpowers/plans/<date>-<task-id>.md` is a reviewed artifact, not a second planning system.

## When to Use
- The task is likely complex, long-running, or high-effort.
- The intake is too sparse to write a credible implementation plan directly.
- The user wants a plan that can survive multiple review and revision rounds.

Do not use this skill when:
- the work is quick or local enough for direct execution;
- a normal tracked plan is already straightforward to write;
- the user already provided a sufficient implementation plan;
- the user explicitly wants implementation now and the intake is already sufficient.

## Quick Reference
| Step | Rule |
| --- | --- |
| 1 | Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` first |
| 2 | Check whether objective, success criteria, scope, surfaces, validation, and review needs are known enough, and record the missing intake dimensions |
| 3 | If broad context is missing, use `brainstorming`; if only one or two narrow facts are missing, ask concise Q&A |
| 4 | Use `goal-writer` or [template.md](template.md) to draft exactly one native Codex `/goal` prompt |
| 5 | Require the goal loop to draft a reviewed implementation plan under `docs/superpowers/plans/<date>-<task-id>.md` |
| 6 | Require named checkpoints and a short `progress.md` log for the planning loop |
| 7 | Require `1` read-only reviewer subagent for every new or materially revised plan |
| 8 | Revise under a `3`-round cap, sync durable results back, and stop at the approved plan or fall back if the task proves simpler |

## Workflow
1. Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md`.
2. Check intake sufficiency across root objective, success criteria, scope boundaries, impacted files or work domains, validation method, rollback or review needs, execution-unit boundaries, and blocking external facts.
3. For coding tasks, add a lightweight coding intake contract before plan drafting: clarify domain terms, the highest practical test seam, one tracer-bullet vertical slice, blocking edges, and the Standards/Spec review split. Keep these fields inside `planning/active/<task-id>/` or the companion plan, never in `tickets.md` as an authority root.
4. If broad context is missing, invoke `brainstorming`; if only narrow facts are missing, ask concise Q&A.
5. Use `goal-writer` or [template.md](template.md) to produce one native `/goal` prompt whose objective is a reviewed implementation plan.
6. The goal loop drafts the plan using `writing-plans` structure, saves the companion artifact under `docs/superpowers/plans/<date>-<task-id>.md`, and works checkpoint by checkpoint instead of treating plan generation as one opaque pass.
7. After each checkpoint, append a short progress log to `planning/active/<task-id>/progress.md` so the planning loop stays inspectable.
8. Require `1` read-only reviewer subagent for every new or materially revised plan.
9. Revise under a `3`-round cap.
10. If the reviewed plan proves the work is straightforward enough for direct or tracked execution, stop Goal2Plan, reclassify, and fall back instead of forcing more planning rounds.
11. Sync summary, reviewer verdict, blockers, plan path, checkpoint status, and any fallback decision back to `planning/active/<task-id>/`.
12. Stop at the reviewed plan unless the user explicitly asks to execute implementation.

## Common Mistakes
- Treating Goal2Plan as a replacement for Codex `/goal` instead of a prompt-contract skill for Codex `/goal`
- Skipping the intake-sufficiency audit and jumping straight into plan drafting
- Writing an execution plan directly without first checking whether intake is actually sufficient
- Letting the companion plan become a second durable memory source instead of syncing durable state back to `planning/active/<task-id>/`
- Executing implementation from inside the planning loop instead of stopping at the reviewed plan
- Forcing Goal2Plan to continue after the reviewed plan proves direct or tracked execution is sufficient
- Forgetting the `1` read-only reviewer subagent gate or the `3`-round revision cap
- Omitting checkpoints or a short `progress.md` log, which makes the planning loop harder to review or resume
- Forcing Goal2Plan onto work that is already simple enough for direct or tracked execution
