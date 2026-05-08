# Roadmap 全版本 Implementation Plan

Active task path: `planning/archive/20260506-222935-roadmap-implementation-plan/`
Lifecycle state: archived
Sync-back status: archived at 2026-05-06T22:29:35: moved companion plan into archive

## 0. 目标与边界

本计划用于在用户 review 批准后，按 `docs/roadmap.md` 的 v1.1 到 v1.6 顺序完成全部 roadmap task。计划本身不执行任何实现、merge、commit 或 push。

执行目标：

- 每个版本都从最新 `dev` 派生独立版本分支。
- 每个版本都有独立 task-scoped planning 目录、companion plan、implementation commit、verification record、merge record。
- 每个版本完成后合并回本地 `dev`，验证后推送 `origin/dev`。
- 每个版本完成后再进入下一版本，避免跨版本混合实现。
- 现有 waiting_review / active task 必须被迁移、关闭或明确保留，不留下无法解释的 active backlog。

非目标：

- 不在 plan review 前实现任何版本。
- 不自动合并仍需人类 review 的外部 PR，除非执行时用户明确批准。
- 不覆盖当前已有外部/并发修改：
  - `planning/active/global-rule-context-load-analysis/findings.md`
  - `planning/active/global-rule-context-load-analysis/progress.md`
  - `planning/active/origin-cloud-harness-deployment-plan/findings.md`
  - `planning/active/origin-cloud-harness-deployment-plan/progress.md`
  - `planning/active/origin-cloud-harness-deployment-plan/task_plan.md`

## 1. 总体执行时序

### Version Order

| Execution Gate | Version | Theme | Enter When | Exit When |
| --- | --- | --- | --- | --- |
| Gate 0 | Review approval and baseline stabilization | 只确认执行前状态 | 用户批准本 plan | 当前 worktree 状态清楚、dev 可作为 base |
| Gate 1 | v1.1 | Planning hygiene and active task cleanup | Gate 0 完成 | active 队列只剩可解释任务，records 可复查 |
| Gate 2 | v1.2 | Cross-IDE projection and hook closure | v1.1 merge/push 完成 | cross-IDE projection/hook/single-source 任务收口 |
| Gate 3 | v1.3 | Context budget and skill discovery governance | v1.2 merge/push 完成 | budget/dedupe/RTK/generic brief-hot 治理落地 |
| Gate 4 | v1.4 | Safety overlay, cloud harness, automation follow-through | v1.3 merge/push 完成，且 2026-05-08 scheduled run 可核验 | overlay/cloud/automation 方案或实现收口 |
| Gate 5 | v1.5 | Workflow productization and operator experience | v1.4 merge/push 完成 | workflow lanes、README/PR、operator docs 收口 |
| Gate 6 | v1.6 | Release readiness and adoption stabilization | v1.5 merge/push 完成 | foundation umbrella 关闭，release/adoption 状态稳定 |

这里的“什么时候”采用顺序 gate，不采用天数估算。唯一硬时间依赖是 `post-upstream-automation-followups` 已记录的 `2026-05-08 20:05 Asia/Shanghai` heartbeat 观察窗口；v1.4 不能在该事件核验前完成最终 closeout。

## 2. Git 与记录总流程

每个版本都使用同一个机械流程。变量：

```bash
VERSION="v1.2"
TASK_ID="roadmap-v1.2-cross-ide-closure"
BRANCH="codex/roadmap-v1.2-cross-ide-closure"
WORKTREE_ROOT="$HOME/.config/superpowers/worktrees/SuperpoweringWithFiles"
```

### 2.1 进入版本前

```bash
git checkout dev
git status --short
git fetch origin
git pull --ff-only origin dev
./scripts/harness worktree-preflight --task "$TASK_ID"
./scripts/harness worktree-name --task "$TASK_ID" --namespace codex --json
```

要求：

- 如果 `git status --short` 有非当前版本改动，先分类：当前版本需要、前一版本遗留、用户并发改动、无关改动。
- 用户并发改动只记录，不覆盖。
- worktree base 必须写入 `planning/active/<task-id>/progress.md`：`Worktree base: <base-ref> @ <base-sha>`。

### 2.2 创建版本 worktree

```bash
git worktree add "$WORKTREE_ROOT/<canonical-label>" -b "$BRANCH" <base-ref>
cd "$WORKTREE_ROOT/<canonical-label>"
```

每个版本创建：

- `planning/active/<task-id>/task_plan.md`
- `planning/active/<task-id>/findings.md`
- `planning/active/<task-id>/progress.md`
- `docs/superpowers/plans/<date>-<task-id>.md`

### 2.3 实现循环

每个实现 slice 都按以下顺序：

1. 读取当前版本 plan。
2. 写 failing test 或修改现有测试来暴露目标行为。
3. 实现最小完整功能，不做跨版本扩散。
4. 运行 focused tests。
5. 更新 `findings.md` / `progress.md`。
6. 进入下一 slice。

### 2.4 版本验证

每个版本至少运行：

```bash
npm run verify
./scripts/harness verify --output=.harness/verification
./scripts/harness doctor --check-only
./scripts/harness sync --check
git diff --check
```

如果版本涉及 upstream automation，再运行：

```bash
node --test tests/automation/*.test.mjs
node scripts/ci/run-upstream-refresh.mjs
```

如果版本涉及 safety，再运行：

```bash
node --test tests/safety/*.test.mjs tests/hooks/pretool-guard.test.mjs
./scripts/harness install --scope=workspace --targets=all --profile=safety --hooks=on
./scripts/harness doctor --check-only
```

### 2.5 版本提交

每个版本至少保留两个 commit：

```bash
git add <version files>
git commit -m "feat: implement roadmap ${VERSION} <theme>"
git add planning/active/<task-id> docs/superpowers/plans/<date>-<task-id>.md
git commit -m "docs: record roadmap ${VERSION} verification"
git push -u origin "$BRANCH"
```

如果版本只涉及文档和 planning cleanup，第一条 commit 使用：

```bash
git commit -m "docs: implement roadmap ${VERSION} <theme>"
```

### 2.6 合并回 dev

```bash
cd <repo-root>
git checkout dev
git pull --ff-only origin dev
git merge --no-ff "$BRANCH" -m "merge: roadmap ${VERSION} <theme>"
npm run verify
./scripts/harness verify --output=.harness/verification
./scripts/harness doctor --check-only
git push origin dev
```

### 2.7 版本 closeout

合并并推送成功后：

```bash
bash harness/core/upstream-overlays/planning-with-files/scripts/close-task.sh \
  . \
  "$TASK_ID" \
  "Roadmap ${VERSION} implemented, verified, merged into dev, and pushed to origin/dev."

bash harness/core/upstream-overlays/planning-with-files/scripts/archive-task.sh \
  . \
  "$TASK_ID"
```

然后删除版本 worktree：

```bash
git worktree remove "$WORKTREE_ROOT/<canonical-label>"
git branch -d "$BRANCH"
```

如果 branch 已推送且需要保留 PR/review 历史，不删除 remote branch，除非用户要求。

## 3. Gate 0: Review Approval And Baseline Stabilization

### 目标

把当前 plan review 后的工作区变成可执行基线，避免把上一轮 audit、当前 plan 和后续实现混成一团。

### 具体步骤

1. 用户批准本 plan 后，先检查：

```bash
git status --short
git diff -- docs/roadmap.md planning/active/project-roadmap-audit planning/active/roadmap-implementation-plan docs/superpowers/plans/2026-05-06-project-roadmap-audit.md docs/superpowers/plans/2026-05-06-roadmap-implementation-plan.md
```

2. 将当前 review-approved planning / roadmap 改动作为 baseline commit：

```bash
git checkout dev
git add docs/roadmap.md \
  planning/active/project-roadmap-audit \
  planning/active/roadmap-implementation-plan \
  docs/superpowers/plans/2026-05-06-project-roadmap-audit.md \
  docs/superpowers/plans/2026-05-06-roadmap-implementation-plan.md \
  planning/archive
git commit -m "docs: add roadmap execution plan"
git push origin dev
```

3. 不把 `global-rule-context-load-analysis` 与 `origin-cloud-harness-deployment-plan` 的并发修改塞进 baseline commit，除非执行前确认这些改动属于已批准范围。

### 输出记录

- `planning/active/roadmap-implementation-plan/progress.md`
- baseline commit hash
- `git status --short` 清洁或明确列出保留的并发改动

## 4. v1.1: Planning Hygiene And Active Task Cleanup

### 目标

让 `planning/active/` 只保留仍需真实执行、review、外部事件或决策的任务，并为后续版本建立统一记录规则。

### 主要任务

1. 复查当前 active 队列：
   - `cross-ide-hook-capability-alignment`
   - `cross-ide-projection-audit`
   - `cross-ide-single-source-consolidation`
   - `cursor-official-load-model-research`
   - `global-rule-context-load-analysis`
   - `harness-template-foundation`
   - `origin-cloud-harness-deployment-plan`
   - `post-upstream-automation-followups`
   - `project-roadmap-audit`
   - `readme-slim-pr`
   - `rtk-support-feasibility-analysis`
2. 建立 `scripts` 或 docs 级 lifecycle audit checklist，不再依赖人工散读。
3. 给 active queue 增加 machine-readable summary，可选位置：
   - `.harness/planning-active-summary.json`
   - `planning/active/<task-id>/progress.md` 中的统一 `Roadmap Mapping` block
4. 关闭 `project-roadmap-audit` 和本 `roadmap-implementation-plan` 的 review 状态，前提是用户已批准并 baseline commit 已存在。

### 开发细节

- 优先复用现有 planning lifecycle helper，不新增第二套 archive 规则。
- 如果新增 helper，放在 `harness/installer/commands/record.mjs` 或新增 `harness/installer/commands/planning-audit.mjs`；测试放在 `tests/installer/record-command.test.mjs` 或新文件。
- 输出应只读 planning files，不推断未记录的状态。

### 预期文件

- `planning/active/roadmap-v1.1-planning-hygiene/*`
- `docs/superpowers/plans/<date>-roadmap-v1.1-planning-hygiene.md`
- `docs/roadmap.md`
- 可选：`harness/installer/commands/planning-audit.mjs`
- 可选：`tests/installer/planning-audit.test.mjs`

### 验证

```bash
node --test tests/core/companion-plan-lifecycle.test.mjs tests/installer/record-command.test.mjs
npm run verify
./scripts/harness summary --task roadmap-v1.1-planning-hygiene
./scripts/harness verify --output=.harness/verification
./scripts/harness doctor --check-only
```

### Commit Plan

- `docs: implement roadmap v1.1 planning hygiene`
- `docs: record roadmap v1.1 verification`
- merge commit: `merge: roadmap v1.1 planning hygiene`

## 5. v1.2: Cross-IDE Projection And Hook Closure

### 目标

收口 cross-IDE projection、hook lifecycle、single-source 和 Cursor 官方加载模型，确保四个 target 的 entry / skills / hooks 语义一致、可验证、文档准确。

### 任务 A: `cross-ide-projection-audit`

1. 检查 execution worktree 当前状态：

```bash
git worktree list
git status --short
```

2. 如果 worktree 仍存在且有实现改动：
   - 读取该 worktree 的 diff。
   - 重跑 focused tests。
   - 如果实现仍适配当前 `dev`，将它 rebase 或 cherry-pick 到 v1.2 branch。
   - 如果实现已被后续任务覆盖，记录 no-merge decision 并关闭 task。

3. 预期代码面：
   - `harness/core/metadata/platforms.json`
   - `harness/adapters/*/manifest.json`
   - `harness/installer/lib/paths.mjs`
   - `harness/installer/lib/hook-projection.mjs`
   - `harness/installer/lib/hook-config.mjs`
   - `harness/installer/lib/health.mjs`
   - `tests/installer/paths.test.mjs`
   - `tests/adapters/hook-projection.test.mjs`
   - `tests/adapters/sync-hooks.test.mjs`
   - `tests/installer/health.test.mjs`

### 任务 B: `cross-ide-hook-capability-alignment`

1. 完成 Phase 6：
   - merge execution branch back into local `dev`
   - push `origin/dev`
2. 如果执行分支已不存在，按 `findings.md` 的 final conclusions 检查当前 `dev` 是否已经包含对应改动。
3. 如果未包含，则补齐：
   - Copilot planning hook lifecycle: `sessionStart`, `userPromptSubmit`, `preToolUse`, `postToolUse`, `stop`
   - Copilot native `superpowers` SessionStart hook
   - Cursor hook evidence level `verified`
   - docs 中 Claude compatibility 只作为 secondary surface

### 任务 C: `cross-ide-single-source-consolidation`

1. 检查 PR #22：

```bash
gh pr view 22 --json state,mergeStateStatus,headRefName,baseRefName,url
```

2. 如果 PR 已 merged：
   - fetch / fast-forward dev
   - close/archive task
3. 如果 PR open：
   - review diff 是否仍适配当前 roadmap
   - 如需合并，merge PR 或 cherry-pick 到 v1.2 branch
4. 如果 PR stale：
   - 记录 stale reason
   - 提取仍有价值的 shared-root / coalescing 逻辑到 v1.2 branch

### 任务 D: `cursor-official-load-model-research`

1. 重新核对官方 docs 链接。
2. 输出完整链接矩阵：
   - Project Rules
   - User Rules
   - `AGENTS.md`
   - Skills
   - Hooks
   - scoped / always / agent requested behavior
3. 把结论转成 adapter policy：
   - Cursor workspace entry 保持 `.cursor/rules/harness.mdc`
   - Cursor user-global entry 不伪造 filesystem rule
   - Cursor skills 仍走 `.cursor/skills`
   - Cursor hooks 采用 native `.cursor/hooks.json`

### 验证

```bash
node --test tests/installer/paths.test.mjs tests/installer/health.test.mjs
node --test tests/adapters/hook-projection.test.mjs tests/adapters/sync-hooks.test.mjs tests/adapters/sync-skills.test.mjs tests/adapters/templates.test.mjs
npm run verify
./scripts/harness sync --dry-run
./scripts/harness doctor --check-only
```

### Closeout

- 将 `cross-ide-projection-audit`、`cross-ide-hook-capability-alignment`、`cross-ide-single-source-consolidation`、`cursor-official-load-model-research` 转为 closed/archive 或记录保留原因。
- 更新 `docs/install/*`、`docs/compatibility/hooks.md`、`README.md`。

### Commit Plan

- `feat: implement roadmap v1.2 cross-ide projection closure`
- `docs: record roadmap v1.2 verification`
- merge commit: `merge: roadmap v1.2 cross-ide closure`

## 6. v1.3: Context Budget And Skill Discovery Governance

### 目标

把 context budget、skill discovery、duplicate skill、RTK feasibility 和 generic target brief/hot context 统一成可执行治理。

### 任务 A: `global-rule-context-load-analysis`

当前该 task 有外部/并发修改。执行前必须：

```bash
git diff -- planning/active/global-rule-context-load-analysis/findings.md planning/active/global-rule-context-load-analysis/progress.md
```

然后只在 v1.3 branch 中接续，不覆盖并发内容。

开发内容：

1. 强化 budget ledger：
   - per-target session cost
   - per-turn hook/planning amplification
   - global/workspace overlap warning
   - skill source/body/discovery distinction
2. 把 budget policy 固化在：
   - `harness/core/context-budgets.json`
   - `harness/core/context-budget-policies.json`
   - `harness/installer/lib/context-budget.mjs`
   - `harness/installer/lib/health.mjs`
   - `harness/installer/commands/verify.mjs`
   - `harness/installer/commands/doctor.mjs`
3. 确保 user-global / both scope 默认 `minimal-global`，workspace 可 opt-in `full`。

### 任务 B: `rtk-support-feasibility-analysis`

1. 完成 Phase 5 报告。
2. 将 RTK 决策转成 roadmap output：
   - 不作为 core upstream
   - 作为 optional plugin / integration layer
   - Copilot / Cursor 优先
   - Claude 需避开 `PreToolUse/Bash` 冲突
   - Codex 若要高价值支持，需要 Harness-owned hook adapter，不复用 prompt-only init
3. 如果决定不实现 RTK v1，关闭任务并在 roadmap 后续保留 optional integration lane。

### 任务 C: duplicate skill dedupe

来自已归档 TypeMint/Copilot 重复候选结论：

1. 在 `skill-projection` 或 health 中规范化 resolved realpath。
2. 检测同名 skill 的 symlink path + real path 重复。
3. 在 `doctor` 输出 actionable warning：
   - source path
   - resolved path
   - target IDE
   - whether duplicate is display-only or true duplicated projection
4. 测试覆盖 Copilot symlink case。

### 任务 D: generic target brief/hot context regression

来自已归档 `spec-review-planning-recovery-brief-hot-summary`：

1. 对 Codex / Cursor / Claude Code 的 `session-start`、`pre-tool-use`、重复 `user-prompt-submit` 建立 behavior test。
2. 避免 generic targets 在 compact/change-detect events 中继续输出 full HOT CONTEXT。
3. 保持 Copilot brief fingerprint behavior 不回退。

### 预期文件

- `harness/installer/lib/context-budget.mjs`
- `harness/installer/lib/health.mjs`
- `harness/installer/lib/skill-projection.mjs`
- `harness/core/context-budgets.json`
- `harness/core/context-budget-policies.json`
- `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh`
- `tests/installer/context-budget.test.mjs`
- `tests/installer/copilot-usage-budget.test.mjs`
- `tests/installer/health.test.mjs`
- `tests/adapters/skill-projection.test.mjs`
- `tests/hooks/task-scoped-hook.test.mjs`
- `tests/hooks/hook-budget.test.mjs`
- `docs/maintenance.md`
- `docs/roadmap.md`

### 验证

```bash
node --test tests/installer/context-budget.test.mjs tests/installer/copilot-usage-budget.test.mjs tests/installer/health.test.mjs
node --test tests/adapters/skill-projection.test.mjs tests/adapters/sync-skills.test.mjs
node --test tests/hooks/task-scoped-hook.test.mjs tests/hooks/hook-budget.test.mjs
npm run verify
./scripts/harness verify --output=stdout
./scripts/harness doctor --check-only
```

### Commit Plan

- `feat: implement roadmap v1.3 context budget governance`
- `docs: record roadmap v1.3 verification`
- merge commit: `merge: roadmap v1.3 context budget governance`

## 7. v1.4: Safety Overlay, Cloud Harness, And Automation Follow-Through

### 目标

让 safety / cloud-safe 成为 workspace 或 cloud repo-local overlay，而不是改写 user-global baseline；同时完成 upstream scheduled run follow-up。

### 任务 A: `post-upstream-automation-followups`

必须在 `2026-05-08 20:05 Asia/Shanghai` heartbeat 后执行：

```bash
gh run list --workflow upstream-refresh.yml --event schedule --limit 5
gh run view <run-id> --json status,conclusion,event,headBranch,createdAt,updatedAt,url
```

分支：

- `success + no_changes`：记录稳定空跑 baseline，关闭 task。
- `success + PR/update`：检查 branch/base/body/artifact contract。
- `failure`：下载 artifact/log，创建新的 repair task，不污染已关闭 automation analysis。

### 任务 B: `origin-cloud-harness-deployment-plan`

该 task 有并发修改，执行前必须先 review diff。

实现方向：

1. 定义 cloud profile：
   - repo-local only
   - no user-global adoption
   - `.github/copilot-instructions.md`
   - `.github/instructions/**`
   - `.github/hooks/**`
   - optional `.github/agents/**`
2. 定义 cloud-safe overlay：
   - block host secrets / host paths
   - disallow local global mutation
   - enforce branch/PR workflow
3. 明确不可行项：
   - cloud repo 持久 `git worktree` 不是治理对象
   - 必须生效的 `.github/**` policy 文件不能靠 ignore 规避提交

### 任务 C: Workspace safety overlay

开发内容：

1. 在 state schema 中分离 baseline 与 overlays：
   - `baseline.policyProfile`
   - `baseline.skillProfile`
   - `overlays.workspaceSafety`
   - `overlays.cloudSafe`
2. `sync` 输出应合并 baseline + overlay，而不是 overlay 替换 baseline。
3. `doctor` / `adoption-status` 输出双层状态。
4. `install --profile=safety` 限制为 workspace scope 继续保留。

### 任务 D: Safety hook false-positive reduction

开发内容：

1. 读取 `harness/core/safety/*.txt` 与 hook runtime。
2. 区分 read/search/verification vs destructive commands。
3. 为常见低风险命令加入 allowlist：
   - `rg`
   - `find`
   - `git diff`
   - `git status`
   - `node --test`
   - `npm run verify`
4. dangerous patterns 仍 downgrade to ask/deny。

### 预期文件

- `harness/core/state-schema/state.schema.json`
- `harness/installer/lib/state.mjs`
- `harness/installer/lib/safety-projection.mjs`
- `harness/installer/lib/health.mjs`
- `harness/installer/commands/install.mjs`
- `harness/installer/commands/sync.mjs`
- `harness/installer/commands/adoption-status.mjs`
- `harness/core/policy/cloud-safe.md`
- `harness/core/policy/safety.md`
- `harness/core/safety/*.txt`
- `tests/installer/state.test.mjs`
- `tests/safety/projection.test.mjs`
- `tests/hooks/pretool-guard.test.mjs`
- `tests/automation/upstream-refresh-workflow.test.mjs`

### 验证

```bash
node --test tests/safety/*.test.mjs tests/hooks/pretool-guard.test.mjs
node --test tests/installer/state.test.mjs tests/installer/health.test.mjs tests/installer/adoption.test.mjs
node --test tests/automation/*.test.mjs
npm run verify
./scripts/harness install --scope=workspace --targets=all --profile=safety --hooks=on
./scripts/harness doctor --check-only
./scripts/harness sync --dry-run
```

### Commit Plan

- `feat: implement roadmap v1.4 safety overlay governance`
- `docs: record roadmap v1.4 automation and cloud verification`
- merge commit: `merge: roadmap v1.4 safety overlay`

## 8. v1.5: Workflow Productization And Operator Experience

### 目标

把 Harness 的能力从底层规则投影整理成用户可执行的 workflow lanes，同时保持 README 精炼、operator docs 可读、eval/browser 能力可选。

### 任务 A: `readme-slim-pr`

1. 检查 PR #29：

```bash
gh pr view 29 --json state,mergeStateStatus,headRefName,baseRefName,url
```

2. 如果已 merged：
   - fetch / fast-forward dev
   - close/archive task
3. 如果 open：
   - review diff against current roadmap
   - merge or cherry-pick if still valid
4. 如果 stale：
   - 保留最有价值的 README 精简策略
   - 重新生成 v1.5 docs commit

### 任务 B: Workflow lanes

把 gstack 对比中可借鉴点转成 Harness-native lanes：

- `plan`: tracked/deep task setup, companion plan, review gate
- `review`: code review, plan review, archive readiness review
- `verify`: focused tests, full verify, doctor, sync check
- `finish`: merge to dev, push, close/archive records
- `release`: release docs, adoption status, changelog
- `archive`: lifecycle guard, companion sync, move records

不新增第二套 planning system；lanes 只是 commands/docs/skills profile 的用户入口。

### 任务 C: Optional browser/eval contracts

只定义 contract，不引入 mandatory dependency：

- browser contract: local target, action, screenshot, accessibility snapshot, result record
- eval contract: skill input, expected behavior, regression fixture, target IDE
- output location: `docs/maintenance.md` or `docs/architecture.md`

### 预期文件

- `README.md`
- `docs/maintenance.md`
- `docs/architecture.md`
- `docs/release.md`
- 可选：`docs/workflows.md`
- 可选：`harness/core/skills/*`
- `tests/installer/policy-render.test.mjs`
- `tests/adapters/templates.test.mjs`

### 验证

```bash
node --test tests/installer/policy-render.test.mjs tests/adapters/templates.test.mjs
npm run verify
./scripts/harness verify --output=stdout
./scripts/harness doctor --check-only
```

### Commit Plan

- `docs: implement roadmap v1.5 workflow lanes`
- `docs: record roadmap v1.5 verification`
- merge commit: `merge: roadmap v1.5 workflow productization`

## 9. v1.6: Release Readiness And Adoption Stabilization

### 目标

关闭 foundation umbrella，确认 renamed repo / dev / origin / release docs / adoption automation 都稳定。

### 任务 A: `harness-template-foundation`

1. 复查该 umbrella task 的所有 companion plans。
2. 确认当前 repo 名已是 `superpowering-with-files`，历史 `HarnessTemplate` 只保留在历史记录中。
3. 关闭 task 前必须记录：
   - current branch
   - current `origin` URL
   - current `dev` SHA
   - `npm run verify` result
   - `./scripts/harness doctor --check-only` result
   - adoption status result

### 任务 B: Release docs alignment

更新：

- `docs/release.md`
- `docs/maintenance.md`
- `README.md`
- `package.json` version only if release scope requires it

### 任务 C: Adoption stabilization

执行只读检查：

```bash
./scripts/harness adoption-status
./scripts/harness verify --output=.harness/verification
./scripts/harness doctor --check-only
```

如果需要 user-global adoption，必须先做 risk gate：

```bash
./scripts/harness sync --dry-run
./scripts/harness doctor --check-only
./scripts/harness adopt-global
./scripts/harness adoption-status
```

adoption 只有在用户批准或该阶段执行授权明确时进行。

### 任务 D: Re-evaluate default safety posture

仅在 v1.4 overlay 行为已验证后判断：

- keep default-off
- workspace prompt-on enablement
- target-specific default

任何 broader default rollout 都必须有：

- safety false-positive regression tests
- overlay state model
- adoption report
- rollback plan

### 验证

```bash
npm run verify
./scripts/harness verify --output=.harness/verification
./scripts/harness doctor --check-only
./scripts/harness adoption-status
git status --short
git log --oneline --decorate -n 10
```

### Commit Plan

- `docs: implement roadmap v1.6 release readiness`
- `docs: record roadmap v1.6 adoption verification`
- merge commit: `merge: roadmap v1.6 release readiness`

## 10. 全版本文件矩阵

| Area | Files |
| --- | --- |
| Roadmap/docs | `docs/roadmap.md`, `README.md`, `docs/architecture.md`, `docs/maintenance.md`, `docs/release.md`, `docs/install/*.md`, `docs/compatibility/*.md` |
| Planning records | `planning/active/roadmap-v1.*/*`, `planning/archive/<timestamp>-roadmap-v1.*/*`, existing task directories that get closed |
| Companion plans | `docs/superpowers/plans/<date>-roadmap-v1.*.md` |
| Installer commands | `harness/installer/commands/*.mjs` |
| Installer libs | `harness/installer/lib/*.mjs` |
| Core policy/state | `harness/core/policy/*.md`, `harness/core/policy/*.json`, `harness/core/state-schema/state.schema.json`, `harness/core/context-*.json` |
| Hooks/safety | `harness/core/hooks/**`, `harness/core/safety/**` |
| Tests | `tests/core/*.mjs`, `tests/installer/*.mjs`, `tests/adapters/*.mjs`, `tests/hooks/*.mjs`, `tests/safety/*.mjs`, `tests/automation/*.mjs` |
| Automation | `.github/workflows/upstream-refresh.yml`, `scripts/ci/**`, `scripts/local/**` |

## 11. 全版本 commit / record ledger

每个版本完成后，在 `planning/active/roadmap-implementation-plan/progress.md` 追加：

| Version | Branch | Base | Implementation Commit | Record Commit | Merge Commit | Pushed | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| v1.1 | TBD | TBD | TBD | TBD | TBD | no | pending |
| v1.2 | TBD | TBD | TBD | TBD | TBD | no | pending |
| v1.3 | TBD | TBD | TBD | TBD | TBD | no | pending |
| v1.4 | TBD | TBD | TBD | TBD | TBD | no | pending |
| v1.5 | TBD | TBD | TBD | TBD | TBD | no | pending |
| v1.6 | TBD | TBD | TBD | TBD | TBD | no | pending |

每个版本还必须在自己的 `progress.md` 保存：

- Worktree base
- Branch name
- Changed files
- Focused test results
- Full verification result
- `doctor --check-only` result
- `sync --check` or `sync --dry-run` result
- Commit hashes
- Merge hash
- Push result
- Archive path

## 12. Review Checklist

执行前需要用户 review 的关键点：

- 是否接受每个版本都从 `dev` 派生独立 branch，并通过 merge commit 回到 `dev`。
- 是否接受每个版本至少两个 commit：implementation + verification record。
- 是否接受 v1.4 必须等待 2026-05-08 scheduled run evidence。
- 是否接受 PR #22 / PR #29 由执行阶段根据当前 GitHub 状态决定 merge、cherry-pick 或 stale-close。
- 是否接受 user-global adoption 只在 v1.6 明确 risk gate 通过后执行。
