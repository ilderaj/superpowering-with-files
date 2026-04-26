# Worktree Naming Governance Implementation Plan

> **Companion to** `planning/active/worktree-naming-governance/` — durable lifecycle, findings, and review state are maintained there; this file carries the detailed implementation checklist.

Active task path: `planning/active/worktree-naming-governance/`
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repo-owned, planning-backed naming contract for manual or skill-driven worktrees so generated names are unique, descriptive, upstream-safe, and consistent across supported IDE targets.

**Architecture:** Introduce a new Harness helper command that resolves the active planning task, allocates a monotonic sequence, and returns a canonical run label of the form `YYYYMMDDHHMM-<task-slug>-NNN`. Reuse that helper from `worktree-preflight`, then inject the contract into projected `using-git-worktrees` skills through a Harness-owned child patch instead of modifying upstream superpowers sources.

**Tech Stack:** Node.js (`node:fs/promises`, `node:test`, existing CLI command pattern), existing Harness skill projection/sync pipeline, Markdown docs and adapter tests.

---

## Companion Links

- Authoritative task memory: `planning/active/worktree-naming-governance/`
- Design spec: `docs/superpowers/specs/2026-04-26-worktree-naming-governance-design.md`
- Sync-back status: implementation complete; active task files summarize execution and verification state.

## Planning Assumptions

- The canonical worktree label format is `YYYYMMDDHHMM-<task-slug>-NNN`.
- `task-slug` comes from planning task identity, not prompt text.
- The numeric sequence is monotonic per task.
- Branch names may optionally wrap the canonical label in a namespace prefix such as `copilot/` or `fix/`.
- No changes are allowed under `harness/upstream/**`.
- The implementation must remain effective even if a host IDE has no native naming rule.

## File Map

- Create: `harness/installer/lib/worktree-name.mjs` — helper logic to resolve task identity, compute canonical labels, and emit text/JSON results.
- Create: `harness/installer/commands/worktree-name.mjs` — CLI wrapper for the naming helper.
- Create: `harness/installer/lib/superpowers-using-git-worktrees-patch.mjs` — projected skill patch that injects the Harness naming rule into materialized `using-git-worktrees` skills.
- Create: `tests/installer/worktree-name.test.mjs` — helper/CLI contract tests.
- Modify: `harness/installer/commands/harness.mjs` — register the new `worktree-name` command.
- Modify: `harness/installer/commands/worktree-preflight.mjs` — show suggested canonical label and branch name in text/JSON output.
- Modify: `tests/installer/worktree-preflight.test.mjs` — assert naming suggestions are surfaced without regressing base-selection behavior.
- Modify: `harness/core/skills/index.json` — attach a child patch for `superpowers:using-git-worktrees`.
- Modify: `harness/installer/commands/sync.mjs` — support the new child patch type.
- Modify: `tests/adapters/skill-projection.test.mjs` — assert the new child patch is planned for every supported target.
- Modify: `tests/adapters/sync-skills.test.mjs` — assert the materialized `using-git-worktrees` skill contains the Harness naming marker and guidance.
- Modify: `harness/core/policy/base.md` — add the always-on naming contract for manual/Superpowers-driven worktrees.
- Modify: `README.md` — document the naming helper and example output.
- Modify: `docs/maintenance.md` — document the helper as the source of truth for worktree names.
- Modify: `docs/safety/vibe-coding-safety-manual.md` — swap raw placeholder branch examples for the new helper.
- Modify: `docs/install/codex.md`
- Modify: `docs/install/copilot.md`
- Modify: `docs/install/cursor.md`
- Modify: `docs/install/claude-code.md`

## Rollout Gates

- Gate 1: naming must be derived without reading prompt text.
- Gate 2: no change may be made under `harness/upstream/**`.
- Gate 3: `worktree-preflight` must retain ownership of base recommendation and only reuse the helper for naming.
- Gate 4: projected `using-git-worktrees` guidance must carry the new naming rule across every supported target.
- Gate 5: Codex documentation must describe the helper as a supplement when the host already owns the worktree model.

### Task 1: Add The Repo-Owned Naming Helper

**Files:**
- Create: `harness/installer/lib/worktree-name.mjs`
- Create: `harness/installer/commands/worktree-name.mjs`
- Modify: `harness/installer/commands/harness.mjs`
- Create: `tests/installer/worktree-name.test.mjs`

- [ ] **Step 1: Add the CLI help contract**

Extend `tests/installer/commands.test.mjs` so the CLI help includes:

```text
worktree-name  Suggest a canonical worktree label and branch name for the active task
```

Run:

```bash
npm test -- tests/installer/commands.test.mjs
```

Expected: FAIL because the command is not registered yet.

- [ ] **Step 2: Add helper fixture coverage**

Create `tests/installer/worktree-name.test.mjs` with fixtures that assert:

```text
explicit --task resolves taskSlug directly
single active planning task resolves automatically
branch fallback is used only when planning is unavailable
sequence starts at 001 when no prior allocations exist
sequence increments when prior labels exist in progress.md
namespace wraps the branch name but not the worktree basename
```

Use a fixed clock in tests so expected labels are deterministic, for example:

```json
{
  "timestamp": "202604281159",
  "canonicalLabel": "202604281159-codex-app-compatibility-design-001"
}
```

- [ ] **Step 3: Implement the helper library**

Add exports with this approximate surface:

```js
export async function resolveWorktreeNaming(rootDir, options = {}) {
  return {
    taskId: 'codex-app-compatibility-design',
    taskSlug: 'codex-app-compatibility-design',
    timestamp: '202604281159',
    sequence: '001',
    canonicalLabel: '202604281159-codex-app-compatibility-design-001',
    branchName: 'copilot/202604281159-codex-app-compatibility-design-001',
    worktreeBasename: '202604281159-codex-app-compatibility-design-001'
  };
}
```

Keep sanitization ASCII-only and cap the task slug so the final label stays readable on macOS paths and in Git branch lists.

- [ ] **Step 4: Wire the command**

Add a thin `worktree-name` command wrapper that supports:

```bash
./scripts/harness worktree-name
./scripts/harness worktree-name --task codex-app-compatibility-design --namespace copilot
./scripts/harness worktree-name --json
```

- [ ] **Step 5: Run the focused command slice**

Run:

```bash
npm test -- tests/installer/commands.test.mjs tests/installer/worktree-name.test.mjs
```

Expected: PASS.

### Task 2: Reuse The Helper From Worktree Preflight

**Files:**
- Modify: `harness/installer/commands/worktree-preflight.mjs`
- Modify: `tests/installer/worktree-preflight.test.mjs`

- [ ] **Step 1: Add the preflight reporting contract**

Extend `tests/installer/worktree-preflight.test.mjs` so the normal text output includes lines shaped like:

```text
Suggested worktree label: 202604281159-codex-app-compatibility-design-001
Suggested branch name: copilot/202604281159-codex-app-compatibility-design-001
```

And `--json` includes:

```json
{
  "naming": {
    "canonicalLabel": "202604281159-codex-app-compatibility-design-001",
    "branchName": "copilot/202604281159-codex-app-compatibility-design-001"
  }
}
```

- [ ] **Step 2: Reuse the helper without changing preflight ownership**

Update `worktree-preflight.mjs` so it keeps base recommendation behavior intact, then adds a separate `naming` object from `resolveWorktreeNaming()`. Do not let name resolution silently change `baseRef`, `baseSha`, or safety check behavior.

- [ ] **Step 3: Record the example command shape**

Update the rendered text output so the example command becomes:

```bash
git worktree add <path>/<canonical-label> -b <suggested-branch> <base-ref>
```

while still preserving the explicit base guidance.

- [ ] **Step 4: Run the focused preflight slice**

Run:

```bash
npm test -- tests/installer/worktree-preflight.test.mjs tests/installer/worktree-name.test.mjs
```

Expected: PASS.

### Task 3: Patch Projected `using-git-worktrees` Skills

**Files:**
- Create: `harness/installer/lib/superpowers-using-git-worktrees-patch.mjs`
- Modify: `harness/core/skills/index.json`
- Modify: `harness/installer/commands/sync.mjs`
- Modify: `tests/adapters/skill-projection.test.mjs`
- Modify: `tests/adapters/sync-skills.test.mjs`

- [ ] **Step 1: Add projection-planning coverage**

Extend `tests/adapters/skill-projection.test.mjs` to assert that every supported target receives a child patch marker for `using-git-worktrees`, similar in spirit to the existing `writing-plans` coverage.

- [ ] **Step 2: Add materialized skill coverage**

Extend `tests/adapters/sync-skills.test.mjs` so the materialized `using-git-worktrees/SKILL.md` contains a Harness marker plus guidance such as:

```text
Before creating a manual worktree, run ./scripts/harness worktree-name
Use the canonical label for the worktree basename
Use the suggested branch name instead of deriving one from the prompt
```

- [ ] **Step 3: Implement the patch helper**

Create a patch helper that injects a short Harness-owned section near the creation steps. The section should say, in effect:

```text
Resolve the task-backed name first with ./scripts/harness worktree-name.
Use the suggested worktree basename and branch name.
If the host already manages the worktree (for example, Codex App), treat this helper as a supplementary naming tool rather than a host override.
```

- [ ] **Step 4: Register the patch type**

Update `harness/core/skills/index.json` to add a `childPatches` entry for `using-git-worktrees`, then update `sync.mjs` to apply the new patch type.

- [ ] **Step 5: Run the projection slice**

Run:

```bash
npm test -- tests/adapters/skill-projection.test.mjs tests/adapters/sync-skills.test.mjs
```

Expected: PASS.

### Task 4: Sync Policy And Operator Docs

**Files:**
- Modify: `harness/core/policy/base.md`
- Modify: `README.md`
- Modify: `docs/maintenance.md`
- Modify: `docs/safety/vibe-coding-safety-manual.md`
- Modify: `docs/install/codex.md`
- Modify: `docs/install/copilot.md`
- Modify: `docs/install/cursor.md`
- Modify: `docs/install/claude-code.md`

- [ ] **Step 1: Add the policy statement**

Update `harness/core/policy/base.md` so the cross-platform rule says manual or skill-driven worktrees should derive names from the repo-owned helper, not from prompt summaries.

- [ ] **Step 2: Document the operator flow**

Update `docs/maintenance.md` and `README.md` with an example flow like:

```bash
./scripts/harness worktree-preflight --safety
./scripts/harness worktree-name --namespace copilot
git worktree add "$HOME/.config/superpowers/worktrees/SuperpoweringWithFiles/<label>" -b "<branch>" dev
```

- [ ] **Step 3: Clarify the Codex distinction**

In `docs/install/codex.md`, explain that Codex may already provide an isolated workspace; the helper is still the recommended source of naming when creating manual branches or worktrees from inside the repo, but it does not replace host-owned workspace identity.

- [ ] **Step 4: Mirror the rule into the other install docs**

Document the same helper for Copilot, Cursor, and Claude Code so the user-visible operator guidance is consistent across targets.

- [ ] **Step 5: Run a focused doc/projection verification slice**

Run:

```bash
npm test -- tests/adapters/skill-projection.test.mjs tests/adapters/sync-skills.test.mjs tests/installer/commands.test.mjs tests/installer/worktree-name.test.mjs tests/installer/worktree-preflight.test.mjs
```

Expected: PASS.

### Task 5: Full Verification And Review Handoff

**Files:**
- Modify: `planning/active/worktree-naming-governance/task_plan.md`
- Modify: `planning/active/worktree-naming-governance/findings.md`
- Modify: `planning/active/worktree-naming-governance/progress.md`

- [ ] **Step 1: Run repository verification**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 2: Preview projection changes**

Run:

```bash
./scripts/harness sync --dry-run
./scripts/harness doctor --check-only
```

Expected: the new helper/patch changes appear as planned projections with no new health regressions.

- [ ] **Step 3: Capture a representative smoke example**

Run the helper in a disposable task fixture and record an example output in `progress.md`, for example:

```text
canonicalLabel: 202604281159-codex-app-compatibility-design-001
branchName: copilot/202604281159-codex-app-compatibility-design-001
```

- [ ] **Step 4: Sync planning state**

Update `task_plan.md`, `findings.md`, and `progress.md` with:

```text
implemented files
verification commands
final branch/worktree naming contract
any unresolved review questions
```

- [ ] **Step 5: Request review**

Summarize:

```text
what now owns naming
how it avoids prompt-derived names
how it remains upstream-safe
how Codex vs Copilot behavior differs
```

Then move the task to `waiting_review` if implementation is complete.
