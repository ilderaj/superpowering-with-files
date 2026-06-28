```text
/goal Objective: Update the context-heavy Codex goal workflow so the authoritative docs, policy, and tests agree on one stable execution contract.
Context: The relevant repo surfaces are `harness/core/policy/base.md`, `docs/install/codex.md`, `docs/compatibility/hooks.md`, and `tests/installer/policy-render.test.mjs`; broader repo history is out of scope unless one of these surfaces forces it. Assumptions: these files remain the smallest authoritative set for this contract.
Constraints: Keep `planning/active/<task-id>/` authoritative, do not treat hooks as the only enforcement mechanism, and do not widen the task beyond the listed surfaces unless a failing test proves another authority is required.
Work Discipline:
- Restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` before each substantive round.
- Reclassify each round as `quick`, `tracked`, or `deep-reasoning`.
- Keep quick rounds lightweight; do not create a companion plan or subagents just because `/goal` is running.
- Keep `planning/active/<task-id>/` authoritative for tracked rounds and sync durable state after each phase.
- For tracked or deeper rounds, work checkpoint by checkpoint and log a short note in `planning/active/<task-id>/progress.md` after each checkpoint.
- For deep-reasoning rounds, use `docs/superpowers/plans/<date>-<task-id>.md`, require 1 read-only reviewer subagent before executing any new or materially revised companion plan, and execute approved plans with normal Superpowers execution, worktree, and git-progress discipline.
- Keep the root goal stable; planning or replanning is allowed, goal drift is not.
Validation:
- Review `harness/core/policy/base.md` and `docs/install/codex.md`, then run `node --test tests/installer/policy-render.test.mjs`.
Done Criteria:
- All `4` authoritative surfaces are aligned, `node --test tests/installer/policy-render.test.mjs` passes, and the final diff stays within the named authority set.
- The final contract still routes quick work lightly and limits companion-plan/verifier behavior to deep-reasoning rounds only.
Stop/Escalate:
- Stop and escalate if a fifth authoritative surface becomes necessary or if any validation proves the assumed authority set is incomplete.
Next Step: Re-open the active planning files, confirm the four named authority surfaces, and edit the smallest one that defines the contract first.
```
