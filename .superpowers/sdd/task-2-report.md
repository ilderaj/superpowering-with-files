# Task 2 Report: Release/Tag/Pin Resolution

## 结论
Task 2 已完成。已新增纯 resolver 层 `scripts/ci/lib/upstream-resolver.mjs`，并补齐 `tests/automation/upstream-resolver.test.mjs` 的定向覆盖。

## 实现内容
- 实现了 `resolveSourceTarget(source, deps)` 的策略分发。
- 实现了 `resolveLatestRelease(source, deps)`，默认忽略 prerelease，并仅在显式配置 `fallbacks: ['latest-tag']` 时才允许 fallback 到 latest-tag。
- 实现了 `resolveLatestTag(source, deps)`，通过 git tag 集合选择最新 tag，再解析到 commit SHA。
- 实现了 `resolvePinnedRef(source, deps)`，支持 `pinned-commit`、`pinned-tag`、`branch-head`。
- 实现了 `resolveTagCommit(url, tag, deps)`，会优先使用 peeled ref，确保 annotated tag 最终落到 commit SHA，而不是 tag object SHA。
- 实现了 `buildFetchPlan(resolvedSource)`，把解析结果收敛成 `fetchRef` + `checkoutCommitSha`，用于后续 fetch/CI 阶段。

## 测试
已通过定向测试：
- `node --test tests/automation/upstream-resolver.test.mjs`

覆盖点包括：
- latest-release 默认忽略 prerelease
- latest-release 仅在显式配置时 fallback 到 latest-tag
- release API 失败时不回退到 branch-head
- pinned-commit 直接返回配置 SHA
- annotated tag peel 到 commit SHA
- latest-tag 解析到最终 commit SHA
- pinned-commit 的 fetch plan 精确输出

## 边界
- 未修改 fetch/update/workflow 逻辑。
- 未修改现有 upstream refresh 主链。
- 未引入 branch-head 的静默回退。
- 未把 Task 2 连接到后续 Task 3/4。

## 备注
- 当前实现依赖注入的 `deps`，便于后续任务把 GitHub release API 和 `git ls-remote` 接口接上去。
- 本轮仅跑了 resolver focused suite，没有扩展到 broader suites，符合 Task 2 的窄范围要求。
