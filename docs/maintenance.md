# Maintenance

Maintenance flow:

```bash
./scripts/harness status
./scripts/harness fetch
./scripts/harness update
./scripts/harness sync
./scripts/harness doctor
```

`fetch` retrieves upstream candidates. `update` applies accepted candidates. `sync` regenerates installed projections.

Before policy extraction, reread the current global policy source and compare it with `harness/core/policy/base.md`.

When changing orchestration policy:

1. Update `harness/core/policy/base.md` first.
2. Keep platform overrides limited to platform-specific caveats.
3. If the rule needs mechanical support, add it under `harness/installer` rather than patching vendored upstream skills.
4. Run adapter rendering tests to confirm every supported target receives the rule.
5. Run repository verification before reporting completion.

Worktree base selection is a Harness-owned guardrail. Maintain it in:

- `harness/core/policy/base.md` for rendered cross-platform policy.
- `harness/installer/lib/git-base.mjs` for base recommendation logic.
- `harness/installer/commands/worktree-preflight.mjs` for the CLI entry point.

Run this before creating a manual or Superpowers-driven worktree:

```bash
./scripts/harness worktree-preflight
```

## Upstream Skill Updates

Upstream updates are staged before they are applied:

```bash
./scripts/harness fetch --source=superpowers
./scripts/harness update --source=superpowers
```

`planning-with-files` also tracks its Git source directly:

```bash
./scripts/harness fetch --source=planning-with-files
./scripts/harness update --source=planning-with-files
```

The update command may only write into `harness/upstream/<source-name>`. It must not modify `harness/core`, `harness/adapters`, `harness/installer`, or `planning/active`.

Do not patch `harness/upstream/superpowers` or `harness/upstream/planning-with-files` to enforce local workflow policy. Those directories are upstream baselines and may be replaced during update. Keep local governance and workflow mechanics in Harness-owned layers.

After any upstream update, run:

```bash
npm run verify
./scripts/harness worktree-preflight
./scripts/harness sync
./scripts/harness doctor
```
