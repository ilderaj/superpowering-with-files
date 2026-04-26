# Agent Safety Harness — Task Plan

## Current State
Status: closed
Archive Eligible: yes
Close Reason: 安全 harness 第一阶段已完成交付；safety profile、hook、checkpoint、Risk Assessment、worktree safety、cloud bootstrap、personal linking、文档与验证链路均已落地。

## Goal

把 `ilderaj/superpowering-with-files` 升级为一套覆盖以下三件事的 harness：

1. 在保留 bypass / vibe coding 效率的前提下，避免再次发生「Agent 把 `/Users/jared` 下文件误删」类事故。
2. 强制把变更工作收敛到 worktree / branch，结束时统一合并到 local dev 并 push 到远端，作为远端可恢复的 checkpoint。
3. 把「敏感/关键路径变更前的风险评估结论」与 `planning-with-files` 绑定，每次都强制落盘。
4. 让用户全局的 agent 配置（个人 AGENTS.md / skills / hooks）也具备 GitHub 同步能力，与现有 `adopt-global` 模型协同。

## Companion Plan

- 路径：[planning/archive/20260425-212230-agent-safety-harness/companion_plan.md](planning/archive/20260425-212230-agent-safety-harness/companion_plan.md)
- 内容：所有 Phase 的具体文件清单、代码骨架、CLI 接口、测试用例。
- 同步状态：companion 与本文件双向引用；本文件只承载 lifecycle、phase 状态、durable 决策摘要。
- Sync-back rule：companion 中任何 phase 落地完成或 durable 决策变更时，回写 `findings.md` 并在本文件 phase 表中更新状态。

## 关键 durable 决策（review Codex 方案后的取舍）

详细论证见 `findings.md`，此处只记结论：

1. **不新增 `.agent-guard/` 子目录**，所有安全能力作为 harness 现有 `core/hooks/` + `core/policy/` + `core/skills/` 的扩展，复用 `install / sync / doctor / adopt-global` 投影管线。
2. **不引入 `safety-install / safety-doctor / safety-checkpoint` 等并立 CLI**，改为 `harness install --profile=safety`、`harness doctor` 增加 safety section、新增 `harness checkpoint` 单命令。
3. **不实现 `agent-safe-run` 人类包装器**，因为 agent 不会调它；用 PreToolUse hook + SessionStart 自动 checkpoint 替代。
4. **VS Code settings 模板只保留 Copilot 已稳定的 `chat.tools.terminal.*` 字段**，砍掉 `chat.agent.sandbox.*` / `chat.agent.networkFilter` 等未确认存在的字段，避免误导。
5. **profile 收敛为两个**：`safety`（user-global 与 workspace 默认开启）和 `cloud-safe`（在 codespaces / devcontainer 上叠加更强约束）。
6. **worktree/branch 模式作为强约束写入 hook**，不仅是 preflight：destructive 命令在「无 worktree / 当前 branch 无 upstream」时 ask。
7. **风险评估强制落盘** = 在 `planning-with-files` 模板里加 `## Risk Assessment` 块 + 新 skill `risk-assessment-before-destructive-changes`；hook 在执行前检查 active task 下是否存在该块。
8. **个人 agent 配置的 GitHub 同步** = 推荐用户开一个**私有** repo（如 `agent-personal-config`），harness 新增 `link-personal` 命令把它 clone 到 `~/.agent-config/` 并合并到各 agent 目录；不要把它和 `superpowering-with-files` 治理 repo 混在一起。
9. **checkpoint 优先用 `git bundle` + diff + untracked tarball + manifest**，本地非 git 目录才退回到全量 tarball；所有 checkpoint 写到 `~/.agent-config/checkpoints/<workspace>/<ts>/`，不进 repo。
10. **iCloud / Google Drive workspace 放置**纯属 human-side 决策，harness 不自动化，但 doctor 会对「workspace 路径在 iCloud Drive 下」给出 informational 提示（受 iCloud evict 影响时不可靠）。

## Phases

| # | Phase | Status | 简述 |
|---|---|---|---|
| 0 | Recover repo & baseline verify | complete | 已在当前隔离 worktree 完成 `npm install --ignore-scripts`、`./scripts/harness doctor --check-only`、`./scripts/harness verify --output=reports/verification/2026-04-25-baseline`；报告已落盘，顺手清理了 npm 自动生成的 `package-lock.json` |
| 1 | Safety policy + hooks 内核 | complete | `safety` / `cloud-safe` policy、profile-aware safety hooks、`pretool-guard.sh`、`session-checkpoint.sh`、危险命令与 worktree 约束已全部落地并覆盖 fixture tests |
| 2 | Checkpoint 子系统 | complete | 已完成 `core/safety/bin/checkpoint`、`harness checkpoint` CLI、git/non-git/skip-if-clean 测试；SessionStart wrapper 现在可调用真实 checkpoint |
| 3 | Profile 与 installer 接入 | complete | `install --profile=safety` 现会直接投影 safety assets；`.agent-config/` safety/docs/template/bin projection 与 `doctor` safety section 全部完成 |
| 4 | planning-with-files 风险评估扩展 | complete | projected `planning-with-files` 模板已补 `## Risk Assessment` 与 destructive log；新 skill `risk-assessment-before-destructive-changes` 已接入 full profile；hook/preflight 均要求非空表格行 |
| 5 | Worktree/branch 工作流强约束 | complete | 新 skill `safe-bypass-flow`、`worktree-preflight --safety`、main repo `dev` branch `git reset --hard` deny、无 upstream ask 等约束均已落地 |
| 6 | Cloud / devcontainer bootstrap | complete | `harness cloud-bootstrap --target=codespaces` 会生成或建议 `.devcontainer/devcontainer.json` 与 `postCreateCommand.sh`，并补 `.gitignore` |
| 7 | 个人配置同步：`harness link-personal` | complete | `link-personal`、`user-managed.json`、`sync`/`adopt-global` skip 逻辑与冲突保护均已实现 |
| 8 | 文档与手册 | complete | `docs/safety/architecture.md`、`vibe-coding-safety-manual.md`、`recovery-playbook.md` 已新增，并跟随 safety profile 投影到 `.agent-config/docs/safety/` |
| 9 | Verify & rollout | complete | `npm run verify`、额外 safety tests、`./scripts/harness verify --output=reports/verification/2026-04-25-safety`、临时 HOME 的 workspace/user-global install + doctor 自检均已通过 |

每个 phase 的 finishing criteria、文件清单、代码骨架与测试，全部在 companion plan 中。

## Open Questions

- 用户是否已有/愿意建一个私有 `agent-personal-config` repo？（影响 Phase 7 的接入步骤，但不影响 Phase 1–6 的实施）
- 是否需要把 checkpoint 自动 push 到一个 GitHub `agent-checkpoints` 私有 repo（作为远端兜底）？默认不做，留作 v2 选项。

## Completion Notes

- 最终验证报告：`reports/verification/2026-04-25-safety/latest.md`
- 额外 safety 测试覆盖：`tests/hooks/pretool-guard.test.mjs`、`tests/installer/worktree-preflight.test.mjs`、`tests/safety/*.test.mjs`
- 环境未提供 `shellcheck`，因此 shell 脚本语法验证停留在仓库测试与实际命令执行层

## Risk Assessment

| 风险 | 影响 | 缓解 |
|---|---|---|
| 新 hook 误拦合法操作降低 vibe coding 效率 | 中 | `safe-commands.txt` 白名单 + workspace 内默认 allow + 仅在跨 boundary / 命中 dangerous patterns 时 ask；提供一键 `harness install --profile=safety --hooks=off` |
| Hook 在不同 agent（Codex/Copilot/Claude/Cursor）行为不一致 | 中 | 复用现有 `harness/adapters/*` 投影管线，按 platform 分别 materialize；测试矩阵覆盖四个 adapter |
| Checkpoint 占盘 | 低 | 默认保留所有，提示但不自动清理；retention 留作 v2 |
| 用户全局配置写穿坏现有手写内容 | 高 | `link-personal` 只做 symlink + 合并，遇冲突 abort 并提示；`adopt-global` 既有的 user-managed 标记沿用 |
| VS Code settings 字段不存在 | 中 | 只生成 `*.safety.jsonc` 模板，不写入用户 settings.json；文档明确「需用户复制并验证版本兼容」 |
