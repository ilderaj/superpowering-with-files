# V2.0 实施计划

## 基线、接缝与禁止项

规划基线：1.3.0，main/dev `0796c52d07b64c526bee45cf728738a940eb3776`；规划 checkout `ca42a06638408a253e93cfb57c05ae6482e795b7` 与其树相同。未来必须重新记录实际 HEAD、dirty 清单、Node 版本、Host 工具/型号目录；不得把此 SHA 当永远有效的执行基线。

现有只读接缝：

- `harness/installer/lib/token-audit.mjs` 的 `runTokenAudit`、`renderTokenAuditMarkdown`；目前取会话最后累计值，缺失可能归零，不能证明单次任务增量或账单。
- `harness/installer/commands/token-audit.mjs`、`tests/runtime/token-audit-service.test.mjs`：保留原 CLI/行为，作为兼容回归。
- `tests/evals/v13-reliable-completion/`：复用去敏案例模式，不复制已验收结果为新运行。
- `harness/trio/skill/references/execution.md`：当前模型建议/权限边界；本版只引用，不改。
- `scripts/adopt-global-skills.mjs`、`harness/optional-skills/show-me/PROVENANCE.json`：读取来源和可撤销采用机制，不加 registry 或安装器。

新增范围固定在 `tests/evals/v20-economics/`、`tests/runtime/economics-report.test.mjs`、`docs/methods/economic-collaboration.md`；仅 Z1 更新两份 roadmap 的链接/证据状态。不修改 package scripts；测试文件自动被现有 `verify:core` glob 包含。不改 token-audit 公共接口、模型 resolver、Host bridge、配置默认值、DSH、homepage、上游镜像和全局技能。

## A0 — 冻结实验（先做）

读本包、V1.4 验收证据、现有 token-audit/eval。写当次 Trio 与新增 `tests/evals/v20-economics/README.md`、`cases.json`。仅写去敏输入；真实轨迹在本地 `.harness/verification/v2.0/<cohort>/`，公开提交前另做去敏。

1. 记录实施授权、实际基线和无冲突路径；未来实施 Trio 与本次“规划完成”Trio分离。
2. 固定 4 个 case：E1 结构化资料提取、E2 冲突来源摘要、E3 恢复有界任务、E4 小范围实现/设计交接。E1/E2 为开发案例，E3/E4 为 holdout；由独立评审固定期望。实现者不能用 holdout 输出调技能；泄漏则新建 cohort 更换 holdout。
3. 每 case 在每轮各执行 baseline/SWF 一次：4 × 2 × 2 = 16 个初始运行；所有重试另记 attempt。轮 1 E1/E3 先 baseline、E2/E4 先 SWF；轮 2 反转。新上下文、独立临时目录，双方只读相同输入、使用同样工具和 rubric，不能看对方输出。
4. 预登记 primaryMetric（`freshTokens` 或 `elapsedMs`）、质量 rubric、工具快照、方法 snapshot hash、请求与实际模型证据要求、超时值。超时按 Host 可用能力填写具体秒数后才开始；不得事后换指标。
5. 正式最小发布先完成 method cohort，strategy cohort 可单独追加；不能合并成一个节省百分比。

出口：四个输入及 hash、不可见于执行者的 rubric、预登记元数据、明确来源权限。无实际模型认证仍可做不涉及模型归因的工具验证，但不能给方法/model对照下可比结论。缺业务来源不阻塞 A1–A3。

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
7. `economicVerdict` 只取 supported/not_supported/unproven：所有运行质量通过、全部可比、primaryMetric两轮严格下降且没有未解释代价转移才 supported；测量齐全但未改善为 not_supported；缺测/未执行/不可比为 unproven。质量失败强制 not_supported。其他资源或人工干预增加时需要独立评审的 `tradeoffReview:{reviewer,evidenceRef,accepted,reason}`；没有明确接受只能 unproven。把 tradeoff 原始数值与理由公开在报告，不能藏到总分。
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

## A2 — 纯计算器（A1 后）

写新增 `tests/evals/v20-economics/lib/report.mjs` 与 `tests/runtime/economics-report.test.mjs`。固定导出 `validateExperiment(input)`（合法返回 input，非法抛带 `code=ERR_ECONOMICS_INPUT` 的 Error）、`buildReport(input)`（返回上述报告）、`renderMarkdown(report)`（字符串）。无 fs、网络、时间、进程环境依赖，输入不变。

先写 verification.md 的 T01–T10，确认因导出/行为缺失失败；按 A1 顺序实现校验→窗口→attempt→pair→round→判定→渲染，不抽象通用指标框架。T11/T12 在 A3。一次改一类失败；输入契约矛盾返回 Chief，不自行加字段含义。出口：T01–T10及T13–T16 pass，旧 token-audit 回归 pass，diff 无越界。

## A3 — 离线 CLI（A2 后）

写新增 `tests/evals/v20-economics/report.mjs`、`fixtures/*.json`。固定命令：`node tests/evals/v20-economics/report.mjs --input <json> --format json|markdown`。仅 --help 可省略 input；默认 format=json。只读显式输入，报告到 stdout、错误到 stderr；不支持 --output，重定向由执行者控制，不自动读任何 evidenceRef。

退出码：0=合法报告（包括 not_supported/unproven，不代表验收通过），2=输入/参数/读取错误。测试必须断言 report verdict，不能只断言 exit 0。无联网、无新 npm 依赖、无全局 sessions 默认。出口 T11/T12 与完整 deterministic suite。

## B1 — 两轮实测（A3 后）

只写本地证据根、去敏 eval README 结果索引和当次 Trio；不写原始业务/session数据到 repo。独立 reviewer 持 rubric；执行者每次只见输入和本 arm 方法。绑定 A0 各项；开跑前验证输入/方法 hash。每次记录原始轨迹、全部 usageScopes、最终制品、计时及人工计数来源。

一次针对性重试后仍失败返回 Chief；可更早停止危险行为，不为填满16条继续越权。未运行槽保留 not_run。恢复必须沿用已记录 runId/attempt，不重新生成整组成功样本。完整报告标出质量与经济结论，Chief 将原始轨迹抽查覆盖全部失败/缺测及每类至少一个成功；独立评审检查全部16个产物。

输出：两个轮次报告与一次 C1 采用决定。没有认证用量可用已预登记耗时指标；不得中途由 token 换成耗时制造正向结论。新增 cohort 才可换指标，保留旧结果。

## C1 — 方法与技能采用决定（依赖 B1 结论）

写新增 `docs/methods/economic-collaboration.md`（按需文档，不接入默认技能）及 `tests/evals/v20-economics/decision-template.md`。模板固定：问题实例→现有能力是否足够→来源URL/revision/hash/license→本地增量→对照 cohort/verdict→采用范围/不采用理由→owner→撤销条件→历史证据位置。

先评估现有 show-me 与 Office 方法，不因版本任务而增新 skill。来源若无法固定标 unknown，停止该项采用；不要为完成本版广泛上网搜技能。任何更新/upstream复制另需具体授权与许可核查。当前最小版本决定可以是“保留现状，不新增”。不要把安装字节验证当行为收益；不写全局 receipt 或改默认模型。

## D1 — 一工作区试点或明确停止

只在用户已有需求且授权安装/工作范围时，选一个非 SWF 工作区、已有 Codex Host；在该任务 Trio 绑定目标，不能由本计划猜路径。分别记录 installed（现有流程及receipt）、read（Host 实际读取）、executed（实际任务轨迹）、delivered（预定接收者可用证据）。复用 V1.4 真实工作流允许，但必须是对应该新工作区的本次证据。

安装前保存受管基线，使用既有 dry-run 冲突检查；发生非本任务改动则停，不覆盖/--takeover。需要新 adapter、DSH 或无需求时 Chief 记录 stop 与理由。退出不要求新 Host 上线；包装 smoke 只支持包装判断。试点写范围仅在当次精确授权后补进执行 Trio，不能视本文件为外部写权限。

## Z1 — 集成、迁移、回滚

依赖 A0–C1；D1有接受或停止记录。更新 `docs/roadmap.md`、`docs/research/swf-60d-20260906/roadmap.md` 链接、实际证据与限制，不改历史成功案例。运行 verification 的回归，review检查所有新增文件没有私密绝对路径/凭据/会话正文。

回滚单位：A2/A3删回本次新增 eval工具/测试；C1撤销本次方法文档入口；D1只恢复本次拥有且之后未被修改的受管文件，有冲突停止交由owner。原始证据保留，不删除失败记录。版本本身无默认开关，因为没有默认行为变更；将来提出扩大默认采用时必须另附具体撤销设计和授权。无自动 release/adopt。
