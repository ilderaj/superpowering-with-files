# Task Plan: GitHub issues audit and remediation

## Goal
审计 `ilderaj/superpowering-with-files` 当前 open GitHub issues，优先定位并修复高优先级/高严重度问题，完成测试验收与代码 review；若执行过程中发现新的高优先级或高严重度问题，则提交到 GitHub issues 并继续闭环，直到高优先级/高严重度 issue 清零，再完成 commit 与 push。

## Current State
Status: active
Archive Eligible: no
Close Reason:
Reconcile: open

## Routing Decision
- Selected Route: tracked-lean
- Route Reason: 这是一次跨 GitHub issue 审计、代码修复、验证、review 与远端写操作的多阶段工作，需要 task-scoped durable trail，但当前问题空间已经足够清晰，暂不升级到 deep-reasoning。
- Promotion Trigger: 如果某条 issue 的根因横跨投影链、生成链、打包链与运行时行为，且两轮最小验证后仍无法收敛，再升级。
- Route Evidence Surface: planning files + GitHub issue metadata + code/tests + local verification + final review notes

## Current Phase
Phase 4

## Phases

### Phase 1: Audit and scope freeze
- [x] Inspect current open GitHub issues and identify high-priority/high-severity candidates
- [x] Map each candidate to concrete code surfaces and existing task context
- [x] Record initial findings and remediation order
- **Status:** complete

### Phase 2: Remediate confirmed P2 issues
- [x] Fix `#100` workflow permission regression
- [x] Fix `#101` projected Codex permission hook active-plan lookup regression
- [x] Fix `#97` goal-writer validation command parsing regression
- [x] Keep diffs minimal and scoped to confirmed issue surfaces
- **Status:** complete

### Phase 3: Verification and regression audit
- [x] Run focused tests for each fixed surface
- [x] Run targeted integration/regression checks for touched projection/sync surfaces
- [x] Re-audit open issues and local code for any newly exposed high-priority/high-severity problems
- **Status:** complete

### Phase 4: Review and closeout
- [x] Perform code review on the landed changes
- [x] File new GitHub issues if new material high-priority/high-severity defects are discovered
- [ ] Update planning evidence, then commit and push once the high-priority set is clear
- **Status:** in_progress

## Execution Contract

### Unit: unit-01
- Kind: audit-and-remediation
- Status: in_progress
- Scope:
  - Do: triage the current open P2 issues, patch the smallest confirmed code surfaces, validate them, and perform a review-first closeout
  - Not do: absorb unrelated backlog cleanup, non-P2 polish, or speculative refactors outside the confirmed issue set
- Owner Mode: inline
- Allowed Ops:
  - Files: `.github/workflows/upstream-refresh.yml`, projected/canonical planning-with-files hook surfaces, goal-writer evaluator/tests, task-scoped planning files
  - Commands: targeted `gh issue`, `rg`, `sed`, focused test commands, small verification commands, `git` inspection, final commit/push
  - External effects: allow GitHub issue creation only if a newly discovered issue is material and high priority/high severity; allow final commit and push after verification
- Dependencies:
  - GitHub issue truth for `#100`, `#101`, `#97`
  - Current repo state and projected skill copies
- Verification Plan:
  - Issue-specific focused tests plus one focused regression pass across touched projection/workflow surfaces
  - Final code review note with findings-first structure
- Return Artifacts:
  - minimal remediation patch
  - updated planning records
  - verification evidence
  - review verdict
- Integration Target:
  - sync all durable conclusions back into `planning/active/github-issues-audit-remediation-20260627/`
- Exit Criteria:
  - no confirmed high-priority/high-severity open issue remains unaddressed in this round
  - touched tests pass
  - final review finds no blocking issue in the landed patch

## Verification Contract

### Mode: execution/review
- Proof Target: 当前 open P2 issues 的已确认代码根因是否被最小修复，并且没有在投影链、workflow 权限或 goal evaluator 上留下同等级回归
- Primary Proof: 逐 issue 的 focused verification（hook tests / evaluator tests / workflow-facing contract checks）
- Backstop Proof: 最终 diff review + 再次审计 GitHub open issues 列表
- Escalation Trigger: 任一 P2 issue 无法在当前代码中复现到具体 surface、focused proof 失败、或修复引入新的同等级回归
- Evidence Sink: `planning/active/github-issues-audit-remediation-20260627/progress.md` 与 `findings.md`
- Reconcile Rule: 每完成一条 issue 的修复或复验，都要把根因、验证结果、是否需要新 issue、以及剩余风险回写 planning
- Unacceptable Substitute: 只看 issue 描述不读代码、只跑宽泛 verify 不做 issue-specific proof、或只做实现不做最终 review

## Risk Assessment

| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |
|---|---|---|---|
| 投影副本修了但 canonical/sync 没补齐 | 只修改 `.agents` 或只修改 upstream 其一 | 同类问题在下一次 projection/build 再次出现 | 以 canonical + projected test + sync/fixture evidence 一起核对 |
| workflow 权限修复缺少对应验证 | 只改 YAML 不验证权限相关调用面 | upstream refresh 仍可能在远端 403 | 至少验证 workflow file permissions 与调用面一致，并记录 residual live-risk |
| goal-writer evaluator 放宽过头 | 为修 plain-text command 误判而误接受非命令文本 | evaluator 失去 proof gate 作用 | 用 focused tests 覆盖 plain-text pass 与 noise 仍 fail 的边界 |

## Key Questions
1. `#101` 是单点投影文件漂移，还是 sync/projection 机制遗漏了隐藏 hook 文件？
2. `#100` 是否只需最小补 `actions: read`，还是还有其他 workflow permission 漏洞？
3. `#97` 应该如何放宽 validation proof 检测，才能接受 plain-text command 同时不接受纯叙述？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 先按 `#101 -> #100 -> #97` 的顺序定位和修复 | `#101` 已确认存在 canonical/projected drift，最容易演变成“修一处坏一处”；先收紧这条链能减少后续误判 |
| 本轮先按 tracked-lean 执行，不立即启用 superpowers | 当前三个 P2 都已有明确 issue 描述和较窄代码面，先用最小修复与 focused proof 收敛更合适 |
| `#101` 不只补当前 `.agents` 漂移，还要加 sync-level assertion | 单纯改 tracked projection 只能修当前仓库状态，不能防止后续 sync 再次漏掉 hidden hook surfaces |
| `#97` 的 validation proof 放宽到 “plain-text command 或 plain-text evidence path” | issue 的真实问题是把 Markdown 反引号当成硬约束；修复应该回到 proof 内容本身，而不是只接受某种排版形式 |

## Plan Record: 2026-06-27 08:14:19 UTC+8
- 新建 task-scoped planning，用于承接 GitHub issues 审计、修复、验证、review 与最终提交。
- 当前 open issues 共 5 条，其中 P2 为 `#101`、`#100`、`#97`；本轮先聚焦这 3 条。

## Plan Record: 2026-06-27 08:39:12 UTC+8
- `#101` 已完成 projected `.agents` Codex permission hook 修复：
  - 恢复 `resolve-active-plan-dir.sh`
  - 恢复 `permission_request.py` 对 `planning/active/<task-id>/task_plan.md` 的解析
  - 恢复 projected Python test 的 active task dir coverage
  - 在 `tests/adapters/sync-skills.test.mjs` 增加 sync-level assertion，防止 hidden hook drift 再次漏检
- `#100` 已完成最小 workflow 修复：在 `upstream-refresh.yml` 顶层 `permissions` 中补 `actions: read`，并更新 workflow contract test。
- `#97` 已完成 evaluator 修复：
  - `hasConcreteValidationProof` 现在基于 proof 内容而不是 Markdown 反引号
  - 支持 plain-text command、plain-text path，以及 bare filename evidence surface
  - 新增 focused tests 覆盖 pass/fail 边界
- Focused verification 全绿；diff-based self review 未发现新的 blocking issue。

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Shell quoting caused an unintended command expansion while searching for hook reminder text | 1 | Switched to single-quoted patterns and narrower file reads; record only, no code impact |

## Notes
- 每完成一条 issue 的定位、修复、验证或 review，都回写 planning。
- 如果发现新的高优先级/高严重度问题，先记录证据和优先级，再决定是否立刻开 issue 并插队处理。
