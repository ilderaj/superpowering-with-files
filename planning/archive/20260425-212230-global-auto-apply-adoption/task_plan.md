# 任务计划：Harness 全局自动 Apply Adoption

## Goal

分析当 `HarnessTemplate` 更新后，如何把最新规则自动 apply 到当前机器的 user-global 环境，并给出一个可执行、可验证、不会误伤存量 workspace 的落地方案。

## Current State
Status: closed
Archive Eligible: yes
Close Reason: Completed and verified during archive eligibility review.
Closed At: 2026-04-25T21:22:16

## Current Phase

Complete

## Phases

### Phase 1: 上下文恢复与现状扫描
- [x] 读取用户目标、仓库治理约束和相关技能
- [x] 扫描现有 installer / sync / doctor / verify / update 能力
- [x] 复核相关历史 planning 任务，避免重复设计
- **Status:** complete

### Phase 2: 可行性分析
- [x] 识别“自动 apply 到 user-global”所缺的闭环能力
- [x] 判断哪些能力已存在，哪些需要新增命令或自动化壳层
- [x] 明确风险边界、失败模式和回滚策略
- **Status:** complete

### Phase 3: 落地方案设计
- [x] 产出推荐方案与备选方案
- [x] 给出 adoption 触发、执行、验证、记录四段式闭环
- [x] 明确为什么不应直接动存量 workspace
- **Status:** complete

### Phase 4: 可执行计划交付
- [x] 将结论同步到 findings / progress
- [x] 写出 companion plan，保留详细实施清单
- [x] 向用户汇报可行性结论与实施顺序
- **Status:** complete

### Phase 5: Inline 实现与验证
- [x] 按 TDD 为 `adopt-global` / `adoption-status` 补失败测试
- [x] 实现 adoption orchestration、receipt、drift detection 和 CLI 接线
- [x] 更新 README，保持说明精简
- [x] 运行 targeted installer tests 与仓库级 verify
- **Status:** complete

## Key Questions

1. 仓库更新和 user-global adoption 之间，当前缺的到底是“命令能力”还是“触发器”？
2. 是否可以在不修改存量 workspace 的前提下，只对 user-global 做自动收敛？
3. 如何证明 adoption 已完成，而不是只执行了 `sync`？
4. 自动 apply 失败时，怎样做到 fail-safe，而不是静默漂移？

## Decisions Made

| Decision | Rationale |
| --- | --- |
| 本次作为独立 tracked task 处理 | 涉及多阶段分析、历史任务复用和 durable plan |
| 不直接复用旧 adoption task | 旧任务解决的是“一次性全局 adoption”，这次解决的是“后续每次更新后的自动收敛” |
| 使用 companion plan 记录详细实施清单 | 本任务属于 deep-reasoning 范畴，且用户显式点名 `using-superpowers` |
| 默认只讨论 user-global，不扩展到存量 workspace | 用户已明确说明 workspace 后续 case by case 更新 |
| 推荐新增 `adopt-global`，不把真实机器副作用塞进 `update` | 保持 repo baseline mutation 与 operator machine mutation 的边界清晰 |
| 自动 apply 的判定标准必须包含 receipt / stamp | 仅执行 `sync` 不能证明本机已经 adopt 到当前 repo HEAD |
| 首版 `adopt-global` 强制 user-global-only | 避免共享 manifest / shared state 语义下误改 workspace projection |
| 首版通过成功 receipt + failure log 区分 adoption 结果 | 保留最近一次成功 adoption 证据，同时避免失败覆盖成功记录 |

## Companion Plan Reference

- Companion plan: `planning/archive/20260425-212230-global-auto-apply-adoption/companion_plan.md`
- Companion plan role: 保存详细可行性分析、方案比较和实施清单
- Sync-back status: `2026-04-20` 已完成
