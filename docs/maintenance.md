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
