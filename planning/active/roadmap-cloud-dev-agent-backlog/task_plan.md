# Roadmap Cloud Dev Agent Backlog 计划

## Goal
审计并清理项目 roadmap，新增面向 cloud dev 与 cloud agents 的 roadmap/backlog，使未来方向覆盖 cloud 体验对齐 local、Codex/Claude cloud agent 支持、issue/agent assignment 入口和 repo Agent tab 入口。

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Current Phase
Phase 1

## Phases

### Phase 1: 上下文审计与需求收敛
- [x] 读取适用流程技能与 planning 模板
- [x] 扫描现有 roadmap/backlog 文件
- [x] 查找 cloud-dev、Codex、Claude、agent assignment 相关现状
- [ ] 审计 roadmap 与 cloud-dev 文档细节
- **Status:** in_progress

### Phase 2: 方案确认
- [ ] 汇总已有能力与缺口
- [ ] 提出 2-3 种 roadmap/backlog 组织方式
- [ ] 获得用户对落地方向的确认
- **Status:** pending

### Phase 3: 文档更新
- [ ] 更新或重组 `docs/roadmap.md`
- [ ] 新增 backlog 文件
- [ ] 交叉链接 cloud-dev operator guide 与 backlog
- **Status:** pending

### Phase 4: 自检与验证
- [ ] 检查占位词、重复和矛盾
- [ ] 运行文档 diff/check
- [ ] 记录验证结果
- **Status:** pending

### Phase 5: 交付
- [ ] 总结修改内容
- [ ] 标明仍需 GitHub 平台验证的问题
- [ ] 将 task state 更新为 waiting_review
- **Status:** pending

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

## Plan Record: 2026-05-11 17:05:40 UTC+8
- 已将任务分类为 tracked task，因为它包含 roadmap 审计、backlog 新增、现有 cloud-dev 状态梳理和未来跨 agent 平台方向设计。
- 已加载 `planning-with-files`、`brainstorming`、`writing-plans` 相关技能。
- 当前进入 Phase 1：审计现有路线图、cloud-dev 文档和自动化实现后，再向用户确认文档组织方案。

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
