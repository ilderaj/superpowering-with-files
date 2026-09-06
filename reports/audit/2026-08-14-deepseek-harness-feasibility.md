# DeepSeek Harness 集成可行性分析报告

- 日期：2026-08-14（Asia/Shanghai）
- 任务：`deepseek-harness-feasibility-20260814`（Trio tracked；capability family=office；route=tracked）
- 范围与状态：本任务完成了基于来源的分析，并仅写入本报告及其新的 Trio 权威文件；未改动业务代码、配置、凭据、已安装的 provider 状态或 Git 状态（暂存/提交/推送）。所有拟议实施仍需后续人工批准。
- 标签约定：`verified`（官方一手来源已验证）、`SWF-local`（当前 SWF 源码/测试/既有报告本地验证）、`assumption`（未证实假设）、`recommendation`（建议）。

## 0. 决策摘要

**结论（recommendation）：可行，但仅作为「实验性、单向、包绑定（packet-bound）的外部 Harness 执行后端」试点；现阶段不建立一等 SWF Host 适配器，不把 Harness 变成任务控制面，也不引入第二个任务权威。**

- 兼容性最强处是进程/SDK 边界（verified + SWF-local）：SWF 把一个决策完备、包绑定的任务发入隔离 Harness workspace，Harness 返回候选证据，Chief 验证后只向 Trio 写入唯一的持久任务更新。
- 现阶段不采用的做法：让 Harness 拥有 SWF 任务状态、改动共享工作树、自动审批动作，或在没有已验证桥接的情况下宣称可见 worker 生命周期（recommendation）。
- 风险与成本不对称：试点可回滚、收益真实；一等适配器与插件耦合在预览期成本高且制造第二权威（recommendation）。

## 1. 事实基础

### 1.1 官方已验证（verified）

- DeepSeek Harness（`dsh`）是开源开发者预览，以 Cordis 插件组合方式构建；文档公开 Web、headless、TypeScript JSON-RPC 与 Python SDK 入口，Python SDK 可对显式 workspace 与 session root 运行任务（来源：官方 Harness 页、quickstart 与 python-sdk 文档，2026-08-14 捕获）。
- Harness 自带 append-only 会话事件日志、plans/goals、子代理注册表、审批服务、沙箱模式、凭据与插件/配置组合；这是运行时局部的执行/会话权威，不是 SWF 任务权威的替代（来源：官方 reference 文档）。
- 沙箱模式为 `read-only` / `workspace-write` / `danger-full-access`，且只约束文件系统效果，不约束网络与进程可见性（来源：sandbox 文档）。
- 审批独立于沙箱并默认 fail-closed；库存 `danger-full-access` 预设把无限制文件系统访问与 `never` 审批配对（来源：approval 与 sandbox 文档）。
- 文档化的最小 Python 组合使用 `danger-full-access`、禁用 compaction、允许对运行时可见的绝对编辑器路径，且文档明确要求 disposable checkout 或容器（来源：python-sdk/quickstart 文档）。**因此它不得在本脏工作根目录运行（verified + recommendation）。**
- 凭据存于 `$DSH_HOME/.credentials.yaml`；Web UI 使用配置的 workspace 并支持 provider/model 切换（来源：providers 文档）。这是凭据/配置边界，需要显式人工门（verified + recommendation）。
- 当前官方 API 文档把 Flash 列为经济路线，但定价于 2026-08-16 调整；成本数字是时间敏感配置，不应内嵌为策略常量（来源：DeepSeek 定价页，2026-08-14 捕获）。
- 上游是 developer preview / release-candidate 质量并明确警告兼容性破坏变更；不应作为未钉版本（unpinned）的硬依赖（verified + recommendation）。

### 1.2 SWF 本地已验证（SWF-local）

- `harness/trio/core/routing.mjs` 是唯一 Trio 路由/策略决策层；不可变分配包只绑定三个规划文件；严格可见 worker 路由失败时 fail-closed 为 `manual_pending`，而非原生回退。
- `harness/trio/hosts/codex.mjs` 渲染当前 `swf_executor` 角色：请求 `opencode-go/deepseek-v4-flash`，校准 high/xhigh/max 档位，无回退模型。它是 Codex-host 角色，不是 DeepSeek Harness 适配器。
- SWF **没有**生产可用的 spawn/continue/status/interrupt/collect 桥来驱动独立 Harness 进程；目前只渲染描述符与 host 角色配置。实际 worker 身份/模型/审批在缺少认证 Host 证据时保持未知（SWF-local；不宣称已有生命周期桥）。
- 现有上游 vendoring 仅覆盖 `planning-with-files` 单一来源及 overlay/provenance/refresh 机制，可作为「日后钉版本引入」的模式参考，但不是「Harness 依赖已受支持」的证据。
- 既有审计报告记录了一条 `opencodex → opencode-go → DeepSeek` 执行路线；此前一次 DeepSeek 路由失败源于累积历史过大与远端 compaction 不可靠，而非任务能力不足。

### 1.3 假设与建议（assumption / recommendation）

- 集成形状的选择、阶段划分、成本控制策略，以及本报告中出现的任何拟议文件/模块名均为假设（hypotheses）与建议，不代表既有模块（assumption）。
- 价格、安全、性能、可用性未作超出当前一手来源的承诺（recommendation）。

## 2. 可行性结论与选项对比

**可行性结论（verified + SWF-local 支撑，recommendation 表述）：进程/SDK 边界兼容性成立，可作实验；一等 Host 适配器与任务控制面不成立，现不实施。**

| 选项 | 说明 | 优点 | 风险/成本 | 结论 |
| --- | --- | --- | --- | --- |
| 1. 维持现有 OpenCode 路线 | 不引入 Harness | 零新增风险与成本 | 无 Harness 运行时能力（本地会话日志、工具追踪、审批服务等） | 作为默认基线保留（recommendation） |
| 2. 包绑定外部 Harness runner（推荐试点） | 窄适配器在一次性 worktree/容器中启动钉版本 headless/SDK 任务，只导出候选证据，同时应用 SWF 与 Harness 两道门 | 能力增量真实、可回滚、无第二权威 | 需要一次性隔离环境、网络出口策略、显式人工审批路径 | 推荐，条件化实施（recommendation） |
| 3. Harness 插件读写 SWF 规划状态 | 插件直接读写 task_plan/findings/progress | 看似便捷 | 制造第二权威，把预览 API 耦合进策略核心 | 现阶段拒绝（recommendation） |
| 4. 完整一等 Host/可见 worker 适配器 | 真实生命周期桥：包摘要、worker 身份、请求/实际模型、审批状态、中断/收集 | 一等能力 | 需要当前 SWF 没有的桥；预览期漂移风险高 | 推迟（recommendation） |

## 3. 目标边界与架构

| 关注点 | 所有者 | 规则 |
| --- | --- | --- |
| 目标、计划、验收、任务状态 | SWF Trio | 唯一持久任务权威；禁止把 Harness 会话日志转换为任务状态 |
| 执行会话、本地工具追踪、compaction | DeepSeek Harness | 仅证据；置于隔离会话存储；Chief 审阅后可在 Trio 记录指针 |
| 路由、provider/model/effort 策略、no-fallback 决策 | SWF | Harness 不得静默覆盖分配包的执行意图 |
| 凭据、环境、沙箱执行、网络出口、审批门 | Host + 人工门 | 绝不写入 SWF 源码/规划文件；需要显式 preflight 与人工授权 |
| 上游代码 | DeepSeek Harness 上游 | 若日后引入须钉版本并保留 provenance；SWF 侧只做窄 overlay/适配器，不改上游副本 |

关键否定（verified + SWF-local）：

- Harness 的审批、沙箱、会话日志**不满足** SWF/Host 门，也不构成第四规划权威；不得以 Harness 日志替代 Trio 回写。
- 文档化最小 Python 组合是 `danger-full-access` + 禁用 compaction，**禁止在本脏工作根目录运行**；只允许 disposable checkout 或容器。
- Harness 文件系统沙箱不管网络与进程可见性；网络出口需单独的 Host/容器策略。

## 4. 分阶段实施计划

> 所有动作均以人工批准为前提；拟议文件/模块名均为假设（hypotheses），不代表既有模块。

### P0 兼容性 Spike（只读）

- 预计自有表面（hypotheses）：一次性容器/临时目录中的钉版本官方 Python SDK 或 headless 入口；`dsh` 版本 pin 与 API 兼容性记录；一个只读探测任务脚本。
- No-go 表面：对共享工作树的任何写入；凭据写入；自动审批；依赖自动 compaction。
- 验证证据：官方 quickstart/python-sdk 要点核对清单；在 disposable 环境内成功运行只读探测并导出会话事件日志；记录 dsh 版本与 API 兼容性证据。
- 停止/回滚：出现凭据泄漏迹象、对非 disposable 路径的写入、未受控网络出口即停；回滚 = 删除一次性环境，SWF 侧零变更。

### P1 最小适配器契约

- 预计自有表面（hypotheses）：`harness/trio/adapters/dsh/`（窄适配器：仅启动/收集/状态读取）；`contract.mjs`（输入=包摘要+冻结切片；输出=候选证据包）；包字段校验与策略投影检查点。
- No-go 表面：不改变 `routing.mjs` 的可见 worker 路由；不做 Harness 会话 → Trio 状态转换；不升级为一等 Host。
- 验证证据：契约单测与包摘要校验；失败路径验证（无回退、`manual_pending`）。
- 停止/回滚：契约任何字段与分配包语义冲突即停；回滚 = 不合并适配器，维持现有 OpenCode 路线。

### P2 受控写入试点

- 预计自有表面（hypotheses）：试点任务专属的一次性隔离 worktree；`workspace-write` 沙箱 + 显式人工审批路径；机械检查的允许路径包络；Host/容器层网络出口策略。
- No-go 表面：`danger-full-access`；`never` 审批；对脏工作根目录运行最小组合；共享工作树写入。
- 验证证据：写入仅落在允许路径包络内（机械检查输出）；每个冻结切片使用全新 Harness 会话；记录实际用量/延迟/错误分类。
- 停止/回滚：包络外写入、审批绕过、网络出口异常即停；回滚 = 删除一次性 worktree 与试点会话，Trio 状态不动。

### P3 晋升/拒绝门

- 预计自有表面：评估报告（证据汇总、错误分类、成本观测、兼容性记录）；Chief 验收记录。
- No-go 表面：自动晋升；未经人类批准的任何公开安装面或源码 vendoring。
- 验证证据：P0–P2 全部证据汇总；pin 版本与 provenance；成本观测与预算对照。
- 停止/回滚：预览漂移、定价或安全事实变化导致假设失效即拒绝/暂缓；回滚 = 保持现状路线。

## 5. 受限 ChatGPT 用量下的经济性策略

- Flash 默认：研究、侦察与有界执行默认 Flash/high；xhigh 仅保留给决策完备的生产切片；不自动升级到 Pro/Chief 模型（recommendation）。
- 升级条件显式（verified 失败 + 可复现证据、人工批准的高风险决策、有界专家复核）；否则返回 `manual_pending`/`blocked`，不做静默改道（SWF-local）。
- 有限 fanout：小规模固定 worker 扇出、范围不重叠；传递源摘要与包字段而非完整对话历史（recommendation）。
- 简短源数据包 + 每切片全新会话；试点期间记录观测用量/延迟/错误分类（SWF-local：历史过大曾致远端 compaction 失败，短会话是可靠性要求）。
- 缓存 token 估算与公开定价仅作预算检查输入，非保证；定价 2026-08-16 漂移，不内嵌为策略常量（verified）。

## 6. 风险与门控矩阵

| 风险 | 等级 | 门控/缓解 |
| --- | --- | --- |
| 预览漂移（preview churn） | 高 | 钉版本 + 兼容性证据；P3 门；不做 unpinned 依赖 |
| 权威冲突 | 高 | 仅 Trio 持久权威；Harness 会话仅证据；拒绝插件读写规划状态 |
| 凭据/数据 | 高 | `$DSH_HOME/.credentials.yaml` 边界；显式人工门；不写入 SWF 源码 |
| 文件系统/沙箱/网络 | 高 | disposable 环境；禁止 `danger-full-access`；网络出口单独 Host 策略 |
| 审批 | 高 | Harness 审批 ≠ SWF/Host 门；无人值守生产禁止 `never` 审批 |
| 上下文/compaction | 中 | 每切片新会话；简短源包；不依赖自动 compaction |
| 观测身份 | 中 | 请求/实际模型分离；无认证 Host 证据时不作实际身份声明 |

## 7. 现在不做的事（what we will not do now）

- 不实现任何 DeepSeek Harness 适配器，不建立 spawn/collect 生命周期桥，不改动 `swf_executor` 角色或模型路由。
- 不替换上游资产，不把 Harness 依赖/插件写进 SWF 策略核心，不做源码 vendoring 或公开安装面。
- 不把 Harness 审批/沙箱/会话日志当作 SWF/Host 门，也不作为第四规划权威。
- 不在本脏工作根目录运行 `danger-full-access` + 禁用 compaction 的最小组合。
- 不写凭据、不改 provider 配置，不对价格/安全/性能/可用性作超出来源的保证。

## 8. 推荐的下一步人工决策

1. 是否批准只读 P0 兼容性 Spike（一次性容器 + 钉版本官方入口；禁止共享工作树写入）。
2. 若 P0 通过：是否批准 P1 最小适配器契约的设计与评审。
3. 指定试点环境（容器/一次性 worktree）与网络出口策略的责任人。

## 9. 来源列表

官方（`verified`；由 Chief 于 2026-08-14 捕获，依据任务 findings 与 Chief 白名单）：

- https://www.deepseek.com/harness/en/
- https://deepseek-harness.github.io/deepseek-harness/en/guide/quickstart
- https://deepseek-harness.github.io/deepseek-harness/en/guide/providers
- https://deepseek-harness.github.io/deepseek-harness/en/guide/python-sdk
- https://deepseek-harness.github.io/deepseek-harness/en/reference/
- https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/approval
- https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/sandbox
- https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/compaction
- https://api-docs.deepseek.com/quick_start/pricing/

本地（`SWF-local`）：

- `harness/trio/core/routing.mjs`
- `harness/trio/hosts/codex.mjs`
- `harness/trio/governance/chiefops/SKILL.md`
- `reports/audit/2026-08-09-plan-execute-deepseek-executor-audit.md`
- `planning/active/deepseek-harness-feasibility-20260814/task_plan.md`、`findings.md`、`progress.md`
