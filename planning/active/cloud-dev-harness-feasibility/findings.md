# Cloud Dev Harness 可行性分析发现

## 已知事实
- 当前主工作区为 `/Users/jared/SuperpoweringWithFiles`，分支 `dev`，HEAD `69cf018`。
- 仓库默认分支为 `main`，当前工作分支为 `dev`。
- 仓库已有多个隔离 worktree，说明现有流程已经重视并行隔离。
- `docs/install/copilot.md` 已记录 repo-local cloud execution：`install --targets=copilot --scope=workspace --profile=cloud-safe --deployment-profile=github-cloud --hooks=on`，并将 GitHub-origin cloud workspace skill root 切到 `.github/skills`。
- `docs/architecture.md` 说明核心策略来自 `harness/core/policy/base.md`，各平台由 adapter 投影；GitHub Copilot hooks 使用 `.github/hooks/*.json` 与 `.github/hooks/*` helper scripts。
- `docs/workflows.md` 已有 plan/review/verify/finish/release/archive lane，适合扩展为 cloud-dev lane 或在现有 lane 上增加 cloud 分支约束。
- `.github/workflows/upstream-refresh.yml` 是现有 Actions 自动化样板：`workflow_dispatch` + schedule，最小权限 `contents: write` / `pull-requests: write`，默认 `create_pr: false` rehearsal，可选 PR 创建。
- `harness/core/policy/cloud-safe.md` 限制 cloud 工作区写 HOME、全局安装、host-only secrets 和出站 credential-bearing 自动化；适合作为 cloud dev agent 的 baseline overlay。
- `harness/installer/commands/cloud-bootstrap.mjs` 已能生成 Codespaces safety bootstrap；模板会运行 `./scripts/harness install --scope=workspace --profile=cloud-safe --deployment-profile=github-cloud --hooks=on`。
- `harness/installer/lib/state.mjs` 中 `deploymentProfile` 仅支持 `standard` 和 `github-cloud`，且非 workspace scope 禁止使用非默认 deployment profile。
- `harness/core/metadata/platforms.json` 已把 Copilot `github-cloud` 的 workspace skill root 切到 `.github/skills`，测试覆盖该行为。
- 归档任务 `origin-cloud-harness-deployment-plan` 已确认：cloud harness 推荐是 Copilot-only repo overlay；不推荐根 `AGENTS.md` 或共享 `.agents/skills` 作为 cloud 专用入口。
- GitHub 官方文档确认：Copilot cloud agent 在 GitHub Actions 驱动的临时环境中工作，可研究、计划、改代码、跑测试、推 branch、可开 PR；单次任务只能操作指定 repo、一个 branch、一个 PR。
- GitHub 官方 hooks 文档确认：`.github/hooks/*.json` 必须存在于 default branch 才会被 Copilot cloud agent 使用。
- GitHub 官方 agent skills 文档确认：project skills 支持 `.github/skills`、`.claude/skills` 或 `.agents/skills`；对本方案应优先使用 `.github/skills` 以降低本地跨 agent 串扰。

## 待研究
- Harness adoption/install 的现有入口和平台支持。
- GitHub Actions / cloud agent 是否已有文档或脚本基础。
- 分支、base、同步、权限、PR 边界的安全约束。

## 风险判断
- `cloud-dev` 可以作为 base 分支或 staging 分支，但不应作为 agent 直接反复 force-push 的工作分支；agent 每个 issue/task 应使用独立 `cloud-dev/<issue>-<slug>` 或 Copilot 原生 branch，然后向 `cloud-dev` 或 `dev` 开 PR。
- 如果目标是完全不让本地看到 cloud harness 文件，则不可达；一旦文件进入 repo，本地 checkout 会看到。但可通过只在 `.github/**` 存放 Copilot cloud 专用入口，把对本地 Codex/Claude/Cursor 的影响降到最低。
- Actions 可以监听 issues 并触发 orchestration，但真正“让 Copilot cloud agent 自动开发”的公共接口需要按 GitHub 当时支持面选择：优先使用 issue assignment / `@copilot` / custom agent 入口；如果需要 Actions 主动调用 agent，需要额外确认可用 API 或 GitHub App 能力。
- 最终建议采用 staged pilot：先 docs-only / planning task，再低风险 test/docs/refactor，最后才开放普通 feature implementation。
- 工程级 plan 应优先实现可测试的纯函数层：`scripts/ci/lib/cloud-dev-branch.mjs` 和 `scripts/ci/lib/cloud-dev-issue.mjs`，再接 runner 与 workflows，避免把 GitHub Actions 行为写成不可测试脚本。
- `cloud-dev` sync 必须默认 check-only；sync path 只能在明确 `mode=sync`、repo variable enabled、无 open cloud PR、且 `cloud-dev` 可从 `origin/dev` fast-forward 时执行。

## Findings Record: 2026-05-10 22:20:39 UTC+8
- implementation plan 已被用户批准执行，当前活动任务继续沿用 `cloud-dev-harness-feasibility` 目录，并把 companion implementation plan 作为详细施工清单。
- 当前工作区不是 linked worktree：`git rev-parse --git-dir` 与 `--git-common-dir` 都指向仓库根 `.git`。
- worktree preflight 推荐保留当前开发上下文，使用 `dev @ 8be83eada6ebb7d0637d3f2cedd0d24bc1bb3d4e` 作为隔离工作区基线。
- 当前 `git status --short` 仅看到无关未跟踪项 `.agents/skills/planning-with-files/scripts/__pycache__/`；说明主工作区并非完全干净。

## Findings Record: 2026-05-10 22:24:47 UTC+8
- 当前实现在 linked worktree `.worktrees/202605101422-cloud-dev-harness-feasibility-001` 中进行，避免污染主 `dev` 工作区。
- worktree 分支为 `202605101422-cloud-dev-harness-feasibility-001`，显式基线为 `dev @ 8be83eada6ebb7d0637d3f2cedd0d24bc1bb3d4e`。
- `npm run verify` 在该 worktree 基线上已通过，说明仓库当前测试基线干净。
- Task 1/2 的最近邻实现模式来自 `scripts/local/sync-dev-after-upstream-pr.mjs` 与 `tests/automation/local-dev-sync.test.mjs`：先测试纯函数，再用注入式 command runner 组装可测试的 CLI。
- workflow 静态测试可直接复用 `tests/automation/upstream-refresh-workflow.test.mjs` 中的 block/step 解析 helper。

## Findings Record: 2026-05-11 00:03:43 UTC+8
- Task 5 review 暴露了 implementation plan 内部的一个真实冲突：Task 1/2 明确让 `analyzeCloudDevSync({ mode: 'check' })` 返回 `reason: 'check_only'`，而 Task 5 的 readiness handoff 又尝试仅凭 `reason` 判定是否 ready。
- 已通过实际复现确认：`analyzeCloudDevSync()` 在 `mode='check'` 下，无论分支是 diverged、`cloud-dev` ahead，还是存在 open PR，都会返回 `reason: 'check_only'`。
- 因此 readiness gate 的根因不是 YAML 语法，而是“把被压平的 `reason` 当成健康状态”。修复应改为读取 result report 的结构化字段（至少 `aheadBehind` 与 `openPullRequestsTargetingCloudDev`），而不是继续放大 `check_only` 的语义。
- `.github/workflows/cloud-dev-issue-triage.yml` 当前也没有排除 PR comments；`issue_comment` 事件默认会覆盖 issue 和 PR discussion comment，需要显式加 guard 才符合 issue triage 预期范围。

## Findings Record: 2026-05-11 01:44:43 UTC+8
- `npm run verify` 的剩余失败不在本次 cloud-dev 实现范围内：失败测试是 `tests/mcp/receipt-ledger.test.mjs` 与 `tests/mcp/safe-write.test.mjs`，根因是当前 worktree 的 Harness projection manifest/state 与受管 entry 文件（尤其 `AGENTS.md`）不一致，`applyWritePlan(sync)` 命中了现有的 safe-apply ownership 拒写逻辑。
- `./scripts/harness doctor --check-only` 的失败同样属于现有环境/元数据问题：当前 worktree 缺失 `.github/copilot-instructions.md` 与 `CLAUDE.md`，同时 doctor 仍报告 companion-plan 引用不一致；这些都不是 cloud-dev feature 代码路径本身的回归。
- `node scripts/ci/check-cloud-dev-branch.mjs --mode=check` 失败则是 rollout prerequisite 未满足：远端尚未创建 `cloud-dev` 分支，因此 `git fetch origin dev cloud-dev` 会返回 `fatal: couldn't find remote ref cloud-dev`。

## Findings Record: 2026-05-11 12:01:30 UTC+8
- 当前 cloud-dev rollout 的稳定契约是：`origin/cloud-dev` 必须与 `origin/dev` 保持零 staging-only 差异；否则 branch checker 会把 `cloud-dev` 视为 ahead/blocking state，不适合派发新 cloud tasks。
- 因此 `github-cloud` / `cloud-safe` / Copilot-only 试跑形态不能直接作为 `cloud-dev` 上的额外提交存在；GitHub cloud baseline 必须通过默认分支 `main` 的 workflow/docs/entry 提供，而不是让 `cloud-dev` 脱离 `dev` 产生长期额外 diff。
- 触发 issue-driven cloud iteration 之前的最低 GitHub 条件现已具备：默认分支拥有 workflow 文件，repo variables 已开启，cloud-dev labels 已创建，远端 `cloud-dev` 已存在且与 `dev` 对齐。

## Findings Record: 2026-05-11 13:26:28 UTC+8
- 后续 cloud work 的推荐入口应是 GitHub issue，而不是 `https://github.com/copilot` 上的自由描述；原因是 issue 才能承载 `cloud-dev` / `agent:*` labels、Actions readiness gate、标准化 `@copilot` handoff、PR review trail 和 promotion 记录。
- `https://github.com/copilot` 可用于非正式讨论或实验，但不应被视为受 Harness 管控的 cloud-dev 工作，除非最终回落到一个带标签的 GitHub issue。
- 当前实现的 GitHub cloud-dev lane 是 Copilot-first：workflow 会生成 `@copilot` prompt，`github-cloud` deployment profile 也是 Copilot 专用；Codex 和 Claude 仍可使用 repo-local Harness entry/skills，但没有被当前 GitHub issue triage 自动派发。

## Findings Record: 2026-05-11 15:30:10 UTC+8
- 实测 issue-first cloud-dev 流程可用：创建带 `cloud-dev` + `agent:impl` 的 issue 后，`Cloud Dev Issue Triage` 会自动运行，并在 issue 上发布标准化 `@copilot` handoff 评论。
- 实际示例为 issue `#55`，workflow run `25656460637` 成功。
- 当前 workflow 存在去重缺口：issue `opened` 与后续 label 事件会各自触发 triage，导致同一 issue 产生重复 `@copilot` 评论；在 #55 的演示中共出现 3 条重复 handoff 评论。

## Findings Record: 2026-05-11 15:33:20 UTC+8
- 最小且足够的修复点在 triage runner，而不是 workflow trigger：即使保留 `opened` / `labeled` / `assigned` 三类 `issues` 事件，只要 runner 在自动 issue 事件发评论前查询现有 issue comments 并检测同体 `github-actions` 评论，就能消除重复 handoff。
- 去重应只默认施加在自动 `issues` 事件；显式 `/cloud-dev retry` 是人工恢复动作，不应被同样的自动查重静默吞掉。
- 本地对真实 issue `#55` 运行修复后的 runner 后，结果变为 `already_commented`，证明当前实现不会再向同一个 issue 追加第 4 条重复 handoff 评论。

## Findings Record: 2026-05-11 15:51:27 UTC+8
- 最终线上稳态依赖两层保护同时存在：
	- runner 仅对 automatic `issues` 事件执行同体 `github-actions` handoff 去重
	- `.github/workflows/cloud-dev-issue-triage.yml` 通过 `concurrency` 按 issue number 串行化自动 triage runs
- 手动恢复语义保持不变：`issue_comment` 的 `/cloud-dev retry` 与 `workflow_dispatch(issue_number)` 仍是显式恢复入口，不会因为已有同体评论而被静默吞掉。
- 真实 GitHub 验证已确认修复生效：issue `#57` 在 `main` 上触发多次 `issues` runs 后，最终只出现 1 条标准 `@copilot` handoff 评论。

## Findings Record: 2026-05-11 15:59:15 UTC+8
- GitHub 官方的 issue assignment API 在本仓库可用，`repository.suggestedActors(capabilities: [CAN_BE_ASSIGNED])` 已返回 `copilot-swe-agent`，说明仓库级 Copilot 接单入口已真正打开，而不只是 triage 评论可用。
- 通过 `POST /repos/OWNER/REPO/issues/ISSUE_NUMBER/assignees` 传入 `agent_assignment.base_branch = cloud-dev` 后，Copilot cloud agent 的真实 task artifact 会保留该 base：本次 issue `#58` 的 task artifact 返回 `base_ref = cloud-dev`。
- 真实生成的 PR 也与 task artifact 一致：PR `#59` 为 `app/copilot-swe-agent` 创建的 draft PR，`baseRefName = cloud-dev`、`headRefName = copilot/validate-copilot-issue-assignment`。这说明 issue-first + Copilot assignment 路径可以把 PR base 稳定压到 `cloud-dev`，不再只是依赖 triage 评论文本约束。

## Findings Record: 2026-05-11 16:02:48 UTC+8
- direct Copilot assignment 与 triage workflow 是两条不同控制面：issue `#58` 上虽然留下了 `Cloud dev preflight is not ready` 的 triage 评论，但 Copilot issue assignment 仍然真实启动了 agent task 并创建了 PR `#59`。因此 direct assignment 不能被描述成 triage gate 的等价替代，它更像一个可验证但需人工预检的 override 路径。
- 对 PR `#59` 的持续跟进显示，branch targeting 约束在执行过程中仍然稳定：task、session、artifact 和 PR 都保持 `cloud-dev` 为 base；当前尚无文件改动，说明“branch correctness 已验证”与“任务内容已完成”需要分开表述。

## Findings Record: 2026-05-11 16:51:31 UTC+8
- PR `#59` 最终并非只做 docs 点缀，而是把 `base_branch=cloud-dev` 从“operator 约束”推进成了“prompt 协议的一部分”。这会让 triage 生成的 `@copilot` 评论同时包含：
	- 机器可读指令：`base_branch=cloud-dev`
	- 人类可读约束：`Base branch: cloud-dev`、`Target PR base: cloud-dev`
- 这项改动与本轮 direct assignment 实验形成闭环：assignment API 已证明 `base_branch` 能被 GitHub cloud agent 保留，PR `#59` 则把同样的键名写进 triage prompt，降低未来仅靠自然语言约束而发生 branch 漂移的概率。
- 目前仍有一个治理层缺口：PR `#59` 没有公开的 checks 结果，也没有在 PR 描述里附带实际跑过的测试命令。因此可以认为“变更方向与覆盖面合理”，但不能把它表述成“已由 Copilot 自证测试通过”。

## Findings Record: 2026-05-11 17:01:06 UTC+8
- 正式 review 后，未发现 PR `#59` 的代码级阻断问题；最相关的风险是“证据外延”而不是“实现错误”。
- 具体来说，`scripts/ci/lib/cloud-dev-issue.mjs` 中新增的 `base_branch=cloud-dev` 只证明 triage comment 会包含该 directive，并不能单独证明 GitHub 的 `@copilot` comment handoff 面一定会解析这个键。现有测试也只覆盖字符串存在性，而非线上行为语义。
- 因此更准确的 operator 结论应是：
	- direct assignment API 路径已经过真实线上验证，能保留 `cloud-dev` base
	- triage comment 路径现在会显式发送同名 directive，但它的“是否被 GitHub comment handoff 语义解释”为后续可继续验证的问题
- 本地最窄验证已经补齐：在 PR 分支代码上执行 `node --test tests/automation/cloud-dev-issue.test.mjs`，17 个测试全部通过。这足以支撑“小改动未破坏现有 issue triage 测试面”的判断。

## Findings Record: 2026-05-11 17:05:47 UTC+8
- 从 merge recommendation 角度看，PR `#59` 更适合被表述为 prompt-hardening / protocol-clarification 变更，而不是 enforcement 变更。
- `mergeStateStatus = CLEAN`、diff 很小、触及测试本地通过，说明这不是“先补代码再说”的 PR；真正需要先修的是标题与 PR body 的 claim 强度。
- 因此推荐顺序是：
	- 先改标题与描述，避免使用会暗示线上强制语义已经被证明的 `Enforce`
	- 然后即可作为低风险改动合入 `cloud-dev`
