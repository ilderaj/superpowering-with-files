# 发现与决策

## 需求
- 审计本项目的能力范围、实现目的与当前缺陷。
- 重点检查 Codex 相关 harness 是否完整并按预期作用在 Codex 中。
- 不修改代码，只做分析。
- 新起一个独立的 tracked planning，不与旧任务混用。

## 研究发现
- 仓库已存在大量历史与活跃 planning 任务，说明项目长期依赖 planning-with-files 进行持久任务管理。
- 仓库中存在 `harness/adapters/codex/`、`docs/install/codex.md`、`tests/hooks/superpowers-codex-hook.test.mjs` 等 Codex 相关实现与验证入口，表明项目确实将 Codex 作为显式支持对象之一。
- `planning-with-files` 当前技能文档中引用的模板位置与仓库内实际模板组织存在差异；虽然不影响本次审计推进，但这提示项目内部可能存在“文档/技能描述”与“实际投影路径”不完全一致的问题。
- 项目定位不是“扩展 Codex 能力本身”，而是为 Codex、Copilot、Cursor、Claude Code 提供统一治理层：统一 policy source、技能投影、可选 hooks、health/doctor、verification、upstream refresh、MCP facade。
- 官方 OpenAI Codex 文章明确说明 Codex 会聚合 `$CODEX_HOME` 与工作区层级的 `AGENTS.md`，并在配置了 skills 时注入 skill metadata 与使用说明；这与项目把 Codex 入口设为 `AGENTS.md`、技能根设为 `.agents/skills` / `~/.agents/skills` 的方向一致。
- Codex adapter 的实现面很薄：`harness/adapters/codex/manifest.json` 只声明 `AGENTS.md` 模板、Codex override、工作区/全局入口以及 `superpowers` / `planning-with-files` 两个 materialized 技能。
- Codex planning hook 已采用事件白名单：当前只投影 `SessionStart` 与 `UserPromptSubmit`，显式省略 `Stop`；对应实现位于 `hook-projection.mjs` 和 `harness/core/hooks/planning-with-files/codex-hooks.json`，测试也覆盖了“旧 Stop hook 被清理”的行为。
- 当前仓库实际 `.harness/state.json` 显示的是 `scope=user-global`、`hookMode=on`、`targets.codex.enabled=true`；因此仓库根下没有 `.codex/` 并不代表未支持 Codex，而是当前安装选择了用户全局投影。
- 当前用户全局 `~/.codex/AGENTS.md`、`~/.codex/hooks.json`、`~/.codex/hooks/*` 均存在，且本地直接执行 `~/.codex/hooks/session-start` 与 `~/.codex/hooks/task-scoped-hook.sh` 可以得到符合 Codex JSON 形状的 payload。
- 本机 `codex-cli 0.130.0` 的 `codex features list` 显示的是 `hooks  stable  true`，没有出现仓库文档里写的 `codex_hooks` feature 名称；这强烈说明仓库关于 `codex_hooks = true` 的说明已落后于当前 Codex 版本语义。
- `doctor --check-only` 在当前仓库上对 Codex 给出的证据是：config 已验证、superpowers local payload 已验证、planning payload 未测、runtime invocation 未测。也就是说，项目可以证明“投影存在”和“脚本本地可执行”，但不能证明“当前 Codex 运行时实际调用过这些 hook”。
- `readHarnessHealth()` 只有在仓库内恰好存在 1 个 `Status: active` 的任务目录时，才会测量 planning hot context 和 planning hook payload；当前仓库有多个 active task，因此 health 会直接放弃 planning payload 测量，而 task-scoped hook 运行时则退化为“Multiple active tasks found...”提示。

- `harness/installer/lib/health.mjs` 现在会在 Claude Code 目标上读取 `.harness/runtime-hooks/claude-code.jsonl`，并把匹配的 metadata-only trace 汇总为 `runtime-invocation-verified`；没有 trace 时仍保持 `not-measured`。
- `tests/installer/runtime-hook-evidence.test.mjs` 已覆盖 runtime trace 读取、无效行告警与 projection 不匹配仍不测量的语义。
- `tests/installer/health.test.mjs` 新增 Claude Code runtime trace 断言；当 runtime evidence 存在时，`readHarnessHealth()` 会把 hook runtime 状态提升为 `runtime-invocation-verified`。
- `verify` / `doctor` 之前在 Codex runtime evidence 上出现过“report 层显示 not-measured，但 direct health 已能看到 verified”的分裂，根因是 runtime record 的 `projectRoot` 与 health 侧 root 归一化存在 macOS `/var` 与 `/private/var` 别名差异；这会把同一份路径误判成不同根。
- 已通过 `realpath` 归一化修正 runtime evidence 比对逻辑后，`verify` 与 `doctor` 的 Codex runtime evidence 重新稳定显示为 `runtime-invocation-verified`，相关回归测试已恢复为全绿。
- `readHarnessHealth()` 在多 active task 场景下不会再尝试测量 planning hot context，但会保留明确 warning；当前实现的 verdict 仍保持 `ok`，因为这里只是“测量受限”而不是“检查失败”。

## 遇到的问题
| 问题 | 解决方案 |
|------|---------|
| 初始模板路径假设错误 | 使用 `fd` 定位实际模板文件 |

## 资源
- `AGENTS.md`
- `PRODUCT.md`
- `DESIGN.md`
- `docs/install/codex.md`
- `docs/compatibility/`
- `harness/adapters/codex/`
- `tests/hooks/superpowers-codex-hook.test.mjs`
- `harness/installer/lib/hook-projection.mjs`
- `harness/installer/lib/health.mjs`
- `~/.codex/AGENTS.md`
- `~/.codex/hooks.json`
- OpenAI: `Unrolling the Codex agent loop`
- Companion plan: `docs/superpowers/plans/2026-05-28-codex-harness-hardening-plan.md`

## 视觉/浏览器发现
- 本次任务当前以仓库静态审计为主，尚未进行浏览器类检查。

---
*每执行2次查看/浏览器/搜索操作后更新此文件*
*防止视觉信息丢失*
