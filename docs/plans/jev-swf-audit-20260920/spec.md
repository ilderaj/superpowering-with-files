# Jev/SWF 审计整改规格
状态：2026-09-20 Chief冻结供本地夜班修复；用户本轮授权审计、规格/票和夜班解决。权威仍为原任务三件套。本规格仅覆盖下列修复，不激活gate、不引入推理服务、调度器或状态库。原spec不冲突部分继续有效。

## S1 验证范围和失败优先级（A01，J01）
1. 适配器接收可选 requiredCheckIds，必须是本领域已知id的无重复数组。显式空数组只允许调用者确认该任务无需这些确定性检查；semantic verification仍必需。
2. 提供requiredCheckIds时仅声明该范围内的checks，缺失结果仍unknown；范围外若提供结果，拒绝以免静默丢弃失败。未提供时保留旧的全check集合，兼容已有调用。collectDevEvidence/collectOfficeEvidence从已验证commands/inspections id推导该列表；纯函数调用者显式传范围。
3. 所有checks中的已知fail优先：scope/coverage不满足→replan，否则repair。明确scope/requirements问题优先于尚缺的无关检查；不得因别的unknown覆盖已证实失败。
4. required check的unknown reason=timed-out/signalled或明确transient infrastructure→retry；not-run/unreadable/未声明reason→continue（仍需补验证），绝不done。unknown不等于一律基础设施失败。
5. unknown不按缺省pass；空checks+semantic verification insufficient不得done。
6. 测试：仅tests适用pass、仅document适用pass；required缺失；fail+unknown；scope破坏+unknown；timeout；输入重复/未知id。对当前代码先记录RED。

## S2 旁路观测隔离、身份与统计（A02/A03/F27，J02）
1. 保持checkpoint对象与既有renderCheckpoint输出字节不变，valid checkpoint的shadow错误不能成为主路径异常。
2. 无效observations容器/单项、未知question、request.bundle与question.bundle不一致、request.subject.taskId与checkpoint.taskId不一致，一律记录结构化failed observation并继续其他项；不得写入别的task trace。
3. 每项记录evaluated / unevaluable / incomparable以及reason。agreement严格true/false/null；total包含所有attempt，不能先过滤拒答；total=agreements+disagreements+unevaluable+incomparable。trace写失败另计traceFailures，不伪称持久化。
4. trace保留shadow question identity（plan_ready与execution_ready等不能合并）、agreement三态、reason。改变trace形状时升schemaVersion，旧v1记录可读取但缺失agreement按unknown，不由override=null推导同意。
5. F27采用局部、按question的等价映射；intake false与plan true接受continue/proceed/execute，goal_complete=false接受retry。不得全局把continue无条件等于执行。
6. 测试：未知state summary不能增加agreement；缺答计unevaluable；坏项后好项继续；错误task/bundle拒绝；trace失败不影响renderer；相同语义别名不误报。

## S3 READY/ALLOWED及来源（A06，J03）
1. readiness可由operator/model判断；authorization不能从operator、semantic答案或自报provenance=policy获得。保留旧question形状用于历史解析，但组合时不得信任该答案。
2. evaluateDecision/resolveReleaseState可接收独立policy context，由调用边界根据现有授权/权限结果提供：decision allowed|not_authorized、taskId、operation、evidenceRef；与被评subject及操作匹配，否则最多ready。不造签名、receipt或第二授权系统。
3. 纯函数仅校验并传递policy记录，不宣称验证了人类身份；真实caller始终重新经过现有Host权限门。没有caller验证来源时只能输出ready，不能依靠字符串把gate接到发布动作。
4. backendId必须与实际答案路径一致；host尚未有真实adapter时不能仅改backendId就伪装成host推理；operator输入不能标deterministic。保留历史读取，新的不一致请求明确拒绝。
5. 测试：operator allowed无policy→ready；伪policy provenance无效；policy缺失/错task/错operation→非allowed；真实匹配policy上下文→allowed recommendation但不执行任何动作；外部backend继续不可用。

## S4 可复算的评估（A04/A05/A08/A09，J04）
### T1：契约回归
- 现有27例称contract replay；ground truth不从runtime DECISION_OUTCOMES动态取得，独立标签可表达实现目前不支持的结果，计unsupported而非在加载期吞掉。
- 固定局部旧状态映射 waiting-human/policy_gate→escalate；null单列不可评，不算分歧。当前数据基准应为27 total、26 comparable、15 disagreement、1 unevaluable；不硬改案例来凑数。
- 报conditionalAgreement=correct/answered、coverage=answered/all、correctOverAll=correct/all、abstentionRate、不可评id；conditionalAgreement不是独立accuracy。旧answerAccuracy保留兼容时标deprecated alias。
- baseline作者列叫legacyReferenceAccuracy（旧oldAccuracy若保留必须标deprecated indicative），不得当旧harness实测。
- falseDoneRate与prematureExecutionRate显式报告各自分母与coverage；对plan-ready拒绝/未解决依赖、intake应plan却done也算premature，不能只识别continue。
- 缺标签、重复id、额外标签、混用不同case集合必须拒绝或明确invalid，不能静默缩小分母。

### T1.5：独立盲评协议，先做fixture/parser，真实结果留WP10
- 输入是决策当时可见的原始任务/计划/证据；去掉operator答案、truth、后续outcome。
- Chief先标注，再由2名独立subagent复核。冻结raw input、rubric、truth、代码/方法hash；预测后不得改标签迎合输出。冲突可保留ambiguous，单独统计。
- 同一个raw input给baseline与bundled两种方法产生答案，再由固定composite计算；使用同model/effort/tool预算，Host身份unknown时明确不可比。不存在真实语义答题过程就不能叫独立判断评估。
- 任务来源按真实coding/office分层，训练/调参案例与holdout按任务分组隔离；合成边界例只算regression。首轮24个可判定真实案例（coding12/office12）、另6个边界/拒答例；20 development+10 holdout按任务group隔离。样本不足报pilot，不补造。
- 独立判断进入T2的暂定筛选门：coverage>=95%，高风险falseDone/premature无新增；paired exact McNemar单侧p<0.05支持更准，否则结论inconclusive，补新holdout。30例仅pilot，不承诺统计power。
- 最终outcome可作为裁决证据，不能把修复后成功或“警告后没有发生事故”直接当早期错误/误报；反事实收益需要干预实验。

### T2：专属profile与+5%护栏
- 新增tests/evals/decision-control/contract.md及离线聚合器/fixture，复用v20证据原则；不修改通用v20 schema让其他评估接受新字段。
- 开始前条件：J01–J04接受、WP07真实调用证据、T1.5筛选、真实usage/event可采、预登记case与rubric/方法hash、明确实验沙箱内gate可影响动作的授权。WP07只shadow，不满足最后一项。此票仅实现协议和离线计算，不执行live或激活。
- 验收主指标保持用户选择：roundsToResolution、repairLoops、outputTokens、decisionAccuracy；decisionLatencyMs为辅助。round以一次完整执行者行动循环计，repairLoop按VERIFY→REPAIR→VERIFY计，记录eventId和时间，不以工具调用数冒充回合。
- outputTokens取Host output，不能用freshTokens；reasoningOutput若已含于output不得重复计。
- 每arm全量求和，包含主执行者、决策回答、证据准备、worker、重试、复核和整合：totalTokens=sum(input+output)，freshTokens=sum(input-cachedInput+output)。不能再减“少返工省下成本”，节省已体现在实测总量。
- 主token护栏totalTokens ratio<=1.05；freshTokens辅助同时报告。价格可核验时再报all-in金额ratio<=1.05，不把token和金额混成一个netCost。缺usage、不可分配overhead、零baseline分母→unproven。
- 预登记一项主要改善（rounds下降>=15%或中位数少1回合；output下降>=15%；repair绝对少1；accuracy绝对+5百分点）；其余主指标与质量不得有实质回归。多指标选择需事前固定或校正多重比较。两轮同向与独立holdout复现是完成验收条件。
- (1,1.05]成本带仅在预登记效率改善复现后判covered；>1.05不得supported。报告paired差值及区间，样本不足/区间跨无效应→unproven。允许 unchanged/regressed，禁止为得正收益修改阈值。

## S5 WP07的最小真实入口（更新SUP-42）
仓库现有调用边界是linear-work-control/scripts/linear-work-control.mjs render checkpoint → renderCheckpoint(input)，手工JSON不代表没有可复用渲染器。
在repo侧新增scripts/render-decision-checkpoint.mjs及测试，组合既有renderCheckpoint与recordCheckpointShadow；禁止让可独立采用的global skill反向import repo core。
输入由--input file|-读取{checkpoint,observations}；stdout严格等于renderCheckpoint(checkpoint)+'\n'，诊断走stderr/本地trace；不调用Linear、不修改Trio、不转移阶段。可选--trace-dir缺省.harness/decision-trace。
先渲染/验证checkpoint，shadow错误隔离后仍返回原渲染输出；无效checkpoint保留原失败语义。任务phase与task身份必须明确对应。
operator回答由当前Host/session产生时记录来源与实际usage，不宣称该CLI执行了语义推理。缺答案明确unevaluable，不补猜。
文档仅在本initiative checkpoint选择该入口，其他global skill和night prompt不改。仅新增CLI+fixture不是实际接入证明：首次真实checkpoint必须由主线程调用并保留trace、stdout等价、call证据，之后才验收整票。

## S6 夜班与接受
每票20分钟首片（不是完成承诺），一晚共享3次/45分钟。已授权本地修复与离线测试；子agent只返回candidate，Chief独立复验写回三件套后才能Done并解锁后继。
全局投影漂移不自动sync apply；阻止“已发布/全局接入”声明，若本票要求的目标有相关drift则报局部blocker。
任何修复需要编辑其他initiative拥有的文件、权限升级、live模型采购/外传、发布或gate激活，停止该子步骤并记录精确恢复条件，不冻结其他无依赖工作。
回退只恢复该票具体diff；不reset/stash/覆盖共享工作树。全程gate保持shadow。
