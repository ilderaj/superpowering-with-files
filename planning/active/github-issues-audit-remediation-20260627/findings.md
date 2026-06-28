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
