# 人工使用指引: Plan → Execute 路由与可见 worker 输入方式

> 本文是 Trio v2 Plan→Execute 机制的人类操作面:路由、strict 拓扑、`childDelegation` / `executionMode` 策略、`manual_pending` 处置与人类 gate。

## 一句话模型

`planning/active/<task-id>/` 下的三件套(`task_plan.md`、`findings.md`、`progress.md`)是唯一任务权威;Chief 负责接需求、路由、规划、派单、review、验收;执行 worker 的生产变更结果只是 candidate,Chief 验收回写后才算数;merge/push/release/发布/发送/凭据/破坏性操作永远需要人类 gate。

`swf_executor`、DeepSeek Flash、xhigh、无 fallback 是**请求/静态角色事实**(定义于 `harness/trio/hosts/codex.mjs` 的 `SWF_EXECUTOR_ROLE`,并由 `renderSwfExecutorAgentEntry` 渲染成 `[agents.swf_executor]` TOML)。**实际** role/model/effort 在 Host 提供 authenticated 证据之前一律视为 `unknown`;一个可见任务本身也不是完整的 Host 生命周期证据。

## 本地契约与 Host 桥的边界(重要)

- **本地 fail-closed 路由契约(已实现,仅本仓库代码)**:`harness/trio/core/routing.mjs` 校验 Assignment Packet 的八字段并拒绝第九个顶层字段;`capability.childDelegation` 只接受 `prohibited | worker_discretion | encouraged`,`capability.executionMode` 只接受 `bounded_slice | worker_self_goal`。未知值、strict 缺策略、`prohibited` 下的 native 子路由全部返回非执行的 `manual_pending`。静态角色配置不构成动态 child 权限。
- **Host 桥(未实现)**:当前 Host 可能支持"人工可见的任务移交/观察",但没有完整的可注入 authenticated 契约来证明 role、精确 packet、actual model/effort、spawn/continue/status/interrupt/collect 与动态 child 拒绝。缺少任何一项时,诚实出口是 `manual_pending`,而不是本地模拟或绕过。

## 权限治理:范围 → Host 沙箱 → 审批

权限判定是三层严格顺序的纯本地契约(实现在 `harness/trio/core/routing.mjs` 的 `adjudicatePermission`,不引入 runner、审批引擎或新状态):

1. **Trio 范围(scope)**:Assignment Packet 的 `allowedOperations` 是唯一授权来源。目标路径必须在 `allowedOperations.files` 之内,且不得落在物化输出上(见下)。任何越界路径在此层直接 `blocked`(`outside_assignment_scope:<path>` 或 `generated_target:<path>`),审批与 escalation/review 根本不进入评估(`approvalEligible: false`,sandbox/approval 阶段为 `skipped`)。
2. **Host 沙箱(sandbox)**:仅在范围通过后评估。Host 必须提供 authenticated 证据(`authenticated: true` + `evidenceRef` + 与 assignment packet 匹配的 `packetDigest`),否则 actual 沙箱与可写根一律 `unknown` 并 fail-closed(`sandbox_actual_unknown`);`bounded` 沙箱的可写根必须覆盖目标路径,否则拒绝(`sandbox_writable_roots_unbound`);自报的 Full Access 或可写根不是证据。
3. **审批(approval)**:最后一个 gate,只可在范围与沙箱都通过后决定放行或拒绝(`approval_denied`);`user` / `auto_review` 审批**永远不能扩大 allowed paths**。

不可扩权证明:Full Access、用户审批、auto-review、可写沙箱均无法把越界操作救回;物化输出(`AGENTS.md`、`.agents/**`)即使被误列入 `allowedOperations.files`、即使沙箱可写、即使已审批,仍然在 scope 层被 `generated_target` 阻断——受支持的工作流是**改源(模板/策略)+ 投影/fixture proof**,绝不直接编辑物化输出。

请求与实际的区分:`permissionIntent`(请求的 `sandboxMode: bounded | full_access`、`writableRoots`、`approval`)与 `hostObservation`(authenticated 的 actual 证据)是两个独立输入;结果同时携带 `requested` 与 `actual`,无 authenticated 证据时 `actual.sandbox` / `actual.writableRoots` 为 `unknown`。本契约不声称 Host 已执行任何权限绑定,也不对运行中 worker 做追溯性权限改写。

## 审批策略、Full Access 与语义车道(2026-08-11)

- **Full Access ≠ approval_policy=never**:`full_access` 只描述沙箱轴。任何权限声明都必须显式声明请求的 approval policy;实际 per-worker 审批策略在 Host authenticated 证据(精确 packet digest 绑定)之前一律 `unknown`。请求的 approval policy 缺失、或与实际策略缺失/不一致时,诚实出口都是 `manual_pending:worker_approval_policy_unbound`;任何"Full Access 所以不用审批"或未声明策略就声称放行的说法都是越权声称,提示词也不能改变 Host 策略。
- **`awaiting_approval` 是非终态保留车道**:不是派新 worker 的理由。恢复阶梯:`awaiting_approval` → 人类/Host 审批 → continue 同一 worker;binding/上下文不一致 → rebind 同一 worker → 有界完整性探测;不可用/无法 rebind → Chief 显式释放旧车道 → 单个替换 worker。不同输出目录本身不构成独立修复车道;独立切片必须有不同的冻结 `currentSlice` 身份与不重叠的声明 scope。
- **语义车道身份**:由 authority taskId + 冻结 currentSlice 身份推导并保留工作,不新增 packet 字段或 worker 注册表;packet digest 是不可变证据/审计绑定,不是允许替换的判别器,也不是必需的身份字段——同一 task + 冻结 currentSlice 下,即使因声明输出/scope 改变使 digest 变化,车道仍被保留(blocker `semantic_lane_reserved:<status>`),resumeCondition 指向既有 worker 与允许的下一步(observe/approve/continue 同一 worker,或匹配的 authenticated Chief release)。所有未释放活跃状态(`planned` / `observed` / `idle` / `executing` / `awaiting_approval` / `blocked` / 未验收 `candidate_done`)都保留其 task + 冻结 slice;`stopped` 不属于活跃保留。缺失 task 或 currentSlice 身份的未释放活跃车道在路径不重叠的新 spawn 上 fail-closed 为 `manual_pending:semantic_identity_unbound:<status>`;无 assignment packet 的 legacy spawn 面对已完整识别身份的活跃车道同样 pending——需提供不可变 Assignment Packet,或匹配的 authenticated Chief release 才能了结;未知身份是 pending,不是放行。
- **未解析 worktree `clientThreadId` 视为 pending**:阻止 fallback spawn,只能对该确切 setup 做有界 status/wait;create 修正最多一次,第二次 Host 校验错误 → `manual_pending`,不重试。
- **`on-request` worker 的非破坏性临时空间**:用 `mktemp -d` 或作用域内非破坏路径创建临时工作区;绝不用 `rm -rf` 仅为重建临时状态。

## 角色职责

| 角色 | 做什么 | 不做什么 |
|---|---|---|
| 人类(你) | 提需求、做人类 gate、最终验收(accept)、决定 merge/release | 不代替模型写代码细节(除非亲自改) |
| Chief | intake、路由(quick/tracked)、规划三件套、构造 Assignment Packet、派单、review、验收回写 | 在"需要可见 worker"时不得 inline 生产变更、不得用 native subagent 顶替主执行 |
| swf_executor(请求角色) | 按已接受计划执行生产变更 + 主验证,返回 candidate 证据 | 不重新设计 scope/架构/接口/验收标准;缺决策或模型不可用时返回 blocked;默认(及 `childDelegation=prohibited`)下不得嵌套委托——仅当 packet 显式允许(`worker_discretion`/`encouraged`)时,worker 本地子委托才可使用 swf_executor,且必须携带机械 proper-subset envelope 并返回主 worker |
| Host(Codex 本体) | 管理 worker/子任务生命周期、提供 authenticated role/identity/packet/actual model-effort 证据 | 无 authenticated 证据时 actual 就是 `unknown`,任何人不得伪称 |

## 路由对照表(核心)

| 路由 | 你怎么输入 | 你会得到 |
|---|---|---|
| **quick(问答/小改动)** | 一句话直接问,零仪式 | 直接回答/小改动,无 Trio |
| **tracked / default(常规开发)** | 一段话按五要素:"实现 X…影响面…约束…验收 verify:trio 全绿 + RED→GREEN 证据…完成后出 draft PR 不要 merge" | Chief 建三件套→切片计划→派 swf_executor→candidate→你验收→你决定 merge |
| **strict(必须可见 worker)** | 加一句:"必须由可见执行角色 swf_executor 完成,不要用隐式子代理" | packet 设 `primaryExecution = visible_worker_required`,且必须显式声明 `capability.childDelegation`;缺策略/未知策略 → 本地 `manual_pending` |
| **deep(先分析再动手)** | "这个问题需要深入分析再决定…先给证据-backed 分析,我 approve 后再动手" | 先出分析报告等你 approve,再进执行 |
| **涉及人类 gate** | 明说停靠点:"停在 draft PR 等我看"/"不要 push"/"发布前必须我确认" | 停在 gate 前(默认也永远保留你的确认权) |
| **manual_pending 后** | 别重说需求,看 blocker/resumeCondition 三选一(见下) | 按对应处置继续 |

## 需求输入五要素

1. **目标**: 要达成什么。
2. **影响面**: 哪个仓库/模块/文件(知道就说,不知道让 Chief 先侦察)。
3. **约束与非目标**: 明确不要动什么(如"不动 upstream"、"不加新依赖")。
4. **验收/证明**: 要什么证据、跑什么验证(如"verify:trio 全绿 + RED→GREEN 记录")。
5. **边界与 gate**: deadline、完成后停在哪(如"出 draft PR,不 merge,等我看")。

不需要调用任何 skill、不需要念固定格式、不需要自己建任务——入口策略(AGENTS.md)自动生效,代理自动扮演 Chief 完成路由、规划、派单。

## strict 拓扑、childDelegation 与 manual_pending 处置

- strict = `capability.primaryExecution = "visible_worker_required"`:主执行必须由可见 worker 完成;visible 不可用时**只能** `manual_pending`(reason `visible_worker_required_unavailable:<detail>`),绝不落到 native subagent。
- 新 strict packet 必须显式声明 `capability.childDelegation`:
  - `prohibited`:禁止任何 native 子路由(即使 child envelope 本身合法);本地路由返回 `manual_pending`(blocker `child_delegation_prohibited`)。
  - `worker_discretion` / `encouraged`:仅当明确写出时才考虑 child 路由。
  - 缺失(strict 必填)或未知值:本地 `manual_pending`(blocker `child_delegation_missing` / `child_delegation_unknown:<value>`),不会选择 visible 或 native 路由。
- legacy 非 strict packet(没有这些字段)保持既有兼容:visible→native→manual 链不变。
- `capability.executionMode` 只接受 `bounded_slice`(有界切片)或 `worker_self_goal`(worker 自身可见会话内的长目标);未知值本地 `manual_pending`(blocker `execution_mode_unknown:<value>`)。worker self-goal 只存在于其自身可见会话;没有 authenticated Host 操作时,Chief 不得声称跨线程 goal 控制或任何生命周期控制。
- `manual_pending` descriptor 携带三件套:`assignmentPacket`(原封不动)、`blocker`(失败原因)、`resumeCondition`(恢复条件)。收到后三选一:
  1. **人工提供/操作可见 worker**:用精确 packet 手动开一个可见 worker 继续——这只携带 requested 事实,不自动证明 actual model/role;
  2. **显式释放 strict 拓扑**:明确改回 default(接受 legacy visible→native→manual 链),再重派;
  3. **等待/判定 blocked**:等待合规 Host 能力,或记录真实外部阻塞(模型不可用、缺权限、缺决策)后 blocked,等条件变化再恢复。
  没有任何一个选项会自动证明 actual model/role;这些都只是处置选择。

## 人类 gate 清单(任何时候都保留)

merge / push(除已授权的分支内提交)、release / deploy / publish(含 PR merge gate)、发送消息/邮件/对外回复、凭据/token/密钥处理、破坏性/不可逆操作(删除、格式化、清空、迁移)。路由、角色配置或本地路由契约都不构成对这些动作的授权。

## 并行执行与 worktree-preflight(2026-08-09)

- **稳定任务亲和性** = 显式 `authorityRoot + taskId`,即 `planning/active/<task-id>/` 下的三件套;HEAD、Trio 文件 hash、脏路径只是派单那一刻的短生命周期执行快照,不是任务身份。
- 多个 active 任务并存时,`./scripts/harness worktree-preflight --task <task-id> --safety` 会按显式 task 解析该任务的风险行,输出通过 `selectionSource` / `taskId` 标识选择来源与任务;不带 `--task` 时保持 fail-closed,CLI 明确提示 `Multiple active planning tasks ... Use --task <task-id>.`,绝不借用其它任务的风险行。
- 缺失、非 `Status: active`、格式损坏或风险行不完整的选中任务会阻断 safety 结果(`riskAssessmentRecorded: problem`)。
- 仓库代码无法认证或抑制 Codex 注入的 "thread has no valid binding" 提示:那是 Host 能力边界;工作流以显式 Assignment Packet 与 Trio hash 为准。
- 本命令不新增线程/会话注册表、不自动推断分支归属、不改变既有 base 建议与命名规则。

## 验收清单(Chief/人类侧)

1. **核对 binding**: worker 用的 Trio 三件套 hash 与派单时一致;不一致 → 拒绝并停止(binding_mismatch)。
2. **核对证据链**: RED 记录、GREEN 通过数、验证命令与退出码、变更路径清单;"worker 说 done"不是证据。
3. **复跑关键验证**(至少): `npm run verify:trio`;涉及 core/homepage 时跑 `verify:all`;`git diff --check`。
4. **检查越权**: 变更是否超出 `allowedOperations`/`nonGoals`/mutablePaths;有无未授权 stage/commit/push。
5. **actual vs requested**: 无 authenticated Host 证据的模型/effort/role 声明一律视为 `unknown`。
6. **写回并关闭**: `trio accept` → `trio close` →(可选)`trio archive`。

## 红线

**做**: 输入用自然语言讲清目标/影响面/约束/验收;任务开始前确认三件套存在且 hash 一致;packet 永远随派单一起给 worker;worker 结果一律先当 candidate;验收证据要"命令 + 退出码 + 计数 + 变更路径";全局投影用 `./scripts/harness sync --check` / `doctor --check-only` 自检。

**不做**: 不建第四份任务权威文件(Trio 只有三个文件);不在 strict 模式下让 Chief inline 改生产代码或让 native 顶包;不把静态角色配置当成动态 child 权限;不声称 actual model/role/effort(无 authenticated 证据就是 unknown);不跳过人类 gate 自行 merge/push/release;不把 `manual_pending` 当失败——它是设计内的诚实出口;不把本地 fail-closed 路由契约当成已实现的 Host 生命周期桥;不以 Full Access / 用户审批 / auto-review / 可写沙箱为扩权手段(范围先决,越界一律 blocked 在 scope 层);不直接写物化输出(`AGENTS.md`、`.agents/**`)——改源 + 投影 proof 是唯一受支持的工作流。

## worker 本地 goal 契约(`worker_self_goal`)

`executionMode = worker_self_goal` 只在 worker 自身可见会话内成立,不是跨线程或 Host 级 goal 控制。该契约是闭合的七个字段:

- `objective`(目标)、`successCriteria`(可验证成功条件)、`stopConditions`(必须停止的条件)、`expectedEvidence`(交付必须附带的证据)、`maxIterations`(1–100 的安全整数上限)、`milestoneCheckIn`(每个切片/里程碑后汇报)、`returnCondition`(只允许 `candidate_done` / `blocked` 等契约允许的结果)。
- 字段缺失、类型不符或越界时,本地路由在派单前拒绝(`assertGoalContract`);worker 不发明新的返回状态,也不把候选结果冒充已验收。
- 成功标准软规则:领域支持时优先给出可测/数字化的 `successCriteria`(例如精确验证命令 + 通过数或阈值);这是建议性指引,不是 fail-closed 校验,缺失数字目标不阻断派单。
- 目标工具生命周期(当 Host 暴露 `get_goal` / `create_goal` 等原生 goal 工具时):创建前先检查 active goal 状态;匹配的 active goal 直接复用,不重复创建;冲突时询问用户;token budget 仅在用户显式要求时设置;普通任务不创建 goal。该规则以 advisory 形式吸收自上游 `define-goal`(openai curated)的质量条,不纳入 packet 级校验。
- 经济路由与角色/复杂度/结构化手动 override 只作为**请求事实**进入纯路由决策与只读输出(`trio next --dry-run --role/--complexity/--override-reason/--override-source`);写命令不接受这些只读参数。请求事实不等于 actual 证据。
- **CLI fail-closed 契约**:任何 requested-model 决策都必须有已声明的工作角色。`trio next` 未给 `--role` 时直接报错退出(exit 1,提示 `trio next requires --role <workRole>`),绝不输出未分类模型(如 Luna);`status` 与全部 Trio 生命周期写命令(`init/progress/accept/stop/close/archive`)从不做模型决策,报告里 `model: null`。Host 侧的 Assignment Packet 同理:缺少 `capability.workRole`、执行角色缺少唯一合法复杂度、或 Chief 角色携带执行复杂度,均在派单/路由前被拒绝。

## 手动 bind / handoff 与 `manual_pending` 恢复

- **手动 bind**:在可见 worker 会话中显式绑定 `planning/active/<task-id>/` 三件套与派单 packet;绑定后任何 re-read/测试/编辑之前先复核三件套 hash 与工作区基线,不一致即 `binding_mismatch` 停止。
- **手动 handoff**:把未完成的切片与证据连同 packet 交回 Chief 或另一个可见 worker 时,必须原样传递 `assignmentPacket`、`blocker`、`resumeCondition` 与已记录的 hash 证据;handoff 不自动证明 actual model/role。
- **`manual_pending` 恢复三选一**(重复请求不会改变结果):
  1. **提供/操作合规可见 worker**:用精确 packet 手动 bind 一个可见 worker 继续——只携带 requested 事实,不自动证明 actual;
  2. **显式释放 strict 拓扑**:明确改回 default(接受 legacy visible→native→manual 链)后重派;
  3. **等待/判定 blocked**:等待合规 Host 能力,或记录真实外部阻塞后 blocked,条件变化再恢复。

  任何选项都不自动证明 actual model/role;这些都只是处置选择。

## 已有 V2 全局状态的 ChiefOps 接管(`install --takeover-chiefops`)

当持久化 authority root 已持有 schema-v2 `user-global` 状态、且只差全局 ChiefOps 目标未被托管时,唯一的 V2 迁移路径是:

```sh
./scripts/harness install --takeover-chiefops
```

严格资格(全部满足才执行,否则在任何写入前失败):

- 状态为 schema-v2 且 `scope.kind: user-global`;
- 恰好一个启用的 managed Codex placement,路径为 `<home>/.codex/AGENTS.md`;
- ownership 恰好包含五个现有 Trio 表面(entry + `trio`/`dev`/`office`/`safety`),且每个文件内容与其 ownership identity 一致;
- 恰好一个未托管的 ChiefOps 目标(`<home>/.agents/skills/chiefops/SKILL.md`),不在 `ownership.entries` 中;
- 无其它 managed 冲突、无不安全物理路径(符号链接/硬链接/越界);generic/manual 目标原样保留、绝不写入。

命令行为:在 authority publication lock 下先捕获并复核七个稳定 preimage(六个全局 Trio 表面 + 既有 V2 state);每个捕获都是 `lstat → read → lstat`,要求读前读后文件与父目录的 dev/ino/nlink 完全一致(文件大小须与读到的字节一致),stat 与 read 之间被替换会以 `ERR_TRIO_PREIMAGE_DRIFT` fail-closed,不产生任何备份或写入。再把唯一、不可变、写后重读验证的备份发布到 `<authorityRoot>/.harness-backup/trio-takeover/<id>/`(含 `manifest.json` 与 `bundle.bin`,保留原始字节、ownership 来源/清单与 recovery 值)。发布任何备份文件之前,须证明从 authority root 到 `.harness-backup/trio-takeover` 的每个已存在祖先都是真实、非符号链接、物理上位于 authority root 之内的目录;符号链接或越界的祖先以 `ERR_TRIO_PHYSICAL_GATE` fail-closed,状态与目标零变更。manifest 的 `recovery` 段原样保留接管前的 `checkpointRef` 与 `rollbackRef`(不写入新建引用)。落盘状态保留 `ownership.source`/`manifestRef` 与 `checkpointRef`,只追加 ChiefOps 的 ownership,并把 `recovery.rollbackRef` 设为可解析的 `trio-backup-v1:<manifest 绝对路径>:<sha256>` 文件引用,其摘要由写后重读的 manifest 文件字节推导;校验时解析该引用、对 manifest 文件重算 sha256 并比对。所有写入绑定备份 preimage(sha256/inode/parent):同内容换 inode 会 fail-closed,中途失败会把已写表面补偿回 preimage。

限制与 gate:

- 备份是恢复证据,不是日志:本命令**不承诺**崩溃/SIGKILL/断电级别的整体原子性。
- 只能从 durable authority root(持有 `.harness/state.json` 的 checkout)运行,不能从临时 worktree 运行;实际全局运行需要单独的人类 gate。
- 命令不自动 merge/push/发布/采纳;运行后请用 `./scripts/harness sync --check` 与 `./scripts/harness doctor --check-only` 复核。本仓库测试只在临时 fixture 上演练该命令,未执行真实全局接管。

## 当前边界与限制(截至 2026-08-10)

- goal-writer / goal2plan 为 legacy harness 时代的技能包,已在 v2 退役(仓库侧 wave9 物理删除,`harness/core/skills` 不再含其副本;用户全局活跃面亦已移除,备份可恢复)。其目标契约职责由 `worker_self_goal` 七字段契约承接,计划评审职责由 Chief acceptance + dev Review Contract 承接。上游 `define-goal`(openai curated)不纳入 SWF 技能清单,其 goal 工具生命周期规则已吸收进本文件与 chiefops 伴生技能的 worker_self_goal 契约。
- 本地 fail-closed 路由、goal 契约、economic 只读输出与 ChiefOps 治理伴生文件均以本仓库源码为准;本文件不声称任何外部安装已被迁移或采纳。
- Host 集成限制:`manual_pending` 是设计内的诚实出口。在 Host 提供可注入的 authenticated 生命周期契约(role、精确 packet、actual model/effort、spawn/continue/status/interrupt/collect、动态 child 拒绝)之前,任何 Host 生命周期或实际身份声明都只能停留在 `manual_pending`,不得伪称。
- 权限治理:`adjudicatePermission` 是本地纯路由契约(范围 → Host 沙箱 → 审批),不构成 Host 权限执行引擎;实际 Host 权限证据在 authenticated + packet digest 绑定之前一律视为 `unknown`,本仓库不伪称任何沙箱或可写根已被 Host 授予。
