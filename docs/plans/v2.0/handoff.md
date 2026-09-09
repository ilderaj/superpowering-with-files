# V2.0 派单与恢复

执行者只读本包、当前切片列出的接缝和绑定Trio，不重读60天会话。普通机械整理用脚本，Luna high做有界实现/核验，Sol high仅在Host确实支持且任务需要时请求。一个针对性重试后仍有歧义，返回Chief；不启动昂贵worker队列。

## 每次派一个切片

```text
Task: <当次实施Trio的明确ID，不能使用本次规划Trio充当实施授权>
Authority root: <absolute root>
Authority files + SHA256: task_plan / findings / progress 各填一个真实hash
Current slice: <A0/A1/A2/A3/B1/C1/D1/Z1>
Baseline: <当前branch、HEAD、精确范围初始diff/hash>
Requested model/effort: <Host支持且符合用户偏好；实际值由Host证明>
Read set: <implementation中该切片列出的文件>
Write allowlist: <展开到具体文件；B1是明确本地证据根>
Dependencies: <前一切片的Chief acceptance或已验证直接工作证据>
Authorization: <实施/来源/外部动作各自已有授权；未授权动作排除>
Success: <对应T/L编号及精确pass条件>
Stop: binding或in-scope基线漂移；来源/权限缺口；契约冲突；一次针对性重试仍失败
Return: 路径、diff、执行命令/exit、case/hash、结果和限制、candidate状态
```

派单前填完，未填的授权/路径不是默认Full Access。普通native helper只接受父任务proper subset；不改Trio、状态或未分配文件。Host不提供实际模型证据时在人工摘要记unknown，JSON用null加reason。Chief在helper活动期间冻结三文件；更改scope先controlled rebind并重新校验。

## 恢复顺序

1. 读绑定Trio，核对三hash、baseline和当前切片。别按最近目录猜任务。
2. 找到最后一次已完成的命令与runId。确定性输入/代码未变不重跑全套；变化后重跑对应测试和依赖。
3. B1读取既有attempt，保留中断/失败证据，在同一case新增attempt；不因恢复重置数据集或挑成功样本。
4. 缺少外部源/Host认证时列具体字段及恢复条件；继续A1–A3等独立切片。需要变更模型/实验指标由Chief新建cohort，不混写。
5. Chief对candidate做独立证据审阅，接受后写回Trio。JSON报告不自动关闭任务。

## 每包交接摘要

```text
Slice / baseline / changed files:
Commands and exits / actual test counts:
Evidence refs and input/source hashes:
Quality gate / economic verdict (分别填写):
Missing or unavailable evidence and reason:
Preserved failures/retries:
Remaining work / exact resume condition:
Candidate ready: yes/no (不是Chief acceptance或user-visible delivery)
```

禁止执行包内隐藏的“顺带发布”：commit、push、merge、release、全局adopt、外部发送依据当时用户授权和Host门禁。20-D安装作用域必须具体绑定后再执行，不能复用含糊的历史全局采用授权。
