# Findings

## Findings Record: 2026-05-28 13:53:47 UTC+8

### Initial Facts
- 用户要求先把当前 `dev` 工作区中的未提交改动提交到本地，保持主工作区干净。
- 随后需要从本地 `dev` 派生新的 worktree，在隔离环境中执行一次本地 upstream update。
- 执行过程中如果出现问题，需要主动修复，并按 upstream update 的一般执行要点做验证。
- 当前主工作区初始分支为 `dev`。
- 启动时发现未提交改动集中在 `planning/active/sync-main-adopt-global-cleanup-review/` 下的三件套，以及一个新的未跟踪 planning task 目录。

### Working Hypotheses
- 本轮应使用仓库已有的 upstream refresh / update 命令，而不是手工模拟 vendor 变更。
- 本轮更适合新建独立 tracked task，而不是复用已关闭的 upstream repair / followup tasks。

## Findings Record: 2026-05-28 13:59:34 UTC+8

### Worktree Baseline Investigation
- 原生 `EnterWorktree` 创建出的 worktree `202605280557-local-upstream-refresh-dev-worktree-001` 实际落在 `main/origin/main @ 41bb6dd`，不是用户要求的本地 `dev @ 9593c14`。
- 证据：当时 worktree 的 `HEAD` 与 `main` 相同，且相对 `dev` 为 `14 3`；同时 `planning/active/local-upstream-refresh-dev-worktree/task_plan.md` 在该 worktree 中不存在。
- 这表明原生 worktree 的默认 base ref 使用了仓库默认主线，而非当前 local `dev`。
- 尝试在该 worktree 内用 `git reset --hard dev` 修正基线时，命中了 `.git/worktrees/.../index.lock: Operation not permitted`，说明当前沙箱下不适合在这个原生 worktree 内继续做 ref 重写。
- 结论：需要回到主工作区，用手工 `git worktree add <path> -b <branch> dev` 明确从本地 `dev` 建立隔离 worktree。

## Findings Record: 2026-05-28 14:10:02 UTC+8

### Upstream Fetch Failure Analysis
- 仓库定义的标准入口是 `./scripts/harness fetch` → `./scripts/harness update`；兼容性文档还要求在接受变更前补跑 `sync --dry-run`、`doctor --check-only`，必要时跑 `npm run verify`。
- `fetch` 的实现位于 `harness/installer/lib/upstream.mjs`，其 `stageGitCandidate()` 直接执行 `git clone --depth=1 <url> <candidatePath>`，然后删除 candidate 里的 `.git`。
- 在当前环境直接跑 `./scripts/harness fetch --help`，命令并不会输出帮助，而是实际进入 `fetchCommand()`；对 `superpowers` 的 clone 首先失败在 git template hook 拷贝：`cannot copy ... commit-msg.sample ... Operation not permitted`。
- 用空模板目录复现实验后，template 拷贝问题可以绕开，但随后立刻命中网络限制：`fatal: unable to access 'https://github.com/obra/superpowers.git/': CONNECT tunnel failed, response 403`。
- 因此当前会话里标准在线 `fetch` 不可行，根因是 **沙箱网络限制 + git clone 初始化副作用**，不是 update 逻辑本身出错。

### Local Offline Candidate Availability
- 当前主工作区 `.harness/state.json` 中 `upstream` 为空，说明本工作树没有现成 candidate 元数据。
- 但历史 worktree `/Users/jared/.config/superpowers/worktrees/SuperpoweringWithFiles/202605080601-upstream-refresh-6-failure-repair-001` 里保留了 `.harness/upstream-candidates/superpowers` 与 `.harness/upstream-candidates/planning-with-files`，且其 `.harness/state.json` 明确记录这两份 candidate 在 2026-05-08 已完成 fetch/update。
- 这意味着本轮可以尝试复用历史本地 candidate，离线执行一次 `./scripts/harness update`；但 candidate 是旧快照，不等同于“拉到最新 upstream”。
- 将历史 candidate 与当前 `dev` 的 `harness/upstream/*` 比较后发现：
  - `superpowers` candidate 与当前基线只有少量差异，且主要是当前树中额外带入了 `node_modules/ws` 等不应属于 upstream baseline 的内容。
  - `planning-with-files` candidate 与当前基线差异巨大，当前 `dev` 的 baseline 明显比该旧 candidate 新得多，不能把旧 candidate 直接更新回当前树。
- 结论：如果继续离线 `update`，只能有选择地复用与当前基线一致或更可信的 candidate；不能盲目全量套用历史 candidate。

## Findings Record: 2026-05-28 14:29:04 UTC+8

### Offline Update Outcome And Fixes
- 已在手工 worktree `/Users/jared/SuperpoweringWithFiles/.worktrees/202605280557-local-upstream-refresh-dev-worktree-001` 中复用历史 `superpowers` candidate，成功执行一次离线 `./scripts/harness update --source=superpowers`。
- 离线 update 初次产出暴露出真实回归：`harness/upstream/superpowers/AGENTS.md` 被写成指向当前 candidate 目录的绝对路径 symlink，而不是上游原本的相对 symlink `CLAUDE.md`。
- 根因已通过 TDD 确认：`updateCommand()` 的 `applyCandidate()` 使用 `fs.cp(..., { recursive: true })` 复制 candidate 目录时，会把相对 symlink 重写为绝对目标路径。
- 最小修复：在 `harness/installer/lib/upstream.mjs` 中为 `stageLocalCandidate()` 与 `applyCandidate()` 的 `fs.cp` 打开 `verbatimSymlinks: true`，保持 symlink 文本不被重写。
- 已新增回归测试 `updateCommand preserves relative symlinks from the candidate` 到 `tests/installer/upstream-commands.test.mjs`，先红后绿，证明修复有效。
- 修复后重新执行离线 `update --source=superpowers`，`AGENTS.md` 现在正确回到相对 symlink `CLAUDE.md`。

### Verified Result
- 兼容性必需检查已执行：
  - `./scripts/harness sync --dry-run` → 无 projection 变更。
  - `./scripts/harness doctor --check-only` → `Harness check passed.`；仅有 pre-existing companion-plan warnings。
  - `node --test tests/installer/upstream-commands.test.mjs` → `6 pass / 0 fail`。
- 当前隔离 worktree 剩余 diff 仅包含：
  - `harness/installer/lib/upstream.mjs`：symlink preservation 修复。
  - `tests/installer/upstream-commands.test.mjs`：对应回归测试。
  - `harness/upstream/superpowers/AGENTS.md`：由绝对路径修正为相对 symlink `CLAUDE.md`。
  - `harness/upstream/superpowers/tests/opencode/test-bootstrap-caching.mjs`：来自离线 candidate 的 upstream baseline 变化，移除了无参时直接 `SKIP` 的分支。

### Residual Constraint
- 本轮没有完成“在线 fetch 最新 upstream”语义；当前结果基于 2026-05-08 保留的本地 candidate。
- `planning-with-files` 因历史 candidate 明显过旧，被刻意排除在本轮离线 update 之外。
- 若需要真正刷新到当前最新 upstream，后续必须在有 GitHub 访问能力的环境里重新执行标准 `fetch`。

## Findings Record: 2026-05-28 14:54:19 UTC+8

### Online Refresh Recovery
- 当前环境已恢复对 GitHub upstream 的访问能力；`git ls-remote https://github.com/obra/superpowers.git HEAD` 成功返回，说明此前记录的网络 blocker 已不再成立。
- 在隔离 worktree `/Users/jared/SuperpoweringWithFiles/.worktrees/202605280557-local-upstream-refresh-dev-worktree-001` 中，用 `env GIT_TEMPLATE_DIR=\"$(mktemp -d)\" ./scripts/harness fetch` 成功拉取了 `superpowers` 与 `planning-with-files` 两个最新 candidate。
- 随后执行标准 `./scripts/harness update` 成功，当前 worktree diff 覆盖 `harness/upstream/superpowers`、`harness/upstream/planning-with-files`、`harness/installer/lib/upstream.mjs` 与 `tests/installer/upstream-commands.test.mjs` 共 78 个文件。

### Verification Triage
- 相关 focused checks 通过：
  - `./scripts/harness sync --dry-run`：零 projection 变更。
  - `./scripts/harness doctor --check-only`：`Harness check passed.`；只有既有 companion-plan warnings。
  - `node --test tests/installer/upstream-commands.test.mjs`：`6 pass / 0 fail`。
- 直接运行 `uv run python -m unittest discover -s harness/upstream/planning-with-files/tests -p 'test_*.py'` 会出现一组失败，但这些失败不能直接作为 Harness 接受门槛：
  - 其中 `init-session` / `check-complete` 类失败主要来自 Harness overlay 对 upstream baseline 的有意覆盖，不代表 `fetch` / `update` 逻辑损坏。
  - 另有 `clawhub-upload/SKILL.md` parity 缺失属于 upstream 自身仓库在干净 clone 中也可复现的问题。
- 为了区分 upstream 本体与 Harness 集成，我把 `planning-with-files` 最新 HEAD 单独浅克隆到临时目录，只跑关键 Python tests。结果显示：
  - `test_init_session_slug`
  - `test_check_complete_resolver`
  - `test_canonical_script_sync`
 这些在 upstream 干净副本里都通过。
  - `test_skill_md_version_parity` 仍因缺少 `clawhub-upload/SKILL.md` 失败。
- 结论：本轮 update 的主要工作结果是有效的；upstream 自测中的大部分红点是 Harness overlay 语义差异，而不是 update 破坏。

### Baseline Verify Failures Are Pre-existing
- 在 worktree 里运行 `npm run verify`，最终失败集中在两组：
  - `tests/adapters/hook-projection.test.mjs` 的 8 个断言
  - `tests/installer/adoption.test.mjs` 的 2 个断言
- 这 10 个失败与本轮 update diff 无直接对应关系。对照验证表明：
  - 在主工作区 `dev @ 9593c14` 上直接运行 `node --test tests/adapters/hook-projection.test.mjs`，相同 8 个断言同样失败。
  - 在主工作区 `dev @ 9593c14` 上直接运行 `node --test tests/installer/adoption.test.mjs`，相同 2 个断言同样失败。
- 结论：`npm run verify` 的剩余红点属于当前 `dev` 基线既有失败，不应归因于本轮 upstream refresh。

## Findings Record: 2026-05-28 15:21:50 UTC+8

### Root Cause Analysis For The 10 Baseline Failures
- `tests/adapters/hook-projection.test.mjs` 的 8 个失败都属于 **测试期望过时**：
  - `harness/installer/lib/hook-projection.mjs` 现在会把 `harness/core/hooks/runtime-hook-evidence.sh` 作为所有受支持 hook projection 的脚本依赖一并投影。
  - `git blame` 显示该行为是在 `23804de Fix Codex runtime evidence path normalization` 中补进的。
  - 但对应测试仍按旧的 `scriptSourcePaths` 列表断言，没有包含这个 runtime helper。
- `tests/installer/adoption.test.mjs` 的第一个失败属于 **测试期望过时 + 行为已前进**：
  - 在当前 fixture 中，`adopt-global --targets=claude-code --hooks=on` 实际会写出 `.harness/runtime-hooks/claude-code.jsonl`。
  - 因此 `planning-with-files` 的 Claude Code runtime evidence 已经是 `runtime-invocation-verified`，不再是旧测试假设的 `not-measured`。
  - 同一 receipt 中 `superpowers` 仍是 `not-measured`，所以总的 `runtimeInvocationVerified` 继续保持 `false`，这与新事实并不矛盾。
- `tests/installer/adoption.test.mjs` 的第二个失败属于 **实现聚合缺口**：
  - receipt 已显示当前 target 下仍有未 fully measured 的 hook，但 `computeAdoptionStatus()` 原本只要“某个 target 至少有一个 hook runtime verified”就不再输出 advisory。
  - 结果就是：receipt 说“未 fully verified”，而 `adoption-status` 的 `reasons` 却为空，语义不一致。

### Follow-up Flake Exposed After Fixing The 10 Baseline Failures
- 在清掉原来的 10 个红点后，全量 `npm run verify` 继续暴露出 `tests/installer/copilot-usage-budget.test.mjs` 里的 2 个失败：
  - `doctor reports Copilot hook ledger detail and overlap as recoverable warnings`
  - `doctor reports the copilot overlap tax only once`
- 根因不是业务逻辑错误，而是 **诊断超时阈值过紧**：
  - `harness/installer/lib/health.mjs` 用 `HOOK_PAYLOAD_TIMEOUT_MS = 2000` 执行 Copilot 双作用域下的 `task-scoped-hook.sh` payload 测量。
  - 单独复现时，workspace/global 两个 hook 分别只需约 261ms / 309ms。
  - 但放进整套 `npm run verify` 的高负载环境后，这两个测量会偶发超过 2 秒，从而把 `doctor` 变成假阳性失败。
- 最小修复是把该诊断超时上限放宽到 5000ms；单测与随后完整 verify 都证明这足以稳定通过，而不会改变健康检查的语义。

### Current Accepted Solution
- 已在 worktree 中完成以下修复：
  - 更新 `tests/adapters/hook-projection.test.mjs`，纳入 `runtime-hook-evidence.sh` 的新投影契约。
  - 更新 `tests/installer/adoption.test.mjs`，对齐当前真实的 Claude Code runtime evidence。
  - 修复 `harness/installer/lib/adoption.mjs` 的 advisory 聚合逻辑，使“部分 hook 未测到 runtime evidence”的 target 仍会给出非阻塞提示。
  - 将 `harness/installer/lib/health.mjs` 中的 hook payload measurement timeout 从 2000ms 调整到 5000ms，消除 Copilot 预算相关测试的全量负载假阳性。
- 最新 fresh 验证结果：
  - `npm run verify` → `431 pass / 0 fail`
  - `node --test --test-concurrency=1 tests/mcp/*.test.mjs`（包含在上面的 verify 中）→ `21 pass / 0 fail`

## Findings Record: 2026-05-28 15:24:50 UTC+8

### Final Integration Confirmation
- worktree 分支 `202605280557-local-upstream-refresh-dev-worktree-001` 已提交为 `6cbd6a2 chore: refresh upstream baselines from dev worktree`。
- 主工作区 `dev` 已执行 `git merge --ff-only 202605280557-local-upstream-refresh-dev-worktree-001`，当前 `HEAD` 即 `6cbd6a2`。
- 合并后的本地 `dev` 相对 `origin/dev` 处于 `ahead 2`：一个是先前的 planning 进度提交 `9593c14`，一个是本轮 upstream refresh 提交 `6cbd6a2`。

### Answer To The “10 Red Points” Question
- 现在不能再说“10 个红点仍未处理”；它们已经在本轮 task 内被完成归因、修复并重新验证。
- 这 10 个红点的最终原因分两类：
  - 8 个 `hook-projection` 失败：测试期望没有跟上 `runtime-hook-evidence.sh` 已被投影进实现的事实。
  - 2 个 `adoption` 失败：一个是旧期望假设 Claude Code 没有 runtime evidence，另一个是 `computeAdoptionStatus()` 对“部分 hook 未验证”场景的 advisory 聚合缺口。
- 对应解决方案也已经落地：
  - 同步测试契约到当前实现；
  - 修正 `adoption-status` 的 advisory 聚合逻辑；
  - 顺带修掉完整 verify 过程中额外暴露的 Copilot hook payload measurement 2 秒假阳性超时，把阈值调到 5 秒。
