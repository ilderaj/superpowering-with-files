# Terra / Luna 派单、续接与返回模板

本模板用于后续已获授权的实施和恢复；当前 V1.3 实施由独立的 implementation Trio 绑定。主执行者每次只填一个包。建议主执行者也用 Luna high 或 Terra high，不把 Chief 身份绑定 Astra。

## 1. 主执行者开工提示

```text
执行 SWF V1.3 已批准范围。先读 docs/plans/v1.3/README.md，再读 implementation.md 的固定契约及当前包、verification.md 的相应用例。不要重读60天日志。

当前包：E0（后续每完成一包推进队列）
执行模型：Luna high；如当前Host已确认支持且选择Terra则明确请求Terra high。不使用Astra。
任务权威：主执行者填当前task_plan.md/findings.md/progress.md绝对路径。

先做当前包的具体动作，不只复述计划。不实施V1.4/V2.0，不扩改close、routing、权限、archive或模型默认值。普通执行遵循direct/native-first；只有用户显式选择时才使用strict-visible兼容路由。遇到确实不兼容的当前代码，给最小差异和复现，按包内修复/受控rebind继续。
使用有效的现有授权，不逐步骤重复确认。额外外部动作按当前Host与用户授权处理。
```

上面任务权威与执行授权必须由发起者填入真实值；未填的模板不能作为派单。当前规划权威位于 `planning/active/swf-v13-implementation-plan-20260906/`，未来恢复或新建实施绑定由主执行者依据用户指示选定，不能由helper自行挑任务。

## 2. 单包 worker 提示模板

```text
Task: SWF V1.3 / <E编号+名称>
Requested model/effort: <Host支持的Luna high或Terra high>
Primary or helper: <主执行/有界helper>
Checkout absolute path: <真实路径>
Authority root: <真实路径>
Trio absolute paths and SHA256: <三项真实值>
Frozen baseline: <HEAD + allowed paths当前SHA256/缺失标记>

目标：<复制本包验收结果的一句话>
必读：docs/plans/v1.3/implementation.md 的第2节（涉及摘要时）和当前包；verification.md 的<S/C/T编号或V命令>。
Allowed writes: <逐个复制当前包精确写集>
Read dependencies: <当前包列出的源文件，必要时只读直接依赖>
完成的依赖与证据: <上游包结果hash、日志位置>
Evidence sink: <.harness/verification/v1.3/run-id/E编号/绝对路径>

你不是工作区唯一执行者。保留所有既有/他人修改；allowed写集外只读。
按计划先测试新增行为RED，再最小实现GREEN。纯文案按实物检查，不造镜像测试。
禁止写绑定Trio（冻结期间由主执行者管理）、全局技能目录、上游、发布状态或额外任务文件。
不得自动升级Astra/另起一批helper。包内两次修复仍失败、或需要改变冻结架构时，返回最小复现及建议，由主执行者拆解；不要扩大范围。
返回candidate_done或准确blocker，不把候选当主任务验收。
```

只发送当前包和必要引用，不转发整段 Chief 历史。若使用真正的SWF frozen packet，调用现有绑定/packet机制，别把这个文字模板冒充经过工具认证的packet。requested模型不写成actual。

## 3. 每包返回格式

```text
Package: E3
Result: candidate_done | blocked
Baseline: <HEAD + scope hash reference>
Changed paths: <完整列表，包含新增文件>
Implementation: <2–4句说明可观察变化>
Verification:
- <命令 / exit / pass fail skip计数 / log路径 / 对应测试内容hash>
- RED: <真正失败行为及日志>，GREEN: <修复后结果>
- 或 text-only: <实际检查范围与结果>
Compatibility: <旧接口/无写入/边界的相关证明>
Remaining limitations: <未执行、不可用、失败分别写>
Review notes: <需要主执行者核对的具体位置>
Resume condition: <仅blocked时，具体缺什么或需重绑什么>
```

不要填“全部通过”而缺命令/结果；不要给实现者自己计算的overall confidence取代证据。没有主执行者接受时只能candidate。

## 4. 中断后恢复清单

1. 读当前绑定Trio，确认当前包/目标仍有效；不要从sidebar标题或最近mtime推断任务。
2. 对allowed paths与Trio hash作比较；无关文件变化不阻塞，范围内变化先确认归属并由主执行者rebind。
3. 复用同字节/环境已有测试日志；找到最后有效动作，从未完成步骤继续，不重复问已经确定的接口。
4. 已有candidate先审阅而不是重新实现。文档说明、源码变化和真实Host验证分别确认。
5. 如果当前Host没有指定模型，Luna可用则用Luna high；不为恢复引入Astra依赖。如果两者都不可用，记录能力缺失及恢复条件。

## 5. E8最终交接

主执行者汇总：当前diff、E0–E8完成范围、七条模型观察、静态/实际证据限制、风险及回滚方法。只在相关验证完成后回写Trio接受状态。

最后一句应准确区分以下状态之一：

- “代码候选已验证，尚缺X的真实Host回放。”
- “V1.3实施与规定验收完成，尚未进行全局采用/发布。”
- “已完成获授权目标的采用/发布，证据为X。”（只有动作真实发生且有对应证据时可用）
