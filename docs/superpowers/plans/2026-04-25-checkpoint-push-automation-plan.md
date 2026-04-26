# Controlled Checkpoint Push Implementation Plan

> **Companion to** [planning/active/git-execution-authorization-analysis/](../../../planning/active/git-execution-authorization-analysis/) — durable lifecycle、phase 状态与结论摘要在那里维护；本文件承载不含 PR 自动化的详细 implementation plan。
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repo-owned, controlled `verify + review-evidence + commit + checkpoint push` path that lets agents create remote recovery points from isolated worktrees without PR automation.

**Architecture:** Reuse the existing Harness installer/CLI surface and safety workflow. Add a dedicated `checkpoint-push` command plus a library that evaluates git context, runs fresh verification, writes deterministic review evidence, commits, and pushes only when the checkout is an eligible worktree branch. Keep PR creation, merge automation, and host-level approval bypass explicitly out of scope.

**Tech Stack:** Node.js (`node:child_process`, `node:fs/promises`, `node:test`), existing Harness CLI command structure, Git CLI, existing checkpoint and worktree-preflight logic.

---

## Companion Link

- Authoritative task memory: `planning/active/git-execution-authorization-analysis/`
- Active task path: `planning/active/git-execution-authorization-analysis/`
- Sync-back status: pending final review on `2026-04-25`

## Planning Assumptions

- v1 **does not automate PR creation, PR updates, merge, or auto-merge**.
- v1 **does not attempt to suppress host-platform approval prompts**. If VS Code / Copilot / another host blocks `git push`, the command must fail with an explicit handoff message instead of pretending repo logic can override host policy.
- v1 only supports autonomous checkpoint push from an **eligible branch context**:
  - inside a Git repository
  - on a named branch
  - not on `main` / `master`
  - not on the main repo checkout `dev`
  - preferably inside a linked worktree
  - with `origin` configured
- v1 requires **fresh verification in the same invocation**. Previous successful test runs do not count.
- v1 produces a **deterministic review artifact** (`diff --check`, changed files, diff stat, verify command/result, commit target). It does **not** embed model-driven code review into the CLI.
- v1 stages and pushes only the current branch; no force-push.

## File Map

- Create: `harness/installer/lib/checkpoint-push.mjs` — context detection, eligibility checks, verification orchestration, review artifact writing, commit/push execution, result shaping.
- Create: `harness/installer/commands/checkpoint-push.mjs` — thin CLI wrapper over the new library.
- Create: `tests/installer/checkpoint-push.test.mjs` — end-to-end command tests with temp git repos and temp bare remotes.
- Modify: `harness/installer/commands/harness.mjs` — register `checkpoint-push` in the CLI.
- Modify: `harness/installer/commands/worktree-preflight.mjs` — expose checkpoint-push readiness in `--safety` output and JSON mode.
- Modify: `tests/installer/worktree-preflight.test.mjs` — assert new readiness/reporting fields.
- Modify: `tests/installer/commands.test.mjs` — assert `checkpoint-push` appears in CLI help.
- Modify: `README.md` — document the new recovery-point workflow and its scope boundary.
- Modify: `docs/maintenance.md` — operator guidance for controlled checkpoint push and failure handling.
- Modify: `docs/safety/vibe-coding-safety-manual.md` — replace raw manual push wording with the repo-owned command where appropriate.
- Modify: `docs/compatibility/hooks.md` — document current safety-hook projection support and clarify that host approval prompts are outside repo-owned logic.
- Modify: `harness/core/skills/safe-bypass-flow/SKILL.md` — point risky-session guidance to the new command instead of only raw `git push -u origin <branch>`.
- Modify: `harness/core/policy/safety.md` — optionally tighten the final bullet to reference `checkpoint-push` as the preferred remote checkpoint path.

## Rollout Gates

- Gate 1: no PR automation in this scope. Any plan step that reaches `gh pr create`, GitHub PR APIs, or branch merge is out of bounds.
- Gate 2: the command must refuse detached HEAD, `main`, `master`, and non-worktree main-checkout `dev`.
- Gate 3: the command must fail before commit/push when fresh verification fails.
- Gate 4: the command must emit review evidence and a machine-readable result even on failure.
- Gate 5: the command must never use `--force`, must never retarget another branch, and must never push outside `origin/<current-branch>`.
- Gate 6: if host-level sandbox, credentials, or network restrictions block `git push`, the command must stop with a clear handoff message instead of retrying or hiding the failure.

## Command Contract

Proposed CLI:

```bash
./scripts/harness checkpoint-push --message="chore: save recovery point"
./scripts/harness checkpoint-push --message="feat: capture automation baseline" --verify-cmd="npm run verify"
./scripts/harness checkpoint-push --message="chore: checkpoint push" --dry-run --json
```

Proposed result payload:

```json
{
  "status": "success|blocked|verification_failed|push_failed|no_changes",
  "branch": "feature/example",
  "upstream": "origin/feature/example",
  "isWorktree": true,
  "verifyCommand": "npm run verify",
  "reviewArtifactPath": ".harness/checkpoint-push/2026-04-25T13-20-00Z/review.md",
  "resultPath": ".harness/checkpoint-push/2026-04-25T13-20-00Z/result.json",
  "headBefore": "<sha>",
  "headAfter": "<sha>",
  "message": "chore: save recovery point",
  "blockedReason": ""
}
```

## Review Artifact Contract

Write a Markdown artifact like:

```markdown
# Checkpoint Push Review Evidence

- Branch: feature/example
- Worktree: yes
- Upstream before push: none
- Verify command: npm run verify
- Verify result: success

## Changed Files
- path/to/file

## Diff Stat
 3 files changed, 42 insertions(+), 7 deletions(-)

## Diff Check
clean
```
```

The artifact is deterministic and local. It is evidence for agent self-review and operator inspection, not a substitute for human code review on sensitive branches.

### Task 0: Write Contract Tests First

**Files:**
- Create: `tests/installer/checkpoint-push.test.mjs`
- Modify: `tests/installer/worktree-preflight.test.mjs`
- Modify: `tests/installer/commands.test.mjs`

- [ ] **Step 1: Add CLI registration contract**

Extend `tests/installer/commands.test.mjs` so the CLI help output includes:

```text
checkpoint-push  Verify, record review evidence, commit, and push a recovery branch
```

Run:

```bash
npm test -- tests/installer/commands.test.mjs
```

Expected: existing command-help assertions still pass and the new command is listed.

- [ ] **Step 2: Add readiness failure contracts**

In `tests/installer/checkpoint-push.test.mjs`, create fixture cases for:

```text
detached HEAD -> blocked
branch main -> blocked
main checkout dev without linked worktree -> blocked
no origin remote -> blocked
clean branch with no changes -> no_changes
verify failure -> verification_failed
```

Each fixture should assert `result.json` exists and includes the right `status` / `blockedReason`.

- [ ] **Step 3: Add happy-path contract with a bare remote**

Use an existing harness fixture plus a temp bare repo to assert:

```text
eligible branch in a linked worktree
fresh verify passes
commit is created
first push sets upstream
result status = success
review artifact exists
remote now contains the pushed branch
```

- [ ] **Step 4: Add worktree-preflight reporting contract**

Extend `tests/installer/worktree-preflight.test.mjs` so `--safety` output includes a checkpoint-push readiness line, for example:

```text
checkpointPushReady: ok
checkpointPushReady: problem (detached HEAD)
```

- [ ] **Step 5: Run the new failing test slice**

Run:

```bash
npm test -- tests/installer/checkpoint-push.test.mjs tests/installer/worktree-preflight.test.mjs tests/installer/commands.test.mjs
```

Expected: new tests fail because the command/library do not exist yet.

### Task 1: Implement Checkpoint-Push Context And Readiness Library

**Files:**
- Create: `harness/installer/lib/checkpoint-push.mjs`

- [ ] **Step 1: Add snapshot helpers**

Create helper functions with this shape:

```js
export async function collectCheckpointPushSnapshot(rootDir) {
  return {
    repoRoot: rootDir,
    currentBranch: 'feature/example',
    upstreamBranch: 'origin/feature/example',
    currentSha: '<sha>',
    hasOrigin: true,
    isWorktree: true,
    dirty: true,
    changedFiles: [],
    untrackedFiles: []
  };
}
```

Reuse the existing git command style from `git-base.mjs` and `worktree-preflight.mjs`; do not re-implement ad hoc shell parsing in the command wrapper.

- [ ] **Step 2: Add readiness evaluation**

Implement a pure evaluator:

```js
export function evaluateCheckpointPushReadiness(snapshot) {
  return {
    status: 'ok|problem',
    reasons: [],
    preferredPushTarget: 'origin/feature/example',
    canCommit: true,
    canPush: true
  };
}
```

Rules:

```text
branch missing -> problem
main/master -> problem
currentBranch === dev && isWorktree === false -> problem
origin missing -> problem
dirty === false -> no_changes path, not hard failure
```

- [ ] **Step 3: Add result-path helpers**

Write helper functions that create:

```text
.harness/checkpoint-push/<timestamp>/review.md
.harness/checkpoint-push/<timestamp>/result.json
```

Use the same timestamp-on-disk style consistently in tests so assertions do not depend on wall-clock exactness beyond directory existence.

- [ ] **Step 4: Re-run the focused tests**

Run:

```bash
npm test -- tests/installer/checkpoint-push.test.mjs
```

Expected: readiness-only tests move forward; happy-path tests still fail because commit/push orchestration is not implemented yet.

### Task 2: Implement Verification And Review-Evidence Flow

**Files:**
- Modify: `harness/installer/lib/checkpoint-push.mjs`

- [ ] **Step 1: Resolve the verify command**

Default behavior:

```text
if --verify-cmd is provided -> use it
else if package.json has scripts.verify -> use "npm run verify"
else -> blocked with a clear message
```

Do not infer `npm test`, `pnpm test`, or other commands in v1. Keep the contract explicit.

- [ ] **Step 2: Run verification before any commit**

Add a runner with this order:

```text
evaluate readiness
resolve verify command
run verify command
capture stdout/stderr/exit code
if non-zero -> write result.json + review.md, return verification_failed
```

- [ ] **Step 3: Write deterministic review evidence**

Collect and write:

```text
git status --short
git diff --stat
git diff --check
verify command
verify outcome
```

If `git diff --check` fails, treat it as `blocked` before commit. The goal is to avoid pushing whitespace/merge-marker damage as a recovery point.

- [ ] **Step 4: Re-run focused tests**

Run:

```bash
npm test -- tests/installer/checkpoint-push.test.mjs
```

Expected: verification-failure and diff-check cases now pass; commit/push happy-path may still fail.

### Task 3: Implement Commit And Push Orchestration

**Files:**
- Modify: `harness/installer/lib/checkpoint-push.mjs`

- [ ] **Step 1: Add commit path**

Commit sequence:

```text
git add -A
git commit -m <message>
```

Rules:

```text
if no tracked/untracked changes -> return no_changes
commit message is required
do not amend
do not force-add paths outside repo root
```

- [ ] **Step 2: Add push path**

Push sequence:

```text
if branch has upstream -> git push
else -> git push -u origin <current-branch>
```

Rules:

```text
never push another branch name
never use --force
never push to dev/main explicitly from this command
```

- [ ] **Step 3: Add host-blocked failure shaping**

Map common failure cases to clear blocked messages, for example:

```text
authentication failed -> push_failed with explicit auth guidance
operation not permitted / sandbox denied -> push_failed with host-approval guidance
network unavailable -> push_failed with retry guidance
```

The command should still leave `review.md` and `result.json` behind.

- [ ] **Step 4: Add success result payload**

On success, result payload must include:

```json
{
  "status": "success",
  "branch": "feature/example",
  "upstream": "origin/feature/example",
  "headBefore": "<sha>",
  "headAfter": "<sha>",
  "message": "chore: save recovery point"
}
```

- [ ] **Step 5: Re-run focused tests**

Run:

```bash
npm test -- tests/installer/checkpoint-push.test.mjs
```

Expected: the happy-path remote-push test now passes.

### Task 4: Wire The Command Into The CLI And Safety Reporting

**Files:**
- Create: `harness/installer/commands/checkpoint-push.mjs`
- Modify: `harness/installer/commands/harness.mjs`
- Modify: `harness/installer/commands/worktree-preflight.mjs`

- [ ] **Step 1: Add the command wrapper**

Mirror the pattern used by `checkpoint.mjs`:

```js
import { checkpointPush } from '../lib/checkpoint-push.mjs';

export async function checkpointPushCommand(args = []) {
  const result = await checkpointPush(process.cwd(), args);
  if (result.stdout) process.stdout.write(result.stdout);
}
```

Keep the wrapper thin; core logic stays in the library so tests do not need full CLI subprocess coverage for every case.

- [ ] **Step 2: Register the command in `harness.mjs`**

Add a help line and command map entry:

```text
checkpoint-push  Verify, record review evidence, commit, and push a recovery branch
```

- [ ] **Step 3: Surface readiness in `worktree-preflight --safety`**

Extend the `safety.checks` array with something like:

```js
{
  name: 'checkpointPushReady',
  status: 'ok|problem|warning',
  message: 'Current checkout is an eligible worktree branch.'
}
```

This makes the recommended path visible before the user starts a long-running session.

- [ ] **Step 4: Re-run the command/reporting slice**

Run:

```bash
npm test -- tests/installer/commands.test.mjs tests/installer/worktree-preflight.test.mjs tests/installer/checkpoint-push.test.mjs
```

Expected: all command wiring tests pass.

### Task 5: Sync Policy, Skills, And Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/maintenance.md`
- Modify: `docs/safety/vibe-coding-safety-manual.md`
- Modify: `docs/compatibility/hooks.md`
- Modify: `harness/core/skills/safe-bypass-flow/SKILL.md`
- Modify: `harness/core/policy/safety.md`

- [ ] **Step 1: Document the preferred recovery-point flow**

In `README.md` and `docs/maintenance.md`, document:

```text
1. Run ./scripts/harness worktree-preflight --safety
2. Work from a dedicated worktree branch
3. Run ./scripts/harness checkpoint-push --message="..."
4. Review the generated review artifact/result.json
5. Keep PR and merge as separate manual workflows
```

- [ ] **Step 2: Update the safety manual**

Replace raw push guidance with the repo-owned command where it improves consistency, while keeping the safety principle intact:

```text
Use ./scripts/harness checkpoint-push to create the remote recovery point before merge/cleanup.
```

- [ ] **Step 3: Clarify hook/platform boundaries**

In `docs/compatibility/hooks.md`, add explicit wording:

```text
Safety hooks can classify commands as allow/ask/deny when hooks are installed.
Host-platform approval prompts for terminal/network operations remain outside repo-owned logic.
```

Also sync the safety-hook support story so the docs no longer imply that only planning hooks matter.

- [ ] **Step 4: Update the risky-session skill**

In `harness/core/skills/safe-bypass-flow/SKILL.md`, change the push step to prefer:

```text
./scripts/harness checkpoint-push --message="..."
```

Keep a note that raw `git push -u origin <branch>` remains the fallback if the command is unavailable or not yet adopted.

- [ ] **Step 5: Tighten policy wording carefully**

Update the final bullet in `harness/core/policy/safety.md` only if the wording stays generic enough for cross-platform rendering, for example:

```text
End every agent task with a diff review and, when creating a remote recovery point, prefer the repository-managed checkpoint push flow.
```

Do not make policy text claim that push is always automatic across all hosts.

### Task 6: Full Verification And Manual Acceptance

**Files:**
- Modify: `planning/active/git-execution-authorization-analysis/progress.md`

- [ ] **Step 1: Run focused automated tests**

Run:

```bash
npm test -- tests/installer/checkpoint-push.test.mjs tests/installer/worktree-preflight.test.mjs tests/installer/commands.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run repository verification**

Run:

```bash
npm run verify
./scripts/harness doctor --check-only
```

Expected: PASS.

- [ ] **Step 3: Manual acceptance in a disposable worktree**

Run a real dry run in a disposable branch:

```bash
./scripts/harness worktree-preflight --safety
git worktree add .worktrees/checkpoint-push-smoke -b chore/checkpoint-push-smoke dev
cd .worktrees/checkpoint-push-smoke
./scripts/harness checkpoint-push --message="chore: smoke test checkpoint push" --dry-run --json
```

Expected:

```text
readiness ok
verify command resolved
review artifact path emitted
no commit/push performed in dry-run mode
```

- [ ] **Step 4: Optional live acceptance with a temp remote branch**

If host permissions allow it, run one real push from the disposable worktree:

```bash
./scripts/harness checkpoint-push --message="chore: smoke test checkpoint push"
```

Expected:

```text
commit created
branch pushed to origin
result.json shows success
```

If the host blocks push, record that as a verified platform limitation rather than a repo bug.

## Explicit Non-Goals

- No `gh pr create`
- No pull request update automation
- No merge automation
- No auto-merge
- No force-push support
- No model-driven code-review subagent embedded into the CLI
- No attempt to override VS Code / Copilot / Codex host approval UX

## Implementation Recommendation

Implement this in two commits if you want low-risk review:

1. `feat: add checkpoint-push command and tests`
2. `docs: document controlled checkpoint push workflow`

That split keeps behavioral code and policy/doc changes reviewable independently.