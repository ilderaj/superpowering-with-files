# Agent Safety Harness — Companion Implementation Plan

> **Companion to** [planning/active/agent-safety-harness/](../../../planning/active/agent-safety-harness/) — durable lifecycle、phase 状态与决策摘要在那里维护；本文件承载具体文件清单、代码骨架、CLI 接口与测试用例。
>
> **For agentic workers**：使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 按 phase 推进。Steps 用 `- [ ]` 跟踪。

**Goal**：让 `superpowering-with-files` 在保留 vibe coding 效率的同时，做到「Agent 只能动可重建的目录、跨 boundary 必须人类确认、destructive 操作前自动 checkpoint、风险结论落盘、worktree/branch 是默认工作模式」。

**Architecture**：复用 harness 现有 `core/{hooks,policy,skills,templates}` + `installer/commands/{install,doctor,sync,verify,adopt-global}` + `adapters/*` 投影管线。新增 `core/safety/`（配置 + 脚本）、`core/hooks/safety/`（hook 实现）、`core/skills/{risk-assessment-before-destructive-changes,safe-bypass-flow}`、新 CLI 子命令 `checkpoint` 与 `link-personal`、新 profile `safety` 与 `cloud-safe`。

**Tech Stack**：Node.js (existing installer)、POSIX shell + `jq` fallback (hooks)、`git bundle`、`tar`。

---

## File Structure

新增：

```
harness/core/policy/safety.md
harness/core/safety/
  protected-paths.txt
  dangerous-patterns.txt
  safe-commands.txt
  cloud-protected-paths.txt
  bin/
    checkpoint                 # POSIX shell, projection 时复制到 user-global / repo-local
harness/core/hooks/safety/
  pretool-guard.sh
  session-checkpoint.sh
  README.md
harness/core/skills/
  risk-assessment-before-destructive-changes/SKILL.md
  safe-bypass-flow/SKILL.md
harness/core/templates/safety/
  vscode-settings.safety.jsonc
  devcontainer.json
  postCreateCommand.sh
harness/installer/commands/
  checkpoint.mjs
  link-personal.mjs
  cloud-bootstrap.mjs
docs/safety/
  architecture.md
  vibe-coding-safety-manual.md
  recovery-playbook.md
tests/safety/
  pretool-guard.test.mjs
  checkpoint.test.mjs
  projection.test.mjs
  link-personal.test.mjs
```

修改：

```
harness/core/policy/base.md                          # +safety 段（仅 in safety profile 时投影）
harness/core/policy/entry-profiles.json              # +safety, +cloud-safe profile
harness/installer/commands/harness.mjs               # +checkpoint, +link-personal, +cloud-bootstrap
harness/installer/commands/install.mjs               # 接 --profile=safety / --hooks=on
harness/installer/commands/doctor.mjs                # +safety section
harness/installer/commands/worktree-preflight.mjs    # +safety check（无 upstream / dirty 警告升级）
harness/upstream/planning-with-files/templates/task_plan.md   # 镜像 + 本地补丁：加 ## Risk Assessment 块
harness/core/skills/planning-with-files-overlay.md   # 若已有 overlay 机制，则补丁加载 Risk Assessment 引导
.gitignore                                           # +.agent-config/checkpoints/ 与 reports/checkpoints/
```

> 任何对 `harness/upstream/**` 的修改必须通过现有的 overlay/patch 机制，不直接改 vendored 文件。

---

## Phase 0 — Recover repo & baseline verify

### Task 0.1：拉最新 + 安装 + verify

- [ ] **Step 1**：`cd ~/dev/superpowering-with-files && git fetch origin && git checkout dev && git pull --ff-only`
- [ ] **Step 2**：`npm install --ignore-scripts`（避免 postinstall 副作用）
- [ ] **Step 3**：`./scripts/harness doctor --check-only`，把输出贴到 `planning/active/agent-safety-harness/progress.md`
- [ ] **Step 4**：`./scripts/harness verify --output=reports/verification/2026-04-25-baseline`
- [ ] **Step 5**：`git status` 确认无 dirty，`git rev-parse HEAD` 记录 base SHA 到 progress.md

**Finishing criteria**：baseline verify 全绿；progress.md 记录 base SHA 与 doctor 输出摘要。

---

## Phase 1 — Safety policy + hook 内核

### Task 1.1：写 `core/policy/safety.md`

- [ ] 内容固定为以下 10 条规则（短小，便于 base.md 注入）：

```markdown
# Safety Policy

- Never run agents from HOME, /Users, /, Documents, Desktop, Downloads, or broad parent folders.
- Run agents only inside a specific project root or sacrificial worktree.
- Bypass is allowed only for rebuildable directories.
- Checkpoint before bypass, autopilot, destructive work, or long-running tasks.
- Delete, cleanup, reset, permission, and credential-related operations require ask or deny.
- Secrets, certificates, releases, payment, and production config changes do not use bypass.
- Destructive commands without an upstream branch require explicit human ask.
- Risk assessment for destructive changes must be persisted in `planning/active/<task-id>/task_plan.md` under `## Risk Assessment` before execution.
- Cross-workspace writes are denied; cross-workspace deletes are denied unconditionally.
- End every agent task with a diff review and a push to remote when applicable.
```

- [ ] 在 `entry-profiles.json` 里增加：
  ```json
  "safety": { "include": ["base.md", "safety.md"] },
  "cloud-safe": { "include": ["base.md", "safety.md", "cloud-safe.md"] }
  ```
- [ ] 写 `core/policy/cloud-safe.md`：在 safety 之上叠加「禁止网络写入、禁止安装新包到全局、禁止读取 ~/.ssh 等」。

### Task 1.2：写配置三件套

- [ ] `core/safety/protected-paths.txt`（一行一条 glob，cwd 命中即 deny）：
  ```
  /
  /Users
  /Users/jared
  $HOME
  ~/Documents
  ~/Desktop
  ~/Downloads
  ~/Library
  ```
- [ ] `core/safety/dangerous-patterns.txt`（命中即 ask；正则）：
  ```
  ^\s*rm\s+-rf?\b
  ^\s*rmdir\b
  \bfind\b.*\b-delete\b
  ^\s*git\s+clean\b
  ^\s*git\s+reset\s+--hard\b
  ^\s*sudo\b
  ^\s*chmod\b
  ^\s*chown\b
  ^\s*dd\b
  ^\s*curl\b
  ^\s*wget\b
  ^\s*(bash|sh)\s+-c\b
  ^\s*npm\s+(install|i|uninstall|rm)\b
  ^\s*pnpm\s+(add|remove|install)\b
  ```
- [ ] `core/safety/safe-commands.txt`（cwd 在 git toplevel 内 + 命中即 allow）：
  ```
  ^\s*git\s+(status|diff|show|log|branch|rev-parse|ls-files|fetch)\b
  ^\s*(npm|pnpm|yarn)\s+(test|lint|typecheck)\b
  ^\s*swift\s+(test|build)\b
  ^\s*xcodebuild\s+test\b
  ```
- [ ] `core/safety/cloud-protected-paths.txt`：cloud-safe 专用（追加 `/workspaces/*/..` 等 codespaces 边界）

### Task 1.3：写 `pretool-guard.sh`

- [ ] 文件路径：`harness/core/hooks/safety/pretool-guard.sh`
- [ ] 输入：stdin JSON（兼容 Claude / Codex / Copilot 三种 hook payload，按 platform-specific adapter 在投影时 wrap）
- [ ] 解析 cwd / tool / command / file_paths：有 `jq` 用 `jq`，否则 grep fallback
- [ ] 决策实现按 findings.md §4.1 矩阵
- [ ] 输出 hook JSON：
  - allow → `{"continue": true}` 或 `{"permissionDecision":"allow"}`
  - ask → `{"permissionDecision":"ask","permissionDecisionReason":"<why>"}`
  - deny → `{"permissionDecision":"deny","permissionDecisionReason":"<why>"}`
- [ ] 日志写到 `${HARNESS_SAFETY_LOG_DIR:-$HOME/.agent-config/logs}/pretool-guard.log`，每行 JSON：`{ts, cwd, tool, decision, reason, command_summary}`
- [ ] 关键校验：
  - cwd 命中 protected-paths → deny
  - 命令解析出绝对路径越出 `git rev-parse --show-toplevel` → deny
  - 命中 dangerous-patterns + (无 upstream 或 active task 缺 Risk Assessment 块) → ask
  - 命中 safe-commands + cwd 在 git toplevel → allow
  - 默认 → allow（避免过度阻塞 vibe coding）
- [ ] 函数 `has_risk_assessment()`：递归找最近的 `planning/active/*/task_plan.md`，`grep -c '^## Risk Assessment' > 0` 即认为已落盘
- [ ] 函数 `current_branch_has_upstream()`：`git rev-parse --abbrev-ref --symbolic-full-name @{u}` 退出码 0 即 true

### Task 1.4：写 `session-checkpoint.sh`

- [ ] SessionStart hook：调 `harness checkpoint $cwd --quiet --skip-if-clean`
- [ ] 解析 cwd 在 broad path 时直接 abort（写 stderr，不 checkpoint）

### Task 1.5：单元测试

- [ ] `tests/safety/pretool-guard.test.mjs`：fixture-driven，至少覆盖：
  - cwd=$HOME → deny
  - cwd=repo + `git status` → allow
  - cwd=repo + `rm -rf /Users/example/test` → deny
  - cwd=repo + `rm -rf ./DerivedData` + 无 Risk Assessment → ask
  - cwd=repo + `rm -rf ./DerivedData` + active task 含 Risk Assessment 块 + 当前 branch 有 upstream → allow
  - cwd=repo（detached HEAD）+ `git reset --hard` → ask
- [ ] 不真实 rm；用 mock filesystem fixture（temp dir + `git init`）

**Finishing criteria**：所有 fixture 测试通过；shellcheck（如有）干净；hook 输出 JSON schema 与 Claude Code / Codex / Copilot 三家文档一致。

---

## Phase 2 — Checkpoint 子系统

### Task 2.1：`core/safety/bin/checkpoint`

- [ ] 用法：`checkpoint <path> [--quiet] [--skip-if-clean] [--out=<dir>]`
- [ ] 默认 `--out=$HOME/.agent-config/checkpoints/<basename(path)>/<UTC-timestamp>/`
- [ ] 行为：
  - 解析 path，若是 git toplevel：
    - `git bundle create repo.bundle --all`
    - `git diff > uncommitted.diff`
    - `git diff --cached > staged.diff`
    - `git status --porcelain > status.txt`
    - 把 untracked 列表 `tar` 到 `untracked.tgz`（排除 `.gitignore` 标准列表）
  - 否则：
    - `tar --exclude=node_modules --exclude=.build --exclude=DerivedData --exclude=.next --exclude=dist --exclude=build --exclude=.venv -czf workspace.tgz <path>`
  - 写 `manifest.json`：
    ```json
    {"sourcePath":"...","timestamp":"...","isGitRepo":true,"branch":"...","headSha":"...","remote":"...","checkpointPath":"..."}
    ```
- [ ] `--skip-if-clean`：git repo 且 `status.txt` 空时退出 0 不写文件
- [ ] 失败 fail-fast，退出码非 0；hook 调用方决定是否 abort

### Task 2.2：`harness checkpoint` CLI

- [ ] 新 `installer/commands/checkpoint.mjs`，spawn `core/safety/bin/checkpoint`，passthrough args
- [ ] 注册到 `harness.mjs` commands 表

### Task 2.3：测试

- [ ] `tests/safety/checkpoint.test.mjs`：建一个 temp git repo + 改一个文件 + 跑 checkpoint，断言 `repo.bundle`、`uncommitted.diff`、`manifest.json` 存在且 manifest 字段完整
- [ ] 非 git 目录：断言只生成 `workspace.tgz` + `manifest.json`

**Finishing criteria**：`./scripts/harness checkpoint .` 在本 repo 上能产出可恢复的 checkpoint；从 `repo.bundle` `git clone` 出来 + apply diff 能还原 workspace。

---

## Phase 3 — Profile 与 installer 接入

### Task 3.1：`install --profile=safety`

- [ ] `install.mjs` 接受 `--profile=safety|cloud-safe`，默认 `default`
- [ ] safety profile 投影：
  - `core/policy/safety.md` → 各 adapter entry 文件
  - `core/hooks/safety/*` → 各 adapter hooks 目录（按 adapter sync-hooks 既有逻辑）
  - `core/safety/*` → user-global `~/.agent-config/safety/`，repo-local `<repo>/.agent-config/safety/`（**注意：这里我们沿用 `~/.agent-config/`，不是 Codex 提议的 `~/.agent-guard/`，与 link-personal 同根**）
  - `core/safety/bin/checkpoint` → `~/.agent-config/bin/checkpoint`（chmod +x），并 PATH 指引文档
  - `core/templates/safety/vscode-settings.safety.jsonc` → `~/.agent-config/templates/`（仅生成、不写入用户 settings.json）

### Task 3.2：`doctor` 安全段

- [ ] 检查项：
  - hooksInstalled（每个 adapter）
  - pretoolGuardExecutable（chmod +x）
  - checkpointExecutable
  - protectedPathsConfigured（文件存在 + 行数 > 0）
  - dangerousPatternsConfigured
  - logsWritable（`~/.agent-config/logs` 可写）
  - checkpointDirWritable
  - planning-with-files Risk Assessment template 已 patch
  - workspace 路径是否在 iCloud Drive（informational）

### Task 3.3：`adopt-global` 协同

- [ ] adopt-global 在 user-global scope 下叠加 `--profile=safety`
- [ ] 不覆盖 `~/.agent-config/personal/*` 内容（user-managed）

**Finishing criteria**：`./scripts/harness install --scope=workspace --profile=safety` 与 `--scope=user-global --profile=safety` 都能成功；`doctor` 全绿。

---

## Phase 4 — planning-with-files 风险评估扩展

### Task 4.1：模板补丁

- [ ] 在 `task_plan.md` 模板加：
  ```markdown
  ## Risk Assessment
  
  | 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |
  |---|---|---|---|
  ```
- [ ] 在 findings.md 模板加 `## Destructive Operations Log`

### Task 4.2：新 skill `risk-assessment-before-destructive-changes`

- [ ] 路径：`harness/core/skills/risk-assessment-before-destructive-changes/SKILL.md`
- [ ] description：「触发 destructive 变更前必须先在当前 active task 的 task_plan.md 写 Risk Assessment 块；包括：命令、目标路径、最坏情况、checkpoint 位置、回退步骤」
- [ ] checklist：
  1. 列出待执行命令与目标
  2. 显式标注是否跨 workspace boundary
  3. 跑 `harness checkpoint .` 并把路径写进 task_plan
  4. 在 task_plan.md 添加 Risk Assessment 行
  5. 仅当 Risk Assessment 完整 + checkpoint 完成时执行命令

### Task 4.3：hook 联动

- [ ] `pretool-guard.sh` 调 `has_risk_assessment()`：找最近的 `planning/active/*/task_plan.md`，`## Risk Assessment` 之后是否有非空表格行；空表则视为未落盘

**Finishing criteria**：跑一次 fixture：active task 无 Risk Assessment + `rm -rf ./DerivedData` → ask；补上 Risk Assessment 后 → allow。

---

## Phase 5 — Worktree/branch 工作流强约束

### Task 5.1：新 skill `safe-bypass-flow`

- [ ] description：「在 bypass / autopilot / long-running 模式开始前，必须把工作隔离在 worktree 或 branch；结束后 push 到 remote 并合并到 dev」
- [ ] checklist：
  1. `harness worktree-preflight` 输出 base ref + SHA，记录到 task_plan
  2. `git worktree add <path> -b <branch> <base>`
  3. SessionStart 自动 checkpoint
  4. 完成阶段性工作后 `git push -u origin <branch>`（作为远端兜底）
  5. 合并：`cd <main repo> && git merge --no-ff <branch>`
  6. `git push origin dev`
  7. 必要时 `git worktree remove`

### Task 5.2：扩展 `worktree-preflight`

- [ ] 现有命令保留，加 `--safety` flag：
  - 校验 `git remote -v` 存在
  - 校验当前 branch dirty 状态可见
  - 校验 active task 含 Risk Assessment 块（若 plan 是 destructive）
  - 输出 SessionStart hook 命令片段

### Task 5.3：hook 规则

- [ ] `pretool-guard.sh` 在 destructive 命令上：
  - 如果当前 cwd 不是 worktree 且当前 branch 无 upstream → ask
  - 如果 cwd 是 main repo 的 dev 分支且命令是 `git reset --hard` → deny

**Finishing criteria**：fixture：在 worktree 内 + 已 push + 有 Risk Assessment → allow；其它情况 ask/deny。

---

## Phase 6 — Cloud / devcontainer bootstrap

### Task 6.1：`harness cloud-bootstrap --target=codespaces`

- [ ] `installer/commands/cloud-bootstrap.mjs`，生成或更新：
  - `.devcontainer/devcontainer.json`（基于 `core/templates/safety/devcontainer.json`，仅写 `chat.tools.global.autoApprove=false` 与 `chat.tools.terminal.blockDetectedFileWrites=outsideWorkspace`，**不**注入 sandbox / networkFilter 字段）
  - `.devcontainer/postCreateCommand.sh`：调用 `./scripts/harness install --scope=workspace --profile=cloud-safe --hooks=on`
  - 在 repo `.gitignore` 追加 `.agent-config/checkpoints/` 等
- [ ] 已存在文件：生成 `*.harness.suggested` 副本而非覆盖

### Task 6.2：测试

- [ ] `tests/safety/projection.test.mjs`：cloud-bootstrap 在 fixture repo 上能产出预期文件；不破坏既有 `.devcontainer/devcontainer.json`（生成 .suggested）

**Finishing criteria**：在 fixture repo 上 `cloud-bootstrap` + `install --profile=cloud-safe` 能成功；用一个真实 Codespace 验证留作手工 acceptance。

---

## Phase 7 — 个人配置同步：`harness link-personal`

### Task 7.1：CLI

- [ ] `installer/commands/link-personal.mjs`
- [ ] 用法：`harness link-personal --repo=<git-url> [--branch=main] [--dry-run]`
- [ ] 行为：
  1. 校验 `~/.agent-config/personal/` 不存在或与 `--repo` 一致
  2. `git clone <repo> ~/.agent-config/personal/`（或 `git pull` 更新）
  3. 读 `personal/manifest.json`：声明哪些文件投影到哪里（白名单）
     ```json
     {"map":[
       {"src":"AGENTS.md","dest":"~/.agents/AGENTS.user.md","mode":"link"},
       {"src":"skills/*/SKILL.md","dest":"~/.agents/skills/personal/","mode":"copy"},
       {"src":"copilot/personal.instructions.md","dest":"~/.copilot/instructions/personal.instructions.md","mode":"link"}
     ]}
     ```
  4. 按 manifest 投影（symlink 优先；冲突 → abort + 报告，不覆盖）
  5. 写 `~/.agent-config/user-managed.json`：记录投影路径，供 `adopt-global` / `sync` 跳过
- [ ] `--dry-run` 只打印计划

### Task 7.2：sync / adopt-global 联动

- [ ] `sync` 与 `adopt-global` 读 `user-managed.json`，跳过其中列出的路径
- [ ] `doctor` 校验 personal manifest 一致性

### Task 7.3：测试

- [ ] `tests/safety/link-personal.test.mjs`：fixture personal repo + 临时 HOME，断言 mapping 正确、冲突时 abort

**Finishing criteria**：用户能 `git init` 一个空的 `agent-personal-config` 私有 repo，`harness link-personal --repo=<git>` 一条命令把它接入 user-global，没有覆盖任何 harness 投影出来的文件。

---

## Phase 8 — 文档与手册

### Task 8.1：`docs/safety/architecture.md`

- 三层模型图、hook 决策矩阵表、checkpoint 数据结构、profile 关系。

### Task 8.2：`docs/safety/vibe-coding-safety-manual.md`

- 中文，≤1200 字，bypass 前 checklist。
- 内容大纲：worktree 隔离、checkpoint、Risk Assessment 落盘、不在 HOME 跑 agent、push 后再 merge、push 后再清理 worktree、敏感操作不 bypass、结束看 diff。

### Task 8.3：`docs/safety/recovery-playbook.md`

- 中文，事故应急 SOP。
- 内容大纲：立刻停 agent、记录上下文、找 checkpoint、`git clone repo.bundle`、apply diff、解 untracked.tgz、Time Machine / APFS local snapshots、Codex/Copilot/Claude session logs、最坏路径承认。

**Finishing criteria**：三份 docs 均存在，进入 user-global / repo-local 投影。

---

## Phase 9 — Verify & rollout

### Task 9.1：完整测试套

- [ ] `npm run verify`
- [ ] `./scripts/harness verify --output=reports/verification/2026-04-25-safety`
- [ ] `shellcheck harness/core/hooks/safety/*.sh harness/core/safety/bin/checkpoint`（如有）
- [ ] 投影 self-test：`./scripts/harness install --scope=workspace --profile=safety && ./scripts/harness doctor`

### Task 9.2：rollout

- [ ] 在本 repo 自身投影并跑 doctor
- [ ] user-global：`./scripts/harness install --scope=user-global --profile=safety`，跑 doctor
- [ ] 选 1 个真实业务 repo 接入：commit `AGENTS.md`、`.github/`、`.codex/`、`.devcontainer/`、`.gitignore`
- [ ] cloud：在 codespace 上手工 acceptance

### Task 9.3：closing

- [ ] 把 verify 报告路径写回 `progress.md`
- [ ] task_plan lifecycle → `Status: closed`、`Archive Eligible: yes`、`Close Reason: 安全 harness 第一阶段交付完毕，hook + checkpoint + risk assessment + worktree 强约束 + 个人配置同步可用`
- [ ] 触发 archive 流程

---

## Definition of Done（Phase 1–9 总）

1. `pretool-guard.sh` 按 fixture 全部 allow/ask/deny 正确。
2. `harness checkpoint .` 产出 git bundle + diff + untracked + manifest，可以从 bundle 重建 repo。
3. `harness install --profile=safety` 在 workspace 与 user-global scope 均成功。
4. `harness doctor` 安全段全绿。
5. `harness cloud-bootstrap --target=codespaces` 生成 devcontainer + postCreate，且不破坏既有文件。
6. `harness link-personal --repo=<git>` 把私有偏好接入 `~/.agent-config/personal/`，sync/adopt-global 不覆盖。
7. `planning-with-files` task_plan 模板含 `## Risk Assessment` 块；新 skill 与 hook 联动有效。
8. `worktree-preflight --safety` 输出 safety 检查；新 skill `safe-bypass-flow` 投影到所有 adapter。
9. 三份 docs 存在并被投影。
10. `verify` / `doctor` 全部通过；report 落 `reports/verification/2026-04-25-safety/`。
11. 既有 install/sync/doctor/adopt-global 主流程不破坏（回归测试）。
12. `.agent-config/checkpoints/` 与 `.agent-config/logs/` 已加入 `.gitignore`。

## 与 Codex 原方案的偏离声明（供后续追溯）

- `.agent-guard/` 改为 `.agent-config/`，与 `link-personal` 同根，避免双壳。
- `safety-install/safety-doctor/safety-checkpoint` 三命令并入主 CLI（`install --profile`、`doctor`、`checkpoint`）。
- 砍 `agent-safe-run`。
- 砍 4 profile → 2 profile。
- VS Code settings 模板只保留 Copilot 已稳定字段。
- 砍单独 `agent-dotfiles`，改为可选的 `agent-personal-config` 私有 repo + `harness link-personal`。
- 增 worktree/branch 强约束 hook + skill。
- 增 Risk Assessment 模板补丁 + 落盘检查。
