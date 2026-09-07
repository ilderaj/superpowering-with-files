# V1.4 可重复验收包

状态：四案受控执行已完成并由 Chief 复核通过，作为 V1.4.0 发布验收证据；输入仍明确标识为 controlled/synthetic，不代表生产业务采用。

## 使用方式

在本项目各新开一个任务，选择 Luna/high 或 Sol/high。首轮不要求双模型复跑；建议 A/B 用 Luna，C/D 用 Sol，也可以四案均用 Luna。四案写集互不重叠，可按 Host 能力并行。

逐案复制下面对应的一行指令，不要把本 README 或 reviewer.md 全文给执行者：

- A：请完整执行 /Users/jared/SuperpoweringWithFiles/docs/plans/v1.4/acceptance-pack/prompts/A.md 中的任务。
- B：请完整执行 /Users/jared/SuperpoweringWithFiles/docs/plans/v1.4/acceptance-pack/prompts/B.md 中的任务。
- C：请完整执行 /Users/jared/SuperpoweringWithFiles/docs/plans/v1.4/acceptance-pack/prompts/C.md 中的任务。
- D：请完整执行 /Users/jared/SuperpoweringWithFiles/docs/plans/v1.4/acceptance-pack/prompts/D.md 中的任务。

把四个任务链接发给本 Chief，即可开始监督；不用等全部完成。Chief 读取任务并用 wait_threads 查看进展，定点指出失败原因、至多一次修复，然后独立复核输出。本次验收已完成四案执行和独立复核；后续重跑仍必须生成新的 task/run 记录。

## 案例范围

| 任务 | 从历史问题抽象 | 对应门槛 | 交付物 |
| --- | --- | --- | --- |
| A | PandaPass 旧方向/新决策、比例责任与临时补足混淆 | O1 / W1 | 中文决策包 |
| B | 周报遗漏模板个人填写区、缺来源却补计划 | O2 / W2 summary | 完整模板周报 |
| C | 三方协议遗漏平台方配置、标黄与指引不一致 | O3 | DOCX、配置映射、四类 native 制品核验 |
| D | 设计已选但交接不足，缺接口却编造字段 | D1 / W3 | 可操作 HTML 预览、实现/测试交接 |

全部输入为合成资料，无须访问 Confluence 或生产系统。C 从带编辑指令的文本生成新 DOCX，覆盖清洁正文和字段映射；它不能证明复杂原生 tracked-change 清理能力，今天真实协议的结构检查可作为该项补充证据。C 四类 native checks 有已有有效证据时可由 Chief 检查 hash/方法后复用，不要求为同一未变制品反复付费渲染。

## 发布门槛修订与边界

本包依据 2026-09-07 用户明确要求“模拟或从历史抽象 cases，Sol/Luna 跑、Chief 验证发布门槛”，新增受控验收路径。它替代 verification.md 第7节对 W1–W3 必须等待自然发生业务的来源条件，保留原真实 pilot 路径。

新路径仍要求：

1. O1/O2/O3/D1 四项实际模型执行已完成，reviewer.md 全部必需项通过；原始结果和必要的修复记录均保留。无需两模型都跑完。
2. W1/W2-summary/W3 在真实 Host 任务中有用户可回读的产物和 Chief 接受记录；sourceType 明确为 controlled/synthetic，不宣称生产采用、业务决策批准或对外发送。
3. O4 的真实授权 automation 六项证据已成立，复用 01a07a4f-473f-7ef2-bf58-66db8bed7a40 并经 Chief 补齐核验；没有使用合成发送结果。
4. 当前候选源码/输入 hash 与各次记录绑定；若历史 automation 未覆盖相关候选版本，评估实际差异，仅补跑受影响部分。
5. verification.md 要求的相关 source/package/install/native/core 回归通过；模型结果经现有 result-contract 校验，语义由 Chief 判断，schema 合法不等于质量通过。DSH 不在本轮开发/测试范围。
6. Chief 已形成 release readiness 结论；随后按现有发布流程完成 merge、release、branch sync 和 local adoption。

因此模拟输入可以验证能力，真实执行/可见交付验证 Host 路径；全业务生产 pilot 的结论仍只能来自实际业务。没有降低字段覆盖、来源真实性、数值正确性或权限门槛。

## 经济性、恢复与限制

四案首跑，不做全排列、多模型竞赛或额外评审 worker。预计耗时由实际运行记录，不承诺 token/账单节省。模型实际值无 Host 证明时 unknown，不影响可验证产物评分。工具缺失只阻塞受影响检查，其余继续。

输入和候选快照见 manifest.json。Chief 若修改候选，只重跑受影响案例；不得覆盖失败输出。执行者不读 reviewer.md，Chief 评分前不向其提供答案；这是程序性隔离，不是安全盲测。

本包是任务材料。唯一状态权威为 planning/active/swf-v14-controlled-acceptance-20260907/{task_plan,findings,progress}.md。
