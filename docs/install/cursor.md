# Cursor Installation

Cursor receives rules and skill projections.

Workspace scope writes:

```text
.cursor/rules/harness.mdc
```

Cursor User Rules live in Cursor Settings. Harness does not write a user-global rules file-system entry for Cursor.

User-global scope projects skills only.

```text
~/.cursor/skills
```

Cursor uses both rules and skills when available.

Skill roots:

```text
.cursor/skills
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

Cursor receives the Harness planning-with-files task-scoped hook and the vendored superpowers session-start hook when hooks are enabled.

Run:

```bash
./scripts/harness install --targets=cursor --scope=workspace
./scripts/harness sync
```

Run with hooks:

```bash
./scripts/harness install --targets=cursor --scope=workspace --hooks=on
./scripts/harness sync
./scripts/harness doctor --check-only
bash .cursor/hooks/task-scoped-hook.sh cursor session-start
```

By default, `sync` refuses to overwrite non-Harness-owned files. To preserve a backup and continue:

```bash
./scripts/harness sync --conflict=backup
```

Preview projection changes safely with:

```bash
./scripts/harness sync --dry-run
./scripts/harness sync --check
```
