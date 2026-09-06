# show-me 与 eli5：SWF 采用判断

日期：2026-09-06。结论：建立 SWF 自有的可选 `show-me`，以 HumanLayer 的图示选择方法为基础，吸收 eli5 的新手表达方向。使用现有 optional-skill 安装器进行 adopt。

## 来源校正

本次查询了 GitHub 完整递归目录和固定 revision 的原始文件：

| 名称 | 核实的来源 | 版本边界 |
| --- | --- | --- |
| show-me | [HumanLayer 原文](https://github.com/humanlayer/skills/blob/3c2629142c5d437428269b1b722b08c0b87f574d/plugins/show-me/skills/show-me/SKILL.md) | `3c2629142c5d437428269b1b722b08c0b87f574d` |
| eli5 | [Anthropic 社区仓库原文](https://github.com/anthropics/claude-plugins-community/blob/a727be1c7bd6064419b6f60d71993a19198adc17/eli5/skills/eli5/SKILL.md) | `a727be1c7bd6064419b6f60d71993a19198adc17`；插件 manifest 为 1.0.0 |
| Matt skills | [Matt 仓库快照](https://github.com/mattpocock/skills/tree/3cca18b368ae95cdbdebbff572ccafa662551015) | 完整目录未发现 show-me 或 eli5 路径；不能据此断言历史上从未存在 |

因此，本次比较对象应称为「HumanLayer show-me」和「Anthropic 社区市场 eli5」。eli5 的 [manifest](https://github.com/anthropics/claude-plugins-community/blob/a727be1c7bd6064419b6f60d71993a19198adc17/eli5/.claude-plugin/plugin.json) 署名 Thariq Shihipar；[仓库说明](https://github.com/anthropics/claude-plugins-community/blob/a727be1c7bd6064419b6f60d71993a19198adc17/README.md) 明确为经过审核的社区插件镜像。Anthropic 组织下的收录不等于 Anthropic 官方维护。

## 优劣势与适配性

以下是对指令设计的评估，不是跨模型运行成绩或用户理解度实验。

| 维度 | HumanLayer show-me | eli5 | 对 SWF 的含义 |
| --- | --- | --- | --- |
| 核心目标 | 用合适的图示解释当前问题 | 用大图、少量文字向零基础读者解释 | 前者覆盖开发与架构讨论；后者适合业务沟通与概念入门 |
| 表达选择 | 伪代码、调用/文件/组件树、Mermaid、diff、HTML | 固定 HTML artifact | 前者更容易避免简单问题也生成文件 |
| 优点 | 示例具体；能保留变更形状和职责边界；选择空间充分 | 指令极短，受众目标直接，给模型较大创作空间 | 前者提供更有价值的方法增量；后者的新手方向值得保留 |
| 局限 | 未明确受众校准、事实溯源与运行证据区别 | 缺少格式选择、来源约束和交付检查；简化深度依赖模型判断 | SWF 需要补齐这些边界，但不需要完整可视化框架 |
| 平台耦合 | HTML 示例使用 Bash(open ...) | 使用 $ARGUMENTS 与 HTML artifact 表达 | 应按实际 Host 能力交付，不照搬调用语法 |
| 上下文成本 | 127 行，含多种重复形状示例 | 11 行，主要是目标描述 | 短不直接等于更可靠；不能据行数推断推理 token 或耗时 |
| 维护 | MIT，可保留归属后改编 | manifest 标 MIT，仓库根为 Apache-2.0 | show-me 保留 MIT；eli5 只作概念参考，不复制指令文本 |

## 为什么选择自有改编

SWF 的重点是把代码、职责、任务状态和证据解释清楚。`show-me` 更适合作为基础方法，因为它先决定「什么表示方式能回答这个问题」。eli5 可用于解释陌生概念，但强制 HTML 不适合作为本 harness 的统一默认。

直接安装原版 show-me 也可用，不过它没有覆盖本项目经常需要区分的「源码/配置」「运行事实」「候选/已验收」；其平台调用示例也不够便携。增加一层独立 renderer 或引入整个插件则会扩大维护范围。因此选择一份短的 SWF 改编，而不是维护两份高度重叠的解释 skill。

保留：按问题选择最小表达、变更用 diff、关系用图、复杂视觉才用 artifact。吸收：以读者已有知识组织解释、少术语、具体例子。新增：来源和推断标注、类比失效边界、能力可用性检查、文件交付与可见展示的区分。移除：特定 Host 命令假设，以及一律 HTML 的约束。

## 与本 harness 和已有能力的关系

- [技能源](../../harness/optional-skills/show-me/SKILL.md) 位于 `harness/optional-skills/show-me/`，不加入六个治理入口，不改 AGENTS.md 或 Trio 路由。
- [安装器](../../scripts/adopt-global-skills.mjs) 只增加一项注册；复用所有权摘要、备份、回读和 receipt。receipt 仅表示安装字节，不成为第四份任务状态。
- 解释任务可留在现有任务内完成；不会因为画图自动新建 Trio、调度 worker 或实施所画方案。
- Host 已提供可视化或 artifact 能力时复用它；本技能只负责解释方式、内容和证据，不复制渲染工具。没有工具时用可读文本和文件链接交付。
- 与 Matt companion 分开，不修改其缓存或锁定版本。现有五项 methods 的目录与来源记录保持独立。

## 验证与边界

安装回归测试使用临时 home，调用真实 adopt 入口，检查 dry-run 无写入、技能/许可证/provenance 字节一致和重复执行无变更。先运行测试观察到缺少 show-me 注册的真实 RED（7 通过、1 失败），再补充实现。实现后 adoption 与现有 methods 测试合计 16/16 通过。

语义验证使用独立只读 helper 实际回答：Quick/Tracked/Chief 关系、新手理解「配置成功不等于启用」、无法预览 HTML 时的交付。此检查覆盖典型决策，不代表跨模型 benchmark，也不能证明所有 HTML 渲染器均可用。

实际全局采用只新增了 show-me；其他条目全部 unchanged。安装器返回 changed=1，源目录、目的目录和 receipt 摘要一致，第二次 dry-run 为零变更。结构校验和最终 16 项回归检查通过，独立语义检查指出的一处写入范围措辞已修正。当前会话工具目录是否立即刷新由 Host 决定；不能把安装成功描述为自动发现已经刷新。

## 使用与维护

示例：`$show-me 用一张图解释 Quick、Tracked 和 Chief 的关系`；`$show-me 用非技术人员能理解的方式解释这个机制`；`$show-me 用 diff 展示这个重构提案，不要改源码`。

[PROVENANCE.json](../../harness/optional-skills/show-me/PROVENANCE.json) 保存 revision、原始摘要及改编范围；[LICENSE](../../harness/optional-skills/show-me/LICENSE) 保留 HumanLayer MIT。后续手动评审上游变更，不自动覆盖本地改编。

撤销时，先从 optional 安装清单移除本技能，再核对现有目的目录仍与本次 receipt 摘要一致，将该目录移到可恢复备份并调整 receipt。不要删除用户后来改写的版本。若之后 Host 原生能力已完整覆盖这里的解释选择与证据交付要求，应重新评估是否保留此 skill。
