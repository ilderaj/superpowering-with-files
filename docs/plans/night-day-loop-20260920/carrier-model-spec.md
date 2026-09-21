# N01 追加规格：夜班执行载体与模型证据

## 决策与核实（2026-09-20）
用户已授权审阅 side chat、制定方案并排入今晚。复用 SUP-47 和原审计 Trio，单 session 串行拓扑不变；不创建 per-ticket 用户任务、不更换全局模型、不批量改其他产品 heartbeat。
现场配置共23个自动化：12 cron、11 heartbeat，其中heartbeat6 ACTIVE/5 PAUSED。SWF夜班与晨报均显式请求 opencode-go/deepseek-v4.1-flash / high；全局配置 p459531/gpt-5.6-sol。模型配置证明请求意图，不证明供应商实际模型。
side chat所述22总数/9 heartbeat与自身列表及现场不符。仅查看automation目录不能证明整个Host没有日志；需定向查找与本轮run ID关联的Host证据。heartbeat模型解析方式须核实Host支持，不通过写入未知TOML字段假装钉定。

## C1 执行载体与预算
维持一个cron session内串行slice，共享3 attempts/45min。允许有边界的只读subagent review，但不能平行修改共享仓库，也不为worker重置预算。45min为协作式admission/checkpoint截止；不是OS级强杀，长工具调用可能越过截止。记录deadline、实际finish、overrun及原因；测试在deadline不再领取新slice。硬中断若需要属于Host能力缺口，不新增自制scheduler。

## C2 模型证据契约
在现有progress.md的run checkpoint与晨报中记录：run/session标识（有证据才填）、configured model/effort、Host-reported route/effort、provider actual identity、evidence source及时间、verification result。
- matched：有绑定本次run的可信Host证据，所证明层次与请求一致；不因此声称provider内部身份已证实。
- unknown：无可信Host证据，明确缺失原因；不伪造attestation、不把模型自述或手写报告当证据。可继续既有授权的低风险本地slice，结果保持unverified并在晨报列出证据缺口；不宣称模型验收通过。
- mismatch：可信证据显示请求路由/effort与明确配置不符，停止该受影响执行路径并保存checkpoint；不全局暂停无关任务。
日志读取只定向提取必要元数据，不复制凭证、用户全文或无关会话。

## C3 别名与heartbeat
对SWF两条automation精确检查配置model/effort；短别名deepseek-flash不满足当前精确路由约定，但不能据别名断言底层必然是另一模型。拒绝静默fallback；不得全局禁止其他任务合法使用别名。
heartbeat采用显式记录的thread-resolved policy，resolved model无Host证据时unknown。先只读盘点11项的状态与可证实的解析来源，报告active/paused；不批量覆盖线程模型、不添加不受支持的heartbeat model字段、不恢复已暂停任务。将来若某heartbeat确有固定模型业务要求，再使用Host支持的配置方式单独变更。

## 实施计划：SUP-47，首片<=20分钟
1. 优先实现C2/C3最小纯校验/报告契约与测试：exact match、wrong alias、effort mismatch、missing evidence、与其他run不匹配的证据、heartbeat unresolved。先RED再GREEN，复用现有治理接口，不新增状态库。
2. 更新canonical night/morning prompts，确保输出明确区分配置和实证；通过现有automation_update同步两条SWF自动化，完整保留schedule/model/notification/target。禁止直接写automation.toml。
3. 加入C1 deadline不再领取及超时记录测试，保留原N01恢复/promotion测试作为下一切片；同一票不得以首片完成标Done。
4. 只读Host证据可用性探测有界执行；缺Host支持写具体gap与恢复条件，不无限搜索或自造实证。
5. 窄测试、canonical/live逐字核对、guard、回读Linear、记录已完成/剩余项。真实cron observation单独记录，离线fixture不得充当实跑。

## 验收与排期
本地契约、负向测试、两条prompt同步完成可验收对应切片；SUP-47整票须同时满足原N01恢复/promotion验收。Host actual unknown必须保留，不能宣称全部模型实证完成。
2026-09-21 01:30 Asia/Shanghai候选，SUP-47提升Urgent；与同Urgent SUP-15按实时updatedAt排序，因此当前SUP15先、SUP47次、SUP24再次。全局预算不扩张，不保证全部完成。晨报07:30报告未执行原因、证据层次及超预算情况。
