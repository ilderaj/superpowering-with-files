# Findings: Git Execution And Authorization Analysis

## Requirements

- 为仓库新增 repo-owned `checkpoint-push` 路径：`verify + deterministic review evidence + commit + push`
- 仅允许在 eligible branch context 下运行：非 `main`/`master`，`dev` 仅限 linked worktree，且必须有 `origin`
- 不做 PR automation，不做 merge automation，不试图绕过 host approval prompts
- `worktree-preflight --safety` 需要暴露 checkpoint-push readiness
- README / maintenance / safety / compatibility / skill / policy 文案需要同步到已实现行为
- 最终把实现 merge 回本地 `dev`，并完成 commit / push

## Verified Findings

- 当前仓库 `.harness/state.json` 记录的是 `policyProfile: "always-on-core"`、`hookMode: "off"`，所以 safety hooks 在当前实例里默认并未实际启用。
- review 阶段暴露的 full `verify` 唯一 blocker 确认为 `tests/adapters/hook-projection.test.mjs` 的 stale assertion：实现已包含 `render-session-summary.mjs` 与 `session-summary.mjs`，测试期望未同步。
- 该漂移通过最小测试修复解决：更新 Cursor planning hook 的 `planning.scriptSourcePaths` 断言后，focused test 与 full `npm run verify` 都恢复为 green。
- `checkpoint-push` 现在通过 `harness/installer/lib/checkpoint-push.mjs` 统一处理 snapshot/readiness、verify orchestration、review artifact、commit/push result shaping。
- CLI failure semantics 已收紧：`blocked`、`verification_failed`、`push_failed` 会返回非零退出码，避免上层脚本把失败当成功。
- `git diff --check` 现在对 staged commit set 执行，能覆盖 newly added files。
- dry-run / failure 路径会恢复 caller index，包括普通 staged 变更与 `git add -N` intent-to-add 条目。
- push contract 已固定为 `origin/<current-branch>`：若 upstream 不是 `origin/<current-branch>` 会被显式阻断；即使本机 `push.default=matching` 也只会推当前分支。
- review artifact 现在区分 pre-push upstream 与 post-push upstream，并在 verify/failure/dry-run 场景下刷新 `Changed Files`、`Git Status --short`、`Git Diff --stat`，避免遗漏 verify 过程中生成的新文件。
- index backup 已移到系统临时目录，不会被 `git add -A` 带入 recovery commit。
- `harness/installer/commands/worktree-preflight.mjs` 的 `--safety` 输出现在包含 `checkpointPushReady`。
- README、`docs/maintenance.md`、`docs/safety/vibe-coding-safety-manual.md`、`docs/compatibility/hooks.md`、`harness/core/skills/safe-bypass-flow/SKILL.md`、`harness/core/policy/safety.md` 已同步到 repo-owned `checkpoint-push` 工作流。
- 当前 user-global adoption 流程在存在既有非 Harness-owned 全局入口时会安全拒绝覆盖；在本机实际场景下，先执行 `./scripts/harness sync --conflict=backup` 再执行 `./scripts/harness adopt-global` 可以无损接管并恢复 `in_sync` receipt。

## Open Threads

- `doctor --check-only` / `adoption-status` 仍会报告一组既有 companion-plan 治理 warning：多个旧 orphan companion plans 以及 `docs/superpowers/plans/2026-04-26-cross-ide-hook-capability-alignment.md` 缺少指回 `planning/active/<task-id>/` 的反向链接。它们与本次 verify/adoption repair 无关，不作为本任务 blocker。

## Recommended Implementation Scope

- v1 只实现 repo-owned `checkpoint-push` orchestration：`verify + deterministic review evidence + commit + push`
- v1 把自动 push 限定在 worktree / 非 trunk / 非 main-checkout `dev` 分支
- v1 不做 PR automation，不做 merge automation，也不尝试覆盖 host-level approval prompts
- v1 用 deterministic review artifact 取代“CLI 内嵌 LLM code review”，把真正的 model-driven review 留在 agent workflow 层

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Task 5 docs 子代理把 authoritative planning files 收窄成 docs-only 子任务 | 手动重写 `planning/active/git-execution-authorization-analysis/{task_plan,findings,progress}.md`，恢复整个 checkpoint-push 实现任务的真实状态 |
| 多轮 code review 持续暴露测试未覆盖的合同缺口 | 每个缺口都先补红灯回归，再做最小修复，直到 reviewer 最终批准 |
| `adopt-global` 对既有非 Harness-owned 全局 Codex 入口执行保护性阻断 | 先执行 `./scripts/harness sync --conflict=backup`，让 Harness 以备份方式接管后再重跑 adoption |

## Destructive Operations Log

| Command | Target | Checkpoint | Rollback |
|---------|--------|------------|----------|
| `git push -u origin copilot/using-subagents-for-plans` | 远端功能分支 | 本地已验证 commit `e61ddd1` | 若后续 `dev` 集成失败，可从该远端功能分支恢复 |
| `git push origin dev` | 远端开发分支 | 本地 merged `dev` commit `d51a729` | 若后续需要回退，可从远端历史或功能分支重新建立修复分支 |
| `git push origin dev` | 远端开发分支 | 本地 repair commit `e300de5` | 若后续需要回退，可从 `origin/dev` 的前一提交 `a84a588` 或 repair worktree 分支记录重建修复 |

## Resources

- `docs/superpowers/plans/2026-04-25-checkpoint-push-automation-plan.md`
- `planning/active/git-execution-authorization-analysis/task_plan.md`
- `harness/installer/lib/checkpoint-push.mjs`
- `harness/installer/commands/checkpoint-push.mjs`
- `harness/installer/commands/worktree-preflight.mjs`
- `tests/installer/checkpoint-push.test.mjs`
- `tests/installer/worktree-preflight.test.mjs`
- `tests/installer/commands.test.mjs`

## Visual/Browser Findings

- None.
