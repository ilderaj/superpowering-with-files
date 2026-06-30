# Task Plan: 整合三个迭代的 roadmap/backlog 为可由低智能模型执行的 companion implementation plan
<!-- 
  WHAT: This is your roadmap for the entire task. Think of it as your "working memory on disk."
  WHY: After 50+ tool calls, your original goals can get forgotten. This file keeps them fresh.
  WHEN: Create this FIRST, before starting any work. Update after each phase completes.
-->

## Goal
基于已批准的 companion implementation plan，执行接下来三个迭代的主线任务，完成 `1.0.11`、`1.0.12`、`1.0.13` 的 kernel-first program delivery，并持续把实现、验证、reconcile 和 release 证据同步回当前 task-scoped planning root。

## Current State
<!--
  WHAT: Explicit lifecycle state for this task.
  WHY: Completed-looking phases are not enough to archive safely. Archive only after
       the task is intentionally closed and marked eligible.
  STATUS VALUES:
  - active: Work is ongoing
  - blocked: Work cannot continue without external input
  - waiting_review: Implementation is done but needs review
  - waiting_execution: Plan is ready but execution has not started
  - waiting_integration: Work is done but not integrated
  - closed: Work is complete and may be archived if Archive Eligible is yes
-->
Status: active
Archive Eligible: no
Close Reason:
Reconcile: open

## Routing Decision
- Selected Route: deep-rich
- Route Reason: 用户明确要求 companion plan、超细执行步骤、低智能模型可执行性、以及 reviewer subagents 多轮验证；这已经是典型 deep-reasoning 规划任务。
- Promotion Trigger: n/a
- Route Evidence Surface: planning + companion plan + reviewer verdicts

## Current Phase
<!-- 
  WHAT: Which phase you're currently working on (e.g., "Phase 1", "Phase 3").
  WHY: Quick reference for where you are in the task. Update this as you progress.
-->
Phase 11

## Phases
<!-- 
  WHAT: Break your task into 3-7 logical phases. Each phase should be completable.
  WHY: Breaking work into phases prevents overwhelm and makes progress visible.
  WHEN: Update status after completing each phase: pending → in_progress → complete
-->

### Phase 1: Restore Context And Intake Audit
- [ ] 恢复当前 roadmap/backlog 审计结论与相关 active tasks
- [ ] 按 `goal2plan` 做 intake sufficiency audit
- [ ] 判断是否仍缺 broad context，或已足够直接进入 companion plan drafting
- **Status:** complete

### Phase 2: Source Consolidation
- [ ] 整理三个 release goals、主线 backlog 项、以及仍需保留的 deferred lanes
- [ ] 读取与这些项直接相关的 active plans / companion plans / docs
- [ ] 提取需要进入 implementation plan 的文件面、任务面与 proof 面
- **Status:** complete

### Phase 3: Companion Plan Drafting
- [ ] 在 `docs/superpowers/plans/<date>-<task-id>.md` 起草 companion plan
- [ ] 用 writing-plans 风格写出详细任务、文件路径、代码块、验证与验收步骤
- [ ] 确保步骤足够细，适合 `gpt-5.4-mini` 级别执行
- **Status:** complete

### Phase 4: Reviewer Verification Loops
- [ ] 使用只读 reviewer subagents 分别检查一致性、可执行性、Harness 合规性
- [ ] 最多进行 3 轮修订/复审
- [ ] 记录 reviewer verdict、剩余风险、以及是否满足 low-intelligence execution bar
- **Status:** complete

### Phase 5: Delivery
- [ ] 回写 authoritative planning files
- [ ] 交付 companion plan 路径、摘要、review 结论与残余风险
- [ ] 如需要，附上 native `/goal` prompt 作为执行入口
- **Status:** complete

### Phase 6: Worktree Restore And Execution Re-entry
- [ ] 在隔离 worktree 中恢复 authoritative planning 与 companion plan
- [ ] 校验 companion plan 与当前分支代码面的关键接口没有显著漂移
- [ ] 进入 `1.0.11 / Task 1`
- **Status:** complete

### Phase 7: Release 1.0.11 Kernel Closure
- [ ] 完成 `KER-001` 与 `KER-002`、`GOV-001`
- [ ] 通过 `1.0.11` focused proof 与 release exit gate
- [ ] 回写 kernel closure 证据与 reconcile 状态
- **Status:** complete

### Phase 8: Release 1.0.12 Governance Productization
- [ ] 完成 `GOV-002`、`REC-001`、`REC-002`、`REC-003`
- [ ] 通过 acceptance / lifecycle / governance proof
- [ ] 回写 release 证据与 reconcile 状态
- **Status:** complete

### Phase 9: Release 1.0.13 Selective Breadth Reopen
- [ ] 完成 `UPD-001`
- [ ] 只选择并完成 1 条 outward-facing breadth lane
- [ ] 通过 `1.0.13` release exit gate
- **Status:** complete

### Phase 10: Final Verification And Closeout
- [ ] 跑全量 gate、final reconcile 与 branch-level review
- [ ] 确认全部 done criteria 均有当前状态证据
- [ ] 准备 finish/merge/closeout
- **Status:** complete

### Phase 11: Branch Closure And Mainline Sync
- [ ] 将 worktree 中已验证变更收束为可发布 commit 集
- [ ] 处理 `origin/main` 集成、PR、merge 与必要 conflict resolution
- [ ] 让 `origin/main`、`origin/dev`、本地 `main/dev` 对齐到用户要求的最新状态
- **Status:** in_progress

## Execution Contract
<!--
  WHAT: Define heavy-task execution units only when the task needs structured decomposition.
  WHY: This keeps execution intent in authoritative planning rather than scattering it across notes.
  WHEN: Fill this section for heavy tracked tasks; omit or leave as a stub for quick tasks.
-->

### Unit: unit-01
- Kind: planning
- Status: planned
- Scope:
  - Do: 产出一个 reviewed companion implementation plan，整合三个迭代的主线 backlog / roadmap 工作，并细化到低智能模型可执行
  - Not do: 不直接执行实现，不把 deferred expansion lanes 混进当前主线，不让 companion plan 取代 `planning/active/<task-id>/`
- Owner Mode: inline
- Allowed Ops:
  - Files: `docs/roadmap.md`, `docs/backlog.md`, `docs/workflows.md`, `docs/reconciliation.md`, `docs/maintenance.md`, `docs/install/**`, `docs/cloud-dev-harness.md`, `docs/superpowers/plans/**`, `planning/active/**`, `reports/audit/**`
  - Commands: targeted reads/searches, plan drafting, review-oriented diffs, evaluator or repo checks if needed
  - External effects: spawn read-only reviewer subagents only
- Dependencies:
  - 当前 roadmap/backlog 主线
  - 相关 active tasks / companion plans
  - `goal2plan`, `writing-plans`, `goal-writer` contract
- Verification Plan:
  - reviewer subagents 必须确认计划满足：前后一致、覆盖主线需求、Harness 合规、低智能模型可执行
- Return Artifacts:
  - companion plan
  - reviewer verdicts
  - sync-back notes
- Integration Target:
  - `planning/active/roadmap-backlog-implementation-plan-20260628/findings.md`
  - `planning/active/roadmap-backlog-implementation-plan-20260628/progress.md`
- Exit Criteria:
  - `docs/superpowers/plans/<date>-<task-id>.md` 中存在 1 份 reviewed plan，且 reviewer 不再指出阻塞级缺口

<!--
  Optional proof-design note:
  Add a top-level verification-contract section only when the task needs
  explicit proof planning. Quick tasks usually omit it. When you do add one,
  use a `Verification Contract` heading plus one or more `Mode` blocks, and
  fill only the relevant modes.

  Minimal field set per mode:
  - Proof Target
  - Primary Proof
  - Backstop Proof
  - Escalation Trigger
  - Evidence Sink
  - Reconcile Rule
  - Unacceptable Substitute
-->

## Verification Contract
### Mode: review
- Proof Target: companion plan 是否既符合 roadmap/backlog 目标，又足够细到低智能模型可以稳定执行
- Primary Proof: 只读 reviewer subagent 审核 companion plan 的完整性、一致性、可执行性与 Harness 合规性
- Backstop Proof: 本地主动复核 plan 对 roadmap/backlog/active planning 的映射，以及计划中的验证命令/验收步骤是否明确
- Escalation Trigger: 任一 reviewer 指出阻塞级缺口，或同一类缺口在两轮修订后仍存在
- Evidence Sink: `planning/active/roadmap-backlog-implementation-plan-20260628/progress.md` 与 companion plan reviewer section
- Reconcile Rule: 每轮 reviewer verdict 都必须回写 authoritative planning files，并更新 companion plan 的 review status
- Unacceptable Substitute: 只看文档标题就宣称计划完整，或只给高层大纲却没有文件面/代码面/验证面细节

## Key Questions
1. 哪些 backlog 项属于当前三个迭代的主线，哪些必须明确保持 deferred？
2. companion plan 需要细到什么粒度，才足够让 `gpt-5.4-mini` 级别模型稳定执行？
3. 哪些步骤必须给出具体代码块、命令、预期输出与失败回退，才能避免执行时再发散成重新设计？

## Decisions Made
<!-- 
  WHAT: Technical and design decisions you've made, with the reasoning behind them.
  WHY: You'll forget why you made choices. This table helps you remember and justify decisions.
  WHEN: Update whenever you make a significant choice (technology, approach, structure).
  EXAMPLE:
    | Use JSON for storage | Simple, human-readable, built-in Python support |
-->
| Decision | Rationale |
|----------|-----------|
| 新开独立 deep-reasoning task | companion plan + 多轮 reviewer 验证是独立 deliverable，不宜混在前一条审计 task 里 |
| 先做 intake audit，再决定是否需要额外 brainstorming | `goal2plan` 明确要求先判断信息缺口，而不是默认进入更重的探索流程 |
| companion plan 固定落点为 `docs/superpowers/plans/2026-06-28-roadmap-backlog-implementation-plan-20260628.md` | 满足 `goal2plan` / `writing-plans` 的 companion artifact 约束，并为 reviewer loops 提供稳定对象 |
| 用户要求在新 worktree 中直接执行 companion plan | 当前 round 已从 deep-reasoning plan authoring 切到 tracked execution，需要用同一 planning root 承接实现与验证状态 |
| `1.0.11` 先按 kernel closure 完整收口再推进 `1.0.12` | 先把 `sync` boundary、execution kernel、lightweight-default wording 和 release gate 压实，能显著降低后续 reconcile / governance productization 的噪音和返工 |
| `1.0.12` 采用“已有能力最小固化”而非重写 runtime | `active-summary` / lifecycle / archive surface 已具备大部分语义，本轮优先补 operator proof line、SOT wording、回归测试与 release evidence，避免为凑计划文件表而重写稳定逻辑 |
| `1.0.13` 保持 report-only backlog/roadmap discipline | 由于没有显式 owner approval，本轮只把 `ADOPT-001` 的选中结果和未选 lane disposition 写进 entry-gate doc 与 reconciliation evidence，不直接改 `docs/roadmap.md` / `docs/backlog.md` |
| `UPD-001` 采用 additive compatibility report | upstream refresh result 继续保留 `eligibleFiles`，并增量附带 `compatibilityReport`，避免破坏现有自动化读取面 |

## Companion Plan
- Companion plan path: `docs/superpowers/plans/2026-06-28-roadmap-backlog-implementation-plan-20260628.md`
- Companion summary: 三波 release 主线 + backlog disposition + 低智能模型可执行步骤 + proof gates + native `/goal` prompt；`1.0.11`、`1.0.12`、`1.0.13` 已交付并完成 full verification，本轮继续处理 worktree -> `origin/main` 的 PR/merge/sync 收尾
- Sync-back status: closure in progress; implementation was verified on 2026-06-29 and the current round is integrating the worktree branch into `origin/main` while re-syncing local/remote `main` and `dev`

## Record Format
<!--
  When adding dated task records, use headings like:
  ## Plan Record: YYYY-MM-DD HH:mm:ss UTC+8
  This keeps multiple task updates from the same date easy to order.
  Prefer `./scripts/harness record --file task_plan` when starting a new dated task-plan block.
-->

## Errors Encountered
<!-- 
  WHAT: Every error you encounter, what attempt number it was, and how you resolved it.
  WHY: Logging errors prevents repeating the same mistakes. This is critical for learning.
  WHEN: Add immediately when an error occurs, even if you fix it quickly.
  EXAMPLE:
    | FileNotFoundError | 1 | Check if file exists, create empty list if not |
    | JSONDecodeError | 2 | Handle empty file case explicitly |
-->
| Error | Attempt | Resolution |
|-------|---------|------------|
|       |         |            |

## Notes
<!-- 
  REMINDERS:
  - Update phase status as you progress: pending → in_progress → complete
  - Re-read this plan before major decisions (attention manipulation)
  - Log ALL errors - they help avoid repetition
  - Never repeat a failed action - mutate your approach instead
-->
- Update phase status as you progress: pending → in_progress → complete
- Re-read this plan before major decisions (attention manipulation)
- Log ALL errors - they help avoid repetition

## Task Metadata
- Task ID: roadmap-backlog-implementation-plan-20260628
- Planning Directory: /Users/jared/SuperpoweringWithFiles/planning/active/roadmap-backlog-implementation-plan-20260628
