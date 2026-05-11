# Roadmap Cloud Dev Agent Backlog 计划

## Goal
审计并清理项目 roadmap，新增面向 cloud dev 与 cloud agents 的 roadmap/backlog，使未来方向覆盖 cloud 体验对齐 local、Codex/Claude cloud agent 支持、issue/agent assignment 入口和 repo Agent tab 入口。

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason:

## Current Phase
Phase 5

## Phases

### Phase 1: 上下文审计与需求收敛
- [x] 读取适用流程技能与 planning 模板
- [x] 扫描现有 roadmap/backlog 文件
- [x] 查找 cloud-dev、Codex、Claude、agent assignment 相关现状
- [x] 审计 roadmap 与 cloud-dev 文档细节
- **Status:** complete

### Phase 2: 方案确认
- [x] 汇总已有能力与缺口
- [x] 提出 2-3 种 roadmap/backlog 组织方式
- [x] 获得用户对落地方向的确认
- **Status:** complete

### Phase 3: 文档更新
- [x] 更新或重组 `docs/roadmap.md`
- [x] 新增 backlog 文件
- [x] 交叉链接 cloud-dev operator guide 与 backlog
- **Status:** complete

### Phase 4: 自检与验证
- [x] 检查占位词、重复和矛盾
- [x] 运行文档 diff/check
- [x] 记录验证结果
- **Status:** complete

### Phase 5: 交付
- [x] 总结修改内容
- [x] 标明仍需 GitHub 平台验证的问题
- [x] 将 task state 更新为 waiting_review
- **Status:** complete

## Risk Assessment

| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |
|---|---|---|---|
| Roadmap 过度承诺未验证的 GitHub cloud agent 能力 | 将 direct assignment 或 Agent tab 能力写成已完全自动化 | 用户和后续实现者误判平台边界 | 把已验证、假设、待验证分别写清；把平台未知项放入 backlog research |
| 与现有 cloud-dev 任务状态重复或冲突 | 未读现有 `cloud-dev-harness-feasibility` 记录就重写路线 | 文档出现两套说法 | 以现有 planning 记录和 docs 为事实源，新增 roadmap/backlog 只做路线层归纳 |
| Backlog 粒度过粗不可执行 | 只写愿景，不拆验收标准 | 后续 issue/agent 执行困难 | 每项 backlog 附 scope、acceptance signal、dependencies |

## Key Questions
1. 现有 roadmap 是否已经包含 cloud-dev 后续方向，哪些需要清理或提升优先级？
2. Cloud dev 要如何定义“全面对齐 local 体验”：安装/profile、planning state、verification、worktree/branch safety、handoff 是否都覆盖？
3. GitHub issue 能否通过模板或 API 自动触发/assign cloud agent；不用模板时是否也能通过 assignees API 或评论完成？
4. Codex 和 Claude agent 在 cloud 上的支持应先写成平台研究、抽象接口，还是直接写实现 backlog？
5. Repo Agent tab 直接执行任务属于 GitHub 平台能力、Harness UI/CLI 能力，还是两者的集成层？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 使用新的 active task `roadmap-cloud-dev-agent-backlog` | 这是独立于已完成 cloud-dev triage 修复的路线图/产品规划任务，需要自己的持久上下文 |
| 先做 context audit，再修改 docs | 用户提出的问题涉及已验证能力和平台未知项，必须区分事实与计划 |
| 采用 `docs/roadmap.md` + `docs/backlog.md` 结构 | 用户选择推荐方案 A；roadmap 保持高层方向，backlog 承载可转 issue/agent task 的执行条目 |

## Plan Record: 2026-05-11 17:05:40 UTC+8
- 已将任务分类为 tracked task，因为它包含 roadmap 审计、backlog 新增、现有 cloud-dev 状态梳理和未来跨 agent 平台方向设计。
- 已加载 `planning-with-files`、`brainstorming`、`writing-plans` 相关技能。
- 当前进入 Phase 1：审计现有路线图、cloud-dev 文档和自动化实现后，再向用户确认文档组织方案。

## Plan Record: 2026-05-11 17:12:04 UTC+8
- 已完成 roadmap/backlog 更新：`docs/roadmap.md` 新增 v1.7/v1.8 与 cloud-dev active items，`docs/backlog.md` 新增 10 个 CDX backlog 条目，`README.md` 加入 Backlog 链接。
- 已明确记录用户问题的当前答案：issue template 可标准化并加 labels，但不能直接写成已验证 native cloud-agent assignment；不用模板时，direct Copilot issue assignment API with `agent_assignment.base_branch = cloud-dev` 已有真实验证证据。
- 已将 repo Agent tab、Codex cloud、Claude cloud 作为平台 research + agent-neutral handoff contract 路线，避免把本地 Harness 支持误写成 cloud automation 已支持。
- 最终文档验证已通过：`git diff --check`、`awk` trailing whitespace scan、placeholder grep、关键文件存在检查。

## Plan Record: 2026-05-11 20:24:37 UTC+8
- 用户追加了更具体的 operator requirement：希望 `https://github.com/copilot` ask 模式的 `/create-issue` 只需简短描述，就能自动生成 cloud-dev 认可的 issue 结构、labels，并尽可能自动 assign cloud agent。
- 审计结论：现有 backlog 只部分覆盖该需求，分散在 issue template、assignment decision 和 handoff validation 条目中，但没有把“minimal-human `/create-issue` intake”作为明确 backlog item。
- 已决定做最小增量更新：只补 backlog 条目，不重写 roadmap 或 operator guide 当前事实描述。

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Placeholder scan matched its own recorded grep pattern in `progress.md` | 1 | Reworded the progress test input summary so it no longer contains the placeholder red-flag terms, then re-ran final verification successfully. |
