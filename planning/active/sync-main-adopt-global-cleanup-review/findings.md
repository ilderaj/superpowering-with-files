# Findings

## Findings Record: 2026-05-28 09:29:29 UTC+8

### Current Facts
- 当前主工作区：`/Users/jared/SuperpoweringWithFiles`。
- 当前主工作区 branch / HEAD：`dev @ 40b3a3d`。
- 当前 linked worktrees 至少包括：主工作区 `dev`、独立 `main` worktree、`codex/202605080601-upstream-refresh-6-failure-repair-001`、`codex/202605061308-roadmap-v1-4-safety-overlay-governance-002`、`202605081401-harness-runtime-facade-mcp-001`、`202605160358-homepage-redesign-prototype-001`、`harness-reconcile-execution`。
- 初始 divergence 快照：
  - `dev...origin/dev = 0 0`
  - `main...origin/main = 0 9`
  - `dev...main = 8 13`
- 当前 `origin/main = 41bb6dd`，`local main = 43c245c`；该结论仍需在一次显式 `fetch --all --prune` 后复核。
- 当前 `main` worktree `git status --short --branch` 显示 clean，仅有 `## main...origin/main [behind 9]`。
- 显式执行 `git fetch --all --prune` 后，`origin/main` 仍为 `41bb6dd`，说明本地缓存没有过期。
- 已在独立 `main` worktree 中执行 `git merge --ff-only origin/main`，现在 `local main = origin/main = 41bb6dd`，并且 worktree 仍 clean。
- 执行 `./scripts/harness sync --conflict=backup` 后，再跑 `./scripts/harness adopt-global` 已恢复到 `in_sync`；当前 `health.problems = []`，仅剩 companion-plan warnings。
- 当前 `./scripts/harness adoption-status` 返回：
  - `status = apply_failed`
  - `scope = user-global`
  - `skillProfile = full`
  - `hookMode = on`
  - receipt 仍指向 2026-05-26 的 `dev` HEAD `50f486d...`
  - 当前失败原因集中在 `claude-code` hooks 缺失，而不是 projection ownership 冲突。
- 直接执行 `./scripts/harness adopt-global` 的实际失败点早于上述 drift 输出：Harness 拒绝覆盖 non-Harness-owned 的 `/Users/jared/.codex/AGENTS.md`。
- `./scripts/harness sync --help` 明确支持 `--conflict=backup`，这是仓库为这类 ownership guard 设计的修复路径。
- 已在执行前创建 checkpoint：`/Users/jared/.agent-config/checkpoints/SuperpoweringWithFiles/2026-05-28T01-31-49Z`。

### Reused Historical Constraints
- `branch-head-sync-latest` 记录表明：本仓库历史上已经有过一次 `main` 吸收 `dev` 的同步，不应机械假设 `main` 与 `dev` 同 SHA。
- `local-branch-cleanup-audit` 记录表明：2026-05-11 之后，本地分支 / worktree 曾收敛到较小集合；当前再次膨胀说明需要重新盘点，而不是复用旧结论。
- repo memory 要求：做任何 branch-readiness 结论前，必须记录 `pwd`、当前 branch、当前 HEAD、`git worktree list`。

### Working Hypotheses
- 假设 1：本轮 `local main` 只需要在其独立 worktree 中 fast-forward 到 fetch 后的 `origin/main`。
- 假设 2：本轮 `adopt-global` 很可能不会失败在 ownership takeover，而是会继续暴露 hooks drift；执行后需要以 `adoption-status` 结果验证是否恢复到 `in_sync`。
- 假设 3：当前 worktree / branch 集合里应当存在一批已合入但仍被本地保留的候选对象，但需要排除 active task、脏 worktree 和 backup / automation lanes。

### Validated Outcomes
- 假设 1 已验证成立：`main` 只需 fast-forward，同步后 `main...origin/main = 0 0`。
- 假设 2 已被当前执行结果部分证伪：本轮 adoption 的第一阻塞不是 hooks drift，而是 `/Users/jared/.codex/AGENTS.md` ownership conflict。

## Branch And Worktree Audit

### Current Snapshot
- 本地 branches: 10
- Linked worktrees: 7

### Clean And Already Merged
- `harness-reconcile-execution`
  - branch 已被 `dev` / `main` 吸收。
  - 对应 worktree clean。
  - 但 task `planning/active/harness-reconcile-roadmap-evolution/` 仍是 `waiting_review`，因此更适合列为 review candidate，而不是立即删除。

### Merged But Blocked By Dirty Worktrees
- `codex/202605080601-upstream-refresh-6-failure-repair-001`
  - branch 已被 `dev` / `main` 吸收。
  - task 已 `closed` 且 `Archive Eligible: yes`。
  - 但 worktree 内存在大量未提交修改，因此不能直接清理。
- `codex/202605061308-roadmap-v1-4-safety-overlay-governance-002`
  - branch 已被 `dev` / `main` 吸收。
  - task 已 `closed` 且 `Archive Eligible: yes`。
  - 但 worktree 仍有未提交修改，因此不能直接清理。

### Clean But Not Merged
- `202605081401-harness-runtime-facade-mcp-001`
  - branch 不在 `dev` / `main` 中。
  - worktree clean。
  - task 状态 `waiting_review`，应继续保留。
- `202605160358-homepage-redesign-prototype-001`
  - branch 不在 `dev` / `main` 中，且相对 `main` 仍有 8 个左侧提交。
  - worktree clean。
  - task 文件写的是“已集成到 main”，但当前 git 事实不支持直接删 branch，需要先 reconcile 这处状态不一致。

### Keep By Semantics
- `dev` / `main`: 主线分支。
- `/Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/20260504-upstream-refresh-layout-compat-main`: 当前已同步好的 `main` worktree，可保留为独立主线落点。
- `automation/upstream-refresh`: 已被主线吸收，但它承载 automation lane 语义，不建议按普通 merged feature branch 处理。
- `backup/dev-before-origin-align-20260504`、`backup/main-before-sync-20260524-204954`: 本地恢复点，不建议在本轮报告里直接纳入清理。

## Claude Code Adopt Review: 2026-05-28 09:50:20 UTC+8

### Effective Evidence
- `./scripts/harness adoption-status` 当前返回 `status = in_sync`、`scope = user-global`，receipt 绑定 `repoBranch = dev` 与 `repoHead = 40b3a3d44e0879b7c6cd61908631a00e9478f145`。
- adoption receipt 的 verification 明确记录 `doctorPassed = true`，但 `runtimeInvocationVerified = false`。
- Claude Code 的 `planning-with-files` 与 `superpowers` hook evidence 均为 `config = settings-hook-present`、`payload = local-payload-verified`、`runtime = not-measured`。
- `./scripts/harness doctor --check-only` 当前通过，`health.problems = []`；输出已包含 Claude Code payload detail：`claude-code / bootstrap / ok` 与 `claude-code / planning-hot / ok`。
- `/Users/jared/.claude/settings.json` 已包含 Claude Code 预期 hook event keys：`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop`、`SessionStart`，每类各 1 个 entry。
- `/Users/jared/.claude/hooks` 已 materialize global hook scripts，包括 `session-start`、`task-scoped-hook.sh`、`planning-hot-context.mjs`、`render-hot-context.mjs` 等。

### Remaining Caveats
- 仍不能声称 Claude Code runtime invocation 已被真实测量；当前系统正确报告为 `runtime = not-measured`，且 adoption-status 保留 reason：local settings and payload checks passed only。
- workspace `.claude/settings.json` 不存在，`.claude/settings.local.json` 无 hooks；这与本轮 user-global adoption 不冲突，但报告中应明确全局与 workspace settings 的区别。
- `doctor --check-only` 仍有 pre-existing companion-plan warnings，与 Claude Code hooks adoption 本身无关。
- `Hook payload target: copilot` 与后续 detail 中同时出现 Claude Code payload 的组合略易误解，属于后续报告语义优化点。

## Findings Record: 2026-05-28 13:13:57 UTC+8

### Live Re-audit After Dev Drift
- 当前主工作区 `dev` 已从 task 启动时的 `40b3a3d` 前进到 `23804de`，因此旧 cleanup 结论必须以实时 git 状态重审，不能直接照搬 Phase 4-5 结论。
- 当前 linked worktrees 仍为 7 个，主工作区与独立 `main` worktree 均 clean。
- `harness-reconcile-execution`
  - branch 仍已被 `dev` / `main` 吸收。
  - worktree clean。
  - 相关 task `planning/active/harness-reconcile-roadmap-evolution/task_plan.md` 当前仍是 `waiting_review`，所以仍只能算 review candidate，不应直接清理。
- `codex/202605080601-upstream-refresh-6-failure-repair-001`
  - branch 仍已被 `dev` / `main` 吸收。
  - 相关 task `planning/active/upstream-refresh-6-failure-repair/task_plan.md` 为 `closed` + `Archive Eligible: yes`。
  - 但对应 worktree 现在依然大量 dirty，并且是 upstream vendor/update 类大 diff，仍不适合直接删 branch/worktree。
- `codex/202605061308-roadmap-v1-4-safety-overlay-governance-002`
  - branch 仍已被 `dev` / `main` 吸收。
  - 相关 task `planning/active/roadmap-v1.4-safety-overlay-governance/task_plan.md` 为 `closed` + `Archive Eligible: yes`。
  - 但对应 worktree 仍有大量未提交修改，且包含源码/tests/docs 变更，仍不适合直接清理。
- `202605081401-harness-runtime-facade-mcp-001`
  - branch 仍未被 `dev` / `main` 吸收。
  - worktree clean。
  - 相关 task `planning/active/harness-runtime-facade-mcp/task_plan.md` 为 `waiting_review`，必须继续保留。
- `202605160358-homepage-redesign-prototype-001`
  - branch 仍未被 `dev` / `main` 吸收；task 文件声称“已集成到 main”，但当前 branch head `2e4171d` 并不在 `main`/`dev` 中。
  - worktree clean。
  - 这说明该 lane 至少存在“task lifecycle / branch state / possibly cherry-picked integration”之间的状态不一致，属于优先应该继续分析的对象，而不是 ready cleanup 对象。
- 其他语义保留对象维持不变：`dev`、`main`、独立 `main` worktree、`automation/upstream-refresh`、`backup/*` 不应在本轮直接纳入清理执行。

### Updated Cleanup Readiness
- 目前没有新增的“可立即安全清理”对象。
- 最接近 ready 的仍是 `harness-reconcile-execution`，但因为 active task 仍 `waiting_review`，它现在更适合作为“等 owner 明确 review 通过后即可清理”的 next candidate。
- 最值得继续分析的不是 merged/dirty 两个 codex lanes，而是 `homepage-redesign-prototype`：它 clean、task 标记 complete/archivable，但 git branch 事实尚未收敛，若不先解释清楚 cherry-pick/merge 关系，直接删 branch/worktree 风险最高。

## Findings Record: 2026-06-02 21:47:01 UTC+8

### Main Fast-Forward Re-Audit
- `git fetch origin --prune` 后，`origin/main` 已从 `41bb6dd` 前进到 `dabbb82`。
- 随后本地 `main` worktree `/Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/20260504-upstream-refresh-layout-compat-main` 已成功 `git merge --ff-only origin/main`，当前 `main = origin/main = dabbb82`。
- `dev` 仍保持 `d8b9f9a`，并继续与 `origin/dev` 一致。
- 最新复核结果：
  - `dev...origin/dev = 0 0`
  - `main...origin/main = 0 0`
  - `git merge-base --is-ancestor dev main` 返回成功
- 这意味着本地两个主线 head 现在都和各自的远端最新版本一致，且 `main` 已再次吸收当前 `dev` 的内容集。

### Cleanup Implication
- 本轮重新快进 `main` 后，之前基于 `41bb6dd` 的任何 cleanup 判断都要作废并以 `dabbb82` 重新审视。
- 不过截至这次 re-audit，branch/worktree 的分类边界没有出现新的立即可删对象；现有 keep/review 结论保持不变。


### Created Artifact
- 新 companion plan 已写入：`docs/superpowers/plans/2026-05-28-claude-code-runtime-evidence.md`。
- 该 plan 明确是 review-only：implementation 未开始，未修改实现代码、Claude Code hooks 或 user-global 配置。

### Plan Scope
- 为 Claude Code 增加真实 runtime invocation evidence：Harness-managed Claude Code hook entrypoints 在真实被 Claude Code 调用时写入 metadata-only JSONL trace。
- 将 runtime trace 读入 `readHarnessHealth()`，并同步到 `doctor`、`verify`、`adopt-global` receipt 与 `adoption-status` 语义。
- 修正当前 `Hook payload target: copilot` 这类 singular summary 在多 target 测量场景下的误导性。
- 增加 Claude Code settings resolution 报告，明确 workspace/user-global/settings.local 的参与状态，避免把 user-global 生效误读为 workspace hook 生效。
- 把 companion-plan warning hygiene 保持为独立任务，不把历史 orphan/missing-back-reference 清理混入 runtime evidence 主线。

### Code Locations Inspected For The Plan
- `harness/installer/lib/health.mjs`
- `harness/installer/lib/hook-evidence-summary.mjs`
- `harness/installer/commands/doctor.mjs`
- `harness/installer/commands/verify.mjs`
- `harness/installer/lib/adoption.mjs`
- `harness/installer/commands/adopt-global.mjs`
- `harness/installer/lib/hook-projection.mjs`
- `harness/installer/lib/paths.mjs`
- `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh`
- `harness/core/hooks/superpowers/scripts/session-start`
- `harness/core/hooks/*/claude-hooks.json`
- `tests/installer/health.test.mjs`
- `tests/installer/commands.test.mjs`

## Findings Record: 2026-05-28 13:31:16 UTC+8

### Focused Follow-up Analysis
- `homepage-redesign-prototype` 当前不是“已 merge 待清理”状态。
  - branch `202605160358-homepage-redesign-prototype-001` 相对 `main` 为 `40 8`，相对 `dev` 为 `28 8`，共同 merge-base 都停在 `7d5f8e8`，说明它从很早的基线上分叉后一直未收敛回主线。
  - `git cherry -v main 202605160358-homepage-redesign-prototype-001` 与对 `dev` 的结果全部为 `-`，说明这 8 个提交没有 patch-equivalent 被主线直接吸收；它不是简单 cherry-pick 已集成的 stale branch。
  - 但当前主线 homepage 历史显示这条 manifesto prototype 之后又经过 `fb88ff9` / `18580da` / `6a45b11` 等后续 redesign/production commits，且当前 `homepage/src/App.tsx`、`homepage/src/styles.css` 与该 prototype branch 版本只有中等差异，说明它更像“已被后续 homepage 演进替代的旧 prototype lane”，不是当前要保留以待 merge 的分支。
  - 因此它的清理前提不是“确认是否已 merge”，而是“确认用户是否还想保留这个 prototype branch 作为历史设计分支”。在未明确前，它属于 review candidate，不是 ready cleanup。
- `harness-reconcile-execution` 可视为 **ready after review**。
  - 其 branch 已完全被 `dev` / `main` 吸收，worktree clean，且无远端 tracking 依赖。
  - planning artifacts、`reconciliation.md` 与 companion plan 都已在主工作区 durable 保存；保留该 worktree 不再提供技术价值。
  - 当前唯一阻塞是 task `planning/active/harness-reconcile-roadmap-evolution/task_plan.md` 仍为 `waiting_review`。
- merged-but-dirty codex lanes 的性质出现分化：
  - `202605080601-upstream-refresh-6-failure-repair-001`：dirty 内容以 upstream/vendor refresh residue、patch test changes、`__pycache__` 为主，更像可放弃残留；当前可先忽略，不必优先深挖。
  - `202605061308-roadmap-v1-4-safety-overlay-governance-002`：dirty 内容包含 `health.mjs`、`state.mjs`、`paths.mjs`、`adoption.mjs`、tests 与 planning 记录的大量实质性修改，且抽样显示像一批已验证但未收敛的人工工作；任何清理前都需要更深入 forensic review。

### Updated Cleanup Classification
- **Ready after review**: `harness-reconcile-execution`。
- **Review candidate / keep until owner decision**: `202605160358-homepage-redesign-prototype-001`。
- **Safe to ignore for now but not worth active cleanup yet**: `codex/202605080601-upstream-refresh-6-failure-repair-001`。
- **Needs deeper forensic review before any cleanup**: `codex/202605061308-roadmap-v1-4-safety-overlay-governance-002`。
- **Keep**: `dev`、`main`、独立 `main` worktree、`202605081401-harness-runtime-facade-mcp-001`、`automation/upstream-refresh`、`backup/*`。
