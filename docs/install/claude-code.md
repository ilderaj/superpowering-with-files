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

Claude Code skill projection is per-skill. Directory-level shared roots such as `.claude/skills -> ~/.codex/skills` are not supported and are reported as unhealthy by `./scripts/harness status` and `./scripts/harness doctor`.

Optional hooks:

```text
.claude/settings.json
.claude/hooks/run-hook.cmd
.claude/hooks/task-scoped-hook.sh
~/.claude/settings.json
~/.claude/hooks/run-hook.cmd
~/.claude/hooks/task-scoped-hook.sh
```

Hook definitions are merged into the `hooks` field of the Claude Code settings JSON files.

Claude Code receives the Harness planning-with-files task-scoped hook and the vendored superpowers session-start hook when hooks are enabled.

Run:

```bash
./scripts/harness install --targets=claude-code --scope=workspace
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
