# Findings & Decisions
<!-- 
  WHAT: Your knowledge base for the task. Stores everything you discover and decide.
  WHY: Context windows are limited. This file is your "external memory" - persistent and unlimited.
  WHEN: Update after ANY discovery, especially after 2 view/browser/search operations (2-Action Rule).
-->

## Requirements
- 整合三个迭代的所有 roadmap / backlog 相关任务
- 产出 1 份完整的 implementation plan
- 该 plan 必须是 companion plan
- plan 必须非常详细，包含执行步骤、设计细节、必要时的代码块/代码区块/命令
- 目标是让 `gpt-5.4-mini` 这类低智能密度模型也能成功执行
- 要有明确的验证、验收、proof 与 tasks
- 要 spawn sub agents 做只读验证，反复修到满足要求
- plan 必须符合 Harness / goal2plan / planning-with-files 的要求

## Research Findings
- `goal2plan` 的 outcome contract 并不要求执行实现；它要求产出或准备 1 个 native `/goal` prompt，并停在 reviewed implementation plan。
- `goal2plan` 明确要求：
  - `planning/active/<task-id>/` authoritative
  - companion plan 保存在 `docs/superpowers/plans/<date>-<task-id>.md`
  - 每个新或 materially revised plan 都要有 `1` 个只读 reviewer subagent
  - 最多 `3` 轮修订
- `brainstorming` 只有在 broad context 缺失时才是 `goal2plan` 的上游必要动作；当前用户给的目标、质量门槛、验收要求已经很完整，缺的不是需求而是整理和落地，因此目前判断不需要单独走 brainstorming 回合。
- `writing-plans` 要求 companion plan 必须：
  - 假设执行者对代码库几乎零上下文
  - 用 bite-sized steps
  - 给 exact file paths
  - 对 code-changing steps 给完整代码块
  - 给 exact commands + expected outputs
- 当前最直接的 source set 包括：
  - `docs/roadmap.md`
  - `docs/backlog.md`
  - `reports/audit/2026-06-04-comprehensive-project-audit-report.md`
  - 相关 active tasks / existing companion plans，尤其是 `goal2plan` lane、自身 roadmap/backlog 审计、upstream-update hardening、weekly retrospective、reconcile lane、test coverage 等
- Companion plan 的主要结构可以复用现有 `docs/superpowers/plans/*.md` 的 header / metadata / task-style，但本轮需要把粒度推得更细，以适配低智能模型执行。
- companion plan 初稿已落在 `docs/superpowers/plans/2026-06-28-roadmap-backlog-implementation-plan-20260628.md`，并包含：
  - 三波 release 的 program-level sequencing
  - backlog-to-release mapping
  - exact file map
  - task-by-task code/test/doc steps
  - release exit gates
  - conditional breadth-lane bundles
  - native `/goal` prompt
- companion plan 首轮自检已识别并去除了两类低智能执行障碍：
  - `<execution-task-id>` 这类执行期占位符
  - 临时 `assert.ok(true)` 风格的占位测试步骤
- reviewer loops 结论：
  - round 1 抓出 `REC-001` dry run 缺失、roadmap/backlog owner-approval gate 放松、`UPD-001` focused adapter/projection checks 缺失、single-authority/placeholder 问题、以及若干 breaking-API / fake-failing-test 风险
  - round 2 修复后，roadmap/backlog 一致性 reviewer 与 Harness 合规 reviewer 转为 pass；mini reviewer 仅剩一个 Task 2 test-helper 来源问题
  - round 3 修复 Task 2 helper 来源后，三条 reviewer 线全部 pass

## Record Format
<!--
  Use headings like `## Findings Record: YYYY-MM-DD HH:mm:ss UTC+8` when recording discoveries.
  This keeps multiple findings from the same date easy to order.
  Prefer `./scripts/harness record --file findings` when starting a new dated findings block.
-->

## Technical Decisions
<!-- 
  WHAT: Architecture and implementation choices you've made, with reasoning.
  WHY: You'll forget why you chose a technology or approach. This table preserves that knowledge.
  WHEN: Update whenever you make a significant technical choice.
  EXAMPLE:
    | Use JSON for storage | Simple, human-readable, built-in Python support |
    | argparse with subcommands | Clean CLI: python todo.py add "task" |
-->
<!-- Decisions made with rationale -->
| Decision | Rationale |
|----------|-----------|
| 当前 intake 已足够进入 companion plan drafting | 目标、范围、成功条件、质量门槛和 review 要求都已明确，缺的只是执行级编排 |
| 不单独走 brainstorming 回合 | 当前不是需求未定义，而是要把已有方向压成超细实现计划 |
| 为未来执行固定 program task id 为 `mainline-program-implementation-20260628` | 降低低智能模型在执行时对 planning sink 的选择歧义 |

## Issues Encountered
<!-- 
  WHAT: Problems you ran into and how you solved them.
  WHY: Similar to errors in task_plan.md, but focused on broader issues (not just code errors).
  WHEN: Document when you encounter blockers or unexpected challenges.
  EXAMPLE:
    | Empty file causes JSONDecodeError | Added explicit empty file check before json.load() |
-->
<!-- Errors and how they were resolved -->
| Issue | Resolution |
|-------|------------|
| 暂无 | - |

## Resources
<!-- 
  WHAT: URLs, file paths, API references, documentation links you've found useful.
  WHY: Easy reference for later. Don't lose important links in context.
  WHEN: Add as you discover useful resources.
  EXAMPLE:
    - Python argparse docs: https://docs.python.org/3/library/argparse.html
    - Project structure: src/main.py, src/utils.py
-->
<!-- URLs, file paths, API references -->
- `/Users/jared/SuperpoweringWithFiles/docs/roadmap.md`
- `/Users/jared/SuperpoweringWithFiles/docs/backlog.md`
- `/Users/jared/SuperpoweringWithFiles/reports/audit/2026-06-04-comprehensive-project-audit-report.md`
- `/Users/jared/SuperpoweringWithFiles/.agents/skills/goal2plan/SKILL.md`
- `/Users/jared/.agents/skills/writing-plans/SKILL.md`
- `/Users/jared/.agents/skills/goal-writer/SKILL.md`

## Visual/Browser Findings
<!-- 
  WHAT: Information you learned from viewing images, PDFs, or browser results.
  WHY: CRITICAL - Visual/multimodal content doesn't persist in context. Must be captured as text.
  WHEN: IMMEDIATELY after viewing images or browser results. Don't wait!
  EXAMPLE:
    - Screenshot shows login form has email and password fields
    - Browser shows API returns JSON with "status" and "data" keys
-->
<!-- CRITICAL: Update after every 2 view/browser operations -->
<!-- Multimodal content must be captured as text immediately -->
-

---
<!-- 
  REMINDER: The 2-Action Rule
  After every 2 view/browser/search operations, you MUST update this file.
  This prevents visual information from being lost when context resets.
-->
*Update this file after every 2 view/browser/search operations*
*This prevents visual information from being lost*

## Task Metadata
- Task ID: roadmap-backlog-implementation-plan-20260628
- Planning Directory: /Users/jared/SuperpoweringWithFiles/planning/active/roadmap-backlog-implementation-plan-20260628

## 2026-09-22 12:18:05 UTC+8 — phase audit archival
Already-closed lifecycle retained; historical scope was delivered or explicitly superseded per task_plan Close Reason. Current user authorizes cleanup. Original evidence preserved; no new implementation/production claim. Backup: .harness/backups/repo-phase-20260922/planning-before.tar.gz. Audit authority: repo-phase-audit-20260922.
