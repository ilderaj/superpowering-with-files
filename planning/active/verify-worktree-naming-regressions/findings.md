# Findings

## Initial Failure Inventory
- 当前全量 `npm run verify` 结果是 `312 pass / 7 fail`。
- 失败分布：
  - `tests/adapters/sync-skills.test.mjs`: 1
  - `tests/installer/worktree-name.test.mjs`: 4
  - `tests/installer/worktree-preflight.test.mjs`: 2

## Relevant Prior Context
- `worktree-naming-governance` 已关闭，设计目标是 `YYYYMMDDHHMM-<task-slug>-NNN` 的 canonical label，并让 `worktree-preflight` 复用 naming helper 但不改变 base recommendation ownership。
- 2026-05-06 的 verify 输出显示当前 helper 在测试里返回 UUID 风格 task id，例如 `019dfb30-6bea-79b2-863d-cf0a17aa2a6f`，和既有断言期望的 slug 不一致。
- `sync-skills` 失败点是 `mkdir '/Users/jared/.harness/backups/...'` 的 `EPERM`，初步更像测试环境写权限问题，而不是业务语义错误。

## Root-Cause Evidence
- 在 repair worktree 中运行：
  - `node --test tests/adapters/sync-skills.test.mjs tests/installer/worktree-name.test.mjs tests/installer/worktree-preflight.test.mjs`
  - 结果稳定重现 `7` 个失败。
- 环境检查确认：
  - `CODEX_THREAD_ID=019dfb30-6bea-79b2-863d-cf0a17aa2a6f`
  - `HOME=/Users/jared`
- `harness/installer/lib/worktree-name.mjs` 当前 precedence 是：
  1. explicit `taskId`
  2. `PLANNING_TASK_ID` / `CODEX_THREAD_ID` / `CLAUDE_SESSION_ID`
  3. `planning/active` 单 active task
  4. current branch
- 关键问题在第 2 步：env task id 即使在 `planning/active/<env-task-id>` 不存在时也会直接返回，导致：
  - `worktree-name` tests 期待的 `worktree-naming-governance`、`feature-worktree-labeling`、`preflight-task` 全被覆盖成 `019dfb30-...`
  - sequence 也无法从真实 task progress 中递增
- `sync-skills` 的 `EPERM` 可通过隔离 `HOME` 消失：
  - 直接运行 focused test：失败，试图写入 `/Users/jared/.harness/backups/...`
  - 运行 `HOME=/private/tmp/verify-worktree-name-home node --test tests/adapters/sync-skills.test.mjs --test-name-pattern 'sync backs up non-owned skill target when requested'`：`10 pass / 0 fail`
  - 说明生产逻辑优先使用 `os.homedir()` / `HOME` 创建 backup archive，当前失败首先是测试环境未隔离 HOME，而不是 backup archive 语义本身错误。

## Fix Outcome
- `harness/installer/lib/worktree-name.mjs` 已收紧 env precedence：
  - `PLANNING_TASK_ID` 仍可显式指定 task id；
  - `CODEX_THREAD_ID` / `CLAUDE_SESSION_ID` 只有在 `planning/active/<taskSlug>` 真实存在时才会参与解析；
  - 否则继续回退到单 active planning task 或当前 branch。
- `tests/installer/worktree-name.test.mjs` 与 `tests/installer/worktree-preflight.test.mjs` 现在显式注入 session env，保证测试覆盖真实 Codex 运行环境，而不是依赖“测试进程恰好没有 thread env”的偶然条件。
- `tests/adapters/sync-skills.test.mjs` 在 backup 场景下显式隔离 `HOME`，把 archive 写到 fixture 内部，避免污染真实用户目录并消除 `EPERM`。
- 验证结果：
  - focused suite：`23 pass / 0 fail`
  - 主工作区全量 `npm run verify`：`319 pass / 0 fail`
