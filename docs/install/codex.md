# Codex Installation

Codex receives rendered `AGENTS.md` files.

Workspace scope writes:

```text
AGENTS.md
```

User-global scope writes:

```text
~/.codex/AGENTS.md
```

Codex projects skills into the shared Harness roots `.agents/skills` and `~/.agents/skills` to keep discovery stable and avoid symlink-specific duplication.

If Codex opens a leaf workspace such as `packages/demo/`, Harness still treats the current git worktree root as the default authority root for planning and `.harness` state. See [Leaf Workspaces](leaf-workspaces.md) for the resolution order and explicit override flow.

Skill roots:

```text
.agents/skills
~/.agents/skills
```

These are the same shared Harness skill roots used by GitHub Copilot.

Harness does not assume a single Codex feature-gate name. Check the installed Codex build first:

```bash
codex features list | rg '^hooks\s'
```

Expected on current builds: a `hooks` row marked enabled. If your Codex version uses a different gate name or config shape, follow the upstream Codex docs for that build instead of assuming Harness can enable it for you.

## Goal-like Continuations

Codex `/goal` stays native. Harness does not add an external runner and does not modify Codex internals.

The rendered Codex `AGENTS.md` applies the Goal Round Start Protocol to `/goal`, `/plan-goal`, and similar continuation flows at each substantive round, checkpoint, or phase boundary:

- restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md` first
- if a companion plan is referenced, read only the relevant compact section for the current round
- reclassify the round as `quick`, `tracked`, or `deep-reasoning`
- keep quick rounds lightweight
- keep `planning/active/<task-id>/` authoritative for tracked rounds
- use the companion plan plus optional read-only verifier subagents only for deep-reasoning rounds
- sync durable decisions, validation, and sync-back status into `planning/active/<task-id>/` after each phase

Codex hooks support this flow with lightweight reminders and context injection only. They are not the sole enforcement mechanism.

Harness projects Codex hooks only when `--hooks=on` is selected. It projects the verified planning-with-files `SessionStart` and `UserPromptSubmit` events, plus the superpowers `SessionStart` wrapper. When the `safety` profile is active, Harness can also project Codex `SessionStart` and `PreToolUse` safety hooks. Those remain repository-owned policy checks and do not replace host-platform approvals.

When these hooks run in a live Codex session, Harness writes runtime trace evidence under `.harness/runtime-hooks/codex.jsonl` and surfaces it in `doctor` and `verify` as runtime evidence instead of guessing.

Hook files:

```text
.codex/hooks.json
.codex/hooks/*
~/.codex/hooks.json
~/.codex/hooks/*
```

The Codex adapter uses official Codex hook config locations and events. Script filenames under `.codex/hooks/*` are Harness-owned adapter choices.

Run:

```bash
./scripts/harness install --targets=codex --scope=workspace
./scripts/harness sync
```

If you already installed Codex hooks before this allowlist change, re-run `./scripts/harness sync` so stale planning `Stop` entries are removed from existing Codex hook configs.

For manual branches or extra worktrees created from inside the repo, resolve the name with:

```bash
./scripts/harness worktree-name --task <task-id> --namespace codex
```

Codex App may already provide an isolated workspace or its own worktree model. Treat the helper as a supplementary naming tool for manual branch or worktree creation inside that workspace, not as a replacement for host-owned workspace identity.

Leaf workspaces do not create a second planning tree. `planning/active/<task-id>/` remains single-homed at the authority root, and mutating commands such as `install`, `sync`, and `verify` still target that root by default.

For user-global adoption, the default skill profile is the lean `minimal-global` projection. Use `--skills-profile=full` only when you intentionally want the complete skill surface:

```bash
./scripts/harness install --targets=codex --scope=user-global
./scripts/harness sync
```

If `doctor --check-only` warns that Codex is paired with `full` at user-global or `both` scope, treat that as a nudge to prefer `minimal-global` unless you really need the larger surface.

Run with hooks:

```bash
./scripts/harness install --targets=codex --scope=workspace --hooks=on
./scripts/harness sync
./scripts/harness doctor --check-only
./scripts/harness status
```

By default, `sync` refuses to overwrite non-Harness-owned files. To preserve a backup and continue:

```bash
./scripts/harness sync --conflict=backup
```

Harness archives the pre-existing content into `~/.harness/backups/` and records it in `~/.harness/backup-index.json`; it no longer leaves `.harness-backup-*` siblings in the live skill or entry roots.

If older `.harness-backup-*` siblings already exist from a previous takeover, the next successful `sync` imports them into the archive store and removes the live duplicates before projecting the new baseline.

Gemini CLI is not currently a supported Harness installer target. Harness does not create installer-managed Gemini entry files or user-global state.
