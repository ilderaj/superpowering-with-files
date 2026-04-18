# Projection Health Analysis Findings

## Findings
- 当前工作区是 `/Users/jared/HarnessTemplate`，分支 `dev`，HEAD `8bea63695ce53ae1830dbe613e9007ce41fcbafe`。
- 另一个 worktree 位于 `/Users/jared/.config/superpowers/worktrees/HarnessTemplate/codex-hooks-projection`，分支 `codex/hooks-projection`，HEAD `d8da24d6382faf676c315059b001af3ebff0bc85`。
- `250ac99dabce16f54b94a9fd1f4829ac1db7e7a4` 是实际代码修正提交，修改了 `harness/core/skills/index.json`、`harness/core/metadata/platforms.json`、`harness/installer/lib/health.mjs` 和相关测试；它已经包含在 `dev` 和 `origin/main`，但不在 `codex/hooks-projection` worktree。
- `b51f1b1` 标题也叫 `Stabilize skill projections across IDE adapters`，但该提交只记录 planning 文件，不是实际代码修正；实际代码修正是小写标题的 `250ac99`。
- 当前 `dev` 的 skill metadata 已把 `superpowers` 和 `planning-with-files` 对 Codex、Copilot、Cursor、Claude Code 都设为 `materialize`。
- 当前 `dev` 的 platform metadata 已把 Codex skill root 从旧的 `.codex/skills` 调整到 `.agents/skills`，并标记为 `materialize-preferred`。
- 当前 `.harness/state.json` 的 `lastSync` 是 `2026-04-14T06:17:44.418Z`，早于 `250ac99` 的提交时间 `2026-04-14 23:02:38 +0800`，所以本机安装状态停在修正前。
- 当前 `.harness/projections.json` 仍记录旧的 `link` strategy 和旧 Codex target `/Users/jared/.codex/skills/*`。
- 实际文件系统状态与 health 报告一致：`/Users/jared/.agents/skills` 缺少 Harness 管理的 Codex projection；`/Users/jared/.copilot/skills`、`/Users/jared/.cursor/skills`、`/Users/jared/.claude/skills` 中多个 Harness skills 仍为 symlink。
- `./scripts/harness sync --dry-run` 显示无需代码修改即可修复当前安装状态：会创建 15 个 Codex materialized skills、更新 44 个旧 link projection、清理 15 个旧 Codex stale projection。
- 相关测试通过：`node --test tests/core/skill-index.test.mjs tests/installer/health.test.mjs tests/adapters/sync-skills.test.mjs tests/installer/paths.test.mjs`，共 36 个测试通过。

## 2026-04-17 Re-review
- 当前主工作区已经前进到 `/Users/jared/HarnessTemplate @ f5b100c468f4206cf1f9045b4251947d58c7cae5`，仍然包含 `250ac99`。
- 当前 `.harness/state.json` 已在 `2026-04-16T15:38:13.667Z` 完成一次新的 sync；虽然顶层仍写着 `"projectionMode": "link"`，但 `.harness/projections.json` 中 Codex/Copilot/Cursor/Claude Code 的 skill entries 都已是 materialized projection，Codex target 也已指向 `/Users/jared/.agents/skills/*`。
- `./scripts/harness doctor --check-only` 当前通过；唯一剩余提示是 `docs/superpowers/plans` 属于历史/人类文档路径 warning，不是 projection health failure。
- `./scripts/harness status` 当前对四个 IDE target 都返回 `status: "ok"`，`"problems": []`，说明 installer/health 对当前 user-global projection 的判断是健康。
- `/Users/jared/.agents/skills` 已存在并作为 Codex 的 Harness 管理 skill root；`/Users/jared/.claude/skills`、`/Users/jared/.cursor/skills`、`/Users/jared/.copilot/skills` 里的 sample skills 都是 materialized directories，不是旧 symlink。
- `/Users/jared/.codex/skills` 仍然存在，但当前只看到 `.system` 与 `codex-primary-runtime` 等非 Harness projection 内容；它不再承担 Harness user-global skill projection 的职责，因此其存在本身不构成 metadata mismatch。
- 旧 worktree `/Users/jared/.config/superpowers/worktrees/HarnessTemplate/codex-hooks-projection` 仍停留在旧逻辑：
  - `platforms.json` 里 Codex global root 仍是 `.codex/skills`
  - `skillsStrategy` 仍是 `link-preferred`
  - `index.json` 里的 projection 仍大多是 `link`
  这说明“如果从旧 worktree 观察，会看到旧世界；如果从主工作区观察，会看到新世界”。
- 当前 `./scripts/harness sync --dry-run` 的 diff 不再是“create 15 / stale 15”，而是 `update: 55, unchanged: 8`。抽样比对显示：
  - `using-superpowers` 在 Codex/Claude Code projection 上与 upstream 一致。
  - `planning-with-files` 在 Copilot projection 上属于预期 patch 差异，且伴随 `__pycache__` 二进制差异。
  因此这批 `update` 更像是“已安装 materialized 副本与当前 repo HEAD 有内容漂移，等待下一次 sync”，不是路径/策略层面的 metadata 不一致。

## Governance Judgment
- 当前**不需要**对 projection metadata、installer 路径策略、health 判定再做一轮“重治理”。主路径已经健康，核心代码修正已落地并已投影到本机 user-global 安装状态。
- 当前**建议做**一轮“轻治理”，目标是减少误审和重复排障，而不是修代码：
  1. 明确审计基准工作区：以后只从包含最新 projection 修正的主工作区运行 `status` / `doctor` / `sync`。
  2. 处理旧 worktree：要么合并到 `dev`，要么标记为历史实验分支并避免再用于 projection 操作。
  3. 在文档中明确两件事：
     - metadata/skill 内容变更后，本机 projection 只有在再次 `sync` 后才会更新。
     - `docs/superpowers/plans/**` warning 和 `/Users/jared/.codex/skills` 的存在，不应被误判为 Harness projection unhealthy。
  4. 如果这种混淆反复发生，再考虑补一个 CLI/doctor 文案治理，把 `.harness/state.json` 顶层 `projectionMode` 的语义解释清楚，避免被误读成“当前实际仍在 link 模式”。

## Conclusion
- 之前关于“未同步导致 unhealthy”的判断，在当时是对的；但到 2026-04-17 这轮复核时，已经不是当前事实。
- 当前主工作区和本机 user-global projection 已与现行 metadata 对齐，健康检查通过。
- 现存问题主要是**审计视角不一致**与**操作语义容易误读**，尤其是旧 worktree 和 `.harness/state.json` 顶层字段会误导人工判断。
- 因此推荐的是**轻治理**，不推荐继续把它当成 projection core bug 去重构。

## Repair Plan
1. 先做操作治理，不急着改 projection core：
   - 约定 `/Users/jared/HarnessTemplate` 为 projection 审计和 sync 的 canonical workspace。
   - 禁止从 `/Users/jared/.config/superpowers/worktrees/HarnessTemplate/codex-hooks-projection` 执行 `./scripts/harness status|doctor|sync`。
2. 清理或收敛旧 worktree：
   - 方案 A：把 `codex/hooks-projection` rebase/merge 到当前 `dev`。
   - 方案 B：保留分支但在其 planning/doc 中标记“历史 worktree，不用于 projection 运维”。
3. 补充一段轻量文档/运行手册：
   - metadata 或 skill 内容变更后，重新运行 `./scripts/harness sync`。
   - 用 `./scripts/harness doctor --check-only` 判断健康，用 `./scripts/harness sync --dry-run` 判断待同步内容。
   - `docs/superpowers/plans` warning 不是 failure；`/Users/jared/.codex/skills` 的非 Harness 内容不是 stale projection。
4. 仅在未来再次发生误判时，再考虑产品级治理：
   - 优化 `status`/`doctor` 文案，解释 `.harness/state.json.projectionMode` 与 effective per-skill strategy 的差异。
   - 视需要新增针对“旧 worktree 误用”的 docs/test coverage。

## References
- `/Users/jared/HarnessTemplate`
- `/Users/jared/.config/superpowers/worktrees/HarnessTemplate/codex-hooks-projection`
- `/Users/jared/HarnessTemplate/harness/core/skills/index.json`
- `/Users/jared/HarnessTemplate/harness/core/metadata/platforms.json`
- `/Users/jared/HarnessTemplate/harness/installer/lib/health.mjs`
- `/Users/jared/HarnessTemplate/.harness/state.json`
- `/Users/jared/HarnessTemplate/.harness/projections.json`
