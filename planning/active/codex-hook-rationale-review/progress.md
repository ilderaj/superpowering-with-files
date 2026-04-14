# Codex Hook 覆盖依据复核进度

## 2026-04-14

- 新建任务目录，隔离本轮关于 `Codex hooks` 覆盖依据的分析。
- 已复读旧任务：
  - `planning/active/cross-ide-hooks-projection/`
  - `planning/active/cross-ide-projection-audit/`
- 当前重点：
  - 验证旧结论是否仍然成立；
  - 补齐 `Codex` 官方能力依据；
  - 明确当前 hooks 清单和实际影响。
- 已完成关键核对：
  - OpenAI 官方 Codex hooks 文档已可访问，并明确给出 `~/.codex/hooks.json`、`<repo>/.codex/hooks.json`、事件集合和 feature flag。
  - OpenAI 官方 Codex skills 文档已明确改为 `.agents/skills` / `~/.agents/skills`。
  - 本仓库当前代码仍把 `Codex` hooks 标记为 unsupported，并把 skill root 写成 `.codex/skills`。
- 当前判断：
  - 旧设计在当时证据不足的情况下合理；
  - 但现在 Codex adapter 已经出现官方能力漂移，需要重新设计。
- 已产出 implementation plan：
  - 路径：`planning/active/codex-hook-rationale-review/task_plan.md`
  - 范围包括 Codex hooks 接入、Codex 官方 skill root 纠偏、现有 Copilot/Cursor/Claude hooks projection 和 health/status 加固、以及文档矩阵同步。
- 根据用户追加要求，计划需要再收紧一次：
  - 只允许使用官方文档中的 hooks 事实作为设计前提；
  - Cursor 因缺少可直接引用的官方 docs 级 hooks 细节，后续计划不能再默认沿用现有路径/事件/schema 假设。
- 2026-04-15 执行前复读发现计划有执行缺口，已修正：
  - 任务级 `git commit` 改为 checkpoint，避免与最终提交重复。
  - Cursor evidence gate 改为可验证的 `evidenceLevel: "provisional"` 断言。
  - 记录 worktree base 和主工作区计划文件迁移要求。
- Worktree base: `dev @ c4297b928f6e0e0d9d7825c123d008b60d59637e`。
- 实现执行结果：
  - Codex `planning-with-files` hook adapter 已接入 `.codex/hooks.json` 和 `.codex/hooks/*`。
  - Codex `superpowers` session-start hook 已通过 Harness-owned wrapper 接入。
  - Cursor hook projection 保持现有行为，但 health 输出标记为 `evidenceLevel: "provisional"`。
  - Hook health 新增 required event 校验。
- 验证：
  - Targeted hook suite 通过。
  - `node --test tests/hooks/*.test.mjs` 通过。
  - `npm run verify` 通过，111 tests passed。
  - `git diff --check` 通过。
