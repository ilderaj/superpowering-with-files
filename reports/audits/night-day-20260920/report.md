# 夜班 / 白班 / Linear 重新审计

2026-09-20，实时MCP + 本地代码/Trio + Linear UI + 4名bounded subagents。

## 结论
方向合理，已有真实夜班和晨报；当前是单仓库、prompt驱动的受控流程，不能宣称跨产品可靠执行已完成。已修复身份核对、空队列entry晋升、跨binding恢复、进度记录、晨报覆盖及UI候选语义。原子锁、完整product/root guard与bootstrap仍是LMP待实施范围。

## 已处理
- 原12张ready-review：SUP13、SUP36–41、SUP43–44共9票技术验收Done；SUP42缺producer退回Todo；SUP45/46转依赖Backlog。
- SUP17 measurement contract缺陷修复：single-layer/no-clip、units/tolerance/observer/viewport、unverified非通过。
- 移除SUP12 waiting-human、SUP14 nightly、SUP35 agent-running；父项In Progress不代表worker运行。
- Tonight UI原nightly条件改为nightly+agent-ready，描述改候选与3次/45min上限。八个视图实地观察存在。
- night/morning canonical和live prompts逐字一致，仍ACTIVE；01:30/07:30及原模型保持。
- SUP25/SUP27 UUID错贴造成的虚构cycle已撤回；连接器本身数据一致。

## 今晚（2026-09-21 01:30 Asia/Shanghai）

| 当前次序 | Ticket | 执行面 |
|---|---|---|
| 1 | SUP15 | Urgent；真实homepage两视口build/preview/截图/测量/交接canary |
| 2 | SUP24 | High；LMP02首片schema/v1 tests，再resolver/root/atomic write续片 |
| 3 | SUP47 | High；新N01：恢复预算、部分promotion失败与幂等回读契约验收 |
| 4 | SUP18 | Medium；render capability，首片fixtures/CDP/static-server |
| 5 | SUP42 | Medium；shadow producer实现/离线测试；首次真实调用待白班观察 |

顺序是当前snapshot，运行时需重新读取；全局最多3 attempts/45min。已排候选不承诺本夜全部执行。SUP25–34已增补specs/impl步骤与条件授权；真实前置Done、readiness通过才晋升。依赖图补齐render和DCR关键前置。未实现的ticket没有被标Done。

spec：docs/plans/night-day-loop-20260920/spec.md；LMP详细规格与步骤：docs/plans/linear-multiproject-isolation-20260918/specs-and-tickets.md、nightly-recovery-plan.md。

## 多项目结构及实际约束
推荐一个稳定产品一个Team，产品内Project表示交付目标，多个repo可共享Team；canonical repo/worktree家族锁负责执行互斥。Team不是安全隔离：root→product→workspace→team→project→issue/comment必须逐次核验。

当前只验证了SUP的真实映射；新产品不因打开/关闭文件夹触发创建或删除。显式tracked intake后先查后建、逐步保存回读ID、失败setup-needed；接入、repo执行、nightly授权分开。MCP无createTeam工具，授权UI fallback必须回读验证。套餐或权限不足不得绕过。

UI Billing=Free plan。官方Free最多2 Teams，当前1，足够SWF+SeQure主repo试点；不足四产品各Team。第三Team前需选择升级或另批共享Team+独立Project方案。本轮未收费、未创建Team。

官方依据：[Teams](https://linear.app/docs/teams)、[Projects](https://linear.app/docs/projects)。当前连接器只认证一个workspace；这不足以证明Codex产品永久只能连一个workspace。

## Human动作
现在无需重复批准本地开发、Phase2或虚构cycle排查。维持DCR gates shadow。后续真实四产品推广前才需容量选择；真实内容发布、全局apply和Git发布保持原独立边界。真人是否能一分钟读懂看板尚未由用户验证，UI检查不替代此项。

## 覆盖与验证
36个active目录，5份binding有效映射6个task（SUP15在MVP的taskMap）；30个local-only/未登记，不能声称全部在loop。LMP06补intake coverage检查，不批量创建或归档旧任务。

verify:trio 470/470；verify:core最终453+82/535全部通过；render contract13/13；Linear helper/queue41/41；最后prompt contract5/5。期间编辑中的prompt断言失败及测试调用错误均修正并重验。sync --check仍exit1：managed drift/manual observation unknown；归入SUP21受控诊断，未伪报环境就绪。

真实Linear snapshot只读选择依次SUP15→SUP47→SUP24，第4次attempt-budget；未claim/执行任务。它是手动预检，不是今晚cron观测。新的scheduled结果由既有07:30早报收集。

证据：linear-final.json、queue-preflight.json、queue-simulation.json、local-coverage.json、verify-trio.log、verify-core-final.log；实际状态以运行时重读为准。未commit/push/deploy。

## 旧审计额外事项已处置
- SeQure Wiki三篇当前已在main且queue为published，旧pending结论过时。独立内容复核未发现需回滚项；两个Mastercard归档来源不可达，未来维护需重新取证，不声明重新发布或真人验收。本轮再次读queue时三篇/两篇冲突已被其他工作修复，未重复编辑Wiki。
- Wiki当前仓库规则要求撤回定时任务，而live draft仍会自动commit/push。已将旧nightly和morning两条automation暂停并回读PAUSED；未删除、未发布，后续在LMP试点明确scope后再恢复。
- Matt刷新保留既有v1.2.3 release策略；GitHub tags实时核实6acc160e。旧待选择项以release-channel no-op关闭；不采用未发布main，不覆盖本机24skill，仓库3skill与安装漂移仍明确保留。
- 报告已在本机HTTP预览目视检查，今晚筛选只显示5张Todo。原file URL浏览器接口受限，报告本体仍为可保存独立HTML。

最终回读：发布SUP47 checkpoint评论后updatedAt变化，同High排序变为SUP24→SUP47。这是当前按updatedAt排序的已知易变性；候选顺序以运行时重读为准。最终snapshot为queue-final-preflight.json。

最终手动预检：旧快照 now 早于 SUP47 最新 updatedAt，被选择器正确拒绝（Malformed candidate）。更新独立手动预检的时间后通过：SUP15→SUP24→SUP47→attempt-budget；未领取或执行任务，未修改真实夜班预算。证据 queue-final-simulation.json。
