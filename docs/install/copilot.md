# GitHub Copilot Installation

Copilot receives rendered `copilot-instructions.md` files.

Workspace scope writes:

```text
.copilot/copilot-instructions.md
```

User-global scope writes:

```text
~/.copilot/copilot-instructions.md
```

Copilot must not be assumed to read Codex global configuration. `planning-with-files` is materialized for Copilot when required.

Skill roots:

```text
.github/skills
~/.copilot/skills
```

Run:

```bash
./scripts/harness install --targets=copilot --scope=workspace
./scripts/harness sync
```

By default, `sync` refuses to overwrite non-Harness-owned files. To preserve a backup and continue:

```bash
./scripts/harness sync --conflict=backup
```
