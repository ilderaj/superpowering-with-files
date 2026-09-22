# Harness 插件化与能力分类可行性审计

日期：2026-09-22。范围：方案，不实施新的插件架构或技能分类。已有上游 skills 更新单独实施。

## 判断

可行，而且仓库已有 `packages/plugin-kit`、Codex/Agent Plugins 清单、构建、哈希校验和 smoke 基础。建议演进现有发布链，避免另起一套安装器、任务状态库或调度器。可移植的核心是治理语义、三文件任务权威、方法技能、确定性检查与证据格式；完整运行能力还依赖宿主。

“同等能力”应定义成同一验收场景、同一权限边界和同一证据要求。不同宿主可以使用不同工具完成同一任务；没有所需能力时必须报告缺口，不能把生成文件、mock 或安装成功计作实际运行成功。当前并未完成跨 IDE 实装验证，因此不能承诺已经等价。

## 已有基础与宿主差异

| 层 | 可复用部分 | 必须按宿主验证的部分 |
| --- | --- | --- |
| 任务治理 | Trio routing、dev/office/safety、Chief 可选验收、三文件恢复 | 指令优先级、skill 发现、上下文压缩后的恢复入口 |
| 确定性工具 | Linear 身份校验、状态映射、渲染测量、安装校验 | Node/Python/Chrome 可用性、文件权限、进程取消 |
| 外部连接 | workspace/project/task 的精确身份与读回协议 | 已认证 Linear MCP、权限和 API 形状；插件不分发凭据 |
| 协作 | 冻结切片、候选结果、验收记录 | 子代理创建/等待/取消、隔离工作区、真实模型证据 |
| 自动化 | 同一队列选择和共享预算语义 | 宿主调度、后台执行、通知和真实运行记录 |
| 发布 | 一个来源、多目标 manifest、固定版本与可回滚产物 | 插件 namespace、hooks、缓存升级、卸载残留 |

Codex 本地 `plugin-creator` 文档确认 `.codex-plugin/plugin.json` 及 skills/hooks/MCP 等组件，但组件声明本身不证明运行时权限、模型或后台调度能力。当前仓库的 Codex/Agent Plugins 构建测试只是包结构证据。

Claude Code 支持 skills、agents、hooks 和 MCP 的插件组合，使用插件 namespace；这支持复用内容，但不能推出其 hook/agent 生命周期与 Codex 相同。[官方插件说明](https://code.claude.com/docs/en/plugins)

Cursor 同时支持 Agent Plugins 与其原生插件格式；原生格式还具有 rules、agents、commands、hooks 等宿主组件。可优先测试通用 skills/MCP，再验证原生扩展。[官方格式说明](https://prod.cursor.com/docs/reference/plugins)

VS Code 支持 Agent Plugins，并把若干 Copilot 专属能力放在自己的 namespace。通用包与专属组件应分别测试。[官方 Agent Plugins 说明](https://code.visualstudio.com/docs/agent-customization/agent-plugins)

## 推荐结构

保留一个规范来源和现有生成链。核心包提供 Trio、必要恢复工具和声明式能力需求；开发、Office、渲染与 Linear 集成为按需组件。宿主适配只负责工具映射、安装路径和生命周期钩子，不复制任务决策逻辑。不要为了“完整插件”加入常驻 daemon 或私有 scheduler。

宿主能力声明至少包括：读写文件、执行脚本、浏览器证据、认证连接器、子代理、持续任务、调度、真实模型证明。能力缺失分成不可执行、可由人工完成、可使用已验证替代三种；人工完成必须有实际记录。保持现有三文件唯一任务权威，不在 manifest 或 MCP 服务中再维护任务进度。

## 按 Harness 目标分类

分类是目录索引和选择元数据，不是新的 skill 身份，也不应改变现有可调用名称或 upstream 路径。

| 建议类别 | 目标 | 现有内容示例 |
| --- | --- | --- |
| 治理与恢复 | 保持授权、范围、状态与验收连续 | Trio、ChiefOps、planning-with-files |
| 产品与设计判断 | 明确需求、领域和可见交互 | grilling、domain-modeling、ux-design |
| 实现与质量 | 修改行为并控制复杂度 | dev、tdd、code-review、diagnosing-bugs、simplification-ledger |
| 证据与表达 | 可复核来源、产物、说明和测量 | office、show-me、render-verify |
| 集成与交付 | 安全接入、同步、发布和运行 | linear-work-control、plugin-kit、installer |

一个技能可带多个目标标签；默认安装仅含核心，按任务选择其余能力。第三方来源名不成为顶层用户分类。Matt 的原始 catalog 保持来源身份，SWF 的方法适配保持自己的语义与验收，不因名称相似互相覆盖。

## 上游更新与本地分类如何共存

1. 上游按现有稳定发布策略固定仓库、tag、commit、许可和内容哈希。发布时间、commit 时间与本地刷新时间分别记录。没有发布更新的来源保留原 pin，不擅自改成跟随 main。
2. 原始快照、SWF overlay、自研/改编 skill、生成插件四层分开。分类映射引用稳定 skill ID，不移动或改写上游原目录。
3. 上游更新先产候选差异，再验证 overlay、相对资源链接、命名、许可证和行为。若 upstream 改变任务权威或权限，不能因“最新版”自动覆盖 SWF 约定。
4. 每个来源采用一条更新策略；本地派生内容只吸收相关变化并保存差异理由。仅受文章启发的独立 skill 没有可机械更新的“上游版本”。来源不明的本地快照标明来源未知，不伪造最新状态。
5. 同版本产物应可重建；更新、回退与卸载必须保留用户文件、既有 Trio 和外部对象。

## 建议验证次序

先在现有 Codex 包上建立干净环境的安装→执行→恢复→升级→卸载闭环；随后验证 Agent Plugins 的共同子集，再分别补 Claude Code、Cursor、VS Code 的宿主接口。每个目标都运行同一组真实场景：代码修复、Office 来源核对、跨 session 恢复、拒绝错误 Linear Project、浏览器测量、受控委派、缺能力时明确停止。调度测试另行记录 configured/triggered/observed。

发布门包括：来源和许可完整、无私人路径/凭据、相对资源可达、升级不覆盖用户修改、宿主负向权限测试、真实场景通过、能力差异文档。不能承诺在无对应 Host 工具的 IDE 中提供相同的后台调度或认证模型证据。

本次仅交付上述方案；未新建分类注册表、重命名技能、增加 MCP 服务或跨 IDE 调度层。
