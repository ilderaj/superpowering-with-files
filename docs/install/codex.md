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

Skills prefer link projection when symlinks are available.

Skill roots:

```text
.codex/skills
~/.codex/skills
```

Run:

```bash
./scripts/harness install --targets=codex --scope=workspace
./scripts/harness sync
```

By default, `sync` refuses to overwrite non-Harness-owned files. To preserve a backup and continue:

```bash
./scripts/harness sync --conflict=backup
```
