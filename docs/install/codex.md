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

Harness currently projects Codex skills into the official Codex skill roots and materializes them there to keep discovery stable and avoid symlink-specific duplication.

Skill roots:

```text
.agents/skills
~/.agents/skills
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

Gemini CLI is not currently a supported Harness installer target. Harness does not create installer-managed Gemini entry files or user-global state.
