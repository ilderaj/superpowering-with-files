# Findings & Decisions

## Requirements
- 为 Copilot workspace safety 下的 `PreToolUse` abort 问题设计 implementation plan。
- 方案必须包含详细回归测试步骤和验证步骤。
- 本轮不直接改代码，只做方案与执行设计。

## Research Findings
- 当前仓库的 authoritative Harness state 已恢复为 `user-global`，`policyProfile` 为 `always-on-core`，workspace `.github/hooks/` 已清空，说明误装的 workspace safety 已被清理。
- `pretool-guard.sh` 在 `harness/core/hooks/safety/scripts/pretool-guard.sh` 中直接执行 `JSON.parse(payloadText)`，无 `try/catch` 包裹。
- 同一脚本只有在进入 `emit(...)` 后才会把 decision 写入 `~/.agent-config/logs/pretool-guard.log`。
- 日志中存在大量 `platform = codex` 的 decision 记录，但没有任何 `platform = copilot` 的记录。
- 这说明 Copilot 场景下脚本高概率在 `emit(...)` 前异常退出；否则至少应留下 `allow/ask/deny` 记录。
- 现有 runtime 单测 `tests/hooks/pretool-guard.test.mjs` 只喂理想化 JSON payload，且 `runGuard()` 固定用 `JSON.stringify(payload)` 作为 stdin；没有覆盖 malformed stdin、包装文本或 Copilot 真实 payload 形状。
- 现有 adapter/projection 测试对 Copilot planning/superpowers 有覆盖，但 Copilot safety 只在 `codex` 目标上有显式 projection/sync 覆盖，缺少 Copilot safety 专用回归。

## Root-Cause Hypothesis
- **主假设：** Copilot `PreToolUse` 传入的 stdin 不是当前脚本假定的“可直接 `JSON.parse` 的纯 JSON 对象”，导致 `JSON.parse(payloadText)` 抛错，宿主把该异常统一呈现为 `Hook PreToolUse aborted`。
- **廉价反证检查：** 若脚本实际进入了 `allow/ask/deny` 判定，则应在 `~/.agent-config/logs/pretool-guard.log` 留下 `platform = copilot` 记录；当前没有，支持主假设。

## Test Gaps
| Gap | Current State | Needed Coverage |
|-----|---------------|----------------|
| runtime payload 容错 | 仅测试理想 JSON stdin | 增加 malformed/raw/wrapped stdin 回归 |
| Copilot safety projection | 仅明确覆盖 Codex safety projection | 增加 Copilot safety projection test |
| Copilot safety sync | 仅明确覆盖 Codex safety sync | 增加 Copilot safety sync/install test |
| 手工 smoke | 无真实 Copilot runtime smoke 步骤 | 增加 disposable checkout / sacrificial worktree smoke checklist |

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 先设计“解析硬化 + fallback 继续判定”的方案，不采用简单删除 hook 或关闭 safety | 用户仍希望保留 Copilot safety 的安全价值，而不是回退到无 safety |
| 解析失败 fallback 不能直接 abort | 当前用户可见故障即由 abort 引起；应把异常转成明确的 `allow/ask` 决策 |
| 对危险 shell 模式仍需保留 ask/deny | 修复目标是恢复可用性，不是弱化安全边界 |
| 实际执行放在隔离 worktree，而不是当前脏工作区 | 当前仓库已有未提交 planning 文件，按 superpowers/worktree 规则应把实现与验证隔离到独立 checkout |
| worktree 目录采用 `.worktrees/` | 仓库 `.gitignore` 已显式忽略 `.worktrees/`，等价于已有项目级偏好，可避免额外询问 |

## Execution Findings
- `./scripts/harness worktree-preflight --task copilot-pretool-guard-regression-fix` 推荐基线为 `dev @ 7326b4a703f05832d325ae016a06fddaa79a92e1`，理由是当前分支 `dev` 为非 trunk 开发分支，应保留该上下文。
- `./scripts/harness worktree-name --task copilot-pretool-guard-regression-fix` 生成的 canonical label / branch name 为 `202604280749-copilot-pretool-guard-regression-fix-001`。
- 在 worktree 上先跑 `tests/hooks/pretool-guard.test.mjs`、`tests/adapters/hook-projection.test.mjs`、`tests/adapters/sync-hooks.test.mjs`，基线共 30 条测试全部通过，可作为后续 red/green 对照。
- Task 1 的三条新增 Copilot runtime regression tests 在未改实现时全部以 `JSON.parse(...)` 相关异常失败，证明当前 regression 已被真实复现，而不是测试拼写或夹具错误。
- Task 2 修复后，`pretool-guard.sh` 的容错链路为：全量 JSON 解析 -> 包装文本中的 `{...}` 提取解析 -> 保留 `rawText` 和 `parseError` 继续判定。
- 当 parse failure 且未检测到命令时，脚本会显式 `emit('allow', ...)` 后退出；当原始 stdin 本身就是危险命令时，会通过 raw fallback 继续命中 `dangerousPatterns`，保持 `ask/deny` 安全边界。
- Task 3 需要“新增 Copilot safety 测试”，不能把已有 Codex safety 测试错当成满足条件。第一次 implementer 误报成功后，复核发现实际文件未改；二次修正后才真正落盘。
- 最终 adapter 覆盖面为：保留原有 Codex safety projection/sync 回归，并额外新增 Copilot safety projection/sync 回归；其中 sync 侧 Codex 与 Copilot 都显式断言安装后的 `pretool-guard.sh` 包含 `permissionDecision`。
- 本次实现已在隔离分支 `202604280749-copilot-pretool-guard-regression-fix-001` 提交为 `557879b`（`fix: harden copilot pretool guard parsing`）。
- 按 finishing-a-development-branch 流程尝试本地 merge 回 `dev` 时，被主工作区未提交改动阻塞；冲突文件为 `tests/adapters/hook-projection.test.mjs` 与 `tests/adapters/sync-hooks.test.mjs`。

## Resources
- `harness/core/hooks/safety/scripts/pretool-guard.sh`
- `tests/hooks/pretool-guard.test.mjs`
- `tests/adapters/hook-projection.test.mjs`
- `tests/adapters/sync-hooks.test.mjs`
- `docs/install/copilot.md`
- `docs/compatibility/hooks.md`
- Companion plan: `docs/superpowers/plans/2026-04-28-copilot-pretool-guard-regression-fix-plan.md`
