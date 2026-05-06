# Findings

## Initial Failure Inventory
- 当前全量 `npm run verify` 结果是 `312 pass / 7 fail`。
- 失败分布：
  - `tests/adapters/sync-skills.test.mjs`: 1
  - `tests/installer/worktree-name.test.mjs`: 4
  - `tests/installer/worktree-preflight.test.mjs`: 2

## Relevant Prior Context
- `worktree-naming-governance` 已关闭，设计目标是 `YYYYMMDDHHMM-<task-slug>-NNN` 的 canonical label，并让 `worktree-preflight` 复用 naming helper 但不改变 base recommendation ownership。
- 2026-05-06 的 verify 输出显示当前 helper 在测试里返回 UUID 风格 task id，例如 `019dfb30-6bea-79b2-863d-cf0a17aa2a6f`，和既有断言期望的 slug 不一致。
- `sync-skills` 失败点是 `mkdir '/Users/jared/.harness/backups/...'` 的 `EPERM`，初步更像测试环境写权限问题，而不是业务语义错误。

## Open Hypotheses
1. active-plan 解析链现在优先读取了某个 UUID 风格 id，导致旧测试夹具的 slug 期望过时。
2. `worktree-name` / `worktree-preflight` 的实现确实发生了回退行为漂移，测试仍然是对的。
3. `sync-skills` 测试需要显式隔离 `HOME` 或 backup root，避免写到真实用户目录。
