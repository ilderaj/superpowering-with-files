# Jev/SWF 审计整改执行计划
日期：2026-09-20。状态：规格冻结，待夜班实施；不是运行时修复完成。
权威：planning/active/swf-decision-control-runtime-20260919/ 三件套。
审计：[audit.md](audit.md)；规格：[spec.md](spec.md)。

## 执行顺序
J01 → J02 → J03 → J04 → WP07/SUP-42 → WP10/SUP-45 → WP11/SUP-46。
本initiative同时只有一个无依赖slice可持有agent-ready+nightly。后继在前票Chief验收Done、重新验证readiness后晋级，不以worker自报成功解锁。
保留WP01–06、08–09原验收；新增修复票不追溯否定原有基础能力。

| 包 | 范围与文件allowlist | 验收/验证 | 依赖 |
|---|---|---|---|
| J01 验证范围与失败优先级 | harness/trio/core/{decision,evidence}.mjs；tests/trio/{decision,dev-evidence,office-evidence}.test.mjs | spec S1全部边界RED→GREEN；node --test上述三测试；verify:trio | 无 |
| J02 shadow隔离与三态统计 | harness/trio/core/shadow.mjs；tests/trio/shadow-gate.test.mjs | spec S2；坏观测后好观测继续，task隔离，renderer不变，null不算agreement；定向测试+verify:trio | J01 |
| J03 policy来源与backend真实性 | harness/trio/core/decision.mjs；tests/trio/decision.test.mjs；docs/decision-control-runtime.md对应契约 | spec S3；operator不能授予allowed，匹配policy可给recommendation但不执行；定向测试+verify:trio | J02 |
| J04 评估口径与独立盲评协议 | scripts/evaluate-decision-{accuracy,shadow}.mjs；tests/trio/decision-accuracy.test.mjs；tests/fixtures/decision/；tests/evals/decision-control/；scripts/evaluate-decision-profile.mjs；docs/plans/2026-09-19-decision-control-runtime-{evaluation-design,baseline}.md | spec S4；T1分母/别名/unsupported，合成两臂usage精确聚合、缺值unproven、+5%边界；定向测试+verify:trio。真实raw inputs与结果由WP10负责，禁止编造 | J03 |
| WP07 接入真实checkpoint入口 | scripts/render-decision-checkpoint.mjs；tests/trio/checkpoint-caller.test.mjs；docs/decision-control-runtime.md | spec S5；离线stdout字节等价+错误隔离；Chief首次真实调用证据前不得Done | J04及原WP06 |
| WP10 实测基线与T1.5 | 原票范围、decision专属评估数据/报告 | S4盲评、2复核、两臂真实回答和usage；T2另需实验干预授权，不能以shadow证明效率提升 | WP07及原WP08/09 |
| WP11 文档收口 | 原票文档范围 | 根据实测结果写supported/unchanged/regressed/unproven；无发布动作 | WP10 |

每票可更新本任务三件套和对应报告；不得覆盖共享工作树其他改动。测试新增文件直接显式调用，不为注册测试改共享package.json。
遇到原fixtures与修复冲突，说明语义差异并更新期望，保留原报告作为历史；禁止修改truth迎合代码。

## 夜班执行契约
- 执行身份executor:codex-local；现有Host配置opencode-go/deepseek-v4.1-flash，实际模型须Host证据。Chief负责规格/接受，可用短只读subagents复核。
- J01首片20分钟，先复现适配器已知fail被unknown遮蔽，然后完成范围与优先级最小修复。其他票同样20分钟首片；未完成保留checkpoint及确切next action，不能假报Done。
- 复用现有ACTIVE Night Executor，下一窗口2026-09-21 01:30 Asia/Shanghai；Morning Handoff 07:30。全队列共3次尝试/45分钟，其他initiative已有高优先票；排队不等于当夜完成。
- 当前仅J01入队；J02–04及WP07保留Backlog依赖。本次授权后继本地修复/离线测试，经既有Chief/readiness流程可晋级；不授权live干预、部署或发布。
- 必须读取原Trio和本spec，保留scope；worker交candidate→Chief复验→三件套→guard→Linear，不以标签替代验收。
- 每票回退只撤该票diff；禁止reset/stash/全局sync apply。超时、不明文件归属、需扩scope则checkpoint，不自行绕过。

## 交付证据
本轮只增加审计/规格/计划、更新控制面，没有实施J01–04。审计证据位于reports/audits/jev-swf-20260920/（source-manifest、probes、测试日志、sync-check）。
Linear真实ID与排队回读见本任务progress及本文件追加映射。


## Linear projection (2026-09-20)
- J01: [SUP-48](https://linear.app/superpoweringwithfiles/issue/SUP-48/j01-修复适用验证范围与失败优先级)
- J02: [SUP-49](https://linear.app/superpoweringwithfiles/issue/SUP-49/j02-隔离shadow观测错误并修正三态统计)
- J03: [SUP-50](https://linear.app/superpoweringwithfiles/issue/SUP-50/j03-分离release授权来源并校验backend真实性)
- J04: [SUP-51](https://linear.app/superpoweringwithfiles/issue/SUP-51/j04-修正t1评估与冻结独立对照协议)
J01 Todo + agent-ready + nightly is intended current slice; others Backlog. WP07 deferred behind J04. Live read-back confirmed: SUP-48 Todo + agent-ready + nightly, no blockers; SUP-49→50→51→42 dependency chain, all Backlog; SUP-45 retains original blockers plus SUP-51; SUP-46 behind SUP-45.

最终队列回读：其他候选SUP-15和SUP-47为Urgent，SUP-24为更早High，SUP-48为High；若前三者均仍合格，SUP-48按当前排序第四，会超出单夜3次尝试上限，顺延下一夜。未修改其他initiative优先级。initiative-only selector确认SUP-48具备资格，不等于全局首选或已执行。
