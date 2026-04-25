# Agent Safety Harness — Task Plan

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason:

## Goal

把 `ilderaj/superpowering-with-files` 升级为一套覆盖以下三件事的 harness：

1. 在保留 bypass / vibe coding 效率的前提下，避免再次发生「Agent 把 `/Users/jared` 下文件误删」类事故。
2. 强制把变更工作收敛到 worktree / branch，结束时统一合并到 local dev 并 push 到远端，作为远端可恢复的 checkpoint。
3. 把「敏感/关键路径变更前的风险评估结论」与 `planning-with-files` 绑定，每次都强制落盘。
4. 让用户全局的 agent 配置（个人 AGENTS.md / skills / hooks）也具备 GitHub 同步能力，与现有 `adopt-global` 模型协同。

## Companion Plan

- 路径：[docs/superpowers/plans/2026-04-25-agent-safety-harness.md](../../../docs/superpowers/plans/2026-04-25-agent-safety-harness.md)
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
| 0 | Recover repo & baseline verify | not-started | `git pull`、`npm i`、`scripts/harness verify`，确认现状 |
| 1 | Safety policy + hooks 内核 | not-started | `harness/core/policy/safety.md`、`core/hooks/safety/pretool-guard.{sh,test}`、`session-checkpoint.sh`、配置三件套（protected/dangerous/safe） |
| 2 | Checkpoint 子系统 | not-started | `core/safety/bin/checkpoint`（git bundle + diff + tarball），并接 `harness checkpoint` CLI |
| 3 | Profile 与 installer 接入 | not-started | 新增 `entry-profiles.json` 中的 `safety` profile；`install --profile=safety` 投影 hooks + 配置；`doctor` 加 safety section |
| 4 | planning-with-files 风险评估扩展 | not-started | 给 task_plan 模板加 `## Risk Assessment` 块；新 skill `risk-assessment-before-destructive-changes`；hook 检测 active task 中是否存在该块 |
| 5 | Worktree/branch 工作流强约束 | not-started | hook 规则 + 扩展 `using-git-worktrees` skill；`worktree-preflight` 增 safety 检查；新 skill `safe-bypass-flow` |
| 6 | Cloud / devcontainer bootstrap | not-started | `harness cloud-bootstrap --target=codespaces` 生成 `.devcontainer/*` + repo-local hooks，profile=cloud-safe |
| 7 | 个人配置同步：`harness link-personal` | not-started | clone 私有 repo 到 `~/.agent-config/`、合并 user-level AGENTS.md/skills，sync 时不覆盖 user-managed 内容 |
| 8 | 文档与手册 | not-started | `docs/safety/architecture.md`、`vibe-coding-safety-manual.md`、`recovery-playbook.md` |
| 9 | Verify & rollout | not-started | `tests/safety/*` + `scripts/harness verify --output=...`；先 workspace projection self-test，再 user-global，最后接入业务 repo |

每个 phase 的 finishing criteria、文件清单、代码骨架与测试，全部在 companion plan 中。

## Open Questions

- 用户是否已有/愿意建一个私有 `agent-personal-config` repo？（影响 Phase 7 的接入步骤，但不影响 Phase 1–6 的实施）
- 是否需要把 checkpoint 自动 push 到一个 GitHub `agent-checkpoints` 私有 repo（作为远端兜底）？默认不做，留作 v2 选项。

## Risk Assessment

| 风险 | 影响 | 缓解 |
|---|---|---|
| 新 hook 误拦合法操作降低 vibe coding 效率 | 中 | `safe-commands.txt` 白名单 + workspace 内默认 allow + 仅在跨 boundary / 命中 dangerous patterns 时 ask；提供一键 `harness install --profile=safety --hooks=off` |
| Hook 在不同 agent（Codex/Copilot/Claude/Cursor）行为不一致 | 中 | 复用现有 `harness/adapters/*` 投影管线，按 platform 分别 materialize；测试矩阵覆盖四个 adapter |
| Checkpoint 占盘 | 低 | 默认保留所有，提示但不自动清理；retention 留作 v2 |
| 用户全局配置写穿坏现有手写内容 | 高 | `link-personal` 只做 symlink + 合并，遇冲突 abort 并提示；`adopt-global` 既有的 user-managed 标记沿用 |
| VS Code settings 字段不存在 | 中 | 只生成 `*.safety.jsonc` 模板，不写入用户 settings.json；文档明确「需用户复制并验证版本兼容」 |
