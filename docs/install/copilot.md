# GitHub Copilot Installation

Copilot receives rendered `copilot-instructions.md` files.

Workspace scope writes:

```text
.github/copilot-instructions.md
```

User-global scope writes:

```text
~/.copilot/instructions/harness.instructions.md
```

Copilot must not be assumed to read Codex global configuration. `planning-with-files` is materialized for Copilot when required.

Skill roots:

```text
.github/skills
~/.copilot/skills
```

Optional hooks:

```text
.github/hooks/planning-with-files.json
.github/hooks/task-scoped-hook.sh
~/.copilot/hooks/planning-with-files.json
~/.copilot/hooks/task-scoped-hook.sh
```

Copilot currently receives the Harness planning-with-files task-scoped hook. Superpowers hooks are reported as unsupported for Copilot.

Run:

```bash
./scripts/harness install --targets=copilot --scope=workspace
./scripts/harness sync
```

Run with hooks:

```bash
./scripts/harness install --targets=copilot --scope=workspace --hooks=on
./scripts/harness sync
./scripts/harness doctor --check-only
bash .github/hooks/task-scoped-hook.sh copilot session-start
```

By default, `sync` refuses to overwrite non-Harness-owned files. To preserve a backup and continue:

```bash
./scripts/harness sync --conflict=backup
```
