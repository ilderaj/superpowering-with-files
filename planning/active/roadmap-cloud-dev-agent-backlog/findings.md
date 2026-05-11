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

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Backlog 应使用任务级条目而不是只写主题清单 | 后续可直接转 GitHub issue 或 agent task，减少二次整理 |
| Roadmap 应保持高层方向，backlog 承载可执行 research/implementation slices | 避免 `docs/roadmap.md` 变成过长执行计划 |

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
