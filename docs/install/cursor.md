# Cursor Installation

Cursor receives rules and skill projections.

Workspace scope writes:

```text
.cursor/rules/harness.mdc
```

User-global scope writes:

```text
~/.cursor/rules/harness.mdc
```

Cursor uses both rules and skills when available.

Skill roots:

```text
.cursor/skills
~/.cursor/skills
```

Run:

```bash
./scripts/harness install --targets=cursor --scope=workspace
./scripts/harness sync
```

By default, `sync` refuses to overwrite non-Harness-owned files. To preserve a backup and continue:

```bash
./scripts/harness sync --conflict=backup
```
