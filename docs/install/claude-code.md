# Claude Code Installation

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

Skill roots:

```text
.claude/skills
~/.claude/skills
```

Claude Code skill projection is per-skill. Directory-level shared roots such as `.claude/skills -> ~/.agents/skills` are not supported and are reported as unhealthy by `./scripts/harness status` and `./scripts/harness doctor`.

Optional hooks:

```text
.claude/settings.json
.claude/hooks/run-hook.cmd
.claude/hooks/task-scoped-hook.sh
.claude/hooks/session-start
~/.claude/settings.json
~/.claude/hooks/run-hook.cmd
~/.claude/hooks/task-scoped-hook.sh
~/.claude/hooks/session-start
```

Hook definitions are merged into the `hooks` field of the Claude Code settings JSON files.

Claude Code receives the Harness planning-with-files task-scoped hook and the vendored superpowers session-start hook when hooks are enabled.

Claude Code remains the native owner of `.claude/settings*.json`. VS Code and Cursor can read Claude-format hooks as a compatibility surface, but Harness treats these settings files as the Claude Code contract and keeps other targets on their native hook adapters.

Run:

```bash
./scripts/harness install --targets=claude-code --scope=workspace
./scripts/harness sync
```

When you create a manual branch or worktree for Claude Code-driven work, resolve the name from the repo-owned helper instead of a prompt summary:

```bash
./scripts/harness worktree-name --task <task-id> --namespace claude-code
```

For user-global adoption, keep the default `full` profile unless you explicitly want the smaller `minimal-global` projection:

```bash
./scripts/harness install --targets=claude-code --scope=user-global --skills-profile=minimal-global
./scripts/harness sync
```

Run with hooks:

```bash
./scripts/harness install --targets=claude-code --scope=workspace --hooks=on
./scripts/harness sync
./scripts/harness doctor --check-only
bash .claude/hooks/task-scoped-hook.sh claude-code user-prompt-submit
```

By default, `sync` refuses to overwrite non-Harness-owned files. To preserve a backup and continue:

```bash
./scripts/harness sync --conflict=backup
```

Harness archives the pre-existing content into `~/.harness/backups/` and records it in `~/.harness/backup-index.json`; it no longer leaves `.harness-backup-*` siblings in the live skill or entry roots.

If older `.harness-backup-*` siblings already exist from a previous takeover, the next successful `sync` imports them into the archive store and removes the live duplicates before projecting the new baseline.
