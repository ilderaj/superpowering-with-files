# Agent Safety Harness — Progress

## Session 2026-04-25 — 立项 + 方案 review

**Goal of session**：review 用户附件中 Codex 出的方案，结合用户 4 条诉求 + harness 现状，输出分析报告 + 精简后的设计 + 可执行 implementation plan，全部落盘。

**Done**：

- 加载 `planning-with-files` / `brainstorming` / `writing-plans` skills，确认本任务走 Tracked + Deep-reasoning 路径。
- 探查 harness 现有能力（installer commands、core hooks/policy/skills、worktree-preflight、adopt-global），确认无需新建 `.agent-guard` 子系统。
- 完成 Codex 方案逐条 review：保留 8 条精华，砍掉 9 条繁复无理，补 3 条用户明确要求但 Codex 漏掉的（worktree 强约束、风险评估落盘、个人配置 git 同步）。
- 落盘四份文件：
  - `planning/active/agent-safety-harness/task_plan.md`（lifecycle + phase + decisions）
  - `planning/active/agent-safety-harness/findings.md`（事故复盘 + review + 设计决策）
  - `planning/active/agent-safety-harness/progress.md`（本文件）
  - `planning/archive/20260425-212230-agent-safety-harness/companion_plan.md`（companion 详细 implementation plan）

**Verification**：

- 暂未跑 `verify`，因为本 session 仅产出 plan 与决策，未触代码。
- 下一 session 进入 Phase 0：`git pull && npm i && ./scripts/harness verify`，并把结果回写本文件。

**Open**：

- 用户决定是否进入 Phase 1 实施，以及是否在 Phase 7 接入 `agent-personal-config` repo（后者非阻塞）。

**Files touched**：

- A `planning/active/agent-safety-harness/task_plan.md`
- A `planning/active/agent-safety-harness/findings.md`
- A `planning/active/agent-safety-harness/progress.md`
- A `planning/archive/20260425-212230-agent-safety-harness/companion_plan.md`

## Session 2026-04-25 — Phase 0 baseline + execution start

**Goal of session**：开始执行 implementation plan，先确认当前 worktree / 基线 / 真实代码结构，再进入 Phase 1。

**Done**：

- 确认当前 cwd 已经是隔离 worktree：`/Users/jared/SuperpoweringWithFiles.worktrees/copilot-superpowers-implementation-plan`。
- Git 状态：当前 branch `copilot/superpowers-implementation-plan`，主工作树 branch `dev`，两者 HEAD 同为 `58f907ac688a2192baf6331b15e6d609ac89b3c2`。
- 运行 `npm install --ignore-scripts`；仓库未跟踪 lockfile，npm 自动生成的 `package-lock.json` 已立即删除，避免把 incidental baseline 产物带入提交。
- 运行 `./scripts/harness doctor --check-only`，结果：`Harness check passed.`。
- 运行 `./scripts/harness verify --output=reports/verification/2026-04-25-baseline`，报告已生成。
- 运行 `./scripts/harness worktree-preflight`，记录：`Worktree base: copilot/superpowers-implementation-plan @ 58f907ac688a2192baf6331b15e6d609ac89b3c2`。
- 复核 installer / sync / policy renderer 后确认：`entry-profiles.json` 是 policy profile 配置，真正的 skills profile 在 `harness/core/skills/profiles.json`。因此 `--profile=safety` 可以复用 entry 渲染层，但仍需新增独立 state 字段；不能挤占现有 `--skills-profile` 语义。
- 进一步确认 hook projection 当前是 skill-index 驱动，safety hooks 需要给 hook planner 增加 profile-aware 路径。

**Verification**：

- `./scripts/harness doctor --check-only` → pass
- `./scripts/harness verify --output=reports/verification/2026-04-25-baseline` → `reports/verification/2026-04-25-baseline/latest.md`
- 基线报告摘要：`Scope: workspace`，`Targets: none`，说明这只是 repo 自测基线；真正的 install/profile/hook 验证留到 Phase 3/9

**Open**：

- Phase 1 需要先补看 hook projection / adapter sync 结构，再决定 safety hooks 是作为独立 core hook source 接入，还是扩展现有 hook projection 规划层。

**Files touched**：

- M `planning/active/agent-safety-harness/task_plan.md`
- M `planning/active/agent-safety-harness/findings.md`
- M `planning/active/agent-safety-harness/progress.md`
- A `reports/verification/2026-04-25-baseline/latest.md`

## Session 2026-04-25 — Phase 1 / 3 profile + safety hook vertical slice

**Goal of session**：先把 `--profile=safety` 的状态/渲染链路打通，再让 safety hooks 真正随 profile 投影，并用 fixture 验证 `pretool-guard` 的核心判定。

**Done**：

- 新增 installer state 字段 `policyProfile`，默认 `always-on-core`；`install --profile=<name>`、`sync`、`adopt-global`、receipt/status、health summary 全部接通。
- 扩展 `renderPolicyProfile()`：除原有 section-based profile 外，新增 include-based profile，允许 `entry-profiles.json` 里直接声明 `safety` / `cloud-safe` = `base.md + extra policy files`。
- 新增 `harness/core/policy/safety.md` 与 `harness/core/policy/cloud-safe.md`。
- 新增 profile-aware safety hook bundle：
  - `harness/core/hooks/safety/{codex,copilot,cursor,claude}-hooks.json`
  - `harness/core/hooks/safety/scripts/pretool-guard.sh`
  - `harness/core/hooks/safety/scripts/session-checkpoint.sh`
  - `harness/core/hooks/safety/README.md`
- 扩展 `planHookProjections()`：当 `policyProfile ∈ {safety, cloud-safe}` 且 `hookMode=on` 时，额外投影 safety hooks；不再把 safety 建模成 skill。
- `pretool-guard.sh` 已实现并通过 fixture：
  - protected cwd → deny
  - safe command in repo → allow
  - absolute destructive target outside workspace → deny
  - dangerous command + no Risk Assessment → ask
  - dangerous command + Risk Assessment + upstream → allow
  - detached HEAD dangerous command → ask

**Verification**：

- `node --test tests/installer/state.test.mjs tests/installer/commands.test.mjs tests/installer/policy-render.test.mjs tests/installer/adoption.test.mjs` → 39/39 pass
- `node --test tests/adapters/hook-projection.test.mjs tests/adapters/sync-hooks.test.mjs tests/hooks/pretool-guard.test.mjs` → 24/24 pass

**Open**：

- `session-checkpoint.sh` 目前还是 best-effort wrapper，因为 `harness checkpoint` / `core/safety/bin/checkpoint` 尚未实现。
- `core/safety/protected-paths.txt` / `dangerous-patterns.txt` / `safe-commands.txt` 尚未落盘；当前 `pretool-guard` 用内建 fallback，Phase 2/3 继续补。
- `doctor` 的 safety section 与 config projection 尚未开始。

**Files touched**：

- M `harness/core/policy/entry-profiles.json`
- A `harness/core/policy/safety.md`
- A `harness/core/policy/cloud-safe.md`
- M `harness/core/state-schema/state.schema.json`
- M `harness/installer/lib/{state,policy-render,adapters,adoption,health,hook-projection}.mjs`
- M `harness/installer/commands/{install,sync}.mjs`
- A `harness/core/hooks/safety/**`
- M `tests/installer/{state,commands,policy-render,adoption}.test.mjs`
- M `tests/adapters/{hook-projection,sync-hooks}.test.mjs`
- A `tests/hooks/pretool-guard.test.mjs`

## Session 2026-04-25 — Phase 2 checkpoint subsystem

**Goal of session**：把 `session-checkpoint.sh` 后面的 placeholder 补成真实 checkpoint 能力，并让主 CLI 可以直接执行 `harness checkpoint`。

**Done**：

- 新增 safety config 文件：
  - `harness/core/safety/protected-paths.txt`
  - `harness/core/safety/dangerous-patterns.txt`
  - `harness/core/safety/safe-commands.txt`
  - `harness/core/safety/cloud-protected-paths.txt`
- 新增 `harness/core/safety/bin/checkpoint`：
  - git repo 生成 `repo.bundle`、`uncommitted.diff`、`staged.diff`、`status.txt`、`untracked.tgz`、`manifest.json`
  - non-git 目录生成 `workspace.tgz`、`manifest.json`
  - 支持 `--skip-if-clean`、`--quiet`、`--out=...`
- 新增 `harness/installer/commands/checkpoint.mjs`，并把 `checkpoint` 注册进 `harness.mjs` usage/commands。
- 修复一个 macOS 兼容性坑：自带 Bash 3.2 不支持 `mapfile`，改成 `while read -d ''` 收集 untracked files。
- 修复一个 path canonicalization 坑：测试使用命令输出的实际 checkpointPath + realpath 比对，避免 `/var` vs `/private/var` 假红。

**Verification**：

- `node --test tests/installer/commands.test.mjs tests/installer/checkpoint.test.mjs` → 17/17 pass
- `npm run verify` → 178/178 pass
- `node --test tests/hooks/pretool-guard.test.mjs` → 6/6 pass

**Open**：

- `session-checkpoint.sh` 在 harness repo 内已能调用真实 `harness checkpoint`；后续还需通过 safety config projection 把 `core/safety/*` materialize 到 user-global / workspace `.agent-config/`，让投影后的 hooks 也能脱离 harness repo 单独工作。
- `doctor` 的 safety section 仍未实现。

**Files touched**：

- A `harness/core/safety/{protected-paths,dangerous-patterns,safe-commands,cloud-protected-paths}.txt`
- A `harness/core/safety/bin/checkpoint`
- A `harness/installer/commands/checkpoint.mjs`
- M `harness/installer/commands/harness.mjs`
- M `tests/installer/{commands,checkpoint}.test.mjs`

## Session 2026-04-26 — Phase 3–9 completion sweep

**Goal of session**：完成剩余 Phase 3–8 实现，并跑完最终 verify / install self-check，把任务推进到 closed。

**Done**：

- 完成 safety profile 的 `.agent-config/` projection：catalogs、checkpoint binary、VS Code safety template、projected docs 全部接入 `sync`。
- `install` 现已在写入 state 后立即执行 `sync`，使 `install --profile=safety` 具备真正的“装完可 doctor”语义。
- `doctor` 新增 safety section；`readHarnessHealth()` 聚合 safety checks、user-managed consistency 与 planning template patch 状态。
- 为 projected `planning-with-files` 模板新增 `## Risk Assessment` / `## Destructive Operations Log` patch，并把检查逻辑接到 `pretool-guard` 与 `worktree-preflight --safety`。
- 新增并投影两个 skill：
  - `harness/core/skills/risk-assessment-before-destructive-changes/SKILL.md`
  - `harness/core/skills/safe-bypass-flow/SKILL.md`
- 完成 `worktree-preflight --safety`、main repo `dev` branch 上 `git reset --hard` deny、placeholder Risk Assessment row 视为 missing 的修正。
- 新增 `harness cloud-bootstrap --target=codespaces`，支持 `.harness.suggested` 输出与 `.gitignore` 补丁。
- 新增 `harness link-personal --repo=...`、`user-managed.json`、`sync` / `adopt-global` skip 逻辑与冲突保护。
- 新增 safety 文档：
  - `docs/safety/architecture.md`
  - `docs/safety/vibe-coding-safety-manual.md`
  - `docs/safety/recovery-playbook.md`
- 运行 code review，修复一个实质性问题：空的 Risk Assessment placeholder row 会被误判为有效。

**Verification**：

- `npm run verify` → pass
- `node --test tests/hooks/pretool-guard.test.mjs tests/installer/worktree-preflight.test.mjs tests/safety/*.test.mjs` → pass
- `./scripts/harness verify --output=reports/verification/2026-04-25-safety` → `reports/verification/2026-04-25-safety/latest.md`
- 临时 HOME fixture：
  - `install --scope=workspace --profile=safety` + `doctor --check-only` → pass
  - `install --scope=user-global --profile=safety` + `doctor --check-only` → pass
- `shellcheck`：环境缺失，未执行

**Files touched**：

- M `.gitignore`
- A `docs/safety/**`
- A `harness/core/skills/{risk-assessment-before-destructive-changes,safe-bypass-flow}/SKILL.md`
- A `harness/core/templates/safety/{vscode-settings.safety.jsonc,devcontainer.json,postCreateCommand.sh}`
- A `harness/installer/commands/{cloud-bootstrap,link-personal}.mjs`
- A `harness/installer/lib/{planning-with-files-risk-assessment-patch,safety-projection,user-managed}.mjs`
- M `harness/installer/commands/{adopt-global,doctor,harness,install,sync,worktree-preflight}.mjs`
- M `harness/installer/lib/{fs-ops,health,planning-with-files-companion-plan-patch}.mjs`
- M `harness/core/hooks/safety/{claude,copilot,cursor}-hooks.json`
- M `harness/core/hooks/safety/scripts/pretool-guard.sh`
- M `harness/core/skills/{index.json,profiles.json}`
- A `tests/safety/{projection,link-personal}.test.mjs`
- A `tests/installer/worktree-preflight.test.mjs`
- M `tests/{adapters/sync-skills,helpers/harness-fixture,hooks/pretool-guard,installer/{commands,health}}.test.mjs`
