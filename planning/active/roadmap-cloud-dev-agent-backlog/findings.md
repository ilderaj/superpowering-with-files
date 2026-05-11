# Findings & Decisions

## Requirements
- 审计和清理更新项目 roadmaps。
- 创建新的 roadmap 和 backlog。
- 将未来方向写入路线：完善 cloud dev 体验，全面对齐 local 体验。
- 除 GitHub Copilot 外，考虑支持 cloud 上的 Codex 和 Claude agent。
- 调研/表达 issue 创建时能否自动使用 assign cloud agent 模板；不用模板时是否也能 assign cloud agent 执行。
- 将 repo Agent tab 中直接执行任务作为未来能力入口，而不只依赖 issue-triggered 任务。

## Research Findings
- 当前正式 roadmap 文件只有 `docs/roadmap.md`；未发现独立 backlog 文件。
- `planning/active/cloud-dev-harness-feasibility/task_plan.md` 已记录大量 cloud-dev 工作，当前状态为 `waiting_review`，并包含已验证的 Copilot direct assignment API 路径、PR base 为 `cloud-dev` 的真实结果，以及 triage prompt 强化的证据边界。
- 已有代码与测试包含 `scripts/ci/lib/cloud-dev-issue.mjs`、`scripts/ci/run-cloud-dev-issue-triage.mjs`、`tests/automation/cloud-dev-issue.test.mjs` 等 cloud-dev issue triage 组件。
- 搜索未发现现有 backlog 文件；因此新增 backlog 是本次文档结构的一部分，而不是迁移既有 backlog。

## Findings Record: 2026-05-11 17:05:40 UTC+8
- 本次初始审计确认：roadmap 是单文件，cloud-dev 细节散落在 active planning、implementation plan、docs 和代码中。
- 需要把“已验证的 Copilot cloud-dev lane”和“待研究的 Codex/Claude cloud agent、Agent tab、issue template assignment”分层记录，避免 roadmap 把未知平台能力写成既成事实。

## Findings Record: 2026-05-11 17:05:40 UTC+8
- `docs/roadmap.md` 的 current direction 仍聚焦 global Harness baseline、safety/default-off、workspace overlay；active items 也仍是安全 overlay 余项，没有反映刚落地的 cloud-dev operator experience。
- `docs/cloud-dev-harness.md` 已经是当前 cloud-dev 事实源：推荐 issue-first，支持 `/cloud-dev retry`，记录 direct Copilot assignment API with `agent_assignment.base_branch = cloud-dev` 已真实验证；同时明确 Codex/Claude 目前只能本地使用 Harness instructions，不能直接使用 GitHub cloud-dev automation。
- `docs/workflows.md` 已有 `cloud-dev` workflow lane，但它偏操作命令和分支边界，没有未来产品化路线。
- `scripts/ci/lib/cloud-dev-issue.mjs` 生成的是 comment-based `@copilot` prompt；当前 prompt 包含 Base branch 与 Target PR base，但没有 issue template 或 native assignment API 的自动创建逻辑。

## Findings Record: 2026-05-11 17:05:40 UTC+8
- `.github/workflows/cloud-dev-issue-triage.yml` 触发于 `issues.opened/labeled/assigned`、`issue_comment.created` 和 `workflow_dispatch`；它从 `main` checkout，先跑 branch readiness，再通过 runner 评论 issue，不创建 issue，也不直接调用 assignees API。
- `docs/install/copilot.md` 已有 cloud-dev pilot 安装方式：workspace-only Copilot + `cloud-safe` + `github-cloud` + hooks on；这是 cloud dev 对齐 local 体验的 Copilot 侧基础。
- `docs/install/codex.md` 和 `docs/install/claude-code.md` 描述的是普通 workspace/user-global 投影与 hooks；目前没有 `github-cloud` 等价 profile，也没有 cloud issue/agent handoff。
- 仓库根 `.github/ISSUE_TEMPLATE` 不存在；只在 vendored upstream superpowers 目录下有 issue templates。本仓库若要“创建 issue 时自动使用 assign cloud agent 模板”，需要新增 repo-local issue form/template，并决定它只加 labels，还是配合 API/Actions 做 assignment。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Backlog 应使用任务级条目而不是只写主题清单 | 后续可直接转 GitHub issue 或 agent task，减少二次整理 |
| Roadmap 应保持高层方向，backlog 承载可执行 research/implementation slices | 避免 `docs/roadmap.md` 变成过长执行计划 |
| 记录 issue template 与 assignment API 的能力边界 | 模板可以标准化字段和 labels；direct Copilot assignment API 已验证；comment-based prompt branch targeting 仍需单独实测 |
| 将 Codex/Claude cloud 支持先写成 research backlog | 本地 Harness 投影已支持 Codex/Claude，但没有已验证 cloud dispatch path，不能过度承诺 |

## Findings Record: 2026-05-11 17:12:04 UTC+8
- 用户选择方案 A：更新 `docs/roadmap.md` 并新增 `docs/backlog.md`。
- `docs/backlog.md` 现包含 10 个 CDX 条目，覆盖 cloud dev parity audit、issue template、Copilot assignment decision、comment handoff validation、Agent tab research、agent-neutral cloud contract、Codex/Claude cloud research、cloud-dev status summary 和 promotion playbook。
- `docs/roadmap.md` 现包含 v1.7/v1.8 未来路线，并将 active roadmap items 转向 cloud-dev/cloud-agent operator experience。
- 最终验证命令输出 `doc verification passed`，未发现 whitespace、placeholder 或关键文件缺失问题。

## Findings Record: 2026-05-11 20:24:37 UTC+8
- 用户提出的更具体需求是：通过 `https://github.com/copilot` ask 模式 `/create-issue`，human 只输入简短 issue 描述，系统自动补全 cloud-dev 所需的结构、labels，并尽可能自动 assign cloud agent。
- 该需求此前只被 `CDX-002`、`CDX-003` 部分隐含覆盖，没有独立表达“minimal-human intake”这个 operator outcome。
- 结论：需要独立 backlog 条目把它从“模板/assignment 的组合推断”提升为“明确交付目标”，否则后续实现容易只做到 issue form 或 assignment API 其中一半。

## Issues Encountered
| Issue | Resolution |
|-------|------------|

## Destructive Operations Log
| Command | Target | Checkpoint | Rollback |
|---------|--------|------------|----------|

## Resources
- `docs/roadmap.md`
- `docs/cloud-dev-harness.md`
- `planning/active/cloud-dev-harness-feasibility/task_plan.md`
- `docs/superpowers/plans/2026-05-10-cloud-dev-harness-implementation-plan.md`
- `scripts/ci/lib/cloud-dev-issue.mjs`
- `scripts/ci/run-cloud-dev-issue-triage.mjs`
- `tests/automation/cloud-dev-issue.test.mjs`

## Visual/Browser Findings
- None.
