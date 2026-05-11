# Cloud Dev Harness 可行性分析计划

## Current State
Status: active
Archive Eligible: no
Close Reason:

## 目标
分析是否可以在本项目 GitHub repo 中 adoption 本项目自身的 Harness，并让 Harness 只在专门的 cloud dev 分支上通过 GitHub cloud/Actions/agent 完成开发迭代、测试、commit 和 PR，同时避免污染关键分支、本地 dev 或本地工作区。输出可行性分析报告和可执行实施方案。

## 基线
- Workspace: `/Users/jared/SuperpoweringWithFiles`
- Current branch: `dev`
- Current HEAD: `69cf018`
- Default branch: `main`
- Repository: `ilderaj/superpowering-with-files`
- 本任务不直接实现 CI/agent 自动化代码，只产出分析和方案。

## 阶段
1. 上下文恢复与任务建档 - complete
2. 研究现有 Harness 架构、安装/adoption、workflow 和安全模型 - complete
3. 评估 GitHub cloud 分支、base 同步、issue 触发和隔离策略 - complete
4. 输出可行性分析报告和实施方案 - complete
5. 自检报告覆盖面并总结 - complete
6. 输出工程级 implementation plan - complete
7. 审阅 implementation plan 并恢复执行上下文 - complete
8. 实现 cloud-dev branch pure library - pending
9. 实现 cloud-dev branch runner 与 sync workflow - pending
10. 实现 issue triage library、runner 与 workflow - pending
11. 更新 cloud-dev operator 文档 - pending
12. 运行 focused/full verification 与 dry-run - pending
13. 回写 implementation evidence 与 rollout gate - pending

## 关键决策
- 将 cloud dev 模式视为可选运行模式，不改变本地 dev 的默认工作流。
- 所有自动开发写入必须限制到专用分支命名空间，关键分支只接受 PR。
- 现有文档已经包含 Copilot cloud-safe/github-cloud deployment profile，可作为方案基础而不是从零设计。
- 归档任务 `origin-cloud-harness-deployment-plan` 的核心结论已经在 roadmap v1.4 落地；本报告基于该现状继续规划 cloud dev 分支与 issue 触发模式。

## Companion plan
- Path: `docs/superpowers/plans/2026-05-10-cloud-dev-harness-feasibility.md`
- Summary: 已创建；报告结论为可行，推荐 Copilot cloud repo-local overlay + protected `cloud-dev` staging lane，任务分支 PR 到 `cloud-dev`，再由 gated PR promotion 到 `dev`。
- Sync-back status: complete

## Implementation plan
- Path: `docs/superpowers/plans/2026-05-10-cloud-dev-harness-implementation-plan.md`
- Summary: 已创建；将可行性报告拆成文件级工程任务，覆盖 `cloud-dev` branch helper、sync workflow、issue triage workflow、docs、tests、verification 和 GitHub rollout gate。
- Sync-back status: complete

## Plan Record: 2026-05-10 22:20:39 UTC+8
- 用户已明确要求开始执行 `docs/superpowers/plans/2026-05-10-cloud-dev-harness-implementation-plan.md`。
- 当前执行策略：按任务顺序遵循 TDD 落地纯函数、runner、workflow、文档与验证，再把实现证据回写到本任务目录。
- 执行前 preflight 已完成：当前 checkout 是普通 repo 工作区，不是 linked worktree；当前分支为 `dev`。
- `./scripts/harness worktree-preflight` 推荐 worktree base 为 `dev @ 8be83eada6ebb7d0637d3f2cedd0d24bc1bb3d4e`。

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 误读不存在的 `harness/installer/lib/deployment-profile.mjs` | 1 | 改读真实实现 `harness/installer/lib/state.mjs`，确认 `deploymentProfile` 枚举与校验在 state 层。 |
