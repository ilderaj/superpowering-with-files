# 任务计划：GitHub origin repo 的 cloud harness 部署方案

## Goal

给出一套可执行的部署方案，把本 harness 部署到 GitHub origin repo 供 Copilot cloud agent 使用，同时保证本地 user-global harness 与 cloud workspace harness 不发生不必要的覆盖、回写、合并或能力串扰，并先停在 review 阶段不执行。

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason:

## Current Phase

Complete

## Phases

### Phase 1: 约束确认与现状恢复
- [x] 读取用户目标与本仓库 AGENTS policy
- [x] 检查 `planning/active/` 现有任务，避免与历史 adoption / projection 结论冲突
- [x] 提取本仓库里与 Copilot、workspace scope、global scope、cloud-safe、hooks 相关的现有能力
- **Status:** complete

### Phase 2: 外部事实核验
- [x] 核对 GitHub 官方文档中 Copilot cloud agent 对 repository instructions、agent instructions、skills、hooks 的当前支持面
- [x] 核对 cloud agent 的运行边界、默认分支限制、推送分支限制与 secrets 边界
- [x] 记录会直接影响方案设计的硬约束
- **Status:** complete

### Phase 3: 方案分型与推荐
- [x] 设计 2-3 条可行路径
- [x] 识别“绝对零重叠”与“同 repo 本地 Copilot 使用”之间的冲突点
- [x] 形成推荐方案与不推荐方案
- **Status:** complete

### Phase 4: 可执行落地计划
- [x] 输出建议的 repo 内落点、命令边界、治理边界和 rollout 顺序
- [x] 明确执行前置条件、验证项与回退思路
- [x] 将 durable 结论写入 planning files，等待用户 review
- **Status:** complete

## Risk Assessment

| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |
|---|---|---|---|
| 本地 Copilot 与 cloud Copilot 同时读取 repo 内 instructions | 在同一个本地 clone 中继续使用本地 Copilot | 用户感知到 global + repo instruction 叠加 | 推荐把 cloud 专用内容限制在 Copilot 的 repo 落点，且本地尽量不用 Copilot 操作该 repo；若必须本地用 Copilot，则接受“薄叠加”而非“零叠加” |
| 共享 `.agents/skills` 被 Codex/Copilot 同时感知 | 在 origin repo 中提交 `.agents/skills` | 本地 Codex / Copilot 都会加载同一套 project skills | 推荐改用 Copilot 专属 repo 技术面：`.github/copilot-instructions.md`、`.github/instructions/**`、`.github/hooks/**`、可选 `.github/skills/**`；不要把 cloud 专用 skill 投到 `.agents/skills` |
| hooks 未进入 default branch 导致 cloud agent 不生效 | 只在 feature branch 提交 `.github/hooks/*.json` | GitHub cloud agent session 看不到 hooks | 把 cloud harness baseline 先经人工 review，再合并到 default branch 后启用 |
| 误把 cloud-safe / safety 做成 user-global | 沿用 `adopt-global` 或 `--scope=both` 的思路 | 本地 global harness 被污染，违背隔离目标 | 方案明确禁止 cloud 方案使用 `adopt-global`、`user-global`、`both`；cloud 侧仅允许 repo-local projection |

## Key Questions

1. 在“必须部署到 origin repo”前提下，怎样把 cloud agent 可见内容限制在 Copilot 的 repo 原生入口，而不是共享给所有本地 IDE？
2. 哪些 GitHub 官方能力必须直接落在 default branch 上，哪些可以继续保留在本地 global harness？
3. 怎样避免 cloud harness 的 repo 内文件被日常本地工作误当成全局 baseline 的一部分继续演化？

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| 本任务新建独立 active task 目录 | 这是新的 tracked analysis / planning 任务，不能覆盖既有 adoption 治理任务 |
| 先做官方事实核验，再出方案 | Copilot cloud agent 的支持面和限制具有明显时效性，不能只靠旧记忆 |
| 推荐“Copilot cloud repo-local overlay”而不是“共享 `.agents/skills` + 根 `AGENTS.md`” | 共享根会被本地 Codex / Copilot 一起感知，不满足隔离目标 |
| 明确把“同 repo 下本地 Copilot 绝对零感知”判定为不可达目标 | GitHub 官方文档已说明 repo instructions 与 agent instructions 会一起生效，本地 Copilot 无法对 repo 内指令失明 |

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| `fd` 不存在 | 1 | 改用 `find` / `rg` 完成扫描 |

