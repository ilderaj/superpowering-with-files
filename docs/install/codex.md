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

Hooks are not projected for Codex because Harness does not have a verified Codex hook adapter. If `--hooks=on` is used with `--targets=codex`, `status` and `doctor` report the Codex hook entries as unsupported without failing the health check.

Run:

```bash
./scripts/harness install --targets=codex --scope=workspace
./scripts/harness sync
```

Run with hook reporting enabled:

```bash
./scripts/harness install --targets=codex --scope=workspace --hooks=on
./scripts/harness sync
./scripts/harness doctor --check-only
./scripts/harness status
```

By default, `sync` refuses to overwrite non-Harness-owned files. To preserve a backup and continue:

```bash
./scripts/harness sync --conflict=backup
```
