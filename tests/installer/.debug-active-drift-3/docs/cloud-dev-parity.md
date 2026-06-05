# Cloud Dev Parity

Cloud-dev parity is defined by contract and evidence, not by UI similarity. The local Harness workflow remains the baseline; remote work must preserve branch isolation, reviewability, verification evidence, and reconciliation before human promotion.

## Evidence Levels

| Path | Current evidence level | Operator claim allowed |
| --- | --- | --- |
| Copilot direct issue assignment with `agent_assignment.base_branch=cloud-dev` | Verified baseline: issue `#58` produced a Copilot task and draft PR `#59` with base `cloud-dev`. | Supported override path when a human runs preflight first. |
| Workflow-posted `@copilot` comment prompt | Prompt emission verified; task/PR behavior from comment-only handoff is not proven. | Useful handoff text, not equivalent to direct assignment until a real PR run proves base/target behavior. |
| GitHub Agent tab | Research only. | Do not claim support. |
| Codex cloud | Research only. | Local Codex Harness support exists; cloud dispatch support is unverified. |
| Claude cloud | Research only. | Local Claude Code Harness support exists; cloud dispatch support is unverified. |

## Parity Matrix

| Surface | Local Harness baseline | Current cloud-dev expectation | Evidence / gap |
| --- | --- | --- | --- |
| Planning state | `planning/active/<task-id>/` owns durable task memory. | Issue/spec links must identify the durable source; remote summaries are reconciled locally before promotion. | Contract required. |
| Branch base | Worktree preflight records intended base. | Task branch starts from `cloud-dev`; promotion to `dev` is human-owned. | Direct Copilot assignment verified; comment-only not proven. |
| Task handoff | Plan, findings, acceptance criteria, and verification commands live in task files. | Handoff includes source issue/spec, base branch, target PR base, acceptance, verification, implementation summary path, and reconciliation status. | Contract required. |
| Skills/hooks | Local projected entries/skills/hooks are available by target. | Cloud agent receives only the platform-supported surface; unsupported hooks/skills are a gap, not implied support. | Copilot-first only. |
| Verification | Focused checks plus `npm run verify`/Harness verification as scope requires. | PR includes executed commands or explicit docs-only narrowing with rationale. | Human review required. |
| PR target | Scoped work merges back to recorded base. | Task PR targets `cloud-dev`; promotion PR targets `dev`. | Direct assignment baseline verified. |
| Promotion | Finish/release is explicit and reviewed. | Human reviews issue, PR, verification, implementation summary, and reconciliation before promotion. | Required. |
| Reconciliation | `docs/reconciliation.md` gate before finish/archive. | Remote task must provide local reconciliation evidence or an explicit waiver before promotion. | Required contract field. |
| Recovery | Worktree/branch status and active task state guide recovery. | Inspect branch divergence, open PRs, latest workflow artifacts, and issue status before retry. | Existing operator guide plus future status summary. |

## Agent-Neutral Cloud Task Contract

Every cloud task should be expressible with these fields before dispatch:

```yaml
task_id: <local task id or issue number>
source_issue_or_spec: <URL or planning path>
base_branch: cloud-dev
target_pr_base: cloud-dev
working_branch_hint: cloud-dev/<issue>-<slug>
acceptance_criteria:
  - <observable result>
verification_commands:
  - npm run verify
implementation_summary_path: <PR body, issue comment, or planning/progress path>
reconciliation_status: open | complete | not_required | waived
docs_backlog_update_needed: yes | no | unknown
promotion_policy: human PR from cloud-dev to dev only
unsupported_surfaces:
  - <skills/hooks/credentials/platform gaps>
```

## Reconciliation Fields For Review

Promotion review should record:

- source issue/spec and PR;
- actual implementation summary;
- verification commands and results;
- branch base and target PR base observed;
- intentional deviations from task intent;
- docs, roadmap, or backlog updates needed;
- unresolved gaps that block or follow promotion.

Do not upgrade a research path to supported until a real issue/task/PR proves branch base, target PR base, credentials/tool surface, verification evidence, and reconciliation behavior.
