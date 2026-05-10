# Findings: Roadmap v1.4 Safety Overlay Governance

## Scope Boundaries

- `v1.4` 聚焦 safety overlay、cloud harness repo-local deployment，以及 automation follow-through。
- `post-upstream-automation-followups` 已有 heartbeat；scheduled run 观察存在固定时间门槛。
- `origin-cloud-harness-deployment-plan` 目前是 `waiting_review` 分析任务，执行前必须把其结论映射成具体代码落点，而不是直接照抄 planning 文案。
- `harness-template-foundation` 属于 `v1.6`，本轮只读取其收尾边界，不提前关闭。

## Known Inputs

- Roadmap source: `docs/roadmap.md`
- Master execution companion: `docs/superpowers/plans/2026-05-06-roadmap-implementation-plan.md`
- Related active tasks:
  - `planning/active/post-upstream-automation-followups/`
  - `planning/active/origin-cloud-harness-deployment-plan/`
  - `planning/active/harness-template-foundation/`

## Durable Findings

- `post-upstream-automation-followups` 当前唯一剩余 gate 是 `2026-05-08 20:05 Asia/Shanghai` 之后的首个 scheduled run 观察；其余 stale worktree cleanup、verify 修复、workflow gate 已完成。
- `dev` 上存在一条误提交的 in-repo Codex worktree gitlink：`.codex-worktrees/202605061308-roadmap-v1-4-safety-overlay-governance-002`。该路径在 `a41d02a Close roadmap v1.6` 中以 mode `160000` 被加入索引，导致只要嵌套 worktree dirty，主仓库就持续显示 dirty，即使 `dev`/`origin/dev` 本身没有代码漂移。
- 这类路径的正确边界是“保留磁盘上的嵌套仓库，但不让父仓库跟踪它”。修复方式是为主仓库补充 `.codex-worktrees/` ignore 规则，并将误提交的 gitlink 从父仓库索引中移除；不需要删除嵌套 worktree，也不应该把其中未提交内容直接当成主仓库变更处理。
- `pre-tool-use` 的真实判定只在 `harness/core/hooks/safety/scripts/pretool-guard.sh`；false-positive 根因不是 payload parse abort，而是 `safe-commands.txt` 对 `rg`、`node --test`、`npm run verify` 等低风险命令覆盖不全。`find` 需要单独走低风险查询分支，不能直接整条放进 allowlist。
- state 已切成“baseline + overlay”最小模型：
  - baseline 继续用 `policyProfile`
  - workspace-only overlay 用 `workspacePolicyOverlay`
  - Copilot cloud repo-local 路径选择用 `deploymentProfile`
- 旧的 workspace safety state 会在 `readState()` 中自动归一化为：
  - `policyProfile: always-on-core`
  - `workspacePolicyOverlay: safety|cloud-safe`
- Copilot repo-local cloud profile 现在支持把 workspace skills 投影到 `.github/skills`；planning-with-files 的 Copilot patch 也能把 `.github/skills` 作为正式优先 root。
- `doctor` / `health` / `adoption-status` 已能暴露 baseline、overlay 与 deployment 维度；user-global adoption 仍只以 baseline contract 为准，不把 workspace overlay 当作 drift。

## 2026-05-09 Upstream Refresh PR Audit

- `main` 上的 production-path rerun `25583701010` 已成功，说明 refresh pipeline、artifact 上传和 PR opening path 都恢复了。
- 但 open PR `#45 chore: refresh upstream baselines` **不应直接合并**，当前存在一个内容级 merge blocker：
  - automation branch 会把 repo-local policy entry files 当成 eligible refresh 产物：
    - `AGENTS.md`
    - `CLAUDE.md`
    - `.github/copilot-instructions.md`
  - 其中 `AGENTS.md` 的 diff 不是纯格式变化，而是把当前仓库用于 Codex 的厚 entry policy 压成了上游 thin entry，删除了：
    - sync-back / plan-location / companion-plan 规则
    - lifecycle / orchestration / hard constraints
    - repo 当前依赖的行为与输出规范
- 这意味着当前 PR 虽然 `mergeable = MERGEABLE`，但**语义上不可合并**；否则会把本仓库的 authoritative repo policy 退化成上游默认薄入口。

## Fix Feasibility

- 这个 blocker 可以修，而且最小修法已经明确：
  - 在 `scripts/ci/lib/upstream-refresh.mjs` 的 `filterEligibleChanges()` 中，把 repo-local entry files 从 automation eligible set 中移出
  - 仍然允许真正的 vendored / projected 内容继续进入 refresh PR：
    - `harness/upstream/**`
    - hidden projection roots such as `.agents/**`, `.claude/**`, `.codex/**`, `.cursor/**`
    - `.github/instructions/**`, `.github/prompts/**`
    - `docs/maintenance.md`
- 已在本地实现该修法，并通过：
  - focused upstream-refresh regression suite
  - 全量 `npm run verify`

## Remaining Non-Blocking Maintenance Item

- GitHub Actions 成功 run 的 annotations 仍提示 Node.js 20 deprecation warning。
- 这不是当前 merge blocker，但官方升级路径已存在：
  - `actions/checkout` latest release: `v6.0.2`
  - `actions/setup-node` latest release: `v6.4.0`
  - `actions/upload-artifact` latest release: `v7.0.1`
  - 三个仓库当前 `action.yml` 的 `runs.using` 都已是 `node24`
- 结论：这个 warning **可以后续单独修**，方法是把 workflow 中的 action major versions 升到支持 Node 24 的当前主线版本。

## 2026-05-09 Final Refresh Closure

- 第一轮 repo-local entry exclusion 修复只解决了“不要把这些文件列进 eligible files”，但没有处理这些文件仍留在 refresh branch worktree 里的事实，因此 allowlist 仍会失败。
- 第二轮 root cause 是 `restoreRepoLocalEntryFiles()` 错把所有 repo-local entry files 当成 tracked files：
  - `AGENTS.md` 在 `origin/dev` 上是 tracked
  - `CLAUDE.md` 与 `.github/copilot-instructions.md` 在 `origin/dev` 上不是 tracked，而是 refresh 过程中产生的 untracked overlay 文件
- 正确修复是按 tracked / untracked 分流：
  - tracked entry files 用 `git restore --source=HEAD --worktree`
  - untracked entry files 直接删除
- `main` 上最后一次 production rerun `25604752525` 成功，且 open PR `#45` 被更新到 head `2daf5a857bfaf86379f38576dfa81c629821684a`。
- 最终复核 `#45`：
  - PR body 的 top-50 eligible files 已不再出现顶层 `AGENTS.md`
  - PR changed files 中不再包含：
    - `AGENTS.md`
    - `CLAUDE.md`
    - `.github/copilot-instructions.md`
  - 因此原先的内容级 merge blocker 已解除
- `#45` 随后已成功合并，merge commit 为 `cbe0bb77ff4460928adb6da72ffb29c0da556572`。
