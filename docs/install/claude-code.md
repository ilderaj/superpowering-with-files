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

Run:

```bash
./scripts/harness install --targets=claude-code --scope=workspace
./scripts/harness sync
```

By default, `sync` refuses to overwrite non-Harness-owned files. To preserve a backup and continue:

```bash
./scripts/harness sync --conflict=backup
```
