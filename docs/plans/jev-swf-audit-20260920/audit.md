# Jev 模式与 SWF 集成审计
日期：2026-09-20（Asia/Shanghai）。结论：设计方向合理，基础契约可保留；执行部分符合预期，但集成、独立准确率和效率收益尚未完成，存在接线前必须修复的缺陷。

## 范围与方法
权威：planning/active/swf-decision-control-runtime-20260919/ 三文件。检查原始 goal、2026-09-19 spec/plan、当前工作树、SUP-35 子票、night/morning 配置；两名只读 subagent 分别审计 runtime 与 evaluation，主线程核验关键复现及集成/排期。
审计的是 dev 工作树（HEAD ad3c8b305ec434bde9dba904cb11741e00f8337e），包括未跟踪的新模块。不是 main、已发布版本或全局已采用版本的验收。
源码哈希与 tracked patch：reports/audits/jev-swf-20260920/source-manifest.json、tracked.patch。复现：node reports/audits/jev-swf-20260920/probes.mjs；输出 probes.json。
保留其他任务的 dirty changes。此次只交付审计、整改规格、计划与队列调整；修复由夜班执行。

## 设计判断
| 设计 | 判断 |
| --- | --- |
| Trio 唯一持久权威，ChiefOps 治理，Linear 人类投影 | 合理，避免第二状态库/调度器 |
| boolean/choice/score 与同状态 bundle | 合理；应优先 Plan/Verify 高价值边界，不能每条工具调用都判断 |
| deterministic / semantic / composite 分离 | 合理，但 required checks、policy authorization 尚未在组合边界落实 |
| mode/intensity/topology 派生与 capability resolver | 合理的兼容基础；目前只增加纯函数，未替换 Host 路由，更没有动态最优成本选择 |
| phases 只作词表而非新状态机 | 可接受的阶段缩减；因此尚未实现整个 execution compute graph 由代码拥有，不能声称该愿景已完成 |
| confidence level 不伪装成校准概率 | 合理；与 Jev 概率模型有明确能力差别 |
| shadow-first | 合理，保护现有流程；shadow 只能证明观测/判断，不能独自测出干预后的端到端效率收益 |

官方材料支持“软件组合窄结构化判断”和共享状态多问题，不足以证明本地性能。TypeSafe 的速度/成本是其服务与实验声明，不能转用为 SWF 实测。
来源：[TypeSafe](https://typesafe.ai/blog/introducing-system-one-models-and-jev)、[LangChain](https://www.langchain.com/blog/building-a-harness-with-jev)，2026-09-20 重新读取。
当前外部 backend 明确拒绝执行，host 也没有独立推理实现。准确名称是“Jev-inspired decision contracts”，不是“已接入 Jev 推理服务”。OpenJev/NanoJev 本轮未独立审计其仓库，不对它们作实现/性能背书。

## Standards 轴：代码与测试
| ID / 级别 | 证据与触发 | 影响 | 处置 |
| --- | --- | --- | --- |
| A01 / P1 | evidence.mjs devChecks/officeChecks 补齐全类别 unknown；decision.mjs:397 在 fail 前遇 unknown 即 retry。仅 tests pass、仅 document_structure pass、tests fail+其他未执行，三个 probe 均为 retry | 不适用检查阻塞完成；已知失败被重试掩盖，可能增加循环 | J01：适用性与失败优先级 |
| A02 / P1（接入前） | shadow.mjs:343–383 对 observation 验证在隔离边界外；observations=[null] 抛错 | 调用者直接 await 时，旁路观测可中断 checkpoint | J02：逐项隔离并保留主路径 |
| A03 / P2 | shadow.mjs:374–412：unknown state 返回 agreement=null，summary 却为 agreements=1；拒答项被过滤 | 污染后续 gate 激活证据 | J02：三态统计、失败与丢失观测显式计数 |
| A04 / P2 | evaluate-decision-shadow.mjs:110–112 直接比较 oldBehaviour；waiting-human/policy_gate 与 escalate 视为不同，null 也计分歧 | 18 次分歧不是 18 次决策差异；其中2次别名、1次不可评 | J04：固定等价映射，15真实可比分歧/26可比，1不可评 |
| A05 / P2 | accuracy.mjs:136–178 按 gate 可回答子集打分，answerVerdict直接复制transition；ground truth引用同一预填答案 | 100% 易被理解为独立预测或两份证据 | J04：conditional agreement、coverage、端到端成功率分列 |

Standards 结论：有缺陷，现有绿测覆盖不足。无已观察到的生产权限绕过或生产阻塞，因为模块尚未接入主路径。

## Spec 轴：需求兑现
| ID / 级别 | 缺口 | 判断与处置 |
| --- | --- | --- |
| A06 / P1（接入前） | release 的 authorization 仍可由普通 operator 填 allowed；probe 得 release_state=allowed | 违反原 spec §9 READY/ALLOWED 来源分离；J03 从独立 policy context 读取，Host门仍最终有效 |
| A07 / P1（交付缺口） | harness 内无生产模块导入 shadow/evidence；WP07 只有 recorder API与fixture | 不满足真实checkpoint集成。更新原 SUP-42，指定repo-side renderer入口；不能继续把找不到caller写成全票完成 |
| A08 / P1（评估缺口） | T1固定答案、作者填写oldBehaviour，T1.5空缺；结果锚定回放不能证明未采取动作的反事实 | 准确率/效率/5%护栏均 unproven。J04冻结独立协议，WP10收集真实证据 |
| A09 / P2（规格矛盾） | evaluation-design §0、§13 把WP07当唯一T2前置；outputTokens引用freshTokens；净成本再减少返工；v20只支持3种primaryMetric | J04用专属profile复用v20计量原则，不直接修改通用v20；区分shadow和实验干预；实测成本只求和 |
| A10 / P2（状态漂移） | spec仍proposed、旧plan仍WP01首夜、旧汇报all-WP完成；F23/F24实际改变已有新API行为却称无导出行为变化 | 本次状态说明为准；WP11消除当前状态页矛盾，历史记录标明被后续取代 |

Spec 结论：部分符合。不是推倒重做，也不把已按原契约验收的8张基础票全部重开；新增修复票追踪新增缺陷。

## 最新交付状态（实时 Linear 核验）
| 工作包 | 状态 | 证据边界 |
| --- | --- | --- |
| WP01–06、WP08–09 | 8票 Done | 原范围基础件/adapter已验收；不证明真实推理或效率 |
| WP07 / SUP-42 | 原 Todo+nightly，审计后等待前置修复 | 实现和离线验证可夜班；首次真实调用由主线程可观察验证 |
| WP10 / SUP-45 | Backlog | 独立判断评估、成本/效率链路及对照结果未完成 |
| WP11 / SUP-46 | Backlog | 文档已有，最终核对依赖WP10 |
| 全部gate | shadow | 没有激活或发布决定 |

## 验证与限制
- 本次 verify:trio：470/470，exit 0；verify:core：454/454 + 82/82，exit 0。日志在 reports/audits/jev-swf-20260920/。
- 本次 sync --check：exit 1；全局投影 update/drift 与 observation unknown，不能声称全局采用成功，不自动覆盖全局配置。
- T1重新读函数而非覆盖结果文件：26/26=100%条件一致率，coverage=26/27=96.3%；另1例不可评。真实预测准确率 unknown。
- 当前运行时“不发网络请求”不等于整套方案0 token；产生 operator 答案、整理证据、复核、重试都需要计量。
- 成本与延迟、返工/回合数没有真实配对数据，不能确认正收益或5%护栏通过。
- 后续独立集需要先冻结评估对象/规则/原始输入和独立标签，再预测；不是要求标签在已经存在的composite实现之前产生。
- 历史任务结果仅辅助裁决；最终成功可能是修复后的成功，不能直接倒推较早时点的计划正确。

## 夜班安排
复用现有 automation：01:30 night、07:30 morning，Asia/Shanghai，ACTIVE；源/live prompt一致。下一窗口为2026-09-21。
本initiative只激活一个无依赖修复切片，后继按真实Done和readiness串行晋升。不得同时派修改同一模块/三件套的worker。全局3次/45分钟预算包含其他initiative，排队不等于今晚完成。
执行身份 executor:codex-local；Host当前配置模型 deepseek-v4.1-flash 仅是配置，实际运行证据待夜班提供。
详见 spec.md 与 plan.md；票号以 plan.md 的投影表及 Linear 回读为准。
