# swf-dsh — dsh 宿主适配前言

本文件是 swf-dsh 插件对 SWF Trio v2 策略的 dsh 宿主改写说明。语义权威：
reports/audit/2026-08-15-dsh-plugin-feasibility.md（commit 890b43c，第 4 节），
插件内所有能力包与模板均原样 vendored（逐字节一致），本前言只声明宿主差异。

## 四条规则改写（报告第 4 节）

1. 「可见 worker」重定义：在 dsh 宿主下，可见 worker = 经 ctx.subagents
   派发且记录 {SessionId, provider, declared model} 的 subagent。无记录直接
   派发 = silent fallback，一律禁止；不可用即 manual_pending，绝不顶替。

2. 证据三态化（actual=unknown）：模型/effort/worker 身份证据只能是
   authenticated / host-claimed / unknown 之一。新增 host-claimed 态，
   且 host-claimed 永远不得写成 authenticated（write 边界由
   src/core/evidence.ts 的 guard 强制执行）。

3. approval_policy=never 语义映射：不复刻 Codex 专属字段，映射为 dsh
   approval preset（ask / never）+ 高风险类强制 manual_pending；
   gated 类别无 approval 即停。

4. 「不得用原生 subagent 顶替执行 worker」重述：在 dsh 宿主下改写为
   「不得用无记录 subagent 顶替可见 worker」——防静默降级的意图不变。

## 触发与直通（决策 12 的宿主侧实现）

报告决策 12 原以 conversationEvents 作为自动检测/拦截 seam。经 dsh 官方源码
（commit 47f943859bef60e4160492346772ded9b24f765a）核实：conversationEvents
与 inputTriggers 是 client/UI 侧服务（packages/client/**），CLI 宿主上下文
可能不提供。swf-dsh 改用宿主侧服务面：

- 自动检测：sessions 服务的 session/created 生命周期事件 + 工作目录文件系统
  判定（planning 三件套或 .swf-task 标记），决策仍走 Slice 0 passthrough 核心。
- 拦截面：SWF 会话注册 session/event 观察者（会话级状态 + approval policy
  fold）；/swf 命令面经 commands 服务注册。
- 非 SWF 会话透明直通：不注册任何拦截、不写任何文件。

## 版本与边界

- @deepseek-ai/dsh 精确 pin 0.1.0-rc.6（lockfile），升级必须过测试门。
- 本地 cordis patch 安装；不发布 npm。
- Trio 规划文件唯一权威；dsh session 仅证据/执行日志。
- 本插件只写 planning/active/<task-id>/swf-packet.json 与
  planning/active/<task-id>/evidence/（三态证据）。
