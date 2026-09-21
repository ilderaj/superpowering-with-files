# 立即修复验收：任务生命周期与默认 Project

2026-09-21。真实任务：SUP-53。用户授权当前执行，未等待夜班。

## 其他本地产品怎样创建 Project

| 层级 | 身份与职责 | 默认规则 |
|---|---|---|
| 本地产品 | productKey + 已验证 Git family/root | 不以 Codex 侧栏名称或 Trio 数量识别产品 |
| Team | 工作流、组织和权限 | 复用明确批准的既有 Team，不自动给每个目录建 Team |
| Project | 产品／独立交付线 | 首次请求接入时一个 main；已接入的产品保留 defaultProjectId |
| Issue | tracked task／slice | 多个 Trio 对应不同稳定 taskId，可共享 Project |
| Labels | 工作流、执行器、关注点 | 不充当绑定身份或权限 |
| Status | 任务生命周期 | 恢复先 Backlog，再独立审核 readiness/nightly |

例如产品 A 有 15 个 Trio，通常是 1 个 Project + 15 个任务，并非 15 个 Project。只有明确独立的交付线才拆分；SWF 的四条线不是其他产品的默认模板。bootstrap-project 规划器及 CLI 校验完整目录、精确 ownership、重复归属、Team 和已关闭 Project；它返回方案，由现有带 guard 的 MCP 流程创建、读回后登记。

## 已修复

- Task ID 跨 close/archive/reopen 保持稳定，时间戳目录只作定位。
- v1 resume-brief 与 v2 resolver 都使用稳定身份；active 路径/Task ID 不符、重复 ID、归档缺失 ID 均拒绝猜测。
- close/archive/reopen 使用既有 binding 保存最新待同步事件。旧回执不能清除新事件，原有其他同步欠账保留。
- staging/ack 使用 canonical binding validators；损坏元数据不改写。
- 当前执行者立即同步，离线失败留下欠账；已更新实际白班/夜班提示，先恢复同步再选择任务。
- 恢复复用 issue UUID，回 Backlog，去除 nightly/agent-ready/agent-running 等运行标签；已关闭 Project 不准借旧绑定绕过 intake。
- 单个 Trio 归档不删除或归档共享 Project；Project 退休需单独检查全部任务和 Roadmap。

## 验证证据

- 完整 verify:core：523 项核心/运行/安装/适配/自动化测试 + 82 项 plugin-kit，全部通过。
- 最后受影响模块测试：41 项通过（包括审查后补充的边界条件）。
- 两个实现 helper + 独立 review；发现并修复 active 身份错位和 staging 绑定校验问题。
- 18 个相关已安装文件按 allowlist 更新，字节读回一致；备份见 adoption.json。未覆盖无关 hooks/ux-design 修改。
- 实际 Host night/morning prompts 与仓库来源一致，原计划、模型、项目保持不变。
- 真实 SUP-53：close→Done，archive→同一 Done，归档目录 resume-brief 找回原 binding，reopen→同一 issue Backlog。每次 pendingRetry 清零；标签保留 workstream:isolation、swf-managed、executor:codex-local，没有 nightly。
- issue UUID 始终为 7b8f4699-5c35-4a90-b3e6-0e25edcdf82f；Project UUID 始终为 2c23513e-5abd-4e71-9212-8814f9b3aa12。逐步证据见 close/archive/reopen-* JSON。本任务最终再关闭为 Done。

## 边界

本地命令负责本地状态和同步事件，不能自行认证 Linear；执行中的 agent 立即用连接器同步。离线时不把待同步说成已成功。helpers 不是 Host 强制拦截器或跨进程事务锁。仅 Codex 侧栏开关不会重建 Project；实际 root 搬迁、独立 clone、非 Git 目录仍需明确注册／重绑定，身份未知时停止自动执行。此次验证为当前真实手工执行，不冒充夜班 cron 已触发。
