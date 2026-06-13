# Cloud Dev Harness Operator Guide

## Purpose

The cloud-dev lane is a remote-only staging path for GitHub-origin agent work that should stay isolated from local development until a human intentionally promotes it. It gives Copilot a stable branch target, preserves reviewable pull-request boundaries, and keeps local `dev` checkouts unchanged unless a person explicitly updates them.

Use this guide when a human wants to start or supervise cloud work from GitHub.

## Start Here

Start normal cloud-dev work from a GitHub issue, not from an unstructured request on `https://github.com/copilot`.

The issue is the durable task record that Actions can triage, label, preflight, and hand off to Copilot with a standardized prompt. A direct Copilot page request can be useful for experiments or discussion, but it bypasses the repo-owned labels, readiness checks, branch target, and review trail unless you manually recreate them.

Recommended entry:

1. Create a GitHub issue in this repository.
2. Add the `cloud-dev` label.
3. Add exactly one task-kind label when possible: `agent:plan`, `agent:impl`, or `agent:test`.
4. Assign Copilot from the issue, or use the Copilot coding-agent control on that issue when GitHub exposes it.
5. Let the Cloud Dev Issue Triage workflow comment the canonical `@copilot` handoff prompt.
6. Review the Copilot PR before merging anything into `cloud-dev`.

If the workflow does not start automatically, comment `/cloud-dev retry` on the issue or manually run the `Cloud Dev Issue Triage` workflow with the issue number.

## Direct Copilot Assignment

Use direct Copilot assignment only when you intentionally want the official issue-assignment path, especially when you need to pin the working base to `cloud-dev`.

This is not the default entry. It bypasses the workflow-owned readiness gate, so a human must complete the preflight checklist first.

Verified operator sequence:

1. Create the issue and add `cloud-dev` plus one task-kind label.
2. Manually confirm the lane is ready with the Preflight Checklist.
3. Assign Copilot from the GitHub issue UI, or call the official issue-assignment API with `agent_assignment.base_branch = cloud-dev`.
4. Confirm the created task or PR still shows `base_ref` or PR base `cloud-dev`.

REST example:

```bash
curl -L \
	-X POST \
	-H "Accept: application/vnd.github+json" \
	-H "Authorization: Bearer $GITHUB_TOKEN" \
	-H "X-GitHub-Api-Version: 2022-11-28" \
	https://api.github.com/repos/OWNER/REPO/issues/ISSUE_NUMBER/assignees \
	-d '{"assignees":["Copilot"],"agent_assignment":{"base_branch":"cloud-dev"}}'
```

Use this path when you need the assignment itself, not the workflow comment, to carry the branch constraint.

## Issue Template

Use short, concrete issue text. Include enough detail for an agent to finish without guessing.

```markdown
## Goal
<One sentence describing the desired outcome.>

## Scope
- <Files, docs, behavior, or workflow area that may change.>
- <Anything explicitly out of scope.>

## Acceptance Criteria
- <Observable result 1.>
- <Observable result 2.>

## Verification
- `npm run verify`
- `./scripts/harness verify --output=.harness/verification`
- `./scripts/harness doctor --check-only`
```

For ambiguous or high-risk work, use `agent:plan` first. Move to `agent:impl` only after a human has reviewed the plan.

## Preflight Checklist

Before starting new cloud work, confirm the lane is ready:

- `origin/cloud-dev` exists.
- `origin/cloud-dev` has no staging-only commits that still need promotion.
- No open pull request targets `cloud-dev` unless that PR is the work you are reviewing.
- Repository variables are enabled when automation should run:
	- `CLOUD_DEV_SYNC_ENABLED=true`
	- `CLOUD_DEV_ISSUE_TRIAGE_ENABLED=true`
- The latest `Cloud Dev Sync` check is passing, or a human has inspected the branch state manually.

Local command equivalent:

```bash
node scripts/ci/check-cloud-dev-branch.mjs --mode=check
```

## Branches

| Branch | Role |
| --- | --- |
| `cloud-dev` | Remote-only staging branch for agent-ready work based on `origin/dev`. |
| `cloud-dev/<issue>-<slug>` | Per-task working branch used by the agent for one scoped issue or PR. |
| `dev` | Human-reviewed integration branch that receives cloud-dev work only through a separate promotion PR. |
| `main` | Verified release branch. |

## Labels

- `cloud-dev`: opt an issue into the cloud-dev lane.
- `agent:plan`: request planning-oriented agent work.
- `agent:test`: request verification-oriented agent work.
- `agent:impl`: request implementation-oriented agent work.

## Human Workflow

### 1. Create the Issue

Create a scoped issue and apply `cloud-dev` plus one task-kind label. Prefer one issue per agent task. Split broad requests into plan, implementation, and verification issues when the work is large or risky.

### 2. Wait for Triage

The Cloud Dev Issue Triage workflow checks branch readiness before prompting Copilot. If the lane is not ready, it leaves a blocking comment instead of starting agent work.

When ready, the workflow posts a standardized prompt that includes:

- issue number and title
- task kind
- base branch `cloud-dev`
- target PR base `cloud-dev`
- prohibition on direct pushes to `dev` or `main`
- required verification commands

If you intentionally use direct Copilot assignment instead of workflow triage, treat the readiness check as a human responsibility. Do not rely on assignment alone to prove the lane is ready.

### 3. Supervise Copilot Work

Copilot should work on a scoped branch such as `cloud-dev/<issue>-<slug>` and open a pull request targeting `cloud-dev`. If Copilot opens a PR against `dev` or `main`, do not merge it; ask Copilot to retarget the PR to `cloud-dev` or recreate the work on the correct branch.

### 4. Review the PR to `cloud-dev`

Require the normal verification evidence before merging:

- `npm run verify`
- `./scripts/harness verify --output=.harness/verification`
- `./scripts/harness doctor --check-only`

For docs-only changes, a human may accept narrower verification, but the PR description should say why full verification was not run.

### 5. Promote to `dev`

After the task PR is merged into `cloud-dev`, promote cloud work through a separate human-owned pull request from `cloud-dev` to `dev`. Do not let agent automation merge directly into `dev` or `main`.

### 6. Release Normally

Once `dev` is verified, promote `dev` to `main` through the normal release flow.

## Validated Behavior

The current `main` branch has already been exercised against the real GitHub issue-to-triage path.

- Verification issue `#57` triggered multiple `issues` workflow runs.
- The triage workflow completed successfully on `main` after the dedupe fix landed.
- The issue ended with exactly one standardized `@copilot` handoff comment from `github-actions`.

The direct Copilot issue-assignment path has also been exercised against the real GitHub agent APIs.

- Validation issue `#58` was assigned to Copilot with `agent_assignment.base_branch = cloud-dev`.
- GitHub created a real Copilot task and preserved `base_ref = cloud-dev` in the task artifacts.
- Copilot opened draft PR `#59` with base `cloud-dev` and head `copilot/validate-copilot-issue-assignment`.

Treat that as the current operator baseline: duplicate automatic handoff comments are no longer expected on `main`. If they reappear, investigate both the runner dedupe logic and the workflow `concurrency` block before changing labels or retrying manually.

Treat direct assignment as a verified override path: it can preserve the `cloud-dev` base branch, but it does not replace the workflow's readiness gate.

## Required Checks

Every cloud-dev task branch and promotion step should pass these checks before review or merge:

- `npm run verify`
- `./scripts/harness verify --output=.harness/verification`
- `./scripts/harness doctor --check-only`

## Promotion

1. The agent works on `cloud-dev/<issue>-<slug>` and opens a pull request with base `cloud-dev`.
2. A human reviews and merges that task branch pull request into `cloud-dev`.
3. Promotion from `cloud-dev` to `dev` happens through a separate human-owned pull request.
4. Local development branches or checkouts update only when a person explicitly syncs them.

For Copilot issue assignment, keep the directive explicit: `base_branch=cloud-dev`.

For the shared matrix, contract fields, and evidence labels that govern promotion claims, see [Cloud Dev Parity](cloud-dev-parity.md).

## Agent Support Boundary

The cloud-dev lane implemented in this repository is Copilot-first.

| Agent | Can use Harness instructions locally? | Can use this GitHub cloud-dev automation directly? | Notes |
| --- | --- | --- | --- |
| GitHub Copilot | Yes | Yes | The workflow writes an `@copilot` handoff and the `github-cloud` deployment profile is Copilot-specific. |
| Codex | Yes | No | Codex can consume `AGENTS.md` and shared `.agents/skills` in a normal repo checkout, but this GitHub issue triage does not dispatch Codex. |
| Claude Code | Yes | No | Claude Code can consume `CLAUDE.md` and `.claude/skills` in a normal checkout, but this GitHub issue triage does not dispatch Claude. |

The broader Harness runtime and MCP facade are intentionally agent-neutral, so other agents can use Harness capabilities when they run in an environment that exposes those entry files or MCP tools. That is separate from this cloud-dev lane. Today, the GitHub issue-to-cloud-agent path is wired for Copilot only.

To make Codex or Claude first-class cloud-dev agents, add a separate trigger and handoff path for each platform, then verify its branch controls, credentials, tool surface, and PR behavior independently.

## Recovery

The Recovery section is for manual recovery and operator intervention after automation blocks or fails.

- Do not force-sync `cloud-dev` when it is ahead of `origin/dev`.
- Inspect branch divergence and any open pull requests targeting `cloud-dev` before assigning Copilot.
- Fix blocking reasons first, then re-run issue triage explicitly with an issue comment containing `/cloud-dev retry` or by manually dispatching the triage workflow with `issue_number`.

## Quick Decision Table

| Situation | Do this |
| --- | --- |
| New repo change for cloud agent work | Create a GitHub issue and label it `cloud-dev`. |
| Unsure what should change | Use `agent:plan`. |
| Implementation is clear and scoped | Use `agent:impl`. |
| Need verification or test repair | Use `agent:test`. |
| Need an informal Copilot conversation | Use `https://github.com/copilot`, but do not treat it as cloud-dev work until an issue exists. |
| Triage did not run | Comment `/cloud-dev retry` or manually dispatch the workflow with `issue_number`. |
| Need to force the official Copilot assignment path to keep base on `cloud-dev` | Run the preflight checklist yourself, then assign Copilot on the issue with `agent_assignment.base_branch = cloud-dev`. |
| Copilot opens PR to `dev` or `main` | Stop and retarget/recreate the PR against `cloud-dev`. |
| Work is merged into `cloud-dev` | Open a human-owned promotion PR from `cloud-dev` to `dev`. |


## Reconciliation Before Promotion

Cloud-dev work should follow the reconcile gate in `docs/reconciliation.md` before human promotion from `cloud-dev` to `dev` whenever the remote task changes product behavior, workflow policy, adapter output, MCP contracts, safety behavior, or roadmap/backlog commitments.

Promotion review should confirm or explicitly waive:

- source issue/spec;
- actual implementation summary;
- verification evidence;
- intentional deviations from plan/spec;
- docs, roadmap, or backlog updates needed;
- unresolved drift that should block or follow promotion.

That local reconciliation evidence lives in `planning/active/<task-id>/` authority: use the required core planning trio and add `reconciliation.md` only when a standalone lifecycle artifact is useful.

Unsupported cloud paths remain unsupported until issue/PR/task evidence proves branch base, target PR, credentials, verification, and reconciliation behavior.
