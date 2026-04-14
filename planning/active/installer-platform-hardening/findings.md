# Findings & Decisions

## Requirements

- 只处理 HarnessTemplate 项目本身的优化，不处理 Jared 全局环境文件。
- 先用 `planning-with-files` 建立 task-scoped planning，再执行。
- A. 处理 `.harness/projections.json` 中 desired set 已不存在的 stale projection：
  - 要么 `sync` 自动垃圾回收；
  - 要么 `status`/`doctor` 显式报告；
  - 不能静默保留。
- B. CLI 安全性：
  - `harness.mjs --help`、`sync --help`、`verify --help` 必须真正显示帮助；
  - `sync` 需要 `--dry-run` 或 `--check`；
  - `verify` 需要 `--output` 或 stdout-only 模式，避免默认写 repo 内 untracked 报告。
- C. Claude shared skill root 语义要明确支持或明确不支持，不能实现和健康检查两套语义并存。
- D. Gemini 支持矩阵要明确支持或明确不支持，并同步 docs / metadata / tests。
- E. 更新 README、install docs、architecture、maintenance，并补最小必要测试。
- 测试不能依赖真实 home 环境，只能使用 fixture/test root。

## Research Findings

- `planning/active/cross-ide-projection-audit/` 和 `planning/active/cross-ide-hooks-projection/` 记录了当前 projection、health、status、hook 相关历史上下文，可作为本轮实现参考，但不应直接复用为当前任务。
- 代码入口集中在：
  - `harness/installer/commands/{harness,sync,status,doctor,verify}.mjs`
  - `harness/installer/lib/{state,health,paths,projection-manifest,skill-projection,fs-ops,metadata,adapters}.mjs`
  - `harness/core/metadata/platforms.json`
  - `harness/adapters/*/manifest.json`
- 当前文档已经声明 Codex、Copilot、Cursor、Claude Code 为支持平台；Gemini 在旧 planning 中只被提到“当前 supported targets 不包含 Gemini”。
- 现有测试目录有：
  - `tests/installer/*.test.mjs`
  - `tests/adapters/*.test.mjs`
  - `tests/helpers/harness-fixture.mjs`
- 顶层 `harness.mjs --help` 已安全返回 usage；但 `sync --help` / `verify --help` 当前会直接执行命令，因为各子命令没有自己的 help 分支。
- `sync.mjs` 当前流程是：
  - 读取 state 和 manifest；
  - 仅对当前 desired projections 执行写入；
  - 只做 `upsertProjectionEntry`；
  - 最后写回 manifest。
  这意味着旧 manifest entry 永远不会因为 desired set 缩小而被清理。
- `readHarnessHealth()` 只基于当前 desired entry/skills/hooks 生成健康结果，完全不知道 manifest 中是否残留 stale projection。
- `verify.mjs` 当前固定向 `reports/verification/latest.{json,md}` 写文件，没有 stdout-only 或自定义输出路径。
- `platforms.json` / `state.mjs` 目前只允许四个平台：`codex`、`copilot`、`cursor`、`claude-code`，没有 Gemini。
- Claude skill projection 当前实现是逐 skill path 校验：
  - `inspectLinkedSkill()` 要求每个 `targetPath` 本身是 symlink；
  - 如果 `.claude/skills` 整个目录被 symlink 到别处，子目录 `.../using-superpowers` 在健康检查里会表现为“不是 symlink”，但错误信息不够明确。
- 当前实现没有任何显式“shared skill root supported/unsupported”语义；只是通过逐 skill projection 的实现细节间接要求逐 skill link。

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| 先完成现状审计，再决定 A/C/D 的具体收敛方向 | 这三项都是行为语义问题，不能先写代码再补定义 |
| 不使用真实 home 路径做任何验证 | 用户明确禁止触碰全局目录，也要求 fixture/test root 覆盖 |
| planning 文件内容全部使用中文 | 遵循仓库 AGENTS 约束 |
| A 选择 `sync` 自动垃圾回收 stale projection，并让 `status`/`doctor` 可见其结果 | 仅报告 stale 会继续留下 Harness-owned 垃圾路径；自动 GC 更符合 installer 的 source-of-truth 角色 |
| C 选择“不支持 Claude 目录级 shared skill root” | 当前 projection/health 设计天然按逐 skill link 工作，强行支持 shared root 会扩大语义和测试面 |
| D 选择“Gemini 当前不支持” | metadata、adapter、state、tests 和安装文档都还没有 Gemini 闭环；明确不支持比半支持更诚实 |

## Implementation Outcome

- `sync` 现在会：
  - 基于 desired manifest 计算 `create` / `update` / `stale` diff；
  - 在真实执行时自动删除 stale entry/skill/hook-script；
  - 对 stale hook-config 做 marker 级清理，而不是盲删整个 config file；
  - 支持 `--dry-run` 与 `--check`。
- `verify` 现在会：
  - `--help` 只显示帮助；
  - 默认把 Markdown 报告打印到 stdout；
  - 只有显式 `--output=<directory>` 时才写 `latest.json` 和 `latest.md`。
- Claude Code:
  - 在 metadata 中显式声明 `sharedSkillRootSupported: false`；
  - health 对 `.claude/skills` 目录级 symlink 给出明确报错，而不是模糊的 “Expected a symlink.”
- Gemini:
  - 在 `harness/core/metadata/platforms.json` 中进入 `unsupportedPlatforms`；
  - `normalizeTargets()` 对 `gemini` 给出明确 `Unsupported target` 错误；
  - 文档明确说明 Harness 不会生成 Gemini installer-managed entry / skill root / user-global state。

## Modified Files

- `/Users/jared/HarnessTemplate/harness/installer/commands/harness.mjs`
- `/Users/jared/HarnessTemplate/harness/installer/commands/sync.mjs`
- `/Users/jared/HarnessTemplate/harness/installer/commands/verify.mjs`
- `/Users/jared/HarnessTemplate/harness/installer/lib/health.mjs`
- `/Users/jared/HarnessTemplate/harness/installer/lib/hook-config.mjs`
- `/Users/jared/HarnessTemplate/harness/installer/lib/metadata.mjs`
- `/Users/jared/HarnessTemplate/harness/installer/lib/projection-manifest.mjs`
- `/Users/jared/HarnessTemplate/harness/core/metadata/platforms.json`
- `/Users/jared/HarnessTemplate/tests/installer/commands.test.mjs`
- `/Users/jared/HarnessTemplate/tests/installer/health.test.mjs`
- `/Users/jared/HarnessTemplate/tests/installer/metadata.test.mjs`
- `/Users/jared/HarnessTemplate/tests/adapters/sync.test.mjs`
- `/Users/jared/HarnessTemplate/tests/adapters/sync-hooks.test.mjs`
- `/Users/jared/HarnessTemplate/README.md`
- `/Users/jared/HarnessTemplate/docs/architecture.md`
- `/Users/jared/HarnessTemplate/docs/maintenance.md`
- `/Users/jared/HarnessTemplate/docs/install/platform-support.md`
- `/Users/jared/HarnessTemplate/docs/install/claude-code.md`
- `/Users/jared/HarnessTemplate/docs/install/codex.md`
- `/Users/jared/HarnessTemplate/docs/install/cursor.md`

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| `fd` 在当前环境不可用 | 用 `rg --files` 和 `ls` 替代 |

## Resources

- /Users/jared/HarnessTemplate/AGENTS.md
- /Users/jared/HarnessTemplate/planning/active/cross-ide-projection-audit/task_plan.md
- /Users/jared/HarnessTemplate/planning/active/cross-ide-projection-audit/findings.md
- /Users/jared/HarnessTemplate/planning/active/cross-ide-projection-audit/progress.md
- /Users/jared/HarnessTemplate/planning/active/cross-ide-hooks-projection/findings.md
- /Users/jared/HarnessTemplate/harness/installer/commands/harness.mjs
- /Users/jared/HarnessTemplate/harness/installer/commands/sync.mjs
- /Users/jared/HarnessTemplate/harness/installer/commands/status.mjs
- /Users/jared/HarnessTemplate/harness/installer/commands/doctor.mjs
- /Users/jared/HarnessTemplate/harness/installer/commands/verify.mjs
- /Users/jared/HarnessTemplate/harness/installer/lib/health.mjs
- /Users/jared/HarnessTemplate/harness/installer/lib/state.mjs
- /Users/jared/HarnessTemplate/harness/core/metadata/platforms.json
- /Users/jared/HarnessTemplate/tests/installer/commands.test.mjs
- /Users/jared/HarnessTemplate/docs/install/platform-support.md

## Visual/Browser Findings

- 本轮没有使用浏览器或图像输入；所有发现均来自本地代码与 planning 文件。

## Task Metadata
- Task ID: installer-platform-hardening
- Planning Directory: /Users/jared/HarnessTemplate/planning/active/installer-platform-hardening
