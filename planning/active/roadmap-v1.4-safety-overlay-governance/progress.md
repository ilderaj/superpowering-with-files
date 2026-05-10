# Progress: Roadmap v1.4 Safety Overlay Governance

## Session Log

### 2026-05-06

- 从 `roadmap-implementation-plan` 接续进入 `v1.4`。
- 确认 `v1.3` 已 merge 回 `dev` 并推送到 `origin/dev`。
- 复核 `post-upstream-automation-followups`、`origin-cloud-harness-deployment-plan`、state overlay 设计以及 safety false-positive 现状。
- discovery 结论：
  - `post-upstream-automation-followups` 只剩 `2026-05-08 20:05 Asia/Shanghai` scheduled run 观察 gate；
  - `pretool-guard.sh` 是唯一 pre-tool runtime，false-positive 修复点在 `safe-commands.txt` 与 `find` 专门分支；
  - cloud repo-local profile 目前只把 Copilot entry / hooks 放进 `.github/**`，skills 还需要切到 `.github/skills`。
- 初次尝试使用外部 Harness worktree 路径 `~/.config/superpowers/worktrees/...001` 做实现，但该路径的写权限审批在平台侧超时。
- 改用仓库内 fallback worktree：
  - Worktree base: `dev @ 1fe45cfce9e09f2d4264cba73f7383703c94e0de`
  - Worktree path: `/Users/jared/SuperpoweringWithFiles/.codex-worktrees/202605061308-roadmap-v1-4-safety-overlay-governance-002`
  - Branch: `codex/202605061308-roadmap-v1-4-safety-overlay-governance-002`
- 已完成实现：
  - 新增 `deploymentProfile` / `workspacePolicyOverlay` state 维度与兼容归一化；
  - `install`、`sync`、`health`、`doctor`、`adoption-status` 接入 baseline + overlay + deployment 读写；
  - Copilot `github-cloud` deployment profile 将 workspace skills 切到 `.github/skills`；
  - cloud bootstrap 模板默认带 `--deployment-profile=github-cloud`；
  - `pretool-guard` 放行 `rg`、`node --test`、`npm run verify`，并对低风险 `find` 单独分流。
- focused verification 已通过：
  - `node --test tests/installer/state.test.mjs tests/installer/paths.test.mjs tests/adapters/skill-projection.test.mjs tests/adapters/skill-profile.test.mjs`
  - `node --test tests/hooks/pretool-guard.test.mjs tests/safety/projection.test.mjs tests/adapters/sync-hooks.test.mjs`
  - `node --test tests/installer/commands.test.mjs tests/installer/adoption.test.mjs tests/installer/health.test.mjs tests/automation/upstream-refresh-workflow.test.mjs`
- full verification 已通过：
  - `./scripts/harness verify --output=stdout`
  - `./scripts/harness doctor --check-only`
  - `./scripts/harness sync --dry-run`
  - `git diff --check`
  - `npm run verify` -> `333 pass / 0 fail`
- 主工作区已与隔离实现 worktree 对齐，并在主工作区复核通过同一套全量验证。
- 准备创建正式 `v1.4` 提交分支时，平台拒绝 `.git/refs` 写入：
  - `git switch -c codex/202605061308-roadmap-v1-4-safety-overlay-governance-003`
  - 错误：`cannot lock ref ... Operation not permitted`
- 在同一窗口内，提权恢复 worktree cache 文件也被平台拒绝，原因不是仓库错误，而是会话执行额度限制；平台给出的下次可继续时间为 `May 7th, 2026 1:45 AM`。
- 恢复策略：保留当前已验证工作区，等待额度恢复后直接从 branch creation -> stage/commit -> merge/push 继续，不回滚已完成实现。
- 已创建 thread heartbeat automation：`resume-roadmap-after-git-quota-reset`，按本地 01:50 wall-clock 自动续跑。
- 2026-05-07 恢复执行时，提权 `git switch -c codex/202605070150-roadmap-v1-4-safety-overlay-governance-003` 已成功，`v1.4` 正式提交线恢复。
- `v1.4` 正式提交线已完成：
  - Branch: `codex/202605070150-roadmap-v1-4-safety-overlay-governance-003`
  - Implementation commit: `4b03004 feat: implement roadmap v1.4 safety overlay governance`
  - Record commit: `23a326b docs: record roadmap v1.4 verification`
  - Merge commit on `dev`: `0ba2f50 merge: roadmap v1.4 safety overlay`
- 本地 `dev` merge 后再次验证：
  - `npm run verify` -> `333 pass / 0 fail`
  - `./scripts/harness verify --output=stdout`
  - `./scripts/harness doctor --check-only`
  - `git diff --check`
- 当前仅剩：
  - 2026-05-08 scheduled run 观察 gate
- `origin/dev` 已更新到 `5b24511 docs: record roadmap v1.4 integration`，其中包含：
  - `0ba2f50 merge: roadmap v1.4 safety overlay`
  - `5b24511 docs: record roadmap v1.4 integration`
- `origin-cloud-harness-deployment-plan` 已关闭并归档到：
  - `planning/archive/20260506-220241-origin-cloud-harness-deployment-plan/`

### 2026-05-08

- 按 hook 要求先复核 `planning/active/`，定位当前 dirty 主因不是 `dev` 代码本身，而是仓库内 fallback worktree `.codex-worktrees/202605061308-roadmap-v1-4-safety-overlay-governance-002`。
- 主工作区锚点：`/Users/jared/SuperpoweringWithFiles` on `dev @ 55de0186cec5ceb5b4709ef090296cb89c261aeb`。
- 关联 worktree 锚点：`/Users/jared/SuperpoweringWithFiles/.codex-worktrees/202605061308-roadmap-v1-4-safety-overlay-governance-002` on `codex/202605061308-roadmap-v1-4-safety-overlay-governance-002 @ 1fe45cfce9e09f2d4264cba73f7383703c94e0de`。
- 比对结果：`git rev-list --left-right --count dev...codex/202605061308-roadmap-v1-4-safety-overlay-governance-002` 返回 `18 0`，说明该 worktree branch 没有未并入 `dev` 的提交，只是滞后 18 个提交并带有自己的未提交工作区改动。
- 根因取证：
  - `git ls-files -s .codex-worktrees/202605061308-roadmap-v1-4-safety-overlay-governance-002` 显示 mode `160000`，证实父仓库错误跟踪了该嵌套仓库 gitlink。
  - `git show --summary --name-status a41d02a -- .codex-worktrees/202605061308-roadmap-v1-4-safety-overlay-governance-002` 证实这条 gitlink 在 `a41d02a Close roadmap v1.6` 被加入主仓库。
- 已执行修复：
  - 在主仓库 `.gitignore` 中新增 `.codex-worktrees/`。
  - 执行 `git rm --cached -f .codex-worktrees/202605061308-roadmap-v1-4-safety-overlay-governance-002`，仅从父仓库索引移除误跟踪 gitlink，保留磁盘上的嵌套 worktree 目录。
- 修复后验证：
  - 主仓库 `git status --short --branch` 只剩预期改动：gitlink staged delete + `.gitignore` 修改。
  - `test -d .codex-worktrees/202605061308-roadmap-v1-4-safety-overlay-governance-002` 通过，确认嵌套 worktree 现场仍在。
- 在本地 `2026-05-08 14:29 CST` 再次复核 closeout gate：`post-upstream-automation-followups` 仍要求等待 `2026-05-08 20:05 Asia/Shanghai` 之后的首次 scheduled run 观察，因此 `roadmap-v1.4-safety-overlay-governance` 目前只能继续保持 active，不能提前 close/archive。
- 本轮先执行 cleanup commit/push，使 `dev` 与 `origin/dev` 对齐到“忽略 in-repo Codex worktrees + 不再跟踪误提交 gitlink”的状态；任务 close/archive 留待 scheduled gate 满足后继续。

### 2026-05-09

- 复核 `main` 上的 production rerun `25583701010`、artifact 和 open PR `#45 chore: refresh upstream baselines`。
- 对 PR `#45` 做目录级和文件级审计：
  - GitHub 原生 diff 超过 300 files 限制，因此改用 `git fetch origin automation/upstream-refresh` + 本地 diff 审计。
  - 目录级统计显示变更主要落在：
    - `.agents/skills`
    - `.claude`
    - `.cursor`
    - `harness/upstream`
    - 以及顶层 `AGENTS.md` / `CLAUDE.md`
  - `gh pr view 45` 显示：
    - `mergeable = MERGEABLE`
    - `reviewDecision = REVIEW_REQUIRED`
    - 当前没有 branch-attached checks
- 在隔离 worktree `/tmp/pr45-audit` 检出 `origin/automation/upstream-refresh @ 476b1ae` 做本地验证：
  - `./scripts/harness verify --output=stdout`：通过
  - `./scripts/harness doctor --check-only`：通过
  - `npm run verify`：通过（用于确认 refresh branch 本身没有代码级失败）
- 发现内容级 blocker：
  - `AGENTS.md` diff 删除了当前仓库厚 entry policy 中的大段 repo-governance 规则，不是可接受的纯 baseline 漂移。
  - `CLAUDE.md` 与 `.github/copilot-instructions.md` 也属于同类 repo-local entry surface，不应被 automation refresh 当作可直接合并产物。
- 已在主工作区实现最小修法：
  - `scripts/ci/lib/upstream-refresh.mjs`
    - 引入 `repoLocalEntryFiles`
    - 将 `AGENTS.md` / `CLAUDE.md` / `.github/copilot-instructions.md` 从 eligible refresh 产物中排除
  - `tests/automation/upstream-refresh-lib.test.mjs`
    - 更新回归测试，改为显式要求 hidden projection roots 保留、repo-local entry files 被排除
- 修法验证：
  - `node --test tests/automation/upstream-refresh-lib.test.mjs tests/automation/upstream-refresh-workflow.test.mjs`：`21 pass / 0 fail`
  - 主工作区 `npm run verify`：`361 pass / 0 fail`
- 额外核实了 Node 20 deprecation warning 的官方升级路径：
  - 当前官方 latest releases：
    - `actions/checkout v6.0.2`
    - `actions/setup-node v6.4.0`
    - `actions/upload-artifact v7.0.1`
  - 三个仓库当前 `action.yml` 的 `runs.using` 都是 `node24`
  - 说明该 warning 后续可独立通过 workflow action major bump 修复，不阻塞当前 PR 审计结论。

## Verification

- Focused state / path / skill projection suites：通过。
- Focused safety / sync-hooks suites：通过。
- Focused commands / adoption / health / automation suites：通过。
- `./scripts/harness verify --output=stdout`：通过。
- `./scripts/harness doctor --check-only`：通过。
- `./scripts/harness sync --dry-run`：通过。
- `git diff --check`：通过。
- `npm run verify`：通过（`333 pass / 0 fail`）。
- `git switch -c codex/202605061308-roadmap-v1-4-safety-overlay-governance-003`：被平台权限/额度限制阻塞，未执行。
- `git switch -c codex/202605070150-roadmap-v1-4-safety-overlay-governance-003`：提权执行成功。
- `git push -u origin codex/202605070150-roadmap-v1-4-safety-overlay-governance-003`：成功。
- `git merge --no-ff codex/202605070150-roadmap-v1-4-safety-overlay-governance-003 -m "merge: roadmap v1.4 safety overlay"`：成功。
- `git push origin dev`：成功。
- merge 后 `npm run verify`：通过（`333 pass / 0 fail`）。
- merge 后 `./scripts/harness verify --output=stdout`：通过。
- merge 后 `./scripts/harness doctor --check-only`：通过。
- merge 后 `git diff --check`：通过。
- `git rev-list --left-right --count dev...codex/202605061308-roadmap-v1-4-safety-overlay-governance-002`：通过，结果 `18 0`，证实 stale worktree branch 没有领先 `dev` 的提交。
- `git ls-files -s .codex-worktrees/202605061308-roadmap-v1-4-safety-overlay-governance-002`：通过，发现父仓库误跟踪了 mode `160000` gitlink。
- `git show --summary --name-status a41d02a -- .codex-worktrees/202605061308-roadmap-v1-4-safety-overlay-governance-002`：通过，证实误跟踪来自 `a41d02a Close roadmap v1.6`。
- `git rm --cached -f .codex-worktrees/202605061308-roadmap-v1-4-safety-overlay-governance-002`：成功。
- 修复后 `git status --short --branch`：通过，仅剩预期的 `.gitignore` 修改与 gitlink staged delete。
- PR audit worktree `./scripts/harness verify --output=stdout`：通过。
- PR audit worktree `./scripts/harness doctor --check-only`：通过。
- PR audit worktree `npm run verify`：通过。
- repo-local entry exclusion fix `node --test tests/automation/upstream-refresh-lib.test.mjs tests/automation/upstream-refresh-workflow.test.mjs`：通过（`21 pass / 0 fail`）。
- repo-local entry exclusion fix 后主工作区 `npm run verify`：通过（`361 pass / 0 fail`）。
- repo-local entry restore fix `node --test tests/automation/upstream-refresh-lib.test.mjs tests/automation/upstream-refresh-workflow.test.mjs`：通过（`22 pass / 0 fail`）。
- repo-local entry restore fix 后主工作区 `npm run verify`：通过（`362 pass / 0 fail`）。
- `gh workflow run upstream-refresh.yml --ref main -f create_pr=true`：
  - `25604547504`：失败，暴露“repo-local entry files 被排除后仍留在 worktree，继续触发 allowlist violation”
  - `25604665893`：失败，暴露“`git restore` 错把 untracked repo-local entry files 当成 tracked pathspec”
  - `25604752525`：成功，production path 恢复
- `gh pr view 45` 最终复核：通过，repo-local entry files 已从 refresh 产物移除
- `gh api repos/ilderaj/superpowering-with-files/pulls/45/merge -X PUT -f merge_method=merge`：成功，merge sha `cbe0bb77ff4460928adb6da72ffb29c0da556572`

## Current Execution State

- Discovery: complete
- Implementation: complete
- Focused verification: complete
- Full verification: complete
- Merge: complete
- Push: complete
- Scheduled-run gate: complete
- Current blocker: none
