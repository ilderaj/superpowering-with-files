# Worktree Base Preflight Findings

## Durable Decisions

- 该机制放在 Harness 自有层：`harness/core/policy/base.md`、`harness/installer/*`、README/docs/tests。
- 不修改 `harness/upstream/superpowers` 或 `harness/upstream/planning-with-files`，避免 upstream update 覆盖本地行为。
- Worktree 创建前必须选择并记录 base，不能依赖 `git worktree add -b` 隐式使用当前 `HEAD`。
- Planning with Files 记录每个任务的 base branch 和 base SHA；finishing 时优先使用记录值，而不是用 `merge-base HEAD main` 猜。
- 新增 CLI 命令为 `./scripts/harness worktree-preflight`，支持默认文本输出、`--json` 和 `--base=<ref>` 显式覆盖。
- Core policy 是跨平台规则来源；adapter rendering test 已确认 Codex、Copilot、Cursor、Claude Code 都会得到 Worktree Base Preflight 规则。
- `.harness/state.json` 当前配置了 Codex workspace projection，因此执行 `./scripts/harness sync` 后生成了 workspace `AGENTS.md`。

## Initial Repository Facts

- 当前工作区位于 `dev`，并跟踪 `origin/dev`。
- 本仓库 release 文档定义：`dev` 是 ongoing implementation and upstream updates，`main` 是 verified template baseline。
- 已有 upstream update guard：`harness/installer/lib/upstream.mjs` 只允许 update 写入 `harness/upstream/<source-name>`。
- 本次 `./scripts/harness worktree-preflight --json` 推荐：`dev @ beca3bf84be33a47c3fda0c7451b7d0a0b154432`。
- `origin/main` 为 `02bb4ede88d2c486875dc820d5d88102dd93a9d8`，本地 `main` 为 `5dcd8eb0a0b7904fe84a961996281485a1994e03`；推荐使用 `dev` 避免从错误的 trunk baseline 开始。

## Verification Notes

- `node --test tests/installer/git-base.test.mjs`：通过，6 个测试。
- `node --test tests/adapters/templates.test.mjs`：通过，3 个测试。
- `npm run verify`：通过，38 个测试。
- `./scripts/harness sync`：通过，生成/同步 1 个 Codex target。
- `./scripts/harness worktree-preflight`：通过，推荐 `dev` 并提示当前工作区 dirty。
- `./scripts/harness doctor`：通过，输出 `Harness installation is healthy.`。
- `git diff --check`：通过。
- `git status --short -- harness/upstream`：无输出，确认本次未修改 upstream baselines。
