# Task Plan: Git Execution And Authorization Analysis

## Goal
分析并落地 Harness 的 controlled `checkpoint-push` 流程：在非 trunk、优先 worktree 的分支上下文里执行 fresh verification、生成 deterministic review evidence、完成 commit/push，并在验证后 merge 回本地 `dev`。

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Current Phase
Phase 8

## Phases

### Phase 1: 任务建档与入口定位
- [x] 读取相关技能与仓库规划约束
- [x] 扫描现有 active tasks，确认本次需要独立 task id
- [x] 初步定位 git safety hook、worktree safety、finishing/worktree skill 相关入口
- **Status:** complete

### Phase 2: 控制面梳理
- [x] 读取决定 `commit/push/pr` 授权方式的源码与文档
- [x] 读取决定 `branch/worktree` 基线和隔离方式的源码与文档
- [x] 区分“硬阻断 / ask / 建议流程 / 非强制说明”四类机制
- **Status:** complete

### Phase 3: 现状分析与优化评估
- [x] 归纳当前能否支持 agent 自主 verify + commit + push
- [x] 判断阻塞点来自平台能力、Harness policy 还是仓库当前实现
- [x] 评估可行优化方向与风险
- **Status:** complete

### Phase 4: 结论交付
- [x] 输出现状说明、关键风险和推荐改进方向
- [x] 更新 planning 文件并收口
- **Status:** complete

### Phase 5: Implementation Plan Drafting
- [x] 按“无 PR 自动化”的边界收敛实施范围
- [x] 产出 companion implementation plan 供执行
- [x] 把 companion plan 路径与摘要回写到 task-scoped planning 文件
- **Status:** complete

### Phase 6: Contract-First Execution
- [x] 将 companion plan 中的 Task 0-4 转成可执行 todo 并按 TDD 起步
- [x] 先补 CLI/预检/主流程的失败合同测试并确认先红后绿
- [x] 落地 `checkpoint-push` library 与 command wiring
- [x] 按多轮 code review 补齐回归：exit code、artifact completeness、origin-only push、dry-run/index preservation、intent-to-add、failure evidence
- **Status:** complete

### Phase 7: Docs, Policy, And Skill Sync
- [x] 同步 README、maintenance、safety、compatibility 与 safe-bypass-flow 文档
- [x] 确保文档边界仍明确排除 PR / merge 自动化
- **Status:** complete

### Phase 8: Verification And Integration
- [x] 运行 focused tests、repo verify、doctor check-only、worktree-preflight --safety
- [ ] 在 disposable worktree 里做 dry-run smoke test，并视权限决定是否 live push
- [ ] 将实现分支 merge 回本地 `dev`
- **Status:** in_progress

### Phase 9: Commit, Push, And Closeout
- [ ] 整理 planning sync-back、commit history 与 review 结论
- [ ] push 实现分支与更新后的 `dev`
- [ ] 关闭当前 task 或切到 waiting_review / waiting_integration
- **Status:** pending

## Risk Assessment

| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |
|---|---|---|---|
| merge/push 集成风险 | 将 `checkpoint-push` 合并回本地 `dev` 并推送远端时，若 contract 有漏项会把错误行为带到默认开发分支 | `copilot/using-subagents-for-plans`、本地 `dev`、远端 `origin/dev` | 已先在功能分支完成 contract/regression tests、`npm run verify`、`./scripts/harness doctor --check-only` 与 `./scripts/harness worktree-preflight --safety`；接下来先做 dry-run smoke，再在主 checkout 用 `git merge --ff-only` 合并；若 smoke 或 merge 后验证失败，保留当前 feature branch 作为回退点，不推送 `dev` |

## Key Questions
1. 当前仓库有哪些代码路径会直接拦截或降级 `git push`、`git commit`、PR 创建？
2. worktree / branch 的推荐路径是说明性文档，还是由 hook / command 强制执行？
3. “需要 human approve” 现在是平台限制、hook ask gate，还是仅存在于 skill / docs 的流程建议？
4. 如果目标是更频繁地把恢复点推到远端，最小改动应该落在哪一层？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 用户确认直接执行 companion implementation plan | 当前已有详细 plan，设计边界明确，不再单独新建实现 task |
| merge 目标固定为本地 `dev` | 用户明确要求在验证后 merge back to local dev |
| v1 只做 controlled checkpoint push，不做 PR/merge 自动化 | companion plan 和用户范围都已明确排除这些能力 |
| review-driven hardening 进入实现范围 | 独立 code review 发现的真实合同缺口都直接补成回归测试与实现修复，避免把问题带到 `dev` |

## Notes
- 当前工作区是隔离 worktree 分支 `copilot/using-subagents-for-plans`，起始基线与本地 `dev` 同 SHA：`a20059fd2a95b2199923b5cc2a1f8cef918c0b02`。
- 当前已完成 feature 实现与文档同步，待做 disposable smoke、merge back to local `dev`、commit/push 收口。

## Companion Plan Reference

- Companion plan: `docs/superpowers/plans/2026-04-25-checkpoint-push-automation-plan.md`
- Companion plan role: 保存不含 PR 自动化的详细 implementation tasks、file map、验证命令与 rollout gates。
- Sync-back status: `2026-04-25` 已同步到执行态，等待最终 merge / push 收口。
