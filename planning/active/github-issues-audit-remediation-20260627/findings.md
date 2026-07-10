# Findings

## Findings Record: 2026-06-27 08:14:19 UTC+8

- GitHub 当前 open issues 共 5 条；其中带 `P2` badge 的高优先级问题有 3 条：
  - `#101` Restore active-plan lookup for permission reminders
  - `#100` Grant actions read before querying workflow runs
  - `#97` Accept plain-text validation commands
- `#101` 的当前代码证据已经确认：
  - canonical upstream copy [harness/upstream/planning-with-files/.codex/hooks/permission_request.py](/Users/jared/SuperpoweringWithFiles/harness/upstream/planning-with-files/.codex/hooks/permission_request.py:1) 会通过 `resolve-active-plan-dir.sh` 解析 `planning/active/<task-id>/task_plan.md`
  - projected copy [ .agents/skills/planning-with-files/.codex/hooks/permission_request.py ](/Users/jared/SuperpoweringWithFiles/.agents/skills/planning-with-files/.codex/hooks/permission_request.py:1) 仍然只检查仓库根 `task_plan.md`
  - projected tests [ .agents/skills/planning-with-files/tests/test_codex_hooks.py ](/Users/jared/SuperpoweringWithFiles/.agents/skills/planning-with-files/tests/test_codex_hooks.py:1) 缺少 upstream 已有的 active task dir coverage
  - `.agents` projected copy 中也缺少 `resolve-active-plan-dir.sh`
- `#100` 的当前代码证据已经确认：
  - [`.github/workflows/upstream-refresh.yml`](/Users/jared/SuperpoweringWithFiles/.github/workflows/upstream-refresh.yml:1) 只声明了 `contents: write` 与 `pull-requests: write`
  - [scripts/ci/lib/upstream-base-health.mjs](/Users/jared/SuperpoweringWithFiles/scripts/ci/lib/upstream-base-health.mjs:95) 会调用 `gh api repos/.../actions/runs`
  - 这与 issue 描述一致，说明 workflow token 缺少 `actions: read` 会导致 base-health 在真正 refresh 前就失败
- `#97` 的当前代码证据已经确认：
  - [harness/core/skills/goal-writer/lib/evaluate-goal-writer.mjs](/Users/jared/SuperpoweringWithFiles/harness/core/skills/goal-writer/lib/evaluate-goal-writer.mjs:67) 当前 `hasConcreteValidationProof` 只接受反引号包裹的命令或路径
  - issue 描述里的 plain-text command case 确实会被误判为没有 concrete validation proof
- 目前还没有证据表明 open issue 之外存在新的更高优先级 blocker；后续应在修复后再做一轮 focused re-audit。

## Findings Record: 2026-06-27 08:39:12 UTC+8

- `#101` 的真实问题不是 canonical source 缺陷，而是 **tracked projected copy drift**：
  - upstream canonical copy 已经正确
  - 仓库内 `.agents` tracked materialization 落后
  - 原有 repo test 没有显式断言 hidden `.codex/hooks/**` 与 projected Python tests，所以 drift 可以静默存在
- `#100` 的最小修复面只有 workflow permission；当前 repo 已有 `tests/automation/upstream-refresh-workflow.test.mjs` 能覆盖这个 contract，因此不需要引入额外测试框架。
- `#97` 的 issue 真正要求是“以 proof 语义为准，而不是 Markdown 格式为准”；因此修复后必须同时证明：
  - plain-text command 被接受
  - 纯叙述仍被拒绝
  - bare filename 这类 evidence surface 不会因为去掉反引号而退化
- 对本轮 landed diff 的 self review 没有发现新的 material issue。
- 当前 GitHub 仓库默认分支是 `main`，而当前工作分支是 `dev`；因此这三个 P2 不会因为一次 `dev` push 自动从 GitHub issue tracker 消失，若要让高优先级 issue 列表归零，需要在 push 后显式关闭这些 issues 或等待后续 merge 到默认分支。

## Open Questions

1. `.agents` 投影缺失是单个文件漏同步，还是 hidden `.codex/hooks/**` 这一类文件在 projection/sync 里整体有缺口？
2. goal-writer evaluator 需要支持到什么程度的 plain-text command 才不会把普通叙述也放行？

## Findings Record: 2026-07-10 01:18:49 UTC+8

### Current P2 Recheck And #105 Result

- Live GitHub truth has moved since this task was created:
  - original scoped P2 issues `#97`, `#100`, and `#101` are no longer open;
  - current open P2 work is a new set and should not be treated as already cleared.
- `#105` is directly connected to this task's `#97` goal-writer validation boundary:
  - the issue is real;
  - a validation sentence containing `make sure` / `go over` previously passed because command words were detected anywhere in the prose;
  - this weakens the intended "prose without a concrete command or evidence surface must fail" gate.
- The isolated worktree fix keeps the conservative boundary:
  - command detection now requires a command-like line/list item or explicit command prefix;
  - `go` requires a known Go subcommand;
  - `make sure` / `make certain` prose is not accepted as a make command;
  - plain-text `node --test ...` and bare filename evidence still pass.
- Worktree commit `b6fe825 fix: tighten goal validation command detection` is ready for Chief integration review, but not merged to `dev`.
- Other current P2 issues should be handled by their mapped owners or a fresh issue-audit slice rather than silently closing this old lane.

## Findings Record: 2026-07-10 09:56:38 UTC+8

### #107 Complete Trio Evidence Gate

- The issue was confirmed: the evaluator previously summed valid refs across all three arrays, so one valid `progress.md` ref could support both planning safety claims.
- Accepted fix requires at least one valid ref in each category:
  - `progressRefs` -> rollout `progress.md`;
  - `taskPlanRefs` -> rollout `task_plan.md`;
  - `findingsRefs` -> rollout `findings.md`.
- Existing complete-trio real observation remains accepted.
- Worker and Chief proof passed; independent review found no actionable issue.
- This slice is not integrated and does not close the broader issue-audit task because current live P2 work still includes other owners/surfaces.

## Findings Record: 2026-07-10 10:06:52 UTC+8

### #103 Copilot Leaf Workspace Policy

- The issue was confirmed: `always-on-core` already included the canonical Leaf Workspace Root Policy, but Copilot maps it to `copilot-always-on-thin`, which omitted the section.
- Minimal accepted fix adds only `Leaf Workspace Root Policy` to the Copilot thin profile.
- Regression proof compares the rendered Copilot section to canonical `base.md` content with only repeated blank-line normalization and checks the authority-root override vocabulary.
- Existing thin exclusions remain covered by the surrounding suite.
- Implementation is accepted but not integrated; #103 remains open until an explicit integration/issue-closure gate.

## Findings Record: 2026-07-10 10:14:21 UTC+8

### Current P2 Set Is Implementation-Complete But Not Integrated

- The live P2 queue contains no issue without a reviewed local implementation commit.
- This does not prove tracker closure or release readiness:
  - seven issue commits are isolated from local `dev`;
  - the ChiefOps overlay commit is only on local `dev`, which is ahead of `origin/dev`;
  - all eight GitHub issues remain open.
- Conservative disposition is therefore `waiting_integration`, not `closed` or `archived`.
- P3 `#80` and pilot-doc issue `#55` remain outside this task's high-priority completion boundary and must not be silently absorbed into the P2 closeout claim.
