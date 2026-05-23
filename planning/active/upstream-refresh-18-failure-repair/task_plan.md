# Task Plan: Upstream Refresh 18 Failure Repair

## Goal
修复 `Upstream Refresh` 在 `main` 上的失败（run `26294196313`），恢复定时与手动触发的 upstream refresh 流程稳定性，重点解决：

- `npm run verify` 中的 `ENOTEMPTY` 临时 fixture 清理失败
- `npm run verify` 中的 bare git repo 安全策略变更导致的测试失败（`safe.bareRepository`）
- upstream refresh allowlist 误报运行时缓存（`node_modules/.cache/wrangler/...`）
- refresh 失败原因被误标成 “Git conflict” 的可观测性问题

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Current Phase
Phase 3

## Phases

### Phase 1: 复现与基线确认
- [x] 本地运行 `npm run verify`，记录当前失败用例与最小错误
- [x] 取证 upstream refresh artifact（blockedReason、excluded path）
- **Status:** complete

### Phase 2: 修复与回归
- [x] 修复临时 fixture 删除的 `ENOTEMPTY` 抖动
- [x] 修复 bare repo 测试 helper 对 `safe.bareRepository` 的兼容
- [x] 让 upstream refresh allowlist 忽略 `node_modules/.cache/**` 运行时产物（至少 untracked）
- [x] 修正 refresh blockedReason 的 conflict 误报规则
- **Status:** complete

### Phase 3: 验证与恢复
- [x] 本地 `npm run verify` 全绿
- [ ] 更新 workflow 并在 GitHub rerun `Upstream Refresh` 验证
- **Status:** in_progress
