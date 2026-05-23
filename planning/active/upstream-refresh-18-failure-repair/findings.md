# Findings

## GitHub Run Facts
- 失败 run：`26294196313`
- workflow：`Upstream Refresh`（`.github/workflows/upstream-refresh.yml`）
- headBranch：`main`
- 失败 step：`Run upstream refresh`

## Failure Summary (Artifact)
从 `upstream-refresh-result` artifact 读取到的关键结论：

- `blockedReason` 包含 `npm run verify` 失败
- `npm run verify` 的最小失败用例包含：
  - `tests/installer/worktree-name.test.mjs` / `worktree-name command prints the naming contract as JSON`
  - `tests/installer/worktree-preflight.test.mjs` / `worktree-preflight prints naming suggestions in text output`
  - `ENOTEMPTY: directory not empty, rmdir '/tmp/harness-fixture-.../.git/objects'`
- 同一次失败还包含 allowlist 误报：
  - `node_modules/.cache/wrangler/wrangler-account.json`

## Local Reproduction Snapshot
- 本地 `npm run verify` 复现了同样的 `ENOTEMPTY` 抖动。
- 本地还额外复现了 Git 2.54 的 bare repo 安全策略导致的失败：
  - `fatal: cannot use bare repository ... (safe.bareRepository is 'explicit')`

