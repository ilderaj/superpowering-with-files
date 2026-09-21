# Chief review decisions — 2026-09-20

用户已授权重新审计、处理 pending review、修复标签和排今晚任务。本报告是证据附件；任务权威仍为 audit 三件套。

- SUP-17：接受修复后的 Phase1 contract；CSS px/tolerance/observer/viewport、single-layer/no-clip、unverified 已定义，13/13 tests。保持 Done。
- SUP-13：按原 A–E 验收（可验证腿复现、不可验证部分明示）技术验收；不冒充真人一分钟试用。
- SUP-36–41、SUP-43–44：按原 ticket 基础模块/adapter/确定性replay验收；不宣称 live integration/模型效果。独立复核通过，主agent verify:trio 470/470；verify:core结果另见日志。
- SUP-42：缺 producer callsite，撤销 ready-review。现有票继续 shadow implementation + offline tests，首次真实checkpoint必须可观察；不得提前 Done。
- SUP-45：保持 shadow，缺 measured baseline；依赖 SUP42/43/44，待依赖解除。SUP46文档本身可用，但依赖SUP45未完成。
- SUP-12：原生 Done 保留，去除陈旧 waiting-human，不重复向人提出已完成设置。8个视图已在UI观察到。
- SUP-14：Done 保留，去除 nightly。SUP35父项保留 In Progress，但去除无当前执行证据的 agent-running。
- SUP16父项不用 agent-running 表示项目未完成。Phase2 SUP18可以准备，未执行。

更正：SUP25 UUID=3f702e3e-5a58-493f-a510-db1cd40a42d2；SUP27 UUID=4a09e47c-91c0-4432-a4da-da6034c8d4b4。旧audit错贴查询标签导致虚构cycle；live数据无此问题。后继无queue labels并非失败：必须依赖Done后再promote。不能保证SUP24独占45分钟。

sync --check exit1的真实输出是 managed projections update / manual target destination-observation-unknown；不能归因为脏树，不能伪称所有全局安装已验证。今晚增加受控诊断步骤，不全量覆盖用户安装。
