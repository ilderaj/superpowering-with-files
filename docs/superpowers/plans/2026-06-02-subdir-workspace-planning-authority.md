# Subdirectory Workspace Planning Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to open a leaf workspace inside a large repo while keeping `planning/active/<task-id>/` and Harness state authoritative at the repo root.

**Architecture:** Separate `workspaceCwd` from `authorityRoot`. Introduce one shared authority-root discovery path used by CLI commands, hook scripts, and runtime/MCP services. Prefer explicit root hints when present, otherwise consult a leaf override file, then resolve the nearest Harness/planning ancestor, then fall back to Git top-level, then finally to `cwd`. Keep planning state single-homed; never duplicate `planning/` into leaf directories.

**Tech Stack:** Node.js ESM, shell hooks, `node:test`, Git root discovery.

**Active task path:** `planning/active/subdir-workspace-planning-authority/`

**Companion plan path:** `docs/superpowers/plans/2026-06-02-subdir-workspace-planning-authority.md`

**Lifecycle state:** waiting_execution after the user approved including leaf override support in the first implementation plan.

**Sync-back status:** Companion plan updated on 2026-06-02 11:53:21 UTC+8 to include Slice B in the first implementation scope; durable summary synced back to the active task files.

---

## Problem Contract

This plan solves the concrete case where a user opens a subdirectory like `apps/foo/` or `packages/bar/` as the workspace root to reduce IDE context, but still expects:

- `planning/active/<task-id>/` to resolve to the repository root,
- task-scoped hook hot context to come from that same root,
- CLI commands such as `summary`, `record`, `worktree-name`, `doctor`, and `status` to keep working,
- runtime and MCP reads/writes to keep enforcing the same root safely.

It does **not** solve planning duplication or multi-root task memory. The repository root remains the single source of truth.

## Root Resolution Contract

Introduce a shared authority-root resolution chain with source metadata:

1. Explicit `--root` or equivalent programmatic input
2. `HARNESS_PROJECT_ROOT`
3. Leaf override file at `.harness/authority-root.json`
4. Nearest ancestor that looks like a Harness authority root
5. `git rev-parse --show-toplevel`
6. `cwd`

Nearest-authority ancestor detection should treat these as sufficient signals:

- `.harness/state.json`
- `planning/active/`
- `scripts/harness`

Return both the resolved root and the resolution source so callers can surface diagnostics and tests can assert behavior.

## Rollout Principle

Implement this in one release with two ordered capabilities:

- **Capability A:** in-repo leaf workspaces continue to use repo-root planning and state automatically.
- **Capability B:** explicit leaf override files support out-of-tree or ambiguous nested-workspace setups in the same release.

Execution order should still be A first, B second, because B depends on the shared authority-root discovery contract introduced for A.

## Planned File Structure

Create:

```text
harness/runtime/authority-root.mjs
harness/installer/commands/workspace-link.mjs
tests/installer/authority-root.test.mjs
tests/installer/workspace-link.test.mjs
docs/install/leaf-workspaces.md
```

Modify:

```text
harness/runtime/root-policy.mjs
harness/runtime/resource-service.mjs
harness/runtime/status-service.mjs
harness/runtime/summary-service.mjs
harness/runtime/doctor-service.mjs
harness/runtime/sync-plan-service.mjs
harness/mcp/tools/write.mjs
harness/mcp/tools/registry.mjs
harness/installer/commands/status.mjs
harness/installer/commands/doctor.mjs
harness/installer/commands/summary.mjs
harness/installer/commands/record.mjs
harness/installer/commands/active-summary.mjs
harness/installer/commands/worktree-name.mjs
harness/installer/commands/worktree-preflight.mjs
harness/installer/commands/checkpoint.mjs
harness/installer/commands/checkpoint-push.mjs
harness/installer/commands/verify.mjs
harness/installer/commands/install.mjs
harness/installer/commands/sync.mjs
harness/installer/commands/adoption-status.mjs
harness/installer/commands/adopt-global.mjs
harness/installer/commands/cloud-bootstrap.mjs
harness/installer/commands/plugin.mjs
harness/installer/commands/harness.mjs
harness/core/hooks/runtime-hook-evidence.sh
harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh
harness/core/hooks/superpowers/scripts/session-start
harness/core/hooks/safety/scripts/session-checkpoint.sh
harness/core/hooks/safety/scripts/pretool-guard.sh
tests/helpers/harness-fixture.mjs
tests/installer/summary-command.test.mjs
tests/installer/record-command.test.mjs
tests/installer/active-summary-command.test.mjs
tests/installer/worktree-name.test.mjs
tests/installer/worktree-preflight.test.mjs
tests/installer/commands.test.mjs
tests/mcp/root-policy.test.mjs
tests/mcp/resources.test.mjs
tests/mcp/read-only-tools.test.mjs
tests/hooks/task-scoped-hook.test.mjs
tests/hooks/session-checkpoint.test.mjs
tests/hooks/pretool-guard.test.mjs
docs/install/codex.md
docs/install/cursor.md
docs/install/claude-code.md
docs/maintenance.md
AGENTS.md
CLAUDE.md
```

## Task 1: Add Shared Authority-Root Discovery

**Files:**
- Create: `harness/runtime/authority-root.mjs`
- Modify: `harness/runtime/root-policy.mjs`
- Test: `tests/installer/authority-root.test.mjs`
- Test: `tests/mcp/root-policy.test.mjs`

- [ ] Define `discoverAuthorityRoot(cwd, options)` that returns:
  - `rootDir`
  - `source` such as `explicit`, `env`, `override-file`, `ancestor-marker`, `git-top-level`, `cwd`
  - optional `markerPath` and `requestedRoot`
- [ ] Define override-file contract at `.harness/authority-root.json`:

```json
{
  "schemaVersion": 1,
  "authorityRoot": "../.."
}
```

  `authorityRoot` must be resolved relative to the directory containing the JSON file.
- [ ] Implement ancestor scanning without assuming `.git` exists.
- [ ] Keep `resolveHarnessRoot()` as the MCP-facing boundary checker, but make its default root come from `discoverAuthorityRoot()` instead of raw `cwd`.
- [ ] Update allow-list semantics so an authority root that contains the current leaf workspace is accepted by default.
- [ ] Add tests for:
  - repo root cwd
  - nested cwd inside repo
  - nested cwd with `.harness/authority-root.json`
  - no markers + no git fallback
  - explicit env override
  - external root rejection
  - symlink escape rejection

## Task 2: Migrate Planning-Critical CLI Commands

**Files:**
- Modify: `harness/installer/commands/status.mjs`
- Modify: `harness/installer/commands/doctor.mjs`
- Modify: `harness/installer/commands/summary.mjs`
- Modify: `harness/installer/commands/record.mjs`
- Modify: `harness/installer/commands/active-summary.mjs`
- Modify: `harness/installer/commands/worktree-name.mjs`
- Modify: `harness/installer/commands/worktree-preflight.mjs`
- Modify: `harness/installer/commands/checkpoint.mjs`
- Modify: `harness/installer/commands/checkpoint-push.mjs`
- Modify: `harness/installer/commands/verify.mjs`
- Test: `tests/installer/summary-command.test.mjs`
- Test: `tests/installer/record-command.test.mjs`
- Test: `tests/installer/active-summary-command.test.mjs`
- Test: `tests/installer/worktree-name.test.mjs`
- Test: `tests/installer/worktree-preflight.test.mjs`

- [ ] Replace direct `process.cwd()` root binding with authority-root discovery.
- [ ] Preserve existing `cwd` semantics for user-facing relative output when practical, but read and write planning/state against `authorityRoot`.
- [ ] Add fixture coverage where the command runs from a nested leaf directory like `packages/demo/` while planning lives at the fixture root.
- [ ] Assert that:
  - `summary` still finds the active task,
  - `record` appends into root `planning/active/<task-id>/`,
  - `worktree-name` sequence resolution still reads root progress,
  - `doctor` and `status` report root-backed state instead of leaf-local empty state.

## Task 3: Bring Hook Root Resolution To Parity

**Files:**
- Modify: `harness/core/hooks/runtime-hook-evidence.sh`
- Modify: `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh`
- Modify: `harness/core/hooks/superpowers/scripts/session-start`
- Modify: `harness/core/hooks/safety/scripts/session-checkpoint.sh`
- Modify: `harness/core/hooks/safety/scripts/pretool-guard.sh`
- Test: `tests/hooks/task-scoped-hook.test.mjs`
- Test: `tests/hooks/session-checkpoint.test.mjs`
- Test: `tests/hooks/pretool-guard.test.mjs`

- [ ] Replace `pwd` fallback with the same authority-root resolution contract used by Node code.
- [ ] Preserve `HARNESS_PROJECT_ROOT` as the strongest non-CLI override.
- [ ] For planning hooks, ensure a nested `cwd` still injects hot context from root `planning/active`.
- [ ] For safety hooks, ensure checkpoint and guard behavior report and operate against the authority root, not the leaf directory.
- [ ] Add nested-cwd tests that execute the shell hooks from a child directory under the fixture root.

## Task 4: Align Runtime And MCP Services

**Files:**
- Modify: `harness/runtime/resource-service.mjs`
- Modify: `harness/runtime/status-service.mjs`
- Modify: `harness/runtime/summary-service.mjs`
- Modify: `harness/runtime/doctor-service.mjs`
- Modify: `harness/runtime/sync-plan-service.mjs`
- Modify: `harness/mcp/tools/write.mjs`
- Modify: `harness/mcp/tools/registry.mjs`
- Test: `tests/mcp/resources.test.mjs`
- Test: `tests/mcp/read-only-tools.test.mjs`
- Test: `tests/mcp/root-policy.test.mjs`

- [ ] Ensure runtime services default to authority-root discovery when `root` is omitted.
- [ ] Keep MCP boundary enforcement intact: leaf workspaces may point upward only to their resolved authority root, not to arbitrary parent directories.
- [ ] Add coverage where MCP tools are called from a nested cwd and still return the root-backed task/status/resource view.

## Task 5: Handle Workspace-Mutating Commands Safely

**Files:**
- Modify: `harness/installer/commands/install.mjs`
- Modify: `harness/installer/commands/sync.mjs`
- Modify: `harness/installer/commands/adoption-status.mjs`
- Modify: `harness/installer/commands/adopt-global.mjs`
- Modify: `harness/installer/commands/cloud-bootstrap.mjs`
- Modify: `harness/installer/commands/plugin.mjs`
- Test: `tests/installer/commands.test.mjs`

- [ ] Decide command-by-command whether to:
  - operate on `authorityRoot`, or
  - refuse from a leaf workspace with a clear message.
- [ ] For `install` and `sync`, default to acting on `authorityRoot`; do not create shadow `.codex`, `.cursor`, `.claude`, `.github`, or `.agents` trees under the leaf directory by accident.
- [ ] For commands whose semantics are truly leaf-local in the future, require an explicit flag rather than silently changing scope.
- [ ] Add regression tests that prove invoking these commands from `packages/demo/` still mutates only the root fixture.

## Task 6: Add Explicit Leaf Override Authoring

**Files:**
- Create: `harness/installer/commands/workspace-link.mjs`
- Modify: `harness/installer/commands/harness.mjs`
- Test: `tests/installer/workspace-link.test.mjs`

- [ ] Add `./scripts/harness workspace-link --root <path>` to create or update `.harness/authority-root.json` in the current leaf workspace.
- [ ] Require `--root` to point to an existing authority root and normalize it to a relative path from the leaf workspace.
- [ ] Refuse to write the file when invoked from the authority root itself unless `--force` is explicitly passed.
- [ ] Add tests for:
  - creating a new override file
  - rewriting an existing override file
  - rejecting external paths
  - producing a stable relative `authorityRoot` value

## Task 7: Documentation And Operator Guidance

**Files:**
- Create: `docs/install/leaf-workspaces.md`
- Modify: `docs/install/codex.md`
- Modify: `docs/install/cursor.md`
- Modify: `docs/install/claude-code.md`
- Modify: `docs/maintenance.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] Document the new distinction:
  - leaf workspace for narrow context
  - root authority for planning and Harness state
- [ ] State that `planning/active/<task-id>/` remains single-homed.
- [ ] Document the default resolution order and when `HARNESS_PROJECT_ROOT` is useful.
- [ ] Document `.harness/authority-root.json` and `workspace-link` as the explicit escape hatch for out-of-tree or ambiguous nested workspaces.
- [ ] Clarify that workspace-mutating commands still target `authorityRoot` by default even when started from a linked leaf workspace.

This should stay ignored by Git and be treated as an advanced override, not the default setup path.

## Verification Matrix

Before calling the work complete, run and record:

```bash
npm run verify
node --test tests/hooks/task-scoped-hook.test.mjs
node --test tests/hooks/session-checkpoint.test.mjs
node --test tests/hooks/pretool-guard.test.mjs
node --test tests/mcp/root-policy.test.mjs tests/mcp/resources.test.mjs tests/mcp/read-only-tools.test.mjs
```

Manual verification scenarios:

1. From repo root, existing behavior is unchanged.
2. From `packages/demo/`, `./scripts/harness summary` still finds root planning.
3. From `packages/demo/`, `./scripts/harness record --task <id> --file progress` writes only to root planning.
4. Hook execution from a nested cwd still injects the correct root task context.
5. `install` or `sync` from a nested cwd does not create duplicate projection trees in the leaf directory.
6. From a leaf workspace that contains `.harness/authority-root.json`, the same commands resolve to the linked authority root even when no ancestor markers exist locally.

## Risks And Rollback

- **Risk:** mutating commands write to the leaf workspace instead of the authority root.
  - Mitigation: migrate command root resolution before claiming support; add regression tests that inspect touched paths.
- **Risk:** MCP allow-list becomes too permissive and allows arbitrary parent traversal.
  - Mitigation: bind upward traversal only to the discovered authority root and keep symlink boundary checks.
- **Risk:** hook shell logic diverges from Node resolution logic.
  - Mitigation: keep one documented resolution order and add nested-cwd hook tests for every projected hook family.
- **Risk:** nested repos or submodules pick the wrong authority root.
  - Mitigation: prioritize explicit root/env and override file ahead of nearest Harness markers and Git top-level.
- **Risk:** override files drift after moving directories.
  - Mitigation: make `workspace-link` rewrite relative paths deterministically and document it as the supported update path.

Rollback strategy:

- Revert the shared authority-root module and command migrations as one patch set.
- Revert `workspace-link` and ignore stale `.harness/authority-root.json` files until cleanup.
- Keep planning files untouched; this feature changes root resolution, not planning data layout.
- If hook parity causes trouble, temporarily restore env-or-`pwd` fallback while keeping CLI/runtime changes isolated.
