# Findings & Decisions

## Requirements
- 检查 `local dev`、`origin/dev`、`origin/main`、`local main` 的 head 差异。
- 检查之后，把它们同步到“最远的最新的状态”。
- 过程需要遵守当前仓库的 planning-with-files 规则与中文落盘要求。

## Research Findings
- 当前工作区位于 `dev`。
- `git status --short --branch` 显示当前工作区存在未提交修改：`.codex-worktrees/202605061308-roadmap-v1-4-safety-overlay-governance-002`。
- 本地缓存视图中，`dev` 与 `origin/dev` 同步，`main` 与 `origin/main` 同步；但这个结论仍需在 fetch 后复核。
- `main` 当前由另一个 worktree 占用，路径为 `/Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/20260504-upstream-refresh-layout-compat-main`。
- 已执行 `git fetch --all --prune`；刷新后四个目标 head 为：
  - `dev = origin/dev = a41d02a`
  - `main = origin/main = fe42a20`
- `dev` 与 `main` 互相都不是祖先：
  - `git merge-base --is-ancestor main dev` 返回失败
  - `git merge-base --is-ancestor dev main` 返回失败
- `dev...main` 显示 `dev` 独有 32 个提交，`main` 独有 1 个提交；`main` 的独有提交是 `fe42a20 Merge pull request #41 from ilderaj/dev`。
- `git diff --quiet main dev` 返回差异存在，且 tree object 不同，说明两边不是“空分叉”。
- 仓库内已有已归档任务 `planning/archive/20260506-142311-align-local-main-with-dev/`，其结论明确规定：
  - “一致”按安全语义解释为：`local main` 与 `origin/main` 同步，且 `main` 包含 `local dev/origin/dev` 的内容。
  - 不通过 force-push 去把四个 ref 改成同一个 SHA。
- 初次在 `main` 上 merge `dev` 后，`npm run verify` 失败于 `tests/installer/active-summary-command.test.mjs`：
  - 测试在写 `docs/superpowers/plans/task-blocked.md` 前未创建父目录。
  - 在 `dev` 中补上 `await mkdir(path.join(root, 'docs/superpowers/plans'), { recursive: true });` 后，focused test 通过，随后全量 `npm run verify` 也通过。
- 最终 head 状态：
  - `dev = origin/dev = 98fab25`
  - `main = origin/main = 570cae0`
  - `git merge-base --is-ancestor dev main` 返回成功，说明 `main` 已包含 `dev`。
- `local main` worktree 已恢复干净。
- 当前 `dev` 工作区仍保留两类本地状态，但都不影响本次 head 同步结论：
  - 既有用户改动：`.codex-worktrees/202605061308-roadmap-v1-4-safety-overlay-governance-002`
  - 本次新建但未提交的 planning 目录：`planning/active/branch-head-sync-latest/`

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 不复用现有 active task | 现有 active tasks 分别服务于 roadmap 与 automation followup，语义边界不同 |
| 在当前 worktree 避免切换分支 | 当前 `dev` 有未提交改动，切换分支会增加污染与冲突风险 |
| 将“同步到最远最新状态”解释为让 `main/origin-main` 非破坏性吸收 `dev/origin-dev` | 当前 `dev` 与 `main` 真实分叉，不能安全地把四个 ref 强行改成同一 SHA；仓库已有同类任务验证过 merge 语义 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 本机未安装 `fd` | 改用 `find` 与 `rg` 完成扫描 |

## Destructive Operations Log
| Command | Target | Checkpoint | Rollback |
|---------|--------|------------|----------|
| `git branch backup/main-before-dev-sync-20260508-1125 fe42a20` | 本地 backup ref | backup branch `backup/main-before-dev-sync-20260508-1125` | 可用该 backup ref 重新创建/重置 `main` |
| `git -C <main-worktree> merge --no-ff --no-edit dev` | `local main` | backup branch `backup/main-before-dev-sync-20260508-1125` | 可回到 backup ref 后重做 |
| `git push origin dev` | `origin/dev` | commit history (`a41d02a -> 98fab25`) | 如需回退需新提交或经显式批准后重写远端 |
| `git -C <main-worktree> push origin main` | `origin/main` | backup branch `backup/main-before-dev-sync-20260508-1125` | 如需回退需新提交或经显式批准后重写远端 |

## Resources
- `/Users/jared/SuperpoweringWithFiles/planning/active/post-upstream-automation-followups/task_plan.md`
- `/Users/jared/SuperpoweringWithFiles/planning/active/roadmap-v1.4-safety-overlay-governance/task_plan.md`
- `/Users/jared/SuperpoweringWithFiles/.git`
