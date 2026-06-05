# Upstream Update Compatibility

Use this contract after `./scripts/harness fetch` / `./scripts/harness update` and before accepting projection changes with `sync`. It preserves the update-then-sync separation: upstream baselines may change first, but local projections change only after review.

## Report Contract

```markdown
# Upstream Update Compatibility: <source/date>

## Changed Upstream Files
- `harness/upstream/<source>/...`

## Affected Harness Projections
| Projection / surface | Impact | Required resync |
| --- | --- | --- |
| Entry files | none / changed | yes/no |
| Skills | none / changed | yes/no |
| Hooks | none / changed | yes/no |
| Planning templates/scripts | none / changed | yes/no |
| MCP/runtime docs | none / changed | yes/no |

## Patch Drift Warnings
- Harness-owned overlay or patch: <clean / drifted / failed>
- Evidence: <diff, test, or command output>

## Risk Level
- Low: upstream docs/template-only change with clean patches.
- Medium: skill, planning, or hook text changed; focused projection checks required.
- High: patch failed, lifecycle semantics changed, generated projections differ unexpectedly, or verification failed.

## Required Checks
- `<command>` — result

## Decision
- Accept and sync / accept with follow-up / block and investigate
```

## Required Checks

Choose checks based on the changed files:

```bash
./scripts/harness sync --dry-run
./scripts/harness doctor --check-only
npm run test:core
npm run test:mcp
```

If skills, hooks, adapters, or projection metadata changed, add focused adapter/projection checks or the full suite:

```bash
npm run verify
```

## Operator Rules

- `update` may write only upstream baseline locations for the selected source.
- Do not patch `harness/upstream/**` to enforce local policy; use Harness-owned overlays, installer code, tests, or docs.
- Treat patch drift as a review blocker until a human accepts the new upstream behavior or updates the Harness patch deliberately.
- Run `sync --dry-run` before `sync`; dry-run is review evidence, not a substitute for writing and verifying when adoption state must change.
