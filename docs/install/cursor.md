# Cursor Installation

Cursor receives rules and skill projections.

Workspace scope writes:

```text
.cursor/rules/harness.mdc
```

Cursor User Rules live in Cursor Settings and apply at the settings layer rather than a user-global rule file on disk. Harness does not write a user-global rules file-system entry for Cursor.

User-global scope projects skills only.

```text
~/.agents/skills
```

Cursor uses both rules and skills when available. Cursor's official docs list `.agents/skills` and `~/.agents/skills` as auto-discovered skill directories, so Harness uses the same shared skill roots as Codex and GitHub Copilot. Cursor's native `.cursor/skills` roots remain official compatibility discovery paths, but Harness no longer projects a duplicate Cursor-specific skill tree there.

Cursor official discovery roots:

```text
.agents/skills
.cursor/skills
~/.agents/skills
~/.cursor/skills
```

Optional hooks:

```text
.cursor/hooks.json
.cursor/hooks/session-start
.cursor/hooks/task-scoped-hook.sh
~/.cursor/hooks.json
~/.cursor/hooks/session-start
~/.cursor/hooks/task-scoped-hook.sh
```

Cursor receives the Harness planning-with-files task-scoped hook and the vendored superpowers session-start hook when hooks are enabled. Cursor now has official native hooks documentation for `.cursor/hooks.json` / `~/.cursor/hooks.json`, and official third-party Claude hook compatibility. Harness keeps the native Cursor format as the primary adapter; Claude-compatible loading is migration/compatibility behavior, not the default projection path.

Run:

```bash
./scripts/harness install --targets=cursor --scope=workspace
./scripts/harness sync
```

When you create a manual branch or worktree for Cursor-driven work, resolve the name from the repo-owned helper instead of a prompt summary:

```bash
./scripts/harness worktree-name --task <task-id> --namespace cursor
```

For user-global adoption, the default skill profile is the lean `minimal-global` projection. Use `--skills-profile=full` only when you intentionally want the complete skill surface:

```bash
./scripts/harness install --targets=cursor --scope=user-global
./scripts/harness sync
```

Run with hooks:

```bash
./scripts/harness install --targets=cursor --scope=workspace --hooks=on
./scripts/harness sync
./scripts/harness doctor --check-only
bash .cursor/hooks/session-start
```

By default, `sync` refuses to overwrite non-Harness-owned files. To preserve a backup and continue:

```bash
./scripts/harness sync --conflict=backup
```

Harness archives the pre-existing content into `~/.harness/backups/` and records it in `~/.harness/backup-index.json`; it no longer leaves `.harness-backup-*` siblings in the live skill or entry roots.

If older `.harness-backup-*` siblings already exist from a previous takeover, the next successful `sync` imports them into the archive store and removes the live duplicates before projecting the new baseline.

Preview projection changes safely with:

```bash
./scripts/harness sync --dry-run
./scripts/harness sync --check
```
