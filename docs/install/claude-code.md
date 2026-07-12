# Claude Code Installation

This page is the Claude Code-specific install and behavior guide.

Use it for `CLAUDE.md`, Claude skill roots, settings-backed hooks, and leaf-workspace behavior. For the general Harness model, start with the repository README instead.

Claude Code receives rendered `CLAUDE.md` files.

Workspace scope writes:

```text
CLAUDE.md
```

User-global scope writes:

```text
~/.claude/CLAUDE.md
```

Hooks are optional and are not installed unless explicitly selected.

If Claude Code opens a leaf workspace such as `packages/demo/`, Harness still uses the current git worktree root as the default authority root for planning and `.harness` state. See [Leaf Workspaces](leaf-workspaces.md) for the bounded resolution order and explicit override flow.

Skill roots:

```text
.claude/skills
~/.claude/skills
```

Claude Code skill projection is per-skill. Directory-level shared roots such as `.claude/skills -> ~/.agents/skills` are not supported and are reported as unhealthy by `./scripts/harness status` and `./scripts/harness doctor`.

Optional hooks:

```text
.claude/settings.json
.claude/hooks/task-scoped-hook.sh
~/.claude/settings.json
~/.claude/hooks/task-scoped-hook.sh
```

Hook definitions are merged into the `hooks` field of the Claude Code settings JSON files.

Claude Code receives the Harness planning-with-files task-scoped hook when hooks are enabled. Superpowers remains an explicit skill route and has no auto-start hook.

Claude Code remains the native owner of `.claude/settings*.json`. VS Code and Cursor can read Claude-format hooks as a compatibility surface, but Harness treats these settings files as the Claude Code contract and keeps other targets on their native hook adapters.

Scripts in `.claude/hooks/` are inert until Claude Code settings reference them through the `hooks` field. Projected scripts alone do not prove that the active Claude Code runtime will invoke them.

Run:

```bash
./scripts/harness install --targets=claude-code --scope=workspace
./scripts/harness sync
```

When you create a manual branch or worktree for Claude Code-driven work, resolve the name from the repo-owned helper instead of a prompt summary:

```bash
./scripts/harness worktree-name --task <task-id> --namespace claude-code
```

Leaf workspaces do not create a second planning tree. `planning/active/<task-id>/` remains authoritative at the root, and commands such as `install`, `sync`, `verify`, and `record` still target that authority root by default.

For user-global adoption, the default skill profile is the lean `minimal-global` projection. Use `--skills-profile=full` only when you intentionally want the complete skill surface:

```bash
./scripts/harness install --targets=claude-code --scope=user-global
./scripts/harness sync
```

Run with hooks:

```bash
./scripts/harness install --targets=claude-code --scope=workspace --hooks=on
./scripts/harness sync
./scripts/harness doctor --check-only
bash .claude/hooks/task-scoped-hook.sh claude-code user-prompt-submit
```

## Verification levels

Claude Code support is verified in layers:

1. Projection: `CLAUDE.md` and `.claude/skills` exist.
2. Hook configuration: `.claude/settings.json` or `~/.claude/settings.json` contains Harness-managed `hooks`.
3. Local hook payload: Harness can execute the projected hook script and parse the expected JSON payload.
4. Runtime invocation: the active Claude Code process is observed invoking the hook.

Harness can verify the first three layers locally. Runtime invocation requires evidence from Claude Code itself, so `runtime=not-measured` means the configuration and local payload checks passed but the running Claude Code session has not been directly observed invoking the hook.

`doctorPassed` and `Harness installation is healthy` report Harness health checks only. They do not claim that Claude Code has already invoked the hook in a live session.

For a manual hook smoke test, enable hooks, run `./scripts/harness doctor --check-only`, then execute:

```bash
bash .claude/hooks/task-scoped-hook.sh claude-code user-prompt-submit
```

If the command returns a JSON payload with `hookSpecificOutput.additionalContext`, the local payload layer is working. It still does not prove live runtime invocation.

By default, `sync` refuses to overwrite non-Harness-owned files. To preserve a backup and continue:

```bash
./scripts/harness sync --conflict=backup
```

Harness archives the pre-existing content into `~/.harness/backups/` and records it in `~/.harness/backup-index.json`; it no longer leaves `.harness-backup-*` siblings in the live skill or entry roots.

If older `.harness-backup-*` siblings already exist from a previous takeover, the next successful `sync` imports them into the archive store and removes the live duplicates before projecting the new baseline.
