# 任务计划：Cross-IDE 单一同源收敛审计

## Goal

基于 Codex、GitHub Copilot、Cursor、Claude Code 的官方文档与仓库当前实现，判断 skills、entry files、hooks 及其他 projection 文件是否可以收敛到尽量少的单一同源路径；明确哪些必须保留平台原生路径，哪些可以共享同源，再输出供 review 的基础分析报告与后续执行计划。

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason: Implementation merged into local `dev`, pushed to `origin/dev`, and opened for review as PR #22.

## Finishing Criteria

- 核对仓库当前 entry/skills/hooks projection 现状。
- 查阅相关 IDE 官方文档并记录可引用事实。
- 明确“官方原生路径”“兼容发现路径”“Harness 自定义 projection”三类边界。
- 判断哪些内容可以单一同源，哪些不能强行收敛。
- 形成可 review 的分析报告与执行计划，不直接修改实现。

## Phases

### Phase 1: 现状恢复与相关历史任务复核
- [x] 读取仓库 AGENTS policy
- [x] 读取 `using-superpowers`、`planning-with-files`
- [x] 扫描相关 active tasks
- [x] 提取既有 cross-ide projection 结论
- **Status:** complete

### Phase 2: 当前实现审计
- [x] 核对 metadata、adapter manifest、文档与测试中的当前 projection 路径
- [x] 归纳当前仓库已经做出的收敛与未收敛点
- **Status:** complete

### Phase 3: 官方文档对照
- [x] 查阅 Codex 官方文档
- [x] 查阅 GitHub Copilot 官方文档
- [x] 查阅 Cursor 官方文档
- [x] 查阅 Claude Code 官方文档
- **Status:** complete

### Phase 4: 收敛原则与执行计划
- [x] 形成单一同源可行性判断
- [x] 输出治理原则、风险与分阶段执行计划
- **Status:** complete

### Phase 5: 集成、验证与提审
- [x] 将 feature worktree 合并回本地 `dev`
- [x] 在合并后的 `dev` 上重跑全量验证
- [x] 清理 feature worktree 与 branch
- [x] 推送 `origin/dev`
- [x] 创建 `dev -> main` PR
- **Status:** complete

## Key Questions

1. Codex 与 Copilot 的 skills 路径是否真的可以统一为 `.agents/skills` 与 `~/.agents/skills`？
2. 如果某个平台支持兼容扫描多个 skill roots，是否仍值得继续保留平台专属投影？
3. 除 skills 外，entry files、hooks、settings 等 projection 是否也存在可共享的单一同源？
4. 应该把“单一同源”定义为唯一存储源，还是唯一投影生成源？
5. 哪些重复文件是官方强制的，哪些重复只是 Harness 当前实现带来的治理成本？

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| 本轮只做分析报告与计划，不直接实现 | 用户明确要求先 review |
| 新建独立 task-scoped planning 目录 | 避免覆盖旧的 projection 审计任务，同时保留可追溯记录 |
| 以官方原始文档为准，不以旧 planning 结论直接下判断 | 用户明确要求“查询各 IDE 的原始文档” |
| “单一同源”优先解释为单一 authoring source，而不是单一 runtime path | 多个 IDE 的运行时发现路径并不一致，强行统一物理路径会违背官方约定 |
| 本轮 implementation plan 作为 companion artifact 保存到 `docs/superpowers/plans/2026-04-20-cross-ide-single-source-consolidation.md` | 用户明确要求按 `writing-plans` 产出可执行实现计划 |

## Companion Plan

- Path: `docs/superpowers/plans/2026-04-20-cross-ide-single-source-consolidation.md`
- Summary: 聚焦 `Codex + Copilot` shared skill roots、Copilot `planning-with-files` shared-root patch、shared projection coalescing、文档同步与完整回归验证。
- Sync-back status: task-scoped planning files已记录结论与 plan path；详细执行清单保存在 companion plan。
