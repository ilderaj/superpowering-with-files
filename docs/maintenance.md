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
3. Run adapter rendering tests to confirm every supported target receives the rule.
4. Run repository verification before reporting completion.

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

After any upstream update, run:

```bash
npm run verify
./scripts/harness sync
./scripts/harness doctor
```
