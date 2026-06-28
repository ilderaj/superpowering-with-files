1. `implementation-local-edit`
- scenario id: `implementation-local-edit`
- baseline prompt: `Summarize a small local implementation update with no blocker.`
- concise-guidance prompt: `Summarize the same small local implementation update with shorter process narration while keeping the required information.`
- required information:
  - `did`
  - `next`
- trio writeback evidence rule:
  - cite rollout `progress.md`
  - cite rollout `task_plan.md` phase/status update when relevant
  - cite rollout `findings.md` when the scenario changes a durable constraint

2. `implementation-with-blocker`
- scenario id: `implementation-with-blocker`
- baseline prompt: `Summarize an implementation update that is blocked and must preserve the blocker line.`
- concise-guidance prompt: `Summarize the same blocked implementation update with shorter process narration while preserving the blocker line.`
- required information:
  - `did`
  - `next`
  - optional `blocker`
- trio writeback evidence rule:
  - cite rollout `progress.md`
  - cite rollout `task_plan.md` phase/status update when relevant
  - cite rollout `findings.md` when the scenario changes a durable constraint

3. `review-findings-update`
- scenario id: `review-findings-update`
- baseline prompt: `Summarize a review pass and preserve the top finding plus the next action.`
- concise-guidance prompt: `Summarize the same review pass with shorter process narration while preserving the top finding and next action.`
- required information:
  - `did`
  - `next`
- trio writeback evidence rule:
  - cite rollout `progress.md`
  - cite rollout `task_plan.md` phase/status update when relevant
  - cite rollout `findings.md` when the scenario changes a durable constraint

4. `tracked-task-phase-sync`
- scenario id: `tracked-task-phase-sync`
- baseline prompt: `Summarize a tracked-task phase update and mention that trio writeback completed.`
- concise-guidance prompt: `Summarize the same tracked-task phase update with shorter process narration while still mentioning completed trio writeback.`
- required information:
  - `did`
  - `next`
- trio writeback evidence rule:
  - cite rollout `progress.md`
  - cite rollout `task_plan.md` phase/status update when relevant
  - cite rollout `findings.md` when the scenario changes a durable constraint

5. `validation-sensitive-update`
- scenario id: `validation-sensitive-update`
- baseline prompt: `Summarize a validation update and preserve whether the verification is failing or passing.`
- concise-guidance prompt: `Summarize the same validation update with shorter process narration while preserving the failing or passing verdict.`
- required information:
  - `did`
  - `next`
- trio writeback evidence rule:
  - cite rollout `progress.md`
  - cite rollout `task_plan.md` phase/status update when relevant
  - cite rollout `findings.md` when the scenario changes a durable constraint
