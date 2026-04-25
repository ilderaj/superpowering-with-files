# Agent Safety Harness — Findings

## 1. 事故复盘（基于附件截图与用户描述）

- 触发条件：bypass 模式 + autopilot/long-running，agent 在某个不安全 cwd（疑似 HOME 或父级目录）执行了诊断/清理性命令。
- 直接原因：清理逻辑里的路径变量未做 boundary 检查，错误地展开到当前用户 `HOME`，然后 `rm` 直接打到 `/Users/jared/...`。
- 损失类型：永久删除（不进废纸篓），覆盖 dotfiles、harness 投影目录、纯本地 git workspace、TypeMint 等无远端 repo。
- 可恢复 surface：本地 git/远端、Codex 会话快照、DerivedData、Xcode 状态、各插件缓存——不可靠且部分内容无法重建。

结论：**hook + checkpoint + 远端化是唯一可靠的纵深防御**，prompt 级别的"小心一点"是无效的。

## 2. 现有 harness 能力盘点

| 已有能力 | 位置 | 与本任务关系 |
|---|---|---|
| install / sync / doctor / adopt-global / verify | `harness/installer/commands/*.mjs` | 直接复用，扩 `--profile=safety` 与 doctor 子检查 |
| Skill 投影管线 | `harness/core/skills/*` + `adapters/*/sync-skills.*` | 用于投影新 skill：`risk-assessment-before-destructive-changes`、`safe-bypass-flow` |
| Hook 投影管线 | `harness/core/hooks/*` + `adapters/*/sync-hooks.*` | 用于投影新 hook：`pretool-guard`、`session-checkpoint` |
| Policy snippets | `harness/core/policy/*` | 加 `safety.md` 与 base entry 注入 |
| worktree-preflight | `installer/commands/worktree-preflight.mjs` | 已记录 `Worktree base: <ref> @ <sha>` 习惯，扩 safety 检查 |
| planning-with-files 模板 | `harness/upstream/planning-with-files/templates/*` | 加 `## Risk Assessment` 块 |
| Companion plan 路径约定 | `docs/superpowers/plans/<date>-<task-id>.md` | 本任务遵守 |

→ 不需要新建 `.agent-guard` 子系统。

## 3. 对 Codex 方案的逐条 review

### 3.1 保留（精华）

| Codex 提案 | 决策 | 理由 |
|---|---|---|
| 三层部署模型（harness repo / user-global / repo-local） | 保留 | 与现有 adopt-global / install --scope=workspace 模型一致 |
| PreToolUse hook 的 allow / ask / deny 决策模型 | 保留 | 是核心防御层 |
| protected-paths / dangerous-patterns / safe-commands 配置三件套 | 保留 | 容易维护与社区迭代 |
| `agent-checkpoint`：git bundle + uncommitted.diff + staged.diff + untracked.tgz + manifest.json | 保留 | git bundle 是真正可恢复的最小单元，比 tarball 经济 |
| 非 git 目录退回到 tarball checkpoint | 保留 | 用户 TypeMint 等场景就是这种 |
| `VIBE_CODING_SAFETY_MANUAL.md` + `RECOVERY_PLAYBOOK.md` | 保留，精简 | 落盘人类可读 SOP |
| Cloud bootstrap：devcontainer.json + postCreateCommand.sh | 保留 | 解决 Codespaces / cloud workspace 重建问题 |
| Profile 概念 | 保留但收敛 | 砍到两个 profile（见下） |

### 3.2 砍掉 / 简化（繁复无理）

| Codex 提案 | 决策 | 理由 |
|---|---|---|
| 新增独立 `.agent-guard/` 子目录 | **砍** | 重复造壳；用 `harness/core/safety/` + 现有 hook/policy 投影管线 |
| `safety-install` / `safety-doctor` / `safety-checkpoint` 三个并立 CLI | **砍** | 改为 `install --profile=safety`、`doctor` 增子检查、`checkpoint` 单命令 |
| `agent-safe-run` 人类包装器 | **砍** | Agent 不会调它，用户也不会每次手动跑；用 SessionStart hook 自动 checkpoint 替代 |
| `always-on-core` / `safety-core` / `safety-strict` / `cloud-safe` 四 profile | **砍 → 二** | `safety`（默认）+ `cloud-safe`（增量），简化心智 |
| VS Code `chat.agent.sandbox.*` / `chat.agent.networkFilter` | **砍** | 这些字段在当前 Copilot 公共 schema 中不存在或未稳定，写出来会误导用户 |
| 单独的 `agent-dotfiles` repo | **砍** | 与现有 `superpowering-with-files`/adopt-global 模型重叠；改为推荐"用户私有 `agent-personal-config` repo + 新 `harness link-personal`"，职责边界更清 |
| 自动化 iCloud / Google Drive 放置 workspace | **砍** | 纯 human 决策，harness 不自动化；doctor 给 informational 提示足够 |
| Stop summary hook（v1） | **砍 → v2** | 优先级低；Phase 1 不做 |
| 大量 destructive 真实文件测试 | **砍** | 测试一律走模拟 hook JSON 与 fixture，不真实删除 |

### 3.3 新增（Codex 漏掉的用户明确要求）

| 缺口 | 补 |
|---|---|
| Worktree/branch 强约束工作流（不只是 preflight） | hook 规则：destructive 命令在「不在 worktree 或当前 branch 无 upstream」时 ask；新 skill `safe-bypass-flow` 描述 worktree → push → merge → push 闭环 |
| 风险评估结论强制落盘 | `planning-with-files` task_plan 模板加 `## Risk Assessment` 块；新 skill `risk-assessment-before-destructive-changes`；hook 检测 active task 是否含该块 |
| 个人 agent 配置 GitHub 同步 | `harness link-personal --repo=<git-url>`：clone 私有 repo 到 `~/.agent-config/`，按合并规则注入 user-level AGENTS.md / skills / hooks；user-managed 标记沿用 adopt-global |

## 4. 关键设计决策

### 4.1 Hook 决策矩阵（精简版）

```
deny:
  cwd ∈ {/, /Users, $HOME, ~/Documents, ~/Desktop, ~/Downloads, ~/Library}
  command 目标 ∈ {$HOME, /Users, /, ~/.ssh, ~/.aws, ~/.config/gh, ~/.netrc, ~/.agents, ~/.codex, ~/.copilot, ~/.claude}
  rm -rf 目标解析为绝对路径且越出当前 git toplevel

ask:
  destructive (rm | rmdir | find -delete | git clean | git reset --hard | chmod | chown | sudo | curl | wget | bash -c | sh -c)
    AND (当前不在 worktree 或当前 branch 无 upstream)
    AND active task 缺少 `## Risk Assessment` 块
  目标越出 workspace（mv/cp 跨界）
  编辑 hooks/skills/AGENTS.md/settings

allow:
  cwd 在已知 workspace（git toplevel）内
  AND 命令在 safe-commands.txt 白名单
```

「destructive 命令 + 已 push 的 worktree + active task 已有 Risk Assessment」会直接 allow，把约束转化为对 vibe coding 友好的工作流，而不是处处弹窗。

### 4.2 Checkpoint 时机

- SessionStart hook：自动 checkpoint 一次（如果 dirty）。
- PreToolUse 命中 ask 决策时：先 checkpoint，再向上层抛 ask。
- 用户手动：`harness checkpoint .`。

### 4.3 个人配置 GitHub 同步的合理性判定

**结论：合理且能在现有 harness 框架下执行。**

- harness 已经有 `adopt-global`，把治理 repo 的 baseline materialize 到 user-global。
- 缺的只是「用户私有偏好」的 source of truth。
- 用户开一个**私有** repo `agent-personal-config`（不放任何 harness 投影出来的内容，只放：自定义 AGENTS.md additions、私有 skills、个人 hooks 片段、个人 prompts）。
- harness 提供 `link-personal --repo=<git>`：
  1. clone 到 `~/.agent-config/personal/`。
  2. 按白名单 symlink/合并到 `~/.agents/skills/personal/*`、`~/.codex/AGENTS.user.md`、`~/.copilot/instructions/personal.instructions.md` 等位置。
  3. 在 `~/.agent-config/personal-manifest.json` 记录 user-managed 路径，sync/adopt-global 永不覆盖。
- 后续在任何新机器：`git clone superpowering-with-files && ./scripts/harness install --scope=user-global && ./scripts/harness link-personal --repo=...` 一条龙。

## 5. 与 harness 政策的对齐

- 本任务为 **Tracked + Deep-reasoning**：使用 planning-with-files（本文件三件套）+ companion plan（`docs/superpowers/plans/2026-04-25-agent-safety-harness.md`）。
- 中文写设计/决策；英文留给代码、commit、UI 字符串。
- 不动 `harness/upstream/**`（vendored 上游），所有改动落在 `harness/core/**`、`harness/installer/**`、`harness/adapters/**`、`docs/**`、`tests/**`。
- 完成 implementation 后通过 `./scripts/harness verify --output=reports/verification/...` 留证。

## 6. 2026-04-25 执行前基线与实现修正

- 当前执行位置已经是隔离 worktree：`/Users/jared/SuperpoweringWithFiles.worktrees/copilot-superpowers-implementation-plan`，对应 branch `copilot/superpowers-implementation-plan`，主工作树 branch 为 `dev`，两者当前都在 `58f907ac688a2192baf6331b15e6d609ac89b3c2`。
- Phase 0 已在当前 worktree 完成：`npm install --ignore-scripts`、`./scripts/harness doctor --check-only`、`./scripts/harness verify --output=reports/verification/2026-04-25-baseline`。其中 npm 因仓库未跟踪 lockfile 自动生成了 `package-lock.json`，已立即删除，不把 incidental artifact 带入后续改动。
- 基线 `doctor` 结果是 `Harness check passed.`；基线 `verify` 已写到 `reports/verification/2026-04-25-baseline/latest.md`。
- 关键实现修正 1：当前 `reports/verification/2026-04-25-baseline/latest.md` 显示 `Targets: none`，说明这次 Phase 0 拿到的是 **repo 自测基线**，不是「已安装 projection + hooks/profile」的运行态基线。因此真正的 safety rollout 验证仍需在 Phase 3/9 显式跑 `install --profile=safety` + `doctor`。
- 关键实现修正 2（已复核）：`harness/core/policy/entry-profiles.json` 实际由 policy renderer 使用，语义就是 **entry/policy profile**；真正的 skills profile 在 `harness/core/skills/profiles.json`。因此 `--profile=safety` 可以直接复用现有 policy profile 渲染链路（`renderEntry(..., profileNames)`），但仍然需要在 installer state 中新增独立 profile 字段，避免和 `--skills-profile` 混用。
- 关键实现修正 3：当前 hook projection 仍然是 **skill-index 驱动**；如果要让 safety hooks 随 `--profile=safety` 安装，就需要在 hook planning 阶段引入 profile-aware 分支，或把 safety hook bundle 建模为可投影的 profile 资源。优先方向是扩展 hook planner / sync state，而不是伪装成一个新的 skill。

## 7. 2026-04-25 当前实现进展（Phase 1 + 3）

- **policyProfile 已打通**：新增 state 字段 `policyProfile`，默认值 `always-on-core`；`install --profile=<name>`、`sync`、`adopt-global`、receipt/status、health summary 都已携带它，与既有 `skillProfile` 并存而不冲突。
- **entry renderer 已支持 include-based profile**：`harness/core/policy/entry-profiles.json` 现在既支持旧的“section list” profile，也支持 `{ "include": ["base.md", "safety.md"] }` 这种文件拼接 profile；因此 `safety` / `cloud-safe` 可以落在独立 markdown 文件，不必污染 `base.md`。
- **safety hooks 的建模结论**：最终没有把 safety 伪装成 skill，而是给 `planHookProjections()` 增加 `policyProfile` 感知；只有 `safety` / `cloud-safe` profile 才会额外投影 `harness/core/hooks/safety/*`。
- **当前 safety hook bundle**：
  - `pretool-guard.sh`：覆盖 cwd protected-path deny、absolute target outside workspace deny、safe command allow、dangerous command 在“无 upstream 或无 Risk Assessment”时 ask。
  - `session-checkpoint.sh`：当前是 best-effort wrapper，优先调用未来的 `scripts/harness checkpoint`；等 Phase 2 落地后自动变成真实 checkpoint 入口。
- **测试已经锁住的行为**：
  - `policyProfile` / `install --profile` / render / adopt-global 链路全绿。
  - profile-aware safety hook projection + codex safety hook sync 全绿。
  - `pretool-guard` 的 6 个 fixture（HOME deny、safe allow、absolute-path deny、无风险评估 ask、有风险评估+upstream allow、detached HEAD ask）全绿。

## 8. 2026-04-25 当前实现进展（Phase 2）

- **checkpoint 子系统已落地**：
  - `harness/core/safety/bin/checkpoint`
  - `harness/installer/commands/checkpoint.mjs`
  - `harness checkpoint ...` 已注册到主 CLI 与 `--help`
- **行为边界**：
  - git repo：产出 `repo.bundle`、`uncommitted.diff`、`staged.diff`、`status.txt`、`untracked.tgz`、`manifest.json`
  - non-git 目录：产出 `workspace.tgz` + `manifest.json`
  - `--skip-if-clean`：clean git repo 直接退出 0，不写 checkpoint 目录
- **实现细节结论**：
  - 输出目录里的 checkpoint 文件不能提前出现在 `git status` / untracked 列表里，所以脚本必须先采集 repo 状态，再创建 `out_dir`。
  - macOS 系统 Bash 还是 3.2，不能用 `mapfile`；已改成兼容的 `while read -d ''` 方案。
  - manifest/sourcePath 在 macOS tmpdir 上可能出现 `/var` 与 `/private/var` 的 canonical 差异；测试使用 realpath 比对，避免假红。

## 9. 2026-04-26 最终实现收口（Phase 3–8）

- **safety profile 现已真正 materialize**：`install --profile=safety` 不再只写 state，而是立即触发 `sync`，把 `.agent-config/` 下的 safety catalogs、checkpoint binary、VS Code safety template、投影文档一起落到 workspace / user-global scope。
- **doctor 拥有独立 safety section**：health 现在会聚合 `hooksInstalled`、`pretoolGuardExecutable`、`checkpointExecutable`、`protectedPathsConfigured`、`dangerousPatternsConfigured`、`logsWritable`、`checkpointDirWritable`、`riskAssessmentTemplatePatched`、`workspaceInICloud`。
- **planning-with-files 模板补丁已闭环**：projected `planning-with-files` 模板会注入 `## Risk Assessment` 与 `## Destructive Operations Log`；doctor 会检查 patch marker，`pretool-guard` 与 `worktree-preflight --safety` 都要求非空表格行，空占位行不再被视为已落盘。
- **新 skill 已接入 full profile**：
  - `risk-assessment-before-destructive-changes`
  - `safe-bypass-flow`
  两者都通过 subagent baseline/green 验证：前者补齐 checkpoint + Risk Assessment 落盘，后者补齐 preflight/worktree/push 闭环。
- **Cloud bootstrap 已落地**：`harness cloud-bootstrap --target=codespaces` 会创建或生成 `.harness.suggested` 版本的 `.devcontainer/devcontainer.json` 与 `postCreateCommand.sh`，并确保 `.gitignore` 拥有 checkpoint/log entries。
- **Personal config integration 已落地**：`harness link-personal --repo=...` clone/update `~/.agent-config/personal/`，按 manifest 投影到 HOME 内目标路径，并通过 `user-managed.json` 让 `sync` / `adopt-global` 永久跳过这些目标。
- **安全文档现随 profile 投影**：`docs/safety/{architecture,vibe-coding-safety-manual,recovery-playbook}.md` 会被投影到 `.agent-config/docs/safety/`，把运行期文档和 policy assets 保持同根。

## 10. 最终验证与收尾结论

- 正式仓库验证入口 `npm run verify` 已通过。
- 额外 safety 回归已通过：
  - `tests/hooks/pretool-guard.test.mjs`
  - `tests/installer/worktree-preflight.test.mjs`
  - `tests/safety/*.test.mjs`
- `./scripts/harness verify --output=reports/verification/2026-04-25-safety` 已产出最终报告。
- 使用临时 HOME 的 fixture 自检已通过：
  - `install --scope=workspace --profile=safety` → `doctor --check-only`
  - `install --scope=user-global --profile=safety` → `doctor --check-only`
- `shellcheck` 在当前环境不可用；保留为非阻塞工具缺失，不视为实现缺口。
- 最后一轮 code review only surfaced one substantive bug：空的 Risk Assessment 占位行会被误判为有效，现已在 `pretool-guard` 与 `worktree-preflight --safety` 两处修正，并补了回归测试。
