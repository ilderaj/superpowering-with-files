# Task Plan: Superpowers Plan Artifact Model

## Goal
实现 Harness 的计划产物模型调整：保留 `planning/active/<task-id>/` 作为唯一 authoritative task memory，同时让 deep-reasoning task 可以产出独立的 Superpowers companion plan，并确保所有 IDE projection、health/doctor 与测试都适配这一范式。

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Current Phase
Phase 5

## Phases

### Phase 1: 隔离执行环境准备
- [x] 选择仓库内 `.worktrees/` 作为 worktree 目录
- [x] 将 `.worktrees/` 加入 `.gitignore`
- [x] 以 `dev` 为显式基点创建隔离 worktree 与实现分支
- [x] 记录 baseline 测试结果与已知基线失败
- **Status:** complete

### Phase 2: 任务 1 - Core Policy 与文档改模
- [x] 更新 core policy，定义 authoritative planning 与 companion plan 的关系
- [x] 更新 README 与 maintenance 文档，说明 deep-reasoning companion artifact 的边界
- [x] 更新 planning 文件记录执行进度与决策
- **Status:** complete

### Phase 3: 任务 2 - Projection Patch 与 Health 语义调整
- [x] 调整 `writing-plans` patch，改为 companion-plan 语义
- [x] 调整 plan location inspection 与 health warning 逻辑
- [x] 确保 orphan/non-referenced companion plan 仍会被警告
- **Status:** complete

### Phase 4: 任务 3 - 测试与跨 IDE 适配验证
- [x] 更新 adapters/installer tests
- [x] 验证所有支持的 IDE 渲染入口都表达了新范式
- [x] 跑 focused tests 与 repo verify，并修复失败
- **Status:** complete

### Phase 5: 收尾与交付
- [x] 更新 planning 文件中的最终结论与验证结果
- [x] 准备交付说明，明确各验证层的 supported targets 覆盖状态
- [x] 在 review 完成后执行最终提交、推送、PR 与本地 `dev` 合并流程
- **Status:** complete

## Key Questions
1. 如何引入独立 companion plan，同时不破坏 `planning/active/<task-id>/` 的 authoritative ownership？
2. 如何让 health/doctor 区分“合法 companion plan”与“orphan historical plan”？
3. 四个 supported targets 在 rendered entry 与 skill projection 层是否都同步适配了这一新范式，以及哪些层是 target-specific / adapter-agnostic？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 继续使用 `planning/active/<task-id>/` 作为唯一 authoritative task memory | hooks、lifecycle、session recovery、archive 都建立在这套结构上 |
| 将独立 `docs/superpowers/plans/**` 限定为 deep-reasoning companion artifact | 满足可回溯性需求，同时避免重建第二套 durable planning system |
| worktree 目录使用仓库内 `.worktrees/` | 用户明确要求仓库内 worktree；已补 `.gitignore` 保护 |
| worktree base 使用本地 `dev` | `worktree-preflight` 明确推荐保留当前非 trunk 开发上下文 |
| baseline `npm test` 失败不阻断本任务 | 失败来自 vendored upstream superpowers test 缺失 `ws`，是已知基线问题，不是本次改动引入 |
| companion plan 只允许 Deep-reasoning task 创建，并且必须回写路径、摘要、sync-back 状态 | 这样 companion artifact 保持为附属物，不会变成第二套 task memory |
| `inspectPlanLocations()` 按文件级别判定 `docs/superpowers/plans/*.md` | 只有逐个 companion plan 才能区分“已被 active task 引用”与 orphan |
| health warning 只消费 `severity: warning` 的 location 结果 | 这样合法 companion artifact 会保留在 inspection 输出里，但不会污染 health warnings |
| companion-plan 引用扫描只看每个 task 目录下的 `task_plan.md`、`findings.md`、`progress.md` | companion-plan 的合法性应由 canonical planning files 决定，而不是任意 markdown/free-text |
| canonical planning file 不可读时返回 inspection problem，而不是继续判 orphan | I/O failure 必须显式暴露，否则 health 会把真实读取问题伪装成 orphan companion plan |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `fd` 不存在 | 1 | 使用 `find` / `rg` 替代 |
| `npm test` 缺少 `ws` 模块 | 1 | 记录为仓库既有基线问题；后续以 focused tests + `npm run verify` 为主 |

## Task Records
- Task 1 completed: core policy and user/maintenance docs define the three-layer model and companion-plan boundary.
- Durable conclusion: `planning/active/<task-id>/` stays authoritative; `docs/superpowers/plans/**` is a secondary companion artifact path limited to Deep-reasoning tasks.
- Workspace entry `AGENTS.md` is included in this fix because it is the Codex-consumed entry file and must stay aligned with source policy.
- This precision fix focused only on the `AGENTS.md` companion-plan boundary and the maintenance verification wording.
- This structural sync replaces the `AGENTS.md` companion-plan block with the same `Companion Plan Model` structure used by source policy.
- Review/session history lives in `progress.md`; this file keeps only the durable plan and conclusions.
- Task 2 completed: projected `writing-plans` now describes companion-plan semantics instead of hard redirecting away from `docs/superpowers/plans/**`.
- Task 2 completed: plan-location inspection now distinguishes referenced companion plans from orphan companion plans by scanning active task planning references.
- Task 2 completed: health warnings now suppress referenced companion plans and keep warning only for orphan companion plans, root-level planning files, and `docs/plans/**`.
- Task 2 code-quality fix completed: companion-plan reference scanning is now limited to canonical task planning files, with a narrower path-match seam.
- Task 2 code-quality fix completed: unreadable canonical planning paths now surface as `problem` inspection results, and companion plans become `reference-unknown` instead of false orphan warnings.
- Task 3 completed: `tests/adapters/templates.test.mjs` now asserts companion-plan semantics for all supported targets: `codex`, `copilot`, `cursor`, `claude-code`.
- Task 3 completed: `tests/adapters/skill-projection.test.mjs` now asserts that the `writing-plans` patched projection exists for all four supported targets, while the `planning-with-files` patch remains Copilot-only by design.
- Task 3 completed: `tests/adapters/sync-skills.test.mjs` now proves the projected `writing-plans` content on synced workspace output keeps `planning/active/<task-id>/` authoritative while allowing deep-reasoning companion plans as secondary artifacts.
- Task 3 completed: `tests/installer/health.test.mjs` now proves the four required health behaviors: referenced companion plan = no warning, orphan companion plan = warning, unreadable canonical planning path = problem, root-level/doc plans = warning.
- Task 3 completed: focused adapter/health tests and `npm run verify` both passed, providing a layered evidence chain: four-target render coverage, four-target writing-plans projection coverage, Copilot-specific planning patch coverage, and adapter-agnostic installer health coverage.
