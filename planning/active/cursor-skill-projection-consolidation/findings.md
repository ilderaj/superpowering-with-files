# Findings & Decisions

## Requirements
- 详细研究 Cursor 官方文档。
- Cursor 能力判断以官方文档为唯一事实源。
- 判断 Cursor 是否已经支持 `.agents/skills`。
- 如果支持，判断是否可以合并 Cursor、Copilot 和 Codex 的 skill projection。
- 如果可以，产出详细 implementation plan。
- 不执行 plan，先交给用户 review。
- 追加要求：修复 planning files 的时间头回归，不能只修当前文档内容；必须定位生成逻辑、添加回归测试，并反复验证到不会再出现只有日期和 `UTC+8` 的格式。

## Research Findings
- 当前 `planning/active/cursor-skill-projection-consolidation/progress.md` 复现了缺陷：Session heading、Started 字段和 Error Log 时间戳均只写日期与 `UTC+8`，缺少 `HH:mm:ss`。
- 仓库中存在正确格式样例，例如其他 active progress 文件使用 `YYYY-MM-DD HH:mm:ss UTC+8`，说明目标格式不是未知，而是当前生成路径退化或缺少守护测试。
- `https://docs.cursor.com/context/skills` 和 `https://docs.cursor.com/en/context/skills` 会重定向到 `https://cursor.com/docs`；Cursor 官方文档主域名当前为 `cursor.com/docs`。
- `https://cursor.com/docs` 的 “Customize Cursor” 入口文案明确提到 “Use rules, skills, and prompts that match how your team works”，链接指向 `https://cursor.com/docs/rules`。
- `https://cursor.com/docs/rules` 明确描述 Rules，并列出四类规则：Project Rules、User Rules、Team Rules、AGENTS.md。
- `https://cursor.com/docs/rules` 明确说明 Project Rules 存放在 `.cursor/rules`，`AGENTS.md` 可放在项目根目录和子目录。
- `https://cursor.com/docs/context/skills` 页面存在但正文抽取失败；需要继续从官方 HTML/静态数据确认 skills 正文。
- `https://cursor.com/docs/skills` 是 Cursor 官方 Agent Skills 文档的 canonical 页面。
- Cursor 官方文档定义 Agent Skills 为 “open standard for extending AI agents”，用于包装 domain-specific knowledge、workflows、scripts、templates 和 references。
- Cursor 官方文档明确说 Cursor 启动时会从 skill directories 自动发现 skills，并由 Agent 根据上下文决定相关性；也支持在 Agent chat 中输入 `/` 手动调用。
- Cursor 官方文档明确列出的自动加载路径包括 `.agents/skills/`、`.cursor/skills/`、`~/.agents/skills/`、`~/.cursor/skills/`。
- Cursor 官方文档明确说为了兼容性还会从 Claude 和 Codex 目录加载 skills：`.claude/skills/`、`.codex/skills/`、`~/.claude/skills/`、`~/.codex/skills/`。
- Cursor 官方文档明确每个 skill 应是包含 `SKILL.md` 的文件夹，且 `SKILL.md` 使用 YAML frontmatter；必填字段为 `name` 和 `description`。
- Cursor 官方文档明确 `paths` 是新的文件作用域字段；legacy `globs` 仍作为旧 skills fallback 接受，但新 skills 应使用 `paths`。
- Cursor 官方文档明确支持 `disable-model-invocation: true`，用于让 skill 只在 `/skill-name` 手动调用时进入上下文。
- Cursor 官方文档明确支持 `scripts/`、`references/`、`assets/` 可选目录。
- Cursor 官方文档明确 Cursor 会递归扫描 skill root，并会拾取任意 `SKILL.md`；也会发现仓库子目录中的 `.cursor/skills/` 或 `.agents/skills/`，并自动按该子目录作用域限制。
- 当前仓库的 Cursor/Copilot/Codex skill projection 根路径来自 `harness/core/metadata/platforms.json` 的 `skillRoots`。
- 当前 `harness/core/metadata/platforms.json` 中 Codex 和 Copilot 都使用 `.agents/skills` / `~/.agents/skills`，Cursor 使用 `.cursor/skills` / `~/.cursor/skills`。
- `harness/installer/lib/paths.mjs` 只按 metadata 解析 skill root；没有 hard-coded Cursor skill path，适合通过 metadata 收敛。
- `harness/installer/lib/skill-projection.mjs` 的 `coalesceSkillProjections` 已能按相同 `targetPath` 合并多个 target 的 skill projection，并合并 patch 列表。
- `harness/installer/commands/sync.mjs` 已在所有 target 的 raw skill writes 收集后调用 `coalesceSkillProjections`，因此 Cursor 改到 `.agents/skills` 后可自然与 Codex/Copilot 合并。
- `tests/adapters/skill-projection.test.mjs` 当前多处断言 Cursor skill target path 为 `.cursor/skills/...`，需要更新为 `.agents/skills/...`，并新增三 target coalesce 断言。
- `tests/adapters/sync-skills.test.mjs` 当前已有 Codex+Copilot coalesce 测试；需要扩展到 Codex+Copilot+Cursor，并更新 all-target planning skill path expectation。
- `tests/installer/paths.test.mjs` 当前断言 Cursor skill target roots 为 `.cursor/skills` / `~/.cursor/skills`，需要改为 `.agents/skills` / `~/.agents/skills`。
- `docs/architecture.md` 当前仍写着 Cursor stays on `.cursor/skills` until official contract is re-verified；该条件已被官方 docs research 满足，需要更新。
- `docs/install/cursor.md` 已承认 Cursor 官方 docs 同时列出 `.cursor/skills` 和 `.agents/skills`，但仍称 Harness 以 `.cursor/skills` 为 primary；需要更新为共享 `.agents/skills` primary，并将 `.cursor/skills` 表述为官方兼容发现路径。
- 当前仓库同时跟踪 `.agents/skills` 和 `.cursor/skills` 两套投影目录，各约 412 个 tracked files；实现阶段若归并 projection，应包含删除 tracked `.cursor/skills` 生成副本或由 sync/manifest 流程清理 stale projection 的明确步骤。
- `.harness/` 被 `.gitignore` 忽略，因此 projection manifest 不是 repo 文档的一部分；测试需要通过 fixture state/manifest 验证合并行为。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Cursor 支持判断只引用 docs.cursor.com | 用户明确限定官方文档唯一事实源 |
| 初步判断 Cursor 已支持 `.agents/skills` | Cursor 官方 `https://cursor.com/docs/skills` 明确将 `.agents/skills/` 列为 Project-level 自动加载目录 |
| 建议归并 Cursor、Copilot、Codex skill projection 到 `.agents/skills` / `~/.agents/skills` | Cursor 官方文档已支持共享路径；现有 coalesce 机制可直接减少重复 projection，Claude Code 仍保留 `.claude/skills` |
| 不建议改变 Cursor rule entry 或 hook root | 官方 skills 支持只影响 skill discovery；Cursor rules 仍是 `.cursor/rules`，hooks 仍是 `.cursor` adapter surface |
| 建议泛化 Copilot planning-with-files root patch | 三个 target 共享同一个 materialized skill 后，shared copy 应尽量保持 target-neutral；保留 `GITHUB_COPILOT_SKILL_ROOT` 作为兼容覆盖 |

## Companion Plan
- Path: docs/superpowers/plans/2026-05-10-cursor-skill-projection-consolidation.md
- Summary: 详细实现计划已覆盖官方事实、metadata 变更、shared planning root patch、`.cursor/skills` tracked 副本移除、测试和文档更新。
- Sync-back status: complete

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 当前 shell 环境没有 `rg`，导致第一次 HTML 文本提取失败 | 改用系统自带 `grep` 继续只针对 Cursor 官方页面提取内容 |
| 当前 planning 时间头回归为仅日期 | 正在按系统化调试流程复现、定位生成路径并补自动化回归测试 |

## Destructive Operations Log
| Command | Target | Checkpoint | Rollback |
|---------|--------|------------|----------|
| `git rm -r .cursor/skills` | `.cursor/skills/**` tracked generated projection tree | `/Users/jared/.agent-config/checkpoints/202605101418-cursor-skill-projection-consolidation-001/2026-05-10T15-21-17Z` | `git restore --staged --worktree .cursor/skills` before commit, or restore from the recorded checkpoint bundle if broader recovery is needed |

## Resources
- https://cursor.com/docs
- https://cursor.com/docs/rules
- https://cursor.com/docs/context/skills
- https://cursor.com/docs/skills
- docs/superpowers/plans/2026-05-10-cursor-skill-projection-consolidation.md

## Visual/Browser Findings
- 不适用。

## Findings Record: 2026-05-10 22:10:28 UTC+8

### Timestamp Root Cause

- Root cause: the script/tooling path was already protected (`planning_record.py`, `init-session.sh`, `harness record`, and progress templates all produce or require `YYYY-MM-DD HH:mm:ss UTC+8`), but the projected planning-with-files `SKILL.md` did not contain a prominent manual timestamp guard. Agents could read the skill body and directly edit planning files from the date-only system date without opening the template or record helper.
- Regression test: added `sync materializes planning-with-files skill with mandatory dated record guidance` to `tests/adapters/planning-record-time.test.mjs`; the test first failed because synced `SKILL.md` lacked `Manual timestamp guard`.
- Fix: added `Manual timestamp guard` to `harness/upstream/planning-with-files/SKILL.md`, mirrored it into `harness/core/upstream-overlays/planning-with-files/SKILL.md`, and updated current tracked top-level projections under `.agents`, `.cursor`, and `.claude` so the active workspace immediately exposes the guard.
- Verification: `node --test tests/adapters/planning-record-time.test.mjs` now passes 5/5 tests, including init-session, planning_record.py, template guidance, and the new skill-body guidance regression.
- Current document cleanup: legacy date-only records in this task's progress file were normalized to explicit `2026-05-10 00:00:00 UTC+8` timestamps because the original exact time was not recoverable from the bad records.

## Findings Record: 2026-05-10 22:19:04 UTC+8

### Execution Bootstrap

- 当前原始 checkout 位于 `dev`，不是 linked worktree；已按 harness preflight 建议创建隔离 worktree：`.worktrees/202605101418-cursor-skill-projection-consolidation-001`。
- Worktree base 已固定记录为 `dev @ 8be83eada6ebb7d0637d3f2cedd0d24bc1bb3d4e`；后续 merge/finish 判断应以这个 base 为准，而不是临时猜测 `main`。
- `.gitignore` 已忽略 `.worktrees/`，因此 project-local worktree 不会污染仓库跟踪状态。
- 在隔离 worktree 内运行 `npm install` 与 `npm run verify` 均通过，说明 companion plan 的实现可以从干净基线开始。
- 当前 repo 中已有对应 active task 目录 `planning/active/cursor-skill-projection-consolidation/`，因此继续复用该任务记忆，而不新建 task id。

## Findings Record: 2026-05-10 22:35:47 UTC+8

### Task 1 Review Outcome

- Task 1 已按 plan 把 Cursor shared-root 合同写进 4 个测试文件，并成功制造预期 red 状态。
- 规格评审确认 Task 1 覆盖了 plan 要求的全部测试面：路径解析、projection path、三目标 coalesce、fresh-sync 旧副本缺席、stale cleanup、health display-duplicate。
- 代码质量评审提出两点建议，但都不应采纳：
  - stale cleanup 用手工旧 manifest/目录模拟更贴近本次已批准 plan；plan 明确要求“simulate a previous Harness-managed `.cursor/skills` projection in `.harness/projections.json`”。
  - fresh-sync 缺席断言必须保持在 `lstat('.cursor/skills/planning-with-files/SKILL.md')`，因为 companion plan 给了明确断言形式；扩成目录级断言会偏离已批准规格。
- 决策：Task 1 视为完成，不为迎合 reviewer 建议而偏离已批准 companion plan。

## Findings Record: 2026-05-10 22:43:33 UTC+8

### Task 2 Boundary Confirmation

- 仅通过 `harness/core/metadata/platforms.json` 中 Cursor `skillRoots` 的单点变更，就把 Task 1 的大部分 red 用例从 7 个降到只剩 1 个，证明根路径归并主要由 metadata 驱动。
- 剩余失败集中在 stale Cursor projection cleanup，用例本身正是后续 Task 3/4 负责的迁移清理语义，因此不应把它算作 Task 2 未完成。
- 代码质量评审里提到的“health test 超出 Task 2 范围”并不是 Task 2 的问题，而是 Task 1 已批准测试面的既有 diff；不应因此回退 Task 1。
- 决策：Task 2 视为完成，Task 3 开始处理 shared planning-with-files patch 和 sync patch wiring。

## Findings Record: 2026-05-10 23:20:49 UTC+8

### Stale Cleanup Root Cause

- `sync removes stale Harness-managed Cursor skill projections after shared root migration` 的失败并不是 stale manifest 没被识别；`diff.stale` 已正确识别旧 `.cursor/skills/planning-with-files` 记录。
- 根因在 `harness/installer/commands/sync.mjs` 的 session-boundary 判断：manifest 里的 stale `targetPath` 经 `path.resolve()` 变成 `/var/...`，而 `process.cwd()` 在 macOS 临时目录环境下是 `/private/var/...`。
- 因为 `isManagedSessionBoundary()` 只比较未 canonicalize 的路径字符串，同一真实目录被误判为不同边界，导致 stale cleanup 被当作“越界路径”跳过，旧文件完全没删。
- 这解释了为什么 sync 摘要显示 `stale=1`，但旧 `SKILL.md` 内容仍保持原始 `old cursor projection` 文本不变。
- 决策：最小修复应是把 session-boundary 比较改为 canonical path 比较，而不是修改 stale manifest 或 cleanup 策略。

## Findings Record: 2026-05-11 00:42:44 UTC+8

### Final Hardening and Merge Outcome

- 在 reviewer 发现 tracked `.agents/skills/planning-with-files/SKILL.md` 仍残留旧 Copilot patch 后，定位到 shared helper 只会追加 shared block，不会清理 legacy Copilot block，也不会修复旧 shared block 里的过时内容。
- `applyPlanningWithFilesSkillRootPatch` 最终改为：先移除 legacy Copilot block，再移除已有 shared block，然后注入一份 canonical shared block，并重写 lingering `COPILOT_PLANNING_WITH_FILES_ROOT` 引用。
- 同一次 hardening 还把 Windows PowerShell 示例从 Claude-only `session-catchup.py` 路径改成 shared-root candidate 解析，避免共享 skill 在 Windows 上误指向 `.claude/skills`。
- 新增回归测试覆盖 legacy-only materialized copy、mixed legacy/shared copy，以及 shared skill content 不再直接写死 Claude Windows path。
- tracked `.agents/skills/planning-with-files/SKILL.md` 已用修复后的 helper 重新 materialize；`docs/compatibility/copilot-planning-with-files.md` 与 `docs/architecture.md` 也已同步到 shared patch 语义。
- 最终集成结果：feature commit `5fc4d2d` 已本地合并进 `dev`，merge commit 为 `522e7ae`；临时 worktree 已移除，feature branch 已删除。

## Findings Record: 2026-05-11 11:13:30 UTC+8

### Final Pre-Push Audit Outcome

- 推送前复查确认 Cursor `skillRoots` 已归并到 `.agents/skills`，同时 `.cursor/rules/harness.mdc` entry 与 `.cursor` hook root 未被误改。
- `.cursor/skills/**` 的 412 个 tracked generated projection 删除符合 approved plan，当前工作区仍保留 `.cursor/rules/**`。
- `applyPlanningWithFilesSkillRootPatch` 已覆盖 legacy-only 与 mixed materialized copy 场景，shared skill root block 会清理旧 Copilot block，并保留 `HARNESS_AGENT_SKILL_ROOT` / `GITHUB_COPILOT_SKILL_ROOT` 兼容 fallback。
- stale cleanup 修复限定在 canonical session-boundary 比较，删除前仍经过 managed manifest 与 root/home boundary 检查，没有扩大到非 Harness-owned 路径。
- 独立只读审计未发现阻断问题；本轮 fresh verification 结果为 focused suite 110/110 pass、`npm run verify` 367/367 pass、`git diff --check` clean。
- 决策：实现符合预期；剩余 4 个 planning/companion markdown 文件只记录最终状态，应作为 closeout commit 提交并推送 `dev`。
