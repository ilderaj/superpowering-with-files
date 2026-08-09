# 人工使用指引: Plan → Execute 路由与输入方式

> 配套审计报告: `reports/audit/2026-08-09-plan-execute-deepseek-executor-audit.md`(Chief 只读审计,approve-with-notes)。
> 本文是 `swf_executor` Plan→Execute 机制的人类操作面,精炼自任务 `plan-execute-deepseek-executor-20260808` 的实操指引。

## 一句话模型

`planning/active/<task-id>/` 下的三件套(`task_plan.md`、`findings.md`、`progress.md`)是唯一权威;Chief 负责接需求、路由、规划、派单、验收;`swf_executor` 是唯一负责生产变更的可见执行角色(锁死 DeepSeek Flash + xhigh,无 fallback);worker 干完只是 candidate,验收后才算数;merge/push/release/发布/发送/凭据/破坏性操作永远需要人类 gate。

## 角色职责

| 角色 | 做什么 | 不做什么 |
|---|---|---|
| 人类(你) | 提需求、做人类 gate、最终验收(accept)、决定 merge/release | 不代替模型写代码细节(除非亲自改) |
| Chief(GPT 侧) | intake、路由(quick/tracked)、规划三件套、构造 Assignment Packet、派单、review、验收回写 | 在"需要可见 worker"时不得 inline 生产变更、不得用 native subagent 顶替主执行 |
| swf_executor(DeepSeek Flash) | 按已接受计划执行生产变更 + 主验证,返回 candidate 证据 | 不重新设计 scope/架构/接口/验收标准;缺决策或模型不可用时返回 blocked;嵌套委托仍用 swf_executor |
| Host(Codex 本体) | 锁 model/effort/permission/path、管理 worker 生命周期、提供 authenticated 证据 | 无 authenticated 证据时 actual model/effort 就是 `unknown`,任何人不得伪称 |

## 路由对照表(核心)

| 路由 | 你怎么输入 | 你会得到 |
|---|---|---|
| **quick(问答/小改动)** | 一句话直接问,零仪式 | 直接回答/小改动,无 Trio |
| **tracked / default(常规开发)** | 一段话按五要素:"实现 X…影响面…约束…验收 verify:trio 全绿 + RED→GREEN 证据…完成后出 draft PR 不要 merge" | Chief 建三件套→切片计划→派 swf_executor→candidate→你验收→你决定 merge |
| **strict(必须可见 worker)** | 加一句:"必须由可见执行角色 swf_executor 完成,不要用隐式子代理" | packet 设 `visible_worker_required`;worker 不可用时 `manual_pending`,绝不偷偷 native |
| **deep(先分析再动手)** | "这个问题需要深入分析再决定…先给证据-backed 分析,我 approve 后再动手" | 先出分析报告等你 approve,再进执行 |
| **涉及人类 gate** | 明说停靠点:"停在 draft PR 等我看"/"不要 push"/"发布前必须我确认" | 停在 gate 前(默认也永远保留你的确认权) |
| **manual_pending 后** | 别重说需求,看 blocker/resumeCondition 三选一:提供合规 worker / 释放 strict / 确认 blocked | 按对应处置继续 |

## 需求输入五要素

1. **目标**: 要达成什么。
2. **影响面**: 哪个仓库/模块/文件(知道就说,不知道让 Chief 先侦察)。
3. **约束与非目标**: 明确不要动什么(如"不动 upstream"、"不加新依赖")。
4. **验收/证明**: 要什么证据、跑什么验证(如"verify:trio 全绿 + RED→GREEN 记录")。
5. **边界与 gate**: deadline、完成后停在哪(如"出 draft PR,不 merge,等我看")。

不需要调用任何 skill、不需要念固定格式、不需要自己建任务——入口策略(AGENTS.md)自动生效,代理自动扮演 Chief 完成路由、规划、派单。

## strict 拓扑与 manual_pending 处置

- 在 Assignment Packet 的 `capability.primaryExecution = "visible_worker_required"` 时启用 strict:主执行必须由可见 worker 完成;visible 不可用时**只能** `manual_pending`(reason `visible_worker_required_unavailable:<detail>`),绝不落到 native subagent。
- `manual_pending` descriptor 携带三件套: `assignmentPacket`(原封不动)、`blocker`(失败原因)、`resumeCondition`(恢复条件)。
- 收到 manual_pending 后的三个选项:
  1. **提供合规 worker**: 开一个 swf_executor 线程(角色已注册于 `~/.codex/config.toml` 的 `[agents.swf_executor]`),把 packet 交给它继续;
  2. **释放 strict 拓扑**: 明确改回 default(接受 legacy visible→native→manual 链),再重派;
  3. **判定 blocked**: 真实外部阻塞(模型不可用、缺权限、缺决策)时记录 blocked,等条件变化再恢复。

## 人类 gate 清单(任何时候都保留)

merge / push(除已授权的分支内提交)、release / deploy / publish(含 PR merge gate)、发送消息/邮件/对外回复、凭据/token/密钥处理、破坏性/不可逆操作(删除、格式化、清空、迁移)。路由或角色配置不构成对这些动作的授权。

## 验收清单(Chief/人类侧)

1. **核对 binding**: worker 用的 Trio 三件套 hash 与派单时一致;不一致 → 拒绝并停止(binding_mismatch)。
2. **核对证据链**: RED 记录、GREEN 通过数、验证命令与退出码、变更路径清单;"worker 说 done"不是证据。
3. **复跑关键验证**(至少): `npm run verify:trio`;涉及 core/homepage 时跑 `verify:all`;`git diff --check`。
4. **检查越权**: 变更是否超出 `allowedOperations`/`nonGoals`/mutablePaths;有无未授权 stage/commit/push。
5. **actual vs requested**: 无 authenticated Host 证据的模型/effort 声明一律视为 `unknown`。
6. **写回并关闭**: `trio accept` → `trio close` →(可选)`trio archive`。

## 红线

**做**: 输入用自然语言讲清目标/影响面/约束/验收;任务开始前确认三件套存在且 hash 一致;packet 永远随派单一起给 worker;worker 结果一律先当 candidate;验收证据要"命令 + 退出码 + 计数 + 变更路径";全局投影用 `./scripts/harness sync --check` / `doctor --check-only` 自检。

**不做**: 不建第四份任务权威文件(Trio 只有三个文件);不在 strict 模式下让 Chief inline 改生产代码或让 native 顶包;不声称 actual model/effort(无 authenticated 证据就是 unknown);不跳过人类 gate 自行 merge/push/release;不把 `manual_pending` 当失败——它是设计内的诚实出口。

## 现状速查(2026-08-09)

- `dev` = `757fc73`(upstream refresh 提交已推送),`main` = `42e19c4`(PR #146 已合并)。
- PR #147(upstream refresh,draft)repo-verify SUCCESS、MERGEABLE、CLEAN,待你决策。
- `swf_executor` 角色已注册: `~/.codex/agents/swf_executor.toml`(flash / xhigh / 无 fallback),备份 `~/.codex/config.toml.bak-plan-execute-20260808`。
- 验证基线: `verify:trio` 217/217、focused 43/43、`verify:all` exit 0。
- 已知待办: Trio CLI `progress` 命令的 BigInt 序列化输出 bug(既有,未触碰的 installer/store 路径),证据以 progress.md 内容为准。
