# Trio 恢复与完成语义

这份说明给 tracked 任务使用。它帮助执行者从中断恢复并判断交付状态；任务状态仍只由 `task_plan.md`、`findings.md`、`progress.md` 三件套承载。

## 恢复顺序

先使用明确的 task id 读取三份文件，确认绑定路径、文件完整性和当前状态，再查看最近的 progress 事实。只读摘要命令是：

```sh
node harness/installer/commands/trio.mjs status --root /absolute/workspace --task <task-id> --summary
```

`--summary` 只读，必须带明确 task id。它只提取三份文件里已经记录的 Goal、Current Decisions、Deliverables、Remaining Work 和 Resume Conditions。旧任务没有这些栏目也可以继续读取；摘要会标记缺失。重复栏目、截断内容和不能可靠识别的文本会标记歧义或限制，不会从聊天历史、缓存或最近修改时间猜决定。

恢复时保留同一范围内仍有效的决定和授权。范围变化、外部动作变化、Host 证据缺失或严格拓扑不可用时，回到相应 gate。worker 只返回候选和证据；主执行者负责把结果写回 progress、接受/停止、关闭和归档。

## 可选栏目

```markdown
# Task Plan
Goal: 完成审阅稿
## Current State
Status: active
Archive Eligible: no
Close Reason:
## Remaining Work
- 核对缺少的字段。
## Resume Conditions
- 延续已确认的只读范围。
```

```markdown
# Findings
## Current Decisions
- 使用抽屉方案，不单独提供时区选择。
## Deliverables
- `draft.md` 已生成，待检查引用和格式。
```

栏目是导航记录，不是新的任务状态、授权记录或验收记录。没有必要时不添加；旧任务无需迁移。`close` 仍要求现有 Chief accepted/stopped progress evidence，摘要不会自动接受、归档或继续任务。

## 完成词汇

`generated` 只表示产生文件或结果；`opened` 表示具名 Host/执行者实际打开或读取；`rendered` 只覆盖明确列出的页面、幻灯片、工作表或范围；`accepted` 需要具名责任者对明确范围作接受；`delivered` 需要目标接收者有可用访问和对应证据。文件存在、worker 最终回复、fixture、queued 打开请求，都不足以单独证明用户可见交付。

直接任务可以在自身相关验证完成后结束；CLI `close` 是特定的 Trio 生命周期写入，仍按现有前置条件执行。委派 worker 的结果先是候选，必须由主执行者检查相关证据后再接受。缺失的页面、引用、公式、Host 返回或通知状态应保留为限制，不写成完成。

## 失败与恢复

发现三文件缺失、损坏、绑定漂移或多个 active 任务时停止猜测，报告具体错误和恢复条件。发现结果路径不存在、交付范围未检查或用户可见性没有 Host 证据时，交付声明降级到实际可证明的层级。恢复不会通过新增 cache、sidecar、第四个任务文件或后台服务解决。
