# Jev 默认决策后端与白夜班分流：下一阶段方案

状态：2026-09-22讨论稿。当前用户授权完成已有整改；本文件新增场景、阈值和默认后端策略供逐项讨论，尚未激活。权威仍为原decision-runtime Trio，现有Linear父票SUP-35。

## 推荐架构

确定性检查 → 需要语义时调用决策bundle → Jev（首选可配置）→ 不可用时cheap-fast cloud adapter → 仍不可用则unknown，由现有Chief/Host处理。

模型输出是证据或建议，组合规则、权限和生命周期仍归现有代码/Host；不增加agent角色、状态库或调度器。默认后端在配置层选择，不把Jev或DeepSeek写死到业务判断。

这次用户明确提出fallback，允许为decision capability增加可配置的主备策略，替代此前本milestone“不实现fallback”的限制；不是让所有执行模型按固定顺序逐个尝试。

官方接口：POST https://api.typesafe.ai/v1/systemone；Bearer认证；state和questions一次批量提交。官方SDK @typesafe-ai/sdk，Node20+，TYPESAFE_API_KEY；默认模型jev-latest可用于连通性，正式评估应固定服务返回的具体版本。
来源：[官方JS指南](https://docs.typesafe.ai/sdk/javascript)、[官方client](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/client.ts)、[官方response types](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/types.ts)。不采用第三方相似域名作为接入依据。

## 主备规则

- 默认模型只适用于窄语义判断。路径可由确定性事实决定时不调用模型；quick不因为接入Jev被强制建立Trio。
- timeout/连接失败/429/5xx/账户不可用/格式错误可触发一次cheap-fast fallback；401/403记录配置故障，不反复重试。总超时和token预算应有上限，SDK默认重试须与外层合并，不能双层放大。
- Jev给出否定结论是有效判断，不是故障，不能换模型直到得到“同意”。低置信度进入abstain/复核；复杂或高影响分歧升级高能力思考，而不是盲信廉价fallback。
- 每个bundle使用相同输入和rubric。fallback必须满足同样的schema和unknown语义，缺字段不补猜；两者都失败不放行。
- 把真实backend、model、版本、输入/输出usage、耗时、fallback原因、重试次数记录为脱敏评估证据。没有usage就unknown，不能当0；概率不能跨后端直接比较。
- state只发送任务判断所需的最小内容；密钥从环境或指定secret配置注入，不写Trio/报告/源码，不扫描其他项目密钥。
- 当前DSh执行dispatch与decision API是两条不同路径。现有cheap-fast执行能力不等于已实现结构化decision adapter；需显式实现并验证。
- 本轮进程未见TYPESAFE/JEV环境变量；等待用户给已存配置的变量名/路径与fallback路由。此事实不代表用户未开通API。

## 两个独立选择轴

1. **智能密度**：歧义、架构权衡、跨模块推理、不可逆影响、需求不完整、失败后需要重构理解 → high-reasoning capability；用户偏好的Astra/Sol由Host当前可用目录解析。规格冻结、可局部验证的重复实现/修复 → cheap-fast execution capability。模型与reasoning effort分开选，用户明确选择优先。
2. **白夜班**：预计执行长度、反馈频率、依赖、deadline、人是否需继续讨论决定时段。高密度规划通常白班；冻结后长执行通常夜班。一个任务可以白班设计→夜班实施→白班接受，不要求整票只能选一个时段。

不能仅凭“复杂”安排夜班：复杂但需求不明的任务先白班讨论；明确但需数小时重复操作的任务适合夜班廉价长loop。也不能仅因预计很便宜就忽略时长和人工依赖。

## 逐项场景清单

| 场景 | 窄判断输出 | 确定性边界与升级点 | 建议顺序 |
|---|---|---|---|
| 1 智能密度/资源建议 | high-reasoning或cheap-fast、uncertain；给原因代码 | 不假设模型能精确预测自身成功率；Host选择实际资源 | 首批shadow |
| 2 human intake | discussion/task；quick/tracked；dev/office（安全治理独立） | 明确“只讨论/不执行”优先；混合任务按当前产物分slice | 首批shadow |
| 3 plan/goal readiness | 需求覆盖、逻辑一致、依赖解除、验收/验证清楚、阻塞未知 | 各问题独立布尔/选择，不让单一“好计划”分数替代证据 | 首批shadow |
| 4 specs/tickets分解 | 覆盖缺口、重复、过大slice、接口冲突、顺序依赖 | 引用需求ID/证据；真实依赖图环和文件冲突由代码检查 | 第二批 |
| 5 验收有效性 | 证据是否支持结论、是否偷换范围、是否只mock证明 | 测试退出/哈希/身份代码验证；独立Chief接受，不能作者自评即Done | 首批shadow |
| 6 commit/push/PR/sync/adopt | 技术ready、影响范围和风险分类 | 授权与policy由Host；commit、push、merge、global adopt逐操作匹配，不互相继承 | 后批，永不直接授权 |
| 7 白夜班分配 | day-now/day-discuss/night-eligible/blocked；时长和usage区间及置信等级 | 依赖状态、文件owner、用户期限和权限是硬门；不输出伪精确token数 | 首批shadow |
| 8 故障恢复 | transient retry/repair/replan/escalate；下一次重试是否有信息增益 | exit/timeout优先代码；连续同错停止重复loop | 第二批，高价值 |
| 9 证据充分性/调研停止 | 还缺什么证据、来源冲突、是否足够做当前决定 | 不确定必须保留；不能把未检索到当不存在 | 第二批 |
| 10 context/checkpoint/handoff | 是否值得压缩、是否有未记录关键决策、交接是否可恢复 | 长度阈值/文件完整性由代码；语义仅检查遗漏 | 第二批 |
| 11 worker并行收益 | 可分解性、共享写冲突、预计协调成本是否值得 | 文件owner/依赖由代码验证；不为每个角色新建agent | 第二批 |
| 12 scope drift | 新发现属于当前验收还是扩scope、是否需重新规划 | 用户限制优先；不得自行扩大授权 | 首批一起观测 |
| 13 工具/检索选择 | 已有证据能否复用、下一工具是否解决具体不确定性 | 工具可用性/费用上限由Host；减少无目标搜索 | 后批 |
| 14 office质量 | 文档是否答题、来源是否支撑、受众/语气是否合适、图表是否误导 | 公式/链接/渲染事实代码验证；重要内容仍独立复核 | 第二批 |
| 15 任务去重/人类注意力 | 新消息是steering/new task、票是否重复、是否值得打扰human | 不自动删除/合票；不把建议当用户取消原任务 | 后批 |
| 16 外部输入风险 | 是否含注入式指令、越权数据要求、异常操作建议 | 作为额外信号，不能取代工具权限/安全边界 | 后批 |

每个场景先问：是否存在频繁、重复且有独立答案的小判断？证据能否缩小？误判代价是否可控？不能明确回答则保留Chief判断，不强塞模型。

## 白夜班分流草案

先过硬门：用户明确“现在做”→本次按day-now；权限不足/依赖未完成/关键需求需人讨论→blocked或day-discuss，不能塞进夜班等待猜测。day/night建议不能覆盖deadline。

通过硬门后的初始启发式（待实测校准）：预计≤20分钟且少量验证循环可白班直接做；预计>30分钟或多轮机械实现、规格已冻结、可断点恢复、无需人连续互动→night候选；20–30分钟灰区按deadline、预计讨论需要和预算处理。这些是初始策略，不是性能事实，也不是本轮修改现有automation的指令。

时长/token先给small/medium/large及区间，用同类已验收任务的实际usage校准，报告P50/P90与样本量；无样本就unknown。Jev分类复杂度，代码统计历史分布；不要让Jev臆造精确成本。分别计规划和执行成本。

“夜班松”不应只加票或取消上限。保留一个全局deadline，任务设可恢复checkpoint、stall检测和失败预算；只在授权、依赖和owner满足时接下一个slice。当前3次/45分钟限制不是长loop容量，应作为后续N3的显式可配置预算评估，不在此次修复中悄悄改成无限循环。优先同能力廉价执行，认知失败升级规划，基础设施失败不升级大模型。

## 下一步实施顺序与验收

| 阶段 | 交付 | 验收/退出 |
|---|---|---|
| 当前R | J02接受、J03/J04修复、WP07真实shadow调用、文档校正 | 本地回归通过；全gate shadow；WP10真实对照证据不足保持未完成 |
| N1 接入 | Jev与cheap-fast adapter、配置主备、脱敏usage、一个synthetic smoke | 有真实返回与模型/usage；模拟timeout/429/坏响应/两端失败；不携带真实敏感任务试连 |
| N2 独立判断 | 真实任务raw input、Chief盲标+2复核、两臂同rubric，task分组holdout | T1.5 coverage/危险误判/配对检验；结果可inconclusive或regressed，不为胜出改truth |
| N3 分流shadow | intake/资源/plan/verify/day-night优先，建议与Chief实际选择并排 | 采decisionLatency、最终接受、返工/回合、全量usage；校准时长区间和fallback率；不自动改排期 |
| N4 有限干预 | 单项目、低风险小范围A/B，保留一键shadow回退 | 明确实验范围；主要改善预登记；总tokens≤baseline1.05，额外≤5%须效率收益覆盖；质检不可退化 |
| N5 扩场景 | 按实际收益选择恢复/证据/handoff等 | 每加场景独立证明价值；没收益就删除/留人工，不要求所有场景模型化 |

N1–N5先作为本方案讨论项，未创建全套nightly队列。待Jev凭据位置、fallback路由与优先场景确认后，按bounded票进入现有Decision Runtime Project。用户的本次“现在做”优先于旧night排期。
