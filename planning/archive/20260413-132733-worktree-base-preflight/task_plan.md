# Worktree Base Preflight Implementation Plan

> **For agentic workers:** 本计划按本仓库规则由 Planning with Files 承载。Superpowers `writing-plans` 仅用于生成临时实施结构；不要把长期计划另存到 `docs/superpowers/plans/`。

**Goal:** 在 Harness 自有层加入 worktree base 选择约束和可验证预检，避免 Superpowers 或并行任务从错误的 `main`/`origin/main` 创建 worktree。

**Architecture:** 将长期规则写入 `harness/core/policy/base.md`，让各平台入口通过现有 adapter render 继承。新增 Harness-owned CLI 预检命令，读取 Git 当前分支、upstream、默认分支和 dev/main 候选关系，输出推荐 base、base SHA 和风险提示。文档和测试只改 Harness 自有目录，不改 `harness/upstream/*`。

**Tech Stack:** Node.js ESM、`node:test`、Git CLI、Harness installer command dispatch、Markdown docs。

---

## Current State
Status: closed
Archive Eligible: yes
Close Reason: Worktree base preflight guardrail implemented and verified.

## File Structure

- Modify: `harness/core/policy/base.md` - 增加 worktree base preflight 规则。
- Create: `harness/installer/lib/git-base.mjs` - 封装 Git 信息读取、候选 base 判断和输出数据结构。
- Create: `harness/installer/commands/worktree-preflight.mjs` - 暴露 CLI 命令。
- Modify: `harness/installer/commands/harness.mjs` - 注册新命令并更新 usage。
- Create: `tests/installer/git-base.test.mjs` - 覆盖 base 选择算法，不依赖真实远端。
- Modify: `tests/adapters/templates.test.mjs` - 确认规则渲染进所有平台入口。
- Modify: `README.md` - 更新 workflow 和 upstream 隔离说明。
- Modify: `docs/maintenance.md` - 记录维护入口和 upstream update 不覆盖机制。
- Modify: `docs/release.md` - 记录 dev/main 工作流下的 worktree base 预检。
- Modify: `planning/active/worktree-base-preflight/*` - 同步本次 durable decisions、验证结果和进度。

## Tasks

### Task 1: Add Harness-owned Base Selection Logic

- [x] 新增 `harness/installer/lib/git-base.mjs`，实现纯函数 `recommendWorktreeBase()` 和 Git 采集函数。
- [x] 新增 `tests/installer/git-base.test.mjs`，覆盖 dev 优先、默认分支兜底、显式 base、候选 SHA 缺失风险。
- [x] 运行 `node --test tests/installer/git-base.test.mjs`，预期通过。

### Task 2: Expose CLI Preflight

- [x] 新增 `harness/installer/commands/worktree-preflight.mjs`。
- [x] 在 `harness/installer/commands/harness.mjs` 注册 `worktree-preflight`。
- [x] 用当前仓库运行 `./scripts/harness worktree-preflight`，预期推荐 `dev` 或当前开发分支，并输出 base SHA。

### Task 3: Add Core Policy Guard

- [x] 更新 `harness/core/policy/base.md` 的复杂任务编排部分，加入创建 worktree 前必须运行 base preflight、显式 start point、写回 Planning with Files 的规则。
- [x] 更新 `tests/adapters/templates.test.mjs`，确保所有平台渲染都包含该规则。
- [x] 运行 `node --test tests/adapters/templates.test.mjs`，预期通过。

### Task 4: Update README and Workflow Docs

- [x] 更新 `README.md`，说明 Harness 自有控制层如何保护该机制不被 upstream 更新覆盖，并补充 workflow 顺序。
- [x] 更新 `docs/maintenance.md`，说明 upstream update 后不用改 upstream skills，必要时只维护 core/installer。
- [x] 更新 `docs/release.md`，说明 dev/main 流程下创建 worktree 前先预检 base。

### Task 5: Verify and Sync Planning State

- [x] 运行 `npm run verify`。
- [x] 运行 `./scripts/harness worktree-preflight`。
- [x] 运行 `git diff --check`。
- [x] 更新 `findings.md` 和 `progress.md`，记录结论、验证结果和未修改 upstream 的事实。

## Finishing Criteria

- `npm run verify` 通过。
- `./scripts/harness worktree-preflight` 在当前 `dev` 工作区输出合理推荐 base。
- `git diff --check` 通过。
- `harness/upstream/superpowers` 和 `harness/upstream/planning-with-files` 没有被修改。

## Verification Summary

- `node --test tests/installer/git-base.test.mjs`: passed, 6 tests.
- `node --test tests/adapters/templates.test.mjs`: passed, 3 tests.
- `npm run verify`: passed, 38 tests.
- `./scripts/harness sync`: passed, synced 1 Codex target.
- `./scripts/harness worktree-preflight`: passed, recommended `dev @ beca3bf84be33a47c3fda0c7451b7d0a0b154432`.
- `./scripts/harness doctor`: passed.
- `git diff --check`: passed.
