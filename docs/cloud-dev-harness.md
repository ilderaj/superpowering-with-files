# Cloud Dev Harness

## Purpose

The cloud-dev lane is a remote-only staging path for GitHub-origin agent work that should stay isolated from local development until a human intentionally promotes it. It gives Copilot a stable branch target, preserves reviewable pull-request boundaries, and keeps local `dev` checkouts unchanged unless a person explicitly updates them.

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

## Recovery

The Recovery section is for manual recovery and operator intervention after automation blocks or fails.

- Do not force-sync `cloud-dev` when it is ahead of `origin/dev`.
- Inspect branch divergence and any open pull requests targeting `cloud-dev` before assigning Copilot.
- Fix blocking reasons first, then re-run issue triage explicitly with an issue comment containing `/cloud-dev retry` or by manually dispatching the triage workflow with `issue_number`.
