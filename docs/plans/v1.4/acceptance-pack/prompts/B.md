这是 SWF V1.4 的受控验收任务，资料是合成的，实际执行和本任务中的交付是真实的。
工作区根：/Users/jared/SuperpoweringWithFiles。
请只读取当前案例输入、完成任务所需工具技能，以及以下候选契约：
harness/trio/skill/SKILL.md
harness/trio/capabilities/office/SKILL.md
harness/trio/capabilities/office/references/source-backed-work.md
harness/trio/capabilities/office/references/artifact-and-delivery.md
不要读取 acceptance-pack/reviewer.md、其他案例输出、scenarios.json 或旧评分答案。它们是评审材料，不是本任务输入。
请求模型为用户在 Host 选择的 Sol 或 Luna，effort=high。不要自行切换 Astra。实际模型无 Host 证据则记 unknown。
开始时记录 HEAD、四份候选文件和案例输入的 SHA256。无关工作树修改不阻断此任务，也不能清理它们。
输出仅写入 .harness/acceptance/v14/B/<唯一run-id>/；不得覆盖任何历史 attempt。可在此目录使用临时文件。不得修改源码、计划、测试输入、全局配置或其他任务；不得发邮件、发布或调用生产写入。允许在本任务最终回复中交付给用户。
执行完成后交付实际产物的绝对路径链接，说明做了什么验证、遗留问题，并输出 receipt.md，含开始/结束时间、run-id、任务/turn 引用（未知可写 unknown）、请求模型、实际模型证据、输入与候选 hashes、输出清单、验证方法和结果、未执行检查。不要自行宣称发布通过；由 Chief 独立评审。
如工具不可用，清楚记录受影响的检查并完成其余部分；不擅自安装依赖。不要为保持“全绿”虚构证据。

案例输入：docs/plans/v1.4/acceptance-pack/inputs/B-weekly.md

请按输入的完整周报模板生成 weekly.md，内容便于家锐审阅后使用。
