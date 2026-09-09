# V2.0 测试与验证计划

这些是未来实施的测试要求；本次规划未执行它们。每条记录命令、exit、输入/源码 hash、实际结果、证据位置。fixture 证明计算行为，真实 Host 回放才证明模型/交付表现。

## 确定性测试

新增 `tests/runtime/economics-report.test.mjs` 使用 node:test/assert；临时 CLI 输入由 mkdtemp 生成并清理本测试所有的目录，不使用真实 sessions。`fixtures/complete.json` 为16条去敏运行的生成模板；其 case IDs E1/E2/E3/E4、round 1/2 和 arms 必须全覆盖。

| ID | 输入与操作 | 必须断言 |
| --- | --- | --- |
| T01 | 单窗口累计 start=(input100,cache20,output10,reasoning2)，end=(160,40,30,8) | 增量 input60/cache20/output20/reasoning6；total80、fresh60，reasoning不重复计费 |
| T02 | 两 exclusive 范围：主 input100/cache20/output10，子40/10/5 | total155、fresh125；父 inclusive 加同子则 run usage=null / overlapping_usage |
| T03 | cumulative input倒退；无 start；cache=null；reasoning=null | 倒退/无起点对应指标unknown；cache缺失保留total、fresh=null；reasoning缺失不影响total/fresh |
| T04 | 重复runId/scopeId、负数、cache>input、reasoning>output、未知schema、非法round、父引用循环/跨run/不存在 | ERR_ECONOMICS_INPUT，不静默跳过；重复 run 的 attempt 不得覆盖 |
| T05 | failed attempt1 fresh50+completed attempt2 fresh40，各耗时2s/3s、人工1/0 | arm总fresh90、elapsed5000、人工1；qualityGate=fail，经济not_supported，包含两次证据 |
| T06 | 完整16次质量通过，每轮每case baseline fresh100、SWF80；耗时/人工无增加 | 每轮400→320，差-80、下降20%；supported；JSON和Markdown都包含4对×2轮 |
| T07 | 轮1 400→320，轮2 400→420；或轮2持平400 | not_supported；不能合两轮为一次改善来验收 |
| T08 | 缺一条initial；一条not_run/unavailable；metric null；缺实际模型证据/方法组模型不同 | coverage列缺口，unproven，缺值非0；不得算不完整轮次收益 |
| T09 | 某产物scope fail或重大事实错误；方法hash/工具范围/输入不同；没有rubric review | 质量fail强制not_supported；差异或未评审unproven；理由与原始case可追溯 |
| T10 | baseline primaryMetric=0；另一个指标/人工干预增加且无tradeoffReview | 百分比null；无明显改善不得supported；代价转移未知时unproven，明确评审接受后仍展示增加值 |
| T11 | CLI --help、无input、坏JSON、未知参数、--format bad、不可读文件；合法unproven输入 | help exit0，其余参数/读取错误exit2；合法unproven exit0且verdict仍unproven，stderr不泄露输入全文 |
| T12 | 对冻结input深比较；同输入连跑；CLI cwd为只有fixture的临时目录；evidenceRef指向不可读路径 | 输入不变/输出稳定；不读取引用、不扫描HOME、不写Trio；stdout JSON可解析，Markdown保留失败/缺测 |

T04 还覆盖多余 attempt 跳号、负耗时、非有限数值、unknown枚举；T08覆盖非预登记case、缺失轮次。判分字段/模板缺失应作为未评审或错误的区别遵循 implementation A1，不由测试随意选择。

实施后运行（以下新增路径在 A2/A3 创建后才存在）：

```sh
node --test tests/runtime/economics-report.test.mjs
node tests/evals/v20-economics/report.mjs --input tests/evals/v20-economics/fixtures/complete.json --format json
node tests/evals/v20-economics/report.mjs --input tests/evals/v20-economics/fixtures/complete.json --format markdown
```

现有兼容命令，可直接运行：

```sh
node --test tests/runtime/token-audit-service.test.mjs
npm run verify:trio
npm run verify:core
git diff --check
```

不改 homepage/plugin/projection/DSH，不为本次 eval 增量额外运行其测试；若确有未授权路径依赖，先返回 Chief 调整范围。未来发布按仓库当时规定跑 release checks，不能用本表豁免。

## Schema 收口回归（A2 必跑，新增）

| ID | 输入 | 断言 |
| --- | --- | --- |
| T13 | 删除actualModel键；保留键填null+reason；填字符串unknown；quality未评审 | 缺键/字符串unknown为ERR_ECONOMICS_INPUT；null合法且comparable=false；not_assessed→incomplete |
| T14 | 同一case/round/arm的attempt1和2；重复相同四元组；从1跳到3；未执行占位与attempt2并存 | 1/2合法且汇总；后三者错误；runId另做全局唯一检查 |
| T15 | run一个scope fresh60、另一个缺cache；sharedOverhead fresh10；attribution incomplete | run fresh=null、knownPartial.fresh=60；shared单列10、不加round；verdict unproven；补成完整对称且独立评审后方可supported |
| T16 | 一条quality fail+一条未执行；仅未评审；质量全pass但usage null/实际型号无证据 | 顶层分别fail/incomplete/pass；经济分别not_supported/unproven/unproven，验证优先级与维度隔离 |

T01–T16均由同一新增node:test文件执行；A2先完成T01–T10及T13–T16，A3再补CLI T11/T12。共享范围重复、空scopes无reason/评审、未知额外键也纳入T13/T15。完整fixture显式提供 `overheadAssessment`，不能靠默认值获得supported。

## 语义、资源与实际工作验证

| Gate | 执行与证据 | 通过条件 |
| --- | --- | --- |
| L1 预登记 | A0的16槽、2轮顺序、hash、独立rubric、资源指标、超时 | 全部在首次run之前冻结；holdout未参与改写 |
| L2 质量与范围 | reviewer逐个核对16个产物/来源/工具轨迹，保留全部失败重试 | factual/scope/usable/limitations全pass；没有越权、伪造、重大错误；失败不能被重试抹掉 |
| L3 资源对账 | 每个run绑定Host窗口；独立审查每类成功及全部失败/缺测 | 主/子范围无重复，所有尝试及整合成本计入；缺值明确；模型认证不能来自自述 |
| L4 经济判断 | JSON与人工手算至少每轮一对，审核全部轮合计和代价 | 两轮同向改善且L2通过、无未解释代价才supported；反例/缺测如实结论 |
| L5 方法决定 | C1来源/现有能力/比较/范围/撤销模板 | “不采用”有效；无证据时不扩默认，无新registry或自动升级 |
| L6 扩展 | D1四阶段实际证据，或Chief明确停止 | installed/read/executed/delivered不互推；无需求可停止；DSH不参与 |
| L7 独立审阅 | 另一个Luna high检查契约、数值、16产物判分、报告与决定 | 没有未解决的执行/真实性/权限阻塞；Chief写回Trio |

E1 fixture 示例：输入四行 A=12、B=8、A更正=15（较新且Owner明确取代）、C=缺失；期望 A15/B8/Cunknown，已知合计23且不称完整总计。E2摘要有旧期限10日、新Owner修正12日及未确认负责人；期望用12日并指出来源、负责人unknown。E3恢复沿用同范围有效授权，不重问；E4只实现/交接指定小范围，不发布。A0需把完整输入与接受rubric冻结，以上示例不充当实际运行输出。holdout的最终输入由评审另外提供，不把本页期望放入执行prompt。

行为指标：重复确认仅统计同一有效授权被重问；恢复轮数从恢复请求到第一次有效动作（连续assistant工具操作计同一assistant turn）；额外步骤需评审给出为何与任务无关。人工介入记录去重事件ID，未知不能填0。两个评审分歧先针对原始证据裁定并留理由，不能平均掉scope fail。

## 发布与报告决策

1. T01–T16和兼容测试通过：`candidate_code_verified`。
2. L1/L3/L4/L5/L6/L7齐备且真实两轮都执行：可验收报告/方法决定。L2失败时保留失败报告为研究交付，版本候选需修复问题或移除该新增方法后新cohort全量复验，不能扩大默认采用。
3. L2通过但资源缺测：经济结论未证明，可接受测量限制与“保持现状”决定；不能宣传节省。
4. L2通过且supported：只支持该cohort；扩大默认采用仍须V1.4正式验收和用户选定范围。
5. 任一真实运行尚未执行：版本验收未完成。D1有明确停止记录不造成此类缺口。

## 追踪矩阵

| 需求 | 切片 | 确定性证据 | 正式证据 |
| --- | --- | --- | --- |
| 20-A 用量可信 | A0–A3 | T01–T05/T08/T11/T12 | L1/L3/L4 |
| 20-B 协作经济性 | B1 | T06–T10 | L2/L4/L7 |
| 20-C 技能生命周期 | C1 | 模板字段人工检查 | L5 |
| 20-D 单一外扩 | D1 | 不伪造Host兼容fixture | L6接受或停止 |
| 简化/不影响V1.4 | Z1 | 旧token-audit、trio/core、diff检查 | L7及roadmap状态一致 |
