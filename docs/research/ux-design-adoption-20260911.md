# ux-design：SWF 设计方法采用判断

日期：2026-09-11。结论：建立 SWF 自有的可选 `ux-design` 方法，把 Vercel 用 design.md 约束页面生成的工程实践，与 Anshu 的 iOS 两遍构建和自我验证方法，合并为平台中立的「判断 + 验证」层，与现有 `pen-design` 渲染能力配对；不复制来源原文。

## 来源校正

| 名称 | 核实的来源 | 版本边界 |
| --- | --- | --- |
| Vercel design.md 实践 | [How our agents build on-brand pages with design.md](https://vercel.com/blog/how-our-agents-build-on-brand-pages-with-design-md)（John Phamous，2026-08-31） | 博客正文，以及配套公开工件 [design.md](https://vercel.com/design.md)；工件是在线文档、无固定 revision，本次以 2026-09-11 抓取内容为准 |
| Anshu 的 iOS 设计提示词 | [Building a beautiful iOS app with 3 Claude Fable prompts](https://x.com/anshuc/status/2064828802824597584)（@anshuc，2026-06-10） | 社交平台长文，无 revision 概念，本次以 2026-09-11 抓取内容为准 |

两者都是公开发布、未声明开源许可的网页内容，抓取文本仅保留在本次会话临时目录，未入库。因此本次不复制任何上游文本，只吸收方法与理念，独立成文；工件因此不带 LICENSE，来源与改编范围记入 PROVENANCE。

## 优劣势与适配性

以下是对方法设计的评估。文中出现的量值（6 个页面、200+ 次运行、39 对 91 的已知失败计数）是作者对其自有环境的自述，不是 SWF 的运行成绩。

| 维度 | Vercel design.md | Anshu 两遍构建 | 对 SWF 的含义 |
| --- | --- | --- | --- |
| 核心目标 | 让 agent 生成符合品牌判断的页面 | 让 agent 从零做出好看的 iOS 应用 | 前者覆盖页面族与可复用机制；后者覆盖从意图到渲染的自检 |
| 关键机制 | 判词写进 prose；样式表词汇有界；反模式具名；修正落到最窄可执行位置；冻结场景 + 盲比 + 失败计数 | 意图与质量标准先行；功能 pass 后再开美学 pass 并重新打开约束；让 agent 自己看渲染结果（录制 → 抽帧 → 像素差异） | 两者互补：先决定「什么算对」，再验证「看见的」而不是「想做的」 |
| 优点 | 判断与机制分离，修正有明确归位；对比循环给出可复算的失败计数 | 两遍结构给出「先能用再好看」的可执行理由；明确要求 agent 验证渲染结果 | 直接构成 SWF 的判词层、两遍构建与渲染后检查 |
| 局限 | 依赖其自有部署与 eval 基础设施；判词与品牌强绑定，不可整体搬用 | 依赖 Xcode 与模拟器工具链；对「验收/交付」边界没有区分 | 需要平台中立化，并补上仓库既有的证据态纪律 |

## 为什么选择自有改编

两份来源都不可整体照搬：design.md 是判词、品牌词汇与其自有评测工程的组合，Anshu 的方法绑定 Apple 平台的录制与抽帧工具。SWF 需要同一套判断同时服务 coding 侧（页面、组件、原型）与 office 侧（deck、文档版面），并沿用仓库既有的证据词汇。

直接安装任一原版也不合适：它们没有区分 `rendered`、`inspected`、`accepted`、`delivered`，也不覆盖本 harness 的权限与交付边界。因此选择一份短的 SWF 改编，而不是维护两份重叠的设计指令。

保留：读者与任务优先、可观察决策、具名反模式、修正按最窄可执行位置归位、渲染后检查。吸收：两遍构建（功能 pass → 美学 pass 且重新打开约束）、用连续帧或像素级对比自检。新增：`inspected` 证据态、与 `pen-design` 的职责切分、平台中立（不强制任何录制、抽帧或导出工具）、发布与验收边界。移除：来源专属的品牌判词、评测基础设施与 Apple 工具链假设。

## 与本 harness 和已有能力的关系

- [技能源](../../harness/optional-skills/ux-design/SKILL.md) 位于 `harness/optional-skills/ux-design/`，采用与 show-me 相同的自包含结构（正文 + 三份支撑文件 + PROVENANCE），不加入六个治理入口，不改 AGENTS.md。
- 路由接入三处：dev 方法选择表、office 工件与交付参考的「视觉设计检查」段、目标 SOP 的自动方法选择表与优先级句。三处都是既有读取路径，零新增治理面。
- 与 `pen-design`：`pen-design` 拥有 pen.dev 的调用、导出与迭代机制契约；`ux-design` 只负责意图、可观察决策与验证，并在描述与正文中明确「不是渲染器」。正文同时明确本方法的决策与反模式是评审和修正标准，不覆盖 renderer 自己的 prompt 契约——pen-design 要求把用户请求逐字传入、不自行扩写设计细节。两者不重叠、不竞争。
- 与 `show-me`：show-me 服务解释性图示，`ux-design` 服务面向使用者的视觉产出；触发词与产出都不同。
- 触发面控制：全局 `design` 触发词已被多处来源占用，因此本技能使用窄描述，把命中限定在 screen、page、dashboard、prototype、demo、mockup、wireframe、slide/deck layout 一类具体产出上。
- [安装器](../../scripts/adopt-global-skills.mjs) 只增加一项注册，复用既有的 dry-run、所有权校验、可恢复备份与 receipt 机制；receipt 只表示安装字节，不成为第四份任务状态。

## 验证与边界

| 检查 | 结果 |
| --- | --- |
| `node --test tests/installer/ux-design.test.mjs` | 6/6 通过（自包含与链接可达、契约条款、条款删除变异、路由触发行、注册、PROVENANCE） |
| `node --test tests/installer/*.test.mjs` | 135/135 通过 |
| `npm run verify:trio` | 424/424 通过 |
| `npm run verify:core` | 476/476 通过（前缀 394，plugin-kit 82） |
| `cmp` 源与 `.agents/skills/trio/**`、dsh 镜像 | 三处投影字节一致 |
| RED 证据 | 改动前 `git show HEAD:<文件>` 在 SOP、dev methods、office artifact、安装器四处均为 0 处 `ux-design` 命中 |
| 全局 adopt dry-run（`--home /Users/jared`，未 apply） | `ux-design` 动作为 `install`、无冲突、目的目录不存在；其余 12 项 `unchanged`，无写入 |

边界与未验证项：测试锁定的是文本契约、路由接线与安装字节，不证明真实会话中的设计质量或调用效果；本方法不主张任何收益量值。来源自述的数字仅作来源说明。全局安装尚未执行，本机 `~/.agents/skills/ux-design` 目前不存在；安装后技能何时被 Host 发现由 Host 决定。渲染检查依赖 Host 提供的能力，无预览或导出能力时方法要求记录为验证受限而不是通过。

## 使用与维护

示例：`$ux-design 用现有 token 画一个 dashboard 原型，先给读者与可观察决策，再给渲染检查表`；`$ux-design 检查这份 deck 的排版与层级，列出命中的反模式，不要发布`；`$ux-design 为注册流程做两遍构建，先功能 pass 再美学 pass，两遍都要看渲染结果`。

[PROVENANCE.json](../../harness/optional-skills/ux-design/PROVENANCE.json) 记录来源、抓取日期、许可状态与改编范围；两来源未声明许可，因此不复制原文、不携带 LICENSE。后续手动评审来源变更，不自动覆盖本地改编。

撤销：从 [INSTALLS](../../scripts/adopt-global-skills.mjs) 移除注册，核对现有目的目录仍与本次 receipt 摘要一致，将该目录移入可恢复备份并调整 receipt；不要删除用户后来改写的版本。若 Host 原生能力已完整覆盖这里的判断与验证要求，应重新评估是否保留此方法。
