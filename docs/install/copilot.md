# GitHub Copilot Installation

This page is the GitHub Copilot-specific install and behavior guide.

Use it for Copilot entry files, skill roots, hooks, GitHub-cloud deployment shape, and `cloud-dev` constraints. For the general Harness model, start with the repository README instead.

Copilot receives rendered `copilot-instructions.md` files.

Workspace scope writes:

```text
.github/copilot-instructions.md
```

User-global scope writes:

```text
~/.copilot/instructions/harness.instructions.md
```

GitHub Copilot uses the shared Harness skill roots `.agents/skills` and `~/.agents/skills` by default. For GitHub-origin cloud repos, Harness can switch the workspace root to `.github/skills` while keeping user-global skills under `~/.agents/skills`.

Skill roots:

```text
.agents/skills
~/.agents/skills
```

GitHub-origin cloud deployment profile workspace skill root:

```text
.github/skills
```

The Copilot entry stays thin: it renders the always-on core policy plus Copilot-specific notes, but not the tracked-task or deep-reasoning sections.

Optional hooks:

```text
.github/hooks/planning-with-files.json
.github/hooks/task-scoped-hook.sh
~/.copilot/hooks/planning-with-files.json
~/.copilot/hooks/task-scoped-hook.sh
```

GitHub Copilot / VS Code Chat now has official preview hooks support. Harness projects only the task-scoped planning hook under `.github/hooks/*.json` and `~/.copilot/hooks`; Superpowers remains an explicit skill route and has no auto-start hook. VS Code can also read Claude-format hooks from `.claude/settings*.json`, but Harness treats that as compatibility only because VS Code ignores Claude matchers and uses different tool names / input field names.

Run:

```bash
./scripts/harness install --targets=copilot --scope=workspace
./scripts/harness sync
```

For repo-local cloud execution where Copilot must stay inside `.github/**`, run:

```bash
./scripts/harness install --targets=copilot --scope=workspace --profile=cloud-safe --deployment-profile=github-cloud --hooks=on
./scripts/harness sync
```

### Cloud Dev Harness Pilot

For the `cloud-dev` lane, keep the Copilot install workspace-only:

```bash
./scripts/harness install --targets=copilot --scope=workspace --profile=cloud-safe --deployment-profile=github-cloud --hooks=on
./scripts/harness sync
./scripts/harness doctor --check-only
```

Do not use `--scope=user-global` or `--scope=both` for the `cloud-dev` lane.

When you create a manual branch or worktree for Copilot-driven work, resolve the name from the repo-owned helper instead of a prompt summary:

```bash
./scripts/harness worktree-name --task <task-id> --namespace copilot
```

If you want to bootstrap or refresh Copilot user-global state explicitly, use:

```bash
./scripts/harness install --targets=copilot --scope=user-global
./scripts/harness sync
```

User-global Copilot defaults to the lean `minimal-global` skill profile. Use `--skills-profile=full` only for a workspace that intentionally accepts the larger skill surface.

For this repository, enable Copilot `safety` only at workspace scope. User-global Copilot can stay installed, but its profile must remain non-safety such as `always-on-core`.

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
