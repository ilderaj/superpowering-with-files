# Economics input and calculation contract

## A1 — 固定输入、输出与计算契约

新增 `tests/evals/v20-economics/contract.md`，按以下定案实现；不引入 schema 库。输入 JSON 对象固定含 `schemaVersion:1`、`cohort`、`runs`。

`cohort` 必填：`id, kind(method|strategy), caseIds[4], holdoutIds[2], rounds:[1,2], primaryMetric, inputHashes, rubricHash, methodHash（baseline/swf两个hash）, toolScopeHash, preregisteredAt, timeoutSeconds`。日期采用带时区 ISO；hash 是 sha256 十六进制。caseIds 不重复，holdout 必须是子集。baseline 方法快照与 SWF 方法快照分别记入运行 `instructionHash`。

每个 run：

| 字段 | 契约 |
| --- | --- |
| runId, caseId, round, arm, attempt | 唯一 runId；arm baseline/swf；attempt 从 1 连续递增，重试不能覆盖 |
| inputHash, instructionHash, toolScopeHash | 与预登记绑定；不匹配标不可比 |
| requestedModel, requestedEffort, actualModel, actualEffort, actualEvidenceRef | 实际值缺失为 null；请求值不能替代实际值 |
| topology | direct/native；user-owned task 另建 cohort，不混入内部 worker 实验 |
| startedAt, endedAt, status | status completed/failed/timeout/not_run/unavailable；未执行可无时间，其他时间缺失则耗时 null |
| quality | factual, scope, usable, limitations 各 pass/fail/not_assessed；由独立 reviewer 填，附 reviewer/evidenceRef |
| actions | repeatConfirmations, resumeTurns, unnecessarySteps, humanInterventions：非负整数或 null；null 附 reasons |
| usageScopes | 以下互不重叠计量范围数组，主/子任务各占一项；没有用量也保留 [] 与 reason |
| evidenceRefs, reasons | 本地证据引用及限制；报告不自动读取证据路径，不输出路径正文/私密内容 |

usageScopes 每项固定 `scopeId, parentScopeId, accounting(exclusive|inclusive|unknown), mode(delta|cumulative), start, end, delta, evidenceRef`。token 向量包含 `input,cachedInput,output,reasoningOutput`，每值是非负安全整数或 null。input 包含 cache；output 包含 reasoning。delta 模式只读 delta；cumulative 模式只读 start/end，必须是同一计数器连续窗口；reset 或倒退不取绝对值，判该项 unknown。reasoningOutput 是细分，永不再加到 output。

算法：

1. schema 错误（未知版本、非法枚举、重复 runId、负值/非安全整数、cached>input、reasoning>output、缺必填）报错退出；无数据/缺测不是 schema 错误。
2. 同一 scopeId 在整个 cohort 重复视为重复计量，拒绝；每个实验计量窗口使用唯一 scopeId。一个树若全是 exclusive，逐项相加；若父 inclusive 与子同时出现，不猜包含关系：该 run 用量 null、reason=overlapping_usage。孤立 inclusive scope 允许，表示已包含其全部子开销。unknown accounting 不参与总数，run 总量 null。循环/不存在 parent 引用拒绝；父 scope 仅能引用本 run 内记录。
3. cumulative 用 end-start；任一必要分量缺失/倒退使该指标 null。total=input+output；freshTokens=input-cachedInput+output；仅 cache 缺失时 total 仍可计算，freshTokens null。reasoningOutput null 不影响 total/fresh。不将缺测当 0。
4. attempt 的墙钟 elapsedMs=end-start；时间倒退拒绝。每 arm/case/round 汇总全部 attempt 的资源与干预；任一次失败/超时或 quality fail，该 pair 质量失败，即使后来成功也不能成为质量全通过 cohort。not_run/unavailable/not_assessed 则未完成，不能算 pass。
5. method cohort 配对双方 actualModel/effort、工具、输入、topology相同且有证据；跨轮同一 case 也相同。strategy cohort 允许明确预登记的不同配置，额外在 cohort 增加 `strategies:{baseline:{model,effort,topology},swf:{...}}`；实际不符则不可比。所有新增/重试/主执行者整合资源计入，缺任何范围则 unknown。
6. 两轮分别计算 sum(SWF)-sum(baseline)，以及 1-sum(SWF)/sum(baseline)。所有四个 pair 的该指标齐全、可比才给轮级数值；baseline=0 时百分比 null。零差不是改善，不丢弃不利案例。elapsedMs 是每 attempt 的整体墙钟，不能再加子任务时间；人工干预逐事件计数去重，无法去重则 null。
7. `economicVerdict` 只取 supported/not_supported/unproven：所有运行质量通过、全部可比、primaryMetric两轮严格下降且没有未解释代价转移才 supported；质量通过后，先检查主指标完整性、可比性及共享成本归属；任一不足为 unproven，即使观测主指标未改善也不提升为完整经济结论。上述条件齐全但未改善为 not_supported；缺测/未执行/不可比为 unproven。质量失败强制 not_supported。其他资源或人工干预增加时需要独立评审的 `tradeoffReview:{reviewer,evidenceRef,accepted,reason}`；没有明确接受只能 unproven。把 tradeoff 原始数值与理由公开在报告，不能藏到总分。
8. 输出 JSON `schemaVersion, cohortId, coverage, runs, pairs, rounds, qualityGate, economicVerdict, reasons`；coverage 含计划16、实际 initial/attempt计数、缺失运行。Markdown 同序输出全部 pair、失败/缺测/重试和限制。不得输出美元费用或跨样本普遍提升宣称。

补充校验定案：必填键缺失属于输入错误；允许缺测的值必须显式填 null/reason，quality 未评审填 not_assessed。非预登记 case、非法 round、重复 case/round/arm/attempt、attempt 跳号属于输入错误；缺少预登记运行槽属于 coverage 缺口，不是输入错误。cohort.rounds 必须是 [1,2]，但 runs 可以不完整。status=not_run/unavailable 的占位行仅 attempt=1，不计入实际执行次数。completed/failed/timeout 均计实际尝试。初始实际运行数只数 attempt=1 且实际执行的行。qualityGate=fail 优先于 incomplete，余下全部通过才 pass。

补充聚合定案：任何参与相加的值为 null，则该合计 null，另报已知部分而不当完整总量；不同指标独立传播缺测。派单/评审/整合的主执行者用量必须归入各 arm 的计量窗口；无法归因且可能影响收益时记录 reason=unattributed_overhead，不能 supported。实验的固定公共准备成本另列 cohort.sharedOverhead（同 usageScopes 向量结构，必须显式给scopes与reason，结构见Schema收口规则），报告独列，不拆分伪造归因、不混入某一arm。两个arm对称排除同一公共准备工作方可比较，独立评审确认。

出口：契约和下列测试期望对应；计算没有任何写 Trio/调用模型/默认目录扫描路径。

### Schema 完整定义（A1）

本节补全A1各字段的类型与缺测规则。JSON不使用字符串 `unknown` 代替未知值，统一 null + reason；unknown只用于人工摘要以及明确枚举 `accounting=unknown`。下表 R=键必填且不可null，N=键必填但可null。未列出的额外键拒绝，防止拼错字段被忽略。

| 对象 | R 字段 | N 字段 |
| --- | --- | --- |
| input | schemaVersion/cohort/runs | 无 |
| cohort | A1原列字段 + sharedOverhead/overheadAssessment | tradeoffReview；strategies仅strategy组R，method组不允许 |
| run | runId/caseId/round/arm/attempt/inputHash/instructionHash/toolScopeHash/requestedModel/requestedEffort/topology/status/quality/actions/usageScopes/evidenceRefs/reasons | actualModel/actualEffort/actualEvidenceRef/startedAt/endedAt |
| quality | factual/scope/usable/limitations | reviewer/evidenceRef；任一判分非not_assessed时两项必须非null |
| actions | reasons（对象，键为缺失动作字段，值为原因） | repeatConfirmations/resumeTurns/unnecessarySteps/humanInterventions |
| usageScope | scopeId/accounting/mode/evidenceRef | parentScopeId/start/end/delta；delta模式delta非null、start/end必须null，cumulative相反 |
| token向量 | 无 | input/cachedInput/output/reasoningOutput（四键均在） |
| sharedOverhead | scopes（usageScopes相同形状的数组）、reason | 无 |
| overheadAssessment | attribution(complete|incomplete|unknown), symmetricExclusion(yes|no|unknown), reason | reviewer/evidenceRef |
| tradeoffReview非null时 | reviewer/evidenceRef/accepted(boolean)/reason | 无 |
| strategies的每arm | model/effort/topology | 无 |

run.reasons和evidenceRefs为字符串数组，可空；每个null必须在reasons写对应字段原因。非空字符串不等于认证，L3必须回看真实Host轨迹。inputHashes为caseId→sha256对象，恰好包含四case。instructionHash由cohort.methodHash固定为 `{baseline:<hash>,swf:<hash>}`；inputHash按case比对。inputHashes/rubricHash/toolScopeHash等必须预登记。质量not_assessed时reviewer/evidenceRef可以null且reasons说明未评审。允许没有时间的执行记录以表示缺测，禁止用补造时间满足R/N规则。

唯一性：全局runId唯一；组合 `(caseId,round,arm,attempt)` 唯一；同 `(caseId,round,arm)` 内attempt从1连续递增。不同attempt共享同一case/round/arm合法，不是重复pair。禁止 `not_run/unavailable` 占位行与同槽实际attempt并存；开始真实执行时用actual attempt1替换该占位，保留旧输入文件版本作历史证据。

共享开销：`sharedOverhead.scopes` 独立命名且不能与run范围重叠；用同一窗口算法得到输出 `{metrics:{totalTokens,freshTokens},knownPartial:{totalTokens,freshTokens},reason}`。run/pair也输出 `knownPartial`（各指标已知值之和；无已知贡献为null），只用于说明，不进入轮级合计或verdict。sharedOverhead永不进入round；其缺测明确展示。只有overheadAssessment.attribution=complete、symmetricExclusion=yes、reviewer/evidenceRef均存在且L3确认，才允许supported；否则unproven / unattributed_overhead。sharedOverhead.scopes=[]也要reason及该评审，不隐含“开销为零”。该完整性条件优先于仅凭primaryMetric变好。

qualityGate推导（资源缺测/不可比不能假装质量失败）：

1. run.status=failed/timeout，或任一quality项fail → fail；否则not_run/unavailable或任一not_assessed → incomplete；否则completed且四项pass → pass。
2. pair：其任一attempt为fail → fail；否则任一arm缺槽或任一attempt incomplete → incomplete；否则pass。
3. 顶层：任一pair fail → fail；否则缺预登记pair或任一pair incomplete → incomplete；否则pass。只有完全16槽且通过者才pass。
4. actual证据缺失、配置不符只影响comparable；usage null只影响资源完整性。因此qualityGate可以pass且economicVerdict=unproven。fail优先not_supported；incomplete强制unproven；quality pass后才依A1资源与代价规则判断。

任何schema补充规则必须先通过T13–T16才能结束A2，不能只运行旧T01–T10。

### 固定输出形状与排序

- `coverage:{plannedInitial:16, executedInitial, executedAttempts, missingSlots:[{caseId,round,arm}]}`。
- `runs` 保留 runId/attempt/status/quality 与标准化 `metrics:{totalTokens,freshTokens,elapsedMs,humanInterventions}`、reasons；不展开原始来源文本。按 caseIds 顺序、round升序、baseline先于swf、attempt升序排序。
- `pairs:[{caseId,round,baseline:{runIds,metrics},swf:{runIds,metrics},qualityGate,comparable,reasons}]`。qualityGate=`pass|fail|incomplete`；comparable是boolean，缺认证填false并给原因，不能填true代表“没发现问题”。
- `rounds:[{round,primaryMetric,baseline,swf,delta,improvementRatio,complete,reasons}]`；不完整时四个数值全null；improvementRatio是0.2而非20，Markdown才格式化20%。
- 顶层 `qualityGate` 同上，`economicVerdict`按算法枚举；`reasons`为排序去重的稳定reason code；详情留在每个run/pair。报告追加 `sharedOverhead` 与 `tradeoffReview`；前者固定对象，后者允许null并说明缺少评审。
- reasons至少固定 `missing_usage, counter_reset, overlapping_usage, unknown_accounting, missing_actual_evidence, input_mismatch, tool_mismatch, configuration_mismatch, incomplete_runs, quality_failed, unreviewed_quality, no_repeatable_improvement, unreviewed_tradeoff, unattributed_overhead`。纯函数不能把一个reference字符串本身当“真实性已验证”；L3由独立评审确认其证据内容。


## Chief reconcile：共享开销与缺测原因

公共准备成本从两个 arm 对称排除时，允许其窗口缺测；这只支持对 arm 执行阶段的比较，不支持全流程总成本收益。sharedOverhead 缺值仍为 null，顶层 reasons 同步报告 `shared_overhead_<reason>`。只有既有 attribution=complete、symmetricExclusion=yes、reviewer/evidenceRef 非空且独立 L3 核对成立才允许 supported。不能用 reference 自述替代独立核对；未归属的派单、评审或整合成本可能影响任一 arm 时仍必须 unproven。空 scopes 不等于零开销。此次澄清保留原契约的对称排除规则，不凭 fixture 成功宣传全流程收益。

run 内每个 token null 分量须有对应原因，稳定前缀为 `usageScopes.<delta|start|end>.<input|cachedInput|output|reasoningOutput>`；模式不适用的整个 start/end/delta=null 不属于缺测。共享开销使用其显式 reason 字段。Markdown 保留每次 quality 四维结果及 opaque reviewer/evidenceRef，不读取引用内容。

主指标可预登记为 totalTokens、freshTokens 或 elapsedMs。totalTokens 为 input+output，不扣缓存；每轮沿用同一已冻结主指标，不按结果切换。


### 判定优先级与展示（2026-09-08 修订）

按以下顺序短路，保持现有单一 `economicVerdict` 字段：

1. 质量失败 → `not_supported`，共享成本未知不能掩盖质量失败。
2. 质量未完成、主指标轮次不完整/不可比，或共享成本归属不完整 → `unproven`。
3. 质量及上述证据完整，但任一轮主指标持平或增加 → `not_supported`。
4. 两轮严格改善后，检查次要指标及人工代价；未知或未接受的代价转移 → `unproven`，否则 `supported`。

只要完整主指标观测中存在不改善，保留 `no_repeatable_improvement` 理由与数值，即使更高优先级使 verdict 为 `unproven`。不把这个理由单独解释成总体成本结论。共享归属的未知、缺评审、明确不对称，以及 accounting=unknown 均不能被断言覆盖。已独立证实的对称排除仍按既有契约处理，不把空 scopes 解释成零。

Markdown 在首部标出主指标，每个 pair 同时展示准确标注的 totalTokens 和 freshTokens；轮级仍按预登记 primaryMetric 计算。历史冻结输入、报告、评分和结论不自动重写；新契约只约束新的报告执行。实验启动与业务读取边界按 [派单预检](admission.md) 冻结。
