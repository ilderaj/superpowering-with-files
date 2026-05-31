# 任务计划：Codex / Claude Code Runtime Plugin 可行性分析

## Current State
Status: active
Archive Eligible: no
Close Reason:

## 目标
完整分析本项目做成一个至少兼容 Codex 与 Claude Code、容易分发、标准、可扩展、易协作的 runtime 类 harness plugin 的可能性，并给出架构判断、缺口、风险、路线图与推荐交付形态。

## Plan Record: 2026-05-31 11:35:44 UTC+8

### Phase 1：恢复上下文与任务建档
Status: complete
- 检查现有 `planning/active/` 任务，特别是 Codex、Claude Code、MCP runtime facade 相关任务。
- 建立本任务独立 planning 目录。
- 记录历史任务中可复用的架构事实与当前任务边界。

### Phase 2：仓库现状审计
Status: complete
- 梳理项目当前架构、CLI、adapter、runtime、MCP、registry、hook、skill projection 和安装分发能力。
- 区分已实现、半实现、文档声明、历史规划四类状态。

### Phase 3：Codex / Claude Code plugin 目标面核对
Status: complete
- 核对当前 Codex 与 Claude Code 对 plugin、extension、hook、MCP、skill/command 分发的真实约束。
- 判断哪些能力能直接兼容，哪些需要薄 adapter，哪些只能通过 MCP/runtime bridge 间接兼容。

### Phase 4：目标产品形态设计
Status: complete
- 定义 `runtime harness plugin` 的标准包结构、manifest、capability registry、policy、extension points、receipt/audit、测试契约。
- 分析最小可行版本、标准版本、团队协作版本和云端版本。

### Phase 5：风险、缺口与路线图
Status: complete
- 梳理技术风险、生态规范风险、安全/权限风险、协作/升级风险与维护成本。
- 输出分阶段路线图、验收标准和推荐下一步。

## 关键问题
1. “plugin” 应该是 Codex / Claude Code 原生插件，还是一个 runtime 包加两端薄适配层？
2. 现有 MCP facade、adapter projection、hook evidence、planning-with-files 能否组成一个标准 runtime plugin 内核？
3. 最容易分发且可协作的边界在哪里：npm 包、MCP server、CLI installer、skills bundle、还是多包组合？
4. 哪些能力必须保持平台原生，哪些应上移到统一 runtime？

## 已知上下文
- `harness-runtime-facade-mcp` 已把 MCP 定位为 control plane，而不是第五个 IDE adapter。
- `codex-harness-capability-audit-20260528` 已确认 Codex 支持链路包括 `AGENTS.md`、skills、hooks、doctor/verify 与 runtime evidence，但真实 runtime invocation 仍依赖 trace。
- `cc-harness-analysis` 已完成 Claude Code evidence semantics 和 local payload measurement 修正，明确 config/payload/runtime invocation 的证据边界。

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| 无 | 0 | 无 |
| `./scripts/harness doctor --check-only` 失败 | 1 | 记录为当前 adoption/planning 状态事实：若干 companion plan 未同步、Claude Code user-global hook config 缺失、多 active task 导致 planning hot context measurement skipped。 |

## Plan Record: 2026-05-31 11:50:17 UTC+8

### Phase 6：包边界与迁移策略讨论
Status: complete
- 回答 package 应留在当前 repo/workspace 还是拆独立 repo。
- 设计从现有 global adoption 平顺迁移到 plugin adoption 的策略。
- 把 Cursor 与 GitHub Copilot plugin/skills/MCP 演进纳入同一包边界判断。

## 架构倾向
- 短中期推荐当前 repo 内 monorepo/workspace 产品化，而不是立即拆独立 repo。
- 发布物应从 workspace packages 生成，repo 仍保留为 source-of-truth、测试矩阵、文档和 release 管线。
- 插件包不应携带当前项目的 `planning/active`、`planning/archive`、reports、live projections；这些是 harness 实例状态，不是 runtime 产品。

## Plan Record: 2026-05-31 12:19:03 UTC+8

### Phase 7：Runtime plugin release companion plan
Status: complete
- 用户认可实施顺序，并要求输出可 review 的 companion plan。
- Companion plan 已覆盖 monorepo package boundary、global adoption migration、四平台 plugin wrappers、packed artifacts、`1.0.6` GitHub release、verification gates 与 loophole audit。

## Companion Plan
- **Path:** `docs/superpowers/plans/2026-05-31-runtime-harness-plugin-release-plan.md`
- **Summary:** 将 Harness 产品化为 `harness-runtime` workspace package、`plugin-kit`、Codex/Claude Code/Cursor/Copilot 四个平台 plugin wrapper，并发布 GitHub release `1.0.6`，附带五个 packed artifacts 与 SHA256/manifest。
- **Sync-back status:** execution started in isolated worktree at 2026-05-31 13:48:00 UTC+8.

## Plan Record: 2026-05-31 13:48:00 UTC+8

### Phase 8：执行 companion plan
Status: in_progress
- 使用隔离 worktree `.worktrees/202605310547-codex-cc-runtime-plugin-feasibility-001`。
- 分支：`runtime-plugin/202605310547-codex-cc-runtime-plugin-feasibility-001`。
- Base：`dev @ 9cde3890f6fefb94425d09cc45b01366795bb757`。
- 当前任务：plugin packaging implementation。
- 已完成：baseline verification、platform fact-check、package boundary、runtime package shell、plugin-kit foundations、四平台 plugin source config、plugin root generation。
- 已完成：packer、release build、preflight/smoke、migration docs/commands、Codex/Claude/Cursor/Copilot host CLI validation evidence。
- 已完成：最终完整 verification rerun、release artifact checksum verification。
- 已完成：git commit/push、PR、GitHub release。
- 当前状态：release published；仅剩提交并推送 post-release planning metadata update。

## Plan Record: 2026-05-31 14:48:04 UTC+8

### Phase 9：PR review remediation
Status: complete
- 检查 PR #73 的 review comments，并逐条确认是否为真实回归。
- 用 TDD 先让定向测试对空 hook config / 缺失 Codex `manifest.hooks` 失败，再修复实现。
- 将 plugin hook 打包逻辑切换为“复用 source-of-truth hook 模板 + 重写脚本路径到 bundled hooks”，避免重新发明跨平台命令。
- 重新运行 plugin-kit 定向与整套测试，确认 review 修复没有破坏 release artifact smoke 路径。
