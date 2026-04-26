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

GitHub Copilot uses the shared Harness skill roots `.agents/skills` and `~/.agents/skills`. `planning-with-files` is materialized there when required.

Skill roots:

```text
.agents/skills
~/.agents/skills
```

The Copilot entry stays thin: it renders the always-on core policy plus Copilot-specific notes, but not the tracked-task or deep-reasoning sections.

Optional hooks:

```text
.github/hooks/planning-with-files.json
.github/hooks/superpowers.json
.github/hooks/task-scoped-hook.sh
.github/hooks/session-start
~/.copilot/hooks/planning-with-files.json
~/.copilot/hooks/superpowers.json
~/.copilot/hooks/task-scoped-hook.sh
~/.copilot/hooks/session-start
```

GitHub Copilot / VS Code Chat now has official preview hooks support. Harness uses native Copilot hook files under `.github/hooks/*.json` and `~/.copilot/hooks` as the primary contract. VS Code can also read Claude-format hooks from `.claude/settings*.json`, but Harness treats that as compatibility only because VS Code ignores Claude matchers and uses different tool names / input field names.

Run:

```bash
./scripts/harness install --targets=copilot --scope=workspace
./scripts/harness sync
```

When you create a manual branch or worktree for Copilot-driven work, resolve the name from the repo-owned helper instead of a prompt summary:

```bash
./scripts/harness worktree-name --task <task-id> --namespace copilot
```

For user-global adoption, keep the default `full` profile unless you explicitly want the smaller `minimal-global` projection:

```bash
./scripts/harness install --targets=copilot --scope=user-global --skills-profile=minimal-global
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

Harness archives the pre-existing content into `~/.harness/backups/` and records it in `~/.harness/backup-index.json`; it no longer leaves `.harness-backup-*` siblings in the live skill or entry roots.

If older `.harness-backup-*` siblings already exist from a previous takeover, the next successful `sync` imports them into the archive store and removes the live duplicates before projecting the new baseline.
