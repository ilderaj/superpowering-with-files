# 经济协作：测量与采用说明

状态：2026-09-09，V2.0 本地候选已验收。最新 main Luna/high 两轮 16 槽的四维质量全部通过，报告 pass/unproven；第一轮成本增加 32.87%，第二轮下降 2.25%，不支持重复节省。决定不采用实验增量条款、不扩大默认范围。尚未发布或 global adopt；不表示既有方法无效。

## 如何使用报告

遵循 [输入契约](../../tests/evals/v20-economics/contract.md)。先登记同一输入、工具、模型/effort、方法快照、指标与超时，再执行两个轮次的配对任务。方法比较固定模型与拓扑；策略比较使用独立 cohort。每次失败与重试都保留，主任务和子任务使用不重叠的资源窗口。独立评审需回看真实轨迹，reference 字符串本身不构成认证。

```sh
node tests/evals/v20-economics/report.mjs --input <experiment.json> --format markdown
```

报告只读取显式 JSON，不扫描会话或打开证据引用，不发送模型请求。`totalTokens=input+output`；`freshTokens=input-cachedInput+output`。reasoning 已包含于 output，不能再加。缺测为 null；knownPartial 只是已知部分。共享准备成本单列；不能把其他任务的累计用量视为本次增量。CLI exit 0 表示输入可计算，验收需要另看质量、可比性和经济结论。

两轮均改善且质量通过、开销归属完整、代价转移被接受，才可能 supported。质量通过后，主指标不完整/不可比或共享成本归属未知为 unproven；这些条件齐全时，任一轮持平或变差为 not_supported。质量失败仍优先 not_supported。结论只覆盖该 cohort，不计算缺少可靠计价依据的美元费用。

## 当前方法盘点与决定

show-me 已有显式来源与撤销式 adoption；Office 已有来源、冲突、待确认、制品与交付证据要求。当前问题是尚无严格配对的收益证据，新增 skill 不能弥补这个缺口。先比较既有方法；不复制新上游、不建立 registry 或自动升级。

show-me 的已记录来源是 `humanlayer/skills` revision `3c2629142c5d437428269b1b722b08c0b87f574d`（本地 PROVENANCE 记录 MIT）；eli5 为概念参考，未复制文本。本次仅核对本地固定记录，未联网更新来源。Office 来源为本仓库 V1.4 `4310b876173e02e3a631e68229ebd027876f2add`。本地快照如下：

- `harness/optional-skills/show-me/SKILL.md`: `d37af9fe3225c1b1956f5e639811c6042ec486ef3ca96066c96ae698538fa4b4`
- `harness/optional-skills/show-me/PROVENANCE.json`: `4a160592f0ebd8993c79572d16c226f8c44b7bd51408478d17609b4d5c9c6aba`
- `harness/trio/capabilities/office/references/source-backed-work.md`: `a78d272b2f9d25bab6b73b1a7215dda1da5d29d04b080b02ceb917d35578c8a8`
- `harness/trio/capabilities/office/references/artifact-and-delivery.md`: `439717b5ad930ed4e8ed06b972330774a5177e65ec140c495b994ca68c7a03a9`

Owner：SWF Chief。本次决定是不采用实验增量；版本证据完整性与独立审阅另行验收。后续改变此决定使用 [决定模板](../../tests/evals/v20-economics/decision-template.md)。当前没有新增方法启用动作需要撤销；撤销本次工具候选时仅移除本次新增 eval/测试/方法文档，原始失败证据保留，既有全局技能不变。

20-D 当前停止：没有用户指定的新工作区试点需求和目标路径；既有 Codex Host 足够。此停止符合计划，不代替 B1 的真实对照门槛。DSH 不在范围内。

## 决定依据与撤销条件

实验增量仅为既有 Office/dev 方法上的控制与交接条款，未启用为默认方法。原正式 cohort `swf-v2-fresh-flash-20260908-01` 的报告为 quality=incomplete、economic=unproven；Protocol-A/B 是额外诊断，不替代正式门槛。具体失败、重试和资源缺测保存在 `.harness/verification/v2.0/acceptance-20260908/`。不把未归属的准备、派单、复核和整合成本记为零，不宣传总成本或 token 节省。

只有新的预登记对照通过质量、成本归属与独立审阅，且有明确工作需求，才重新考虑增量方法。若离线工具有不可修复的计算或证据表达错误，撤销该工具及说明；保留历史实验和 V1.4 既有技能。Owner 为 SWF Chief。

历史 cohort `swf-v2-main-luna-closure-20260908-01`：16/16 factual、usable、limitations 通过，scope14/16；两轮 worker totalTokens 分别增加14.38%和5.71%。这些只是保留范围失败的本轮观测，不支持对既有 SWF 方法或 Luna 的普遍归因。完整本地结论见 .harness 证据（本地留存，参见公开验收摘要）。

2026-09-08 后续有界修复：报告明确共享归属检查的优先级，并逐 case 同时显示 totalTokens/freshTokens；历史报告不改写。新实验先遵循 [启动预检](../../tests/evals/v20-economics/admission.md)，通过两个微型 probe 只表示流程可行，不替代正式 cohort 或版本验收。

2026-09-09 前一完整 cohort `swf-v2-input-verified-luna-20260909-01`：factual12/16，scope/usable/limitations各16/16。两轮 worker totalTokens 下降24.21%和11.91%，但质量失败、共享成本未知且部分 case 指标增加；不支持节省或采用声明。执行者可见 E3 要求遗漏 rubric 所需 provenance，是准备缺陷，不能归因于 Luna 能力。三名评审的已知用量亦单列保留，验证开销不容忽略。见 完整裁定与资源限制（本地留存，参见公开验收摘要）。

最新 cohort `swf-v2-count-explicit-luna-20260909-01` 已完成独立质量与终审：152 次唯一请求，worker totalTokens 7,056,073；本切片可明确归属的 worker、诊断和审阅小计 15,907,551，仍不是完整项目成本。准备和验收过程成本高，不构成总体经济收益证明。见 Chief 结论及成本范围（本地留存，参见公开验收摘要）。
