# Expected Autonomous Release Closure Contract

## Scenario
- Restore `planning/active/<task-id>/task_plan.md`, `findings.md`, and `progress.md`.
- Start every loop in `Assess`.
- `finishing-a-development-branch` already completed integration, but continued unattended closure work still remains.

## Expected Decisions
- `Assess` confirms the handoff only because continued unattended closure work is explicitly required.
- The workflow continues on the created PR or post-integration target instead of replaying finishing.
- if finishing completed the job and no follow-through remains, do not invoke this skill.
- Re-check on a 15-minute cadence while waiting for the created PR to move.

## Required Evidence
- The report must name `finishing-a-development-branch` as the upstream handoff source.
- The report must distinguish valid handoff evidence from a fully completed finishing-only outcome.
- If finishing completed the job and no follow-through remains, do not invoke this skill.
