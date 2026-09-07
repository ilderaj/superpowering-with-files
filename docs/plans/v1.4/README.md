# SWF V1.4 跨域交付执行计划

## 2026-09-07 受控验收补充（当前适用）

按用户要求，不再等待新的自然业务才能覆盖 W1–W3。新增 [可重复验收包](acceptance-pack/README.md)，其中四个独立 Sol/Luna 任务、隔离输入的评分表、证据与重试规则，定义受控验收发布路径。本补充优先于本文要求“仅自然业务 pilot 才能发布”的表述；原 pilot 路径继续有效。受控来源必须标识，实际 Host 执行与用户可见交付仍必须验证。O4 六项真实证据、源码/制品回归、Chief 接受要求保留。未执行 cases 不得计 pass；当前任务状态以新绑定 Trio 为准。


状态：V1.4 source/package、O1/O2/O3/D1 语义验收、O4 live evidence，以及受控 W1–W3 workflow evidence 均已由 Chief 复核通过；本次发布版本为 1.4.0。受控 workflow 证据只证明 Harness 的可见交付路径，不宣称生产采用、业务批准或对外发送。

本计划服务于 V1.4 的跨域证据、决策、Office 产物和可见交付验收。它既保留 Sol/Luna 可复用的执行契约，也记录本轮候选实现边界；实现任务记录位于 `planning/archive/20260907-002818-swf-v1-4-cross-domain-delivery-20260906/`，受控验收与发布闭合记录位于 `planning/archive/20260908-001000-swf-v1-4-release-20260908/`，可移植的结果快照位于 `acceptance-pack/evidence/`。

## 0. 2026-09-07 实施结果

- 新增两个按需 Office reference；primary surface 保持 6 个，supporting reference 为 7 个，总 projection surface 为 13 个。
- 新增 O1–O4、D1 的冻结场景、输入 fixture 和确定性 contract。O1、O2、O3、D1 经独立语义复核通过；O4 使用已有授权 automation 的 live evidence 完成复核。
- 既有 Office DOCX、PDF、PPTX、XLSX fixture 完成 native parse/render 和数值检查；本地结果不冒充真实 workflow delivery。
- 目标验证通过：Office/projection/package 47/47，V1.4 contract 8/8，`verify:trio` 424/424，`plugin:verify` 82/82，`verify:core` 359/359 加 plugin-kit 82/82。
- 已复核现存 ACTIVE 的只读 Outlook 汇总 automation，并绑定 source、schedule、target、既有授权、执行和可见回读证据；O4 通过。四个受控任务分别提供 O1/O2/O3/D1 结果和 W1/W2/W3 可回读交付证据，sourceType 标识为 controlled/synthetic。
- 本轮完成 V1.4 的 commit、push、PR、merge、release、main/dev 收敛和本地 adoption；生产 workflow 仍按原 pilot 路径单独验收。

## 1. 读取顺序和权威边界

按以下顺序阅读：

1. 本文件：范围、冻结决策、版本矩阵和完成门槛。
2. [implementation.md](implementation.md)：未来允许修改的路径、固定接口、分片过程、停止和回滚。
3. [verification.md](verification.md)：现有与拟议命令、数字夹具、语义回放和发布门槛。
4. [handoff.md](handoff.md)：冻结包、候选结果格式和恢复流程。

本次规划基线为1.3.0，main/dev `0796c52d07b64c526bee45cf728738a940eb3776`；规划checkout `ca42a06638408a253e93cfb57c05ae6482e795b7` 与其树相同。规划Trio只记录本次文档任务；未来实施由主执行者绑定当次实施Trio和实际HEAD，计算新的三文件hash，不复用本次规划的冻结hash。

上位范围：[三版路线图](../../research/swf-60d-20260906/roadmap.md)。后续版本：[V2.0执行包](../v2.0/README.md)。每次派单只冻结该slice的写集与依赖；无关dirty文件不构成全仓库冻结。

## 2. V1.4 固定范围

V1.4 只增加 Office 的按需支持参考，并使其能随现有 projection、安装和插件打包边界传播：

- 保留六个 逻辑治理条目（entry不是skill）：`entry`、`trio`、`dev`、`office`、`safety`、`chiefops`。
- 仅允许新增两个 Office supporting reference：`source-backed-work.md` 与 `artifact-and-delivery.md`。
- 允许修改现有 Office capability 的本地链接，以及 `harness/trio/projection.mjs` 的 supporting source list。
- 只有在现有测试要求时，才修改对应测试、安装/打包文档和固定夹具元数据。
- 复用 Host 的 native document/spreadsheet/presentation/PDF 打开、解析、渲染、调度、通知、权限和外部写入能力。
- 不新增 skill、capability、registry、worker bridge、DSH dev/test、renderer、scheduler、auth、state system。
- 不做全局 adoption；不修改其他 dirty worktree 的内容。
- V2.0 由另一条主执行线负责；本计划只输出可被 V2.0 消费的结构化证据边界，不写 `docs/plans/v2.0/**`，不替 V2.0 做成本或节省结论。

路由和运行时约束同样冻结：root 当前只接受 direct/native-first 与 `manual_pending`；历史 `visible_worker_required` 输入必须 fail closed。请求的模型和 effort 不能冒充实际运行时证据。若未来 Host 无法提供实际模型证据，结果写 `unknown`；不得切换 Astra 作为兜底。

## 3. 五个验收案例和三个实际工作流

五个案例必须全部存在：

| 案例 | 验收内容 | 必须可见的结果 |
| --- | --- | --- |
| O1 | 冲突产品计划 | 事实、假设、冲突、建议、待确认项和来源日期/范围分开；不能把旧需求写成当前事实 |
| O2 | 中文工作总结 | 事实、动作、负责人、输出、期限/风险和来源分开；未知项明确写 `证据不足，待确认` |
| O3 | 多页/多 sheet Office 产物 | native open/parse/render；引用、公式、缓存值、分页、表头、可搜索文本和链接可核验 |
| O4 | 授权定时总结 | 只接受真实授权的 Host automation 和收件人可见证据；不能用 fixture、模拟发送或“queued”替代 |
| D1 | design→implementation handoff | 设计约束、实现边界、接口、验收、负责人和未决项可直接交给实现者 |

三个工作流必须是不同的真实使用路径：

| 工作流 | 组合 | 真实发布门槛 |
| --- | --- | --- |
| W1 product | O1 + 相关来源证据 + product decision | 实际用户/Host 可见的产品决策包，含 O1 结果 |
| W2 summary | O2 + O4 | O2 为可见中文总结；O4 另须真实授权 automation、真实执行和收件人可见回读 |
| W3 design | D1；可复用O3 | 选定设计与实现handoff可回读；不为W3强制制造Office格式，O3可在W1/W2或独立合适场景覆盖 |

同一份证据或产物可被多个工作流引用；不要求为 O1–O4、D1、W1–W3 制作八份重复 artifact。发布结果必须按 `caseId` 和 `workflowId` 单独记录，防止“复用证据”被误报成“重复交付”。

受控验收已覆盖 O4 所需的 live evidence；合成输入只用于 O1/O2/O3/D1 及 W1/W2/W3 的可重复检查，不能替代生产 pilot 的来源、批准或对外交付证据。

## 4. 版本要求—分片—测试矩阵

| 版本要求 | 实现分片 | 验证方式 | 发布条件 |
| --- | --- | --- | --- |
| 14-A evidence→decision | `V14-1`、`V14-4` | `OFF-REF`、`SEM-O1/O2`、来源日期/冲突回放 | O1、O2 事实边界完整 |
| 14-B solution→handoff | `V14-1`、`V14-4` | `SEM-D1`、`HAND-01` | D1 可执行，未决项有 owner |
| 14-C everyday work/visible delivery | `V14-2`、`V14-4`、`V14-5` | `PROJ-*`、`SEM-O4`、`DEL-*` | W1–W3 实际可见；O4 有真实证据 |
| 14-D artifact/language acceptance | `V14-1`、`V14-2`、`V14-3` | Office 既有 verifier、`SEM-O3`、中文字段审查 | 引用/计算/布局/链接通过 |
| O1 | `V14-4` | `SEM-O1` | pass |
| O2 | `V14-4` | `SEM-O2` | pass |
| O3 | `V14-3`、`V14-4` | `OFF-NUM`、`SEM-O3` | pass |
| O4 | `V14-5` | `SEM-O4` + Host visible evidence | 真实授权、真实执行、收件人可见 |
| D1 | `V14-4` | `SEM-D1`、`HAND-01` | pass |
| W1 | `V14-5` | `DEL-W1` | product 结果真实可见 |
| W2 | `V14-5` | `DEL-W2`、`DEL-O4` | O2 可见；O4 满足实际交付门槛 |
| W3 | `V14-5` | `DEL-W3` | 产物和 handoff 均可见 |
| V2.0 20-A/20-B/20-C/20-D | V2.0 主线 | 只消费 V1.4 结构化 evidence；另行验证 | 本包不宣称 V2.0 完成 |

## 5. 执行队列和完成标准

主线可由 Luna high 或Host支持的Sol完成；Luna high helper 负责按 frozen packet 做定点检查、夹具复核和候选报告。该分工不创建强制 role queue，也不改变 Host 的 primary executor 归属。

| 阶段 | 内容 | 结果 |
| --- | --- | --- |
| V14-0 | 重读权威文件、确认基线、计算 packet digest、扫描 dirty paths | `ready` 或 `blocked`；不写源码 |
| V14-1 | 新增两个 Office reference，补本地链接 | Office 文本 contract 和 reachability candidate |
| V14-2 | 更新 projection supporting source list，补安装/打包/投影契约测试 | 六个 primary 不变，supporting 传播完整 |
| V14-3 | 复用既有 Office fixture，新增 V1.4 scenario/result contract metadata | 确定性夹具可重放；不模拟 O4 |
| V14-4 | 执行 O1/O2/O3/D1 semantic model replay | 每案有输入、输出、来源、限制和模型证据字段 |
| V14-5 | 执行 W1/W2/W3 pilot；单独处理 O4 | 真实交付 evidence；缺 O4 输入则只阻断 pilot gate |
| V14-6 | Standards/Spec、sibling、风险和候选边界复核 | Chief 可审阅的 candidate package |

完成必须同时满足：

- 只触及 handoff 中允许的路径；未知路径或权限漂移立即停止。
- 六个 primary identity、路由语义和 Host ownership 未漂移。
- `git diff --check`、既有 Trio/Office/projection/install/plugin tests 通过；拟议测试的 status 明确记录。
- O1–O4+D1 全部通过；W1/W2/W3 各自有受控 workflow evidence，并在结果记录中绑定对应 case 与交付状态。
- 每个结果区分 `generated`、`opened`、`rendered`、`accepted`、`delivered`；文件写入或队列状态不能升级为可见交付。
- helper 只能提交 candidate；Chief acceptance、外部写入、合并和全局 adoption 仍由既有 gate 决定。

## 6. 当前真实未决项

1. 本轮复核了现存 ACTIVE automation 的 source、schedule、target、授权、execution event 与 recipient-visible readback；O4 live gate 已通过。受控 workflow 结果不扩大为生产采用或业务批准结论。
2. Host 的实际模型、effort、token/cache/billing 证据未认证；不能从 prompt bytes、shadow replay 或请求字段推导成本、节省或模型身份。
3. 若当前分支在实现前新增了其他 projection/supporting surface、Office 参考文件或安装 schema，必须重新计算全量 source/target manifest 与 packet hash。
4. V2.0使用独立实验输入契约；本包的usage摘要不能直接作为其计量输入。未来按V2.0绑定原始Host窗口、null语义和实验范围，缺失保留缺测。

## 规划 reconcile 记录

Chief reconcile已完成：实施绑定实际Trio/HEAD，不复用规划hash；生成目标只由sync写入；CMD-07补齐必需参数；去掉无关shadow回放；W3不强制多页Office制品；补齐O1/O2/D1具体输入和风险适配检查。源文件哈希、XLSX数值、四个受控任务结果和 O4 live evidence 已回查。生产 pilot 仍按业务授权另行绑定。
