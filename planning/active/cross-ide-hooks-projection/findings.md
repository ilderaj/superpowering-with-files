# cross-ide-hooks-projection 调研记录

## 当前结论

- 当前 Harness 默认不安装 hooks；`docs/compatibility/hooks.md` 明确要求 hook installation 必须显式选择。
- 当前 `sync` 只渲染入口文件，不投射 skills，也不投射 hooks。
- `harness/installer/lib/skill-projection.mjs` 目前只返回 `link`/`materialize` 策略元数据，尚未接入 `sync`。
- `harness/upstream/planning-with-files/SKILL.md` 当前 baseline 刻意不依赖 frontmatter hooks，稳定契约是 task-scoped Markdown workflow 和 helper scripts。
- `harness/upstream/superpowers/hooks/` 当前 baseline 带 `SessionStart` hook：
  - Claude Code: `hooks/hooks.json`，事件名 `SessionStart`，matcher `startup|clear|compact`。
  - Cursor: `hooks/hooks-cursor.json`，事件名 `sessionStart`。
  - 脚本 `hooks/session-start` 会根据环境输出 Claude Code、Cursor 或 Copilot CLI 风格的 context JSON。
- `.harness/upstream-candidates/planning-with-files/` 存在上游候选 hook 配置，但还没有合并为 Harness 默认行为：
  - Claude-style `SKILL.md` frontmatter: `UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop`。
  - Cursor: `.cursor/hooks.json` 和 `.cursor/hooks/*.sh|*.ps1`。
  - GitHub Copilot: `.github/hooks/planning-with-files.json` 和 `.github/hooks/scripts/*.sh|*.ps1`，包含 `sessionStart`、`preToolUse`、`postToolUse`、`agentStop`、`errorOccurred`。
  - Gemini 和 MastraCode 也有 hooks，但当前 Harness supported targets 只有 Codex、GitHub Copilot、Cursor、Claude Code；本次计划只覆盖现有四个目标，保留扩展点。

## 架构判断

- 不应直接修改 `harness/upstream/superpowers` 或 `harness/upstream/planning-with-files` 来适配本项目策略；这些目录是可替换的 upstream baseline。
- hook 路径转换必须放在 Harness-owned 层，例如 `harness/core/hooks` 和 `harness/installer/lib/hook-projection.mjs`。
- `planning-with-files` 的上游候选 hooks 多数读取项目根目录 `task_plan.md`，与 Harness 的 `planning/active/<task-id>/task_plan.md` 规则冲突，必须通过 Harness-owned wrapper 转换为 task-scoped 路径。
- hook 安装应继续默认关闭，通过显式 `--hooks=on` 或等价状态开启，避免默认改写 IDE/agent 全局行为。
- sync 的目标行为应是：
  - 始终渲染入口文件。
  - 按目标投射 skills。
  - 只有 `hookMode: "on"` 时投射 hooks。

## Worktree base

- Worktree base: `dev @ 50b74ab2deca894e62810096b8c41b18336f5ad2`
- 推断依据：`./scripts/harness worktree-preflight` 报告当前分支 `dev` 是 non-trunk branch，应保留当前开发上下文。

## 需要验证的边界

- `npm run verify` 必须通过。
- `./scripts/harness install --targets=codex,copilot,cursor,claude-code --scope=workspace --hooks=on` 后，`./scripts/harness sync` 应在临时测试根目录里创建入口文件、skills 和 hooks。
- `--hooks=off` 或默认安装不得创建 hook config/scripts。
- Copilot 的 `planning-with-files` 不应复用 Claude/Cursor 的 frontmatter hook；应 materialize 到 `.github/skills/planning-with-files` 并安装 `.github/hooks/planning-with-files.json`。
- Cursor 应安装 `.cursor/hooks.json` 和 `.cursor/hooks/*.sh`；Windows variant 可先通过计划中的 schema 保留，但首轮实现必须至少支持 POSIX scripts。
- Claude Code 应安装 `superpowers` 的 `hooks.json` 和 `hooks/`，并为 `planning-with-files` 提供兼容 task-scoped wrapper，而不是恢复上游 root-level `task_plan.md` 假设。

## 2026-04-13 skills projection 分析

- 本轮目标从单纯 hooks 扩展为“entry + skills governance harness”。当前计划目录继续复用 `planning/active/cross-ide-hooks-projection/`，避免创建重复任务状态。
- `harness/installer/lib/skill-projection.mjs` 目前只返回 `{ skillName, target, strategy, source, patch }`，没有 target install path，也没有执行 link/materialize。
- `harness/installer/commands/sync.mjs` 当前只渲染 entry files：
  - 调用 `loadAdapter`、`renderEntry`、`entriesForScope`；
  - 对 entry 调用 `writeRenderedFile`；
  - 完全没有调用 `projectionForSkill` 或任何 skills 文件系统操作。
- `harness/installer/commands/doctor.mjs` 当前只检查 state 里 `config.paths` 指向的 entry 文件是否存在，以及 entry 内容是否包含个人绝对 home path；不会检查 skills source、symlink target、materialized copy 或 Copilot patch 结果。
- `harness/installer/commands/status.mjs` 当前只是输出 `.harness/state.json`，无法展示每个 IDE 的 entry + skills 状态。
- `harness/installer/lib/fs-ops.mjs` 当前 `writeRenderedFile`、`materializeFile`、`linkPath` 都会先 `rm(targetPath, { recursive: true, force: true })`；这会无条件覆盖用户已有本地文件，必须改成 Harness-owned path 可替换、非 Harness-owned path 备份或拒绝。
- `harness/core/metadata/platforms.json` 只有 entryFiles 和 skillsStrategy，没有每个平台实际读取 skills 的 workspace/global root。
- `harness/core/skills/index.json` 已声明：
  - `superpowers` baseline 为 `harness/upstream/superpowers/skills`，所有 target 默认 link；
  - `planning-with-files` baseline 为 `harness/upstream/planning-with-files`，Copilot 为 materialize，其它 target link；
  - Copilot patch 只是文档 `harness/core/skills/patches/copilot-planning-with-files.patch.md`，没有可执行 patch/materialize 逻辑。
- `update` 当前只把 `.harness/upstream-candidates/<source>` 应用到 `harness/upstream/<source>`，不会直接同步 IDE 目录。正确架构应保持 update 只更新 baseline；后续 `sync` 从更新后的 baseline 重新投影 skills。
- `.harness/upstream-candidates/planning-with-files` 中有 Copilot `.github/skills/planning-with-files` 和 `.github/hooks/planning-with-files.json` 候选实现，但这些 hooks 默认读取项目根 `task_plan.md`，不符合 Harness task-scoped `planning/active/<task-id>/` 规则。可以借鉴目录约定，不能原样投射。
- 本轮实现应优先完成 skills projection 和状态可见性；hooks 只纳入 Copilot planning-with-files materialize 的最低闭环，避免把整个可选 hooks 系统扩大为本阶段阻塞项。

## 建议的 skills 目标路径契约

- Codex:
  - workspace skill root: `.codex/skills`
  - user-global skill root: `~/.codex/skills`
- GitHub Copilot:
  - workspace skill root: `.github/skills`
  - user-global skill root: `~/.copilot/skills`
  - `planning-with-files` 必须 materialize 到 `<skillRoot>/planning-with-files`。
- Cursor:
  - workspace skill root: `.cursor/skills`
  - user-global skill root: `~/.cursor/skills`
- Claude Code:
  - workspace skill root: `.claude/skills`
  - user-global skill root: `~/.claude/skills`

这些路径应进入 `harness/core/metadata/platforms.json`，由 `paths.mjs` 统一解析，不能散落在 `sync`、`doctor` 或测试里。

## 冲突处理契约

- Harness 写入的 entry 文件和 skills projection 应写入 sidecar manifest，例如 `.harness/projections.json`。
- 如果目标路径不存在，可以创建。
- 如果目标路径是当前 manifest 记录的 Harness-owned path，可以替换。
- 如果目标路径是符号链接且指向当前期望 source，可以视为 healthy。
- 如果目标路径存在但不在 manifest 中：
  - 默认拒绝覆盖并报错；
  - 支持显式 `--conflict=backup` 时先重命名为 `<name>.harness-backup-<timestamp>`，再写入新投影。
- 不应继续使用无条件 `rm -rf` 作为默认写入策略。

## 执行 worktree

- 执行前重新运行 `./scripts/harness worktree-preflight`，当前 base 更新为 `dev @ 7c5bcfe4eb61f3b23ab82bc21bec78c7a727bfe4`。
- 创建隔离 worktree：`/Users/jared/.config/superpowers/worktrees/HarnessTemplate/codex-entry-skills-governance`。
- 执行分支：`codex/entry-skills-governance`。
- Baseline verification：`npm run verify` 通过，38 tests passed。

## 2026-04-13 更新后计划复核

- 当前分支：`dev @ d7dfcf86f952545a026ea26f4965e35e78a261cc`。
- 新增提交：
  - `8587b66 feat: project skills through harness sync`
  - `d7dfcf8 Refine README projection docs`
- 当前工作区干净，无未提交源码改动。
- 已落地能力：
  - `sync` 现在渲染 entry files 后执行 `planSkillProjections`。
  - `sync` 使用 `.harness/projections.json` 记录 Harness-owned paths。
  - `sync --conflict=backup` 支持备份非 Harness-owned path。
  - `planning-with-files` 在 Copilot 下 materialize 并执行 `Harness Copilot planning-with-files patch`。
  - `doctor/status` 已基于 `readHarnessHealth` 展示 entries + skills 健康状态。
- 尚未落地能力：
  - state 里没有 `hookMode`。
  - platform metadata 里没有 `hookRoots`。
  - skill index 里没有 hook descriptors。
  - installer 里没有 `hook-projection.mjs` 或 hook config merge 逻辑。
  - `sync` 不安装 hook configs/scripts。
  - `doctor/status` 不报告 hooks 状态。
- 计划结论：
  - 原 Task 1-9 已经是完成历史，不应重复执行。
  - 需要从 Task 10 开始追加 hooks projection addendum。
  - hooks 实现必须复用现有 projection manifest 和 conflict policy，不能新增第二套 ownership 系统。
  - 因为 `superpowers` 和 `planning-with-files` 可能写入同一个 IDE hook config，必须先设计结构化 merge，不能简单 materialize 覆盖。

## 2026-04-13 hooks execution findings

- Codex hook adapter 保持 `unsupported`：当前仓库没有可验证的 Codex hook config schema 或 upstream hook 文件，因此不伪造 Codex hook 安装。
- 最终 hook 支持矩阵：
  - `planning-with-files`: Copilot、Cursor、Claude Code supported；Codex unsupported。
  - `superpowers`: Cursor、Claude Code supported；Codex、Copilot unsupported。
- Copilot 的 hook root 本身是 `.github/hooks`，因此 planning hook script 目标路径应为 `.github/hooks/task-scoped-hook.sh`，不是 `.github/hooks/hooks/task-scoped-hook.sh`。
- `task-scoped-hook.sh` 不能使用 Bash 4+ 的 `mapfile`。macOS 自带 `/bin/bash` 3.2 不支持该内建；脚本已改为临时文件计数方式，兼容 macOS 默认 Bash。
- `task-scoped-hook.sh` 使用 Node 做 JSON escaping，而不是额外依赖 `python3`。Harness 本身已经要求 Node，因此该运行时假设更小。
- planning-with-files hook 只读取 `planning/active/<task-id>/task_plan.md` 和 `progress.md` 的有限上下文，不读取项目根 planning 文件，也不在 stop/error hook 中执行归档。
- Hook config merge 使用 `Harness-managed ... hook` 描述作为 managed marker；同 skill 的旧 Harness-managed hook 会被替换，用户自定义 hook entry 会保留。
- `doctor`/`status` 报告 unsupported hook adapter，但 unsupported 不进入 health problems，不阻塞 `doctor --check-only`。

## 2026-04-13 README materialize/link 说明

- `planning-with-files` 是 Harness 的 durable task-state system；GitHub Copilot 这一份 materialized copy 是为了避免 symlinked external skill directories 在 Copilot/VS Code/GitHub/远程环境里无法稳定索引。
- 其它 skill baselines 默认继续使用 link，以保留单一 upstream source 并降低维护成本。
- README 应明确该差异是平台可靠性取舍，不是投影表配置遗漏。
