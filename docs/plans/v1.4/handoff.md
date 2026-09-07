# V1.4 执行交接

## 2026-09-07 受控验收补充（当前适用）

按用户要求，不再等待新的自然业务才能覆盖 W1–W3。新增 [可重复验收包](acceptance-pack/README.md)，其中四个独立 Sol/Luna 任务、隔离输入的评分表、证据与重试规则，定义受控验收发布路径。本补充优先于本文要求“仅自然业务 pilot 才能发布”的表述；原 pilot 路径继续有效。受控来源必须标识，实际 Host 执行与用户可见交付仍必须验证。O4 六项真实证据、源码/制品回归、Chief 接受要求保留。未执行 cases 不得计 pass；当前任务状态以新绑定 Trio 为准。


本模板用于未来已授权的实施任务。先由主执行者创建或恢复当次实施Trio，再派一个有界切片；本次规划Trio及其旧hash不能作为实施授权或冻结绑定。

Luna high可完成全部切片；Host支持且任务需要时可用Sol。普通直接执行由执行者负责Trio和完成；native helper只返回candidate，由Chief核验接受。不强制双模型、独立角色队列或新visible task。

## 派单模板

```text
Authority root: <absolute repository root>
Task ID: <当前实施Trio ID>
Current slice: <V14-0…V14-6中一个>
Baseline: <实际branch/HEAD + in-scope起始diff>
Authority SHA256: <当次task_plan/findings/progress三hash>
Requested model/effort: <用户选择及Host支持配置>
Read set: <implementation中该切片的准确现有文件>
Write set: <展开该切片新增/修改源文件；测试输出另列>
Generated targets: <sync dry-run核对后的workspace目标，仅允许生成命令写入>
Evidence sink: <本地明确目录，或Host证据引用>
Dependencies: <上一切片接受/验证记录>
Authorization: <实施；具体来源；具体外部动作，各自已有效授权>
Verification: <verification中的CMD/OFF/PROJ/SEM/DEL编号与期望>
Stop: in-scope或三hash漂移、越界文件、未获授权动作、真实能力缺失
Return: 改动路径、测试命令/exit/hash、候选范围、失败/未执行/缺测、恢复条件
```

helper不得修改三文件、其他worker输出或无关dirty文件。Chief在helper活动期间保持三文件冻结；需改变范围时controlled rebind后重验。不要凭整个仓库status变化阻断无关切片。packet摘要是派单材料，不是第四任务状态文件。

## 切片依赖与并行

| 切片 | 写集入口 | 依赖/返回 |
| --- | --- | --- |
| V14-0 | 主执行者的实施Trio、精确证据目录 | 实际基线、dirty边界、Root迁移证据 |
| V14-1 | 两个Office refs和Office源SKILL链接 | 固定reference contract、OFF-REF |
| V14-2 | projection及列出的受影响测试/文档；受管生成目标 | V14-1后；6 primary/7 support/13 projection、安装打包证明 |
| V14-3 | eval README/scenarios及独立contract test准确路径 | V14-1语义固定后可与V14-2并行；不改共享projection文件 |
| V14-4 | 每次回放证据 | V14-2/3通过；O1/O2/O3/D1真实输出及评审 |
| V14-5 | 精确pilot证据；外部目标必须先绑定已有授权 | 个别案例通过即可开始相应pilot；缺O4不挡其他workflow |
| V14-6 | 候选证据、roadmap最小状态更新、主执行者Trio | 全套证据；部分候选或正式版本验收明确分开 |

每包只读所需接缝，不重读60天session。确定性变更先写会失败的相关断言再实现；既有fixture只做回归，不人为损坏以凑RED。语义回放一次针对性重试仍失败返回Chief，不自行升级Astra或重复spawn。actual模型未知只限制模型归因，不否认已实际验证的产物内容。

## 运行与恢复

先核验源/输入/方法快照；回放prompt只含输入、不含expected。runId由执行者生成唯一ID，Host reference另记，未知Host ID不能导致所有结果共用unknown。证据使用实现计划schema，保留每次attempt、旧失败和工具轨迹。

中断后读三文件，定位上次slice/runId/attempt。未变的代码/输入可复用对应验证；变化后只重跑受影响范围及依赖。已有效的同范围授权不重复询问；缺来源或权限只暂停依赖它的动作。O4缺证据保留blocked，不能用fixture或queued替代。

回滚只恢复本slice拥有且未被后续修改的文件；发现冲突停止，不reset全工作树，不删除失败证据。外部已执行动作使用Host及用户已授权的撤回流程；本地删除记录不会撤回外部交付。

## 返回与接受

```text
Slice / baseline / three authority hashes:
Changed source paths / generated targets (分别列):
Commands / exit codes / actual counts / evidence refs:
Case and workflow results / reviewer:
Artifact generated/opened/rendered/accepted/delivered evidence:
Missing data, unavailable tools, failures, unexecuted items (分别列):
Next exact step / stop-resume condition:
Candidate: ready or blocked; scope: source / semantic / full pilot
```

源候选不要求先补齐全部pilot；正式V1.4仍要求O1–O4+D1及W1–W3全部通过。Chief接受指定范围后写回实施Trio。提交、合并、发布和global adoption不由candidate或本计划自动授权。
