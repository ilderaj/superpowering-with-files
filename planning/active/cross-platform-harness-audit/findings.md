# Findings & Decisions

## Requirements
- 检查当前 harness 在 Linux 与 Windows 下是否仍有效。
- 找出仍然依赖 macOS 的实现假设。
- 说明需要兼容或补齐的地方。

## Research Findings
- 初步入口已定位到 `scripts/harness/`、`harness/installer/commands/harness.mjs`、`tests/helpers/harness-fixture.mjs` 与多份 harness 设计/实施文档。
- 直接做全仓库平台关键词搜索会产生大量与任务无关的噪音，需要优先围绕 harness 相关目录收敛审计。
- `planning/active/` 下已有多个活跃任务，本次审计应独立记录到 `planning/active/cross-platform-harness-audit/`。

## Findings Record: 2026-05-26 13:45:29 UTC+8
- 已确认这是一个 tracked research task，需要使用任务级 planning 文件持久化审计结果。
- 初步文件盘点显示 harness 相关实现至少分布在脚本、安装入口、测试夹具与设计文档四类位置。
- 一次宽泛 `rg` 输出过大，说明后续需要按目录和关键词分段取证，避免误判。

## Findings Record: 2026-05-26 13:44:20 UTC+8
- `scripts/harness` 是 POSIX `sh` 包装器，只把参数转发给 `node harness/installer/commands/harness.mjs`。这对 Linux 友好，但没有任何 Windows `.cmd` / `.bat` / `.ps1` 入口。
- Windows 关键阻断点不止一个：`harness/installer/commands/checkpoint.mjs`、`record.mjs`、`active-summary.mjs`、`harness/runtime/summary-service.mjs`、`harness/installer/lib/checkpoint-push.mjs`、`harness/installer/lib/health.mjs` 都直接调用 `bash` 或 `python3`。
- `harness/core/hooks/superpowers/scripts/run-hook.cmd` 在 Windows 下直接 `exit /b 0`；`docs/architecture.md` 也明确写了 Codex hooks 的 Windows disabled。这说明至少 hooks 这条链路不是 Windows 有效路径。
- 低层实现并非完全没有 Windows 感知：`harness/installer/lib/fs-ops.mjs` 会在 `win32` 下使用 `junction`；`harness/installer/commands/doctor.mjs` 也识别 `C:\\Users\\...` 路径。但这不足以证明 CLI 端到端可用。
- Linux 侧没有发现明显的 Darwin-only 命令依赖；现有顶层脚本与多数文件路径处理对 Linux 友好。但 Linux 仍然隐含依赖 `bash` 和 `python3` 可用，属于前置条件而不是显式兼容说明。
- `harness/core/safety/protected-paths.txt` 仍包含 `/Users`、`/Users/jared`、`~/Library` 等 macOS 特征路径，说明仓库里还残留 macOS 时代的默认安全配置。
- 仓库现有 GitHub Actions 全部跑在 `ubuntu-latest`，没有 `macos-latest` / `windows-latest` 矩阵；同时 workflow 里也没有直接跑 `npm run verify` 或 `./scripts/harness verify`，所以现有自动化不足以证明跨平台支持。
- `npm run verify` 当前本地基线并不全绿，失败项包含作者绝对路径残留、checkpoint-push 在当前 Git safe.bareRepository 语义下的失败、以及 doctor/copilot budget 相关用例。这说明现有验证本身还有噪音，不能直接当成跨平台支持的充分证据。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 采用“实现/测试/文档”三线交叉审计 | 单看任一来源都可能高估或低估平台支持度 |
| 先审 Linux，再审 Windows | Linux 与现有 POSIX 脚本更接近，可先建立基线，再识别 Windows 差异点 |
| Linux 结论使用“基本可用但未被充分证明”措辞 | 代码路径总体兼容 Linux，但缺少针对 Linux 的显式验证与文档边界 |
| Windows 结论使用“当前不算有效”措辞 | CLI 入口、命令依赖与 hook 能力都存在实质性阻断，而不是单纯缺少文档 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 初次关键词搜索结果过大，难以直接得出结论 | 后续按 harness 目录、脚本类型与平台关键字拆分搜索 |
| 并行审计结果中对 Linux 可信度偏乐观 | 通过人工复核 workflow、入口脚本和命令实现后，下调为“基本可用但证据不足” |
| `npm run verify` 失败会干扰对平台支持的判断 | 将其拆解为“当前基线噪音”，不把失败直接解释成 Linux/Windows 专属问题 |

## Destructive Operations Log
| Command | Target | Checkpoint | Rollback |
|---------|--------|------------|----------|
|         |        |            |          |

## Resources
- `scripts/harness/`
- `harness/installer/commands/harness.mjs`
- `tests/helpers/harness-fixture.mjs`
- `docs/cloud-dev-harness.md`
- `docs/superpowers/plans/2026-05-20-harness-token-output-compression-plan.md`
- `scripts/harness`
- `harness/installer/commands/checkpoint.mjs`
- `harness/installer/commands/record.mjs`
- `harness/installer/commands/active-summary.mjs`
- `harness/runtime/summary-service.mjs`
- `harness/installer/lib/checkpoint-push.mjs`
- `harness/installer/lib/health.mjs`
- `harness/core/hooks/superpowers/scripts/run-hook.cmd`
- `harness/core/safety/protected-paths.txt`
- `tests/hooks/pretool-guard.test.mjs`
- `.github/workflows/*.yml`

## Visual/Browser Findings
- 当前无。
