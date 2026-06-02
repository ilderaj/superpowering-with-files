# Task Plan: 子目录 Workspace 与全局 Planning Authority 对齐方案

## Goal
给出一套可 review 的方案，使用户可以在大型仓库的子目录打开 workspace，同时仍稳定读取并写入仓库根目录下唯一 authoritative 的 `planning/active/<task-id>/`。

## Current State
Status: waiting_integration
Archive Eligible: no
Close Reason:
Reconcile: done
- Companion plan: `docs/superpowers/plans/2026-06-02-subdir-workspace-planning-authority.md`
- Companion summary: 首版同时交付 in-repo leaf workspace 自动回指 authority root，以及显式 `.harness/authority-root.json` override 能力。
- Sync-back status: Companion implementation plan updated and synced back on 2026-06-02 15:22:00 UTC+8 after implementation, verification, and integration prep.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements & Discovery
- [x] 理解用户诉求与约束
- [x] 盘点现有 active tasks，避免混用旧上下文
- [x] 检查当前 planning/hook/root 解析实现
- **Status:** complete

### Phase 2: Option Analysis
- [x] 提炼问题模型与失败根因
- [x] 比较可行方案及其权衡
- [x] 形成推荐方向
- **Status:** complete

### Phase 3: Execution Plan Draft
- [x] 输出分阶段落地计划
- [x] 定义最小可行改动边界
- [x] 列出验证策略与回滚点
- **Status:** complete

### Phase 4: Review Handoff
- [x] 向用户提交分析结论
- [x] 明确未实施、待 review 决策点
- [x] 根据反馈决定是否进入实现
- **Status:** complete

### Phase 5: Implementation & Verification
- [x] 建立 shared authority-root resolver
- [x] 迁移 planning-critical CLI 到 authority-root
- [x] 迁移 hooks 与 runtime/MCP 到 authority-root
- [x] 补齐验证并收敛文档
- **Status:** complete

## Key Questions
1. 子目录 workspace 的“工作根”与 planning 的“authority root”是否应该显式解耦？
2. 这个 authority root 应该优先通过 git top-level 自动发现，还是通过显式指针文件/环境变量声明？
3. 需要兼容哪些入口面：CLI、hooks、MCP/runtime、IDE 子目录 workspace？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 本任务按 tracked analysis 处理，并建立独立 planning 目录 | 这是多阶段工作流与架构分析，不适合只靠临时上下文完成 |
| 先做需求分析与执行方案，不修改实现 | 用户明确要求先 review 方案 |
| 推荐采用“authority root + leaf workspace shim”的双层模型 | 既能保留子目录 workspace 的小上下文，又能保持 `planning/active` 的唯一 authoritative 位置 |
| root 解析策略应统一为“显式优先，自动发现兜底” | 单靠 `git top-level` 对 monorepo / nested repo / 特例目录不够稳定；单靠环境变量又太脆弱 |
| 首版同时包含自动发现与显式 override file | 用户已明确选择把两类能力一起纳入首版 |
| 显式 override 采用 `.harness/authority-root.json` | 复用现有本地 runtime state 目录，避免污染版本控制与上层 policy 文件 |
| `install` / `sync` 等命令在 leaf workspace 中默认仍作用到 authority root | 这样才能避免在末端路径误生成第二套投影树 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
|       | 1       |            |

## Notes
- 重点关注 `process.cwd()` 被直接视为 root 的路径。
- 重点比较自动发现与显式声明两类机制的协作成本。
- 当前实现已经覆盖 CLI、runtime/MCP resource、hook helper、checkpoint/adoption/upstream 命令，以及显式 `workspace-link` override 入口。
- 文档与验证已经收口完成；剩余仅是后续如需继续扩展更多非核心入口时的增量工作。
