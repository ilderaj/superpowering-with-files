# 迁移后的日常作业指引（Codex 插件版 Harness）

状态：2026-09-26。适用对象：本机 Codex 用户。范围仅 Codex，不含 Claude、Cursor 或其他 IDE 的 dot 文件。

## 现在是什么状态

Harness 的运行入口已经换成私有的 harness-codex-plugin。技能规范正文在插件里；本仓库不再向项目物化 `.agents/skills` 下的 Trio/ChiefOps 投影，仓库的 AGENTS.md 只保留一条指向 $harness-codex-plugin:trio 的短入口。dev 和 main 都已经是这个形态。

分工是固定的：插件提供运行时技能正文与辅助脚本；本仓库提供公开安全的规范源码、文档和验收记录。第三方内化技能的源码留在私有仓 ilderaj/swf-harness-codex-plugin，不进入公开仓。

## 开工前只做一件事：确认插件在

    codex plugin list --json

期望看到 harness-codex-plugin@<marketplace>、enabled=true、版本为当前安装版。如果没有，先按 docs/install/codex-plugin-private.md 安装或升级。安装不会附带 MCP、凭据、模型权限或项目规则，这些仍然是各自独立的一步。

## intake：直接把任务说清楚

不需要先“唤出插件”或“启动 Harness”。正常描述你要的结果、边界和已有授权即可，Host 会按技能描述选择。区别只在任务是否需要三文件。

一次性、有界、当场能验收的工作，例如改一段文案、跑一次对比、审一个文件、修一个小 bug，直接说，当场做完并验证，不建任务文件。

需要跨会话、需要恢复、涉及多个步骤或外部系统的工作，明确说“建任务”或“按 Trio 跟踪”。这时会落到：

    planning/active/<task-id>/task_plan.md
    planning/active/<task-id>/findings.md
    planning/active/<task-id>/progress.md

这三个文件是受跟踪任务的唯一权威状态。开会话、压缩上下文、换模型之后，恢复也读这里，不靠聊天记录。

判断口径：如果中断后你需要别人（或未来的你）不看聊天也能接着干，就该建任务；否则不用。

## calling：显式调用技能

重要任务建议显式点名，避免模型靠猜。语法是 $插件名:技能名。

常驻入口：

| 场景 | 显式调用 |
| --- | --- |
| 路由、权限、完成口径的总入口 | $harness-codex-plugin:trio |
| 工程类质量契约 | $harness-codex-plugin:dev |
| 文档、报告、Office 产物质量契约 | $harness-codex-plugin:office |
| 破坏性、安全敏感、外部写入 | $harness-codex-plugin:safety |
| 受跟踪任务的恢复、委派与验收 | $harness-codex-plugin:chiefops |
| 三文件建立与跨会话恢复 | $harness-codex-plugin:planning-with-files |

高频专项：code-review、diagnosing-bugs、tdd、grilling、work-methods、domain-modeling、codebase-design、overengineering-review、simplification-ledger。

写作与产物：simple-english、tech-doc-style-chinese、office-humanizer、show-me、ux-design、kill-ai-slop、kami。

平台与集成：cloudflare、cloudflare-deploy、workers-best-practices、wrangler、durable-objects、sandbox-stable、sandbox-next、turnstile-spin、weread、linear-work-control。

隐式调用是默认行为：正常描述任务，模型会自己挑。风险是它可能挑到相近技能或漏掉某个约束，所以涉及验收口径、合规、外部写入或跨会话时，显式点名更稳。没有任何命令可以“调用整个插件”。

## 让某个项目用上插件规则

全局 ~/.codex/AGENTS.md 和项目 AGENTS.md 是两件独立的事。

项目自己拥有 AGENTS.md 时（本仓库就是这种），不需要插件再写；插件会识别并报告 owner=repository。

其他项目需要受管路由块时：

    node <插件根>/scripts/project.mjs enable /绝对路径/项目
    node <插件根>/scripts/project.mjs status /绝对路径/项目
    node <插件根>/scripts/project.mjs disable /绝对路径/项目

enable 只追加一段受管块，保留原有内容；如果项目里已经是完整旧 Trio 规则，它会拒绝写入，避免出现两份治理正文。disable 只删自己那段，不碰仓库自有规则。

## 全局规则的可逆迁移

旧的全量 Trio 入口可以按原始字节备份替换，全程可回滚：

    node <插件根>/scripts/policy-migration.mjs plan --global ~/.codex/AGENTS.md --receipt-dir <新目录> > <新目录>/plan.json
    node <插件根>/scripts/policy-migration.mjs apply --plan <新目录>/plan.json
    node <插件根>/scripts/policy-migration.mjs status --receipt <新目录>/receipt.json
    node <插件根>/scripts/policy-migration.mjs rollback --receipt <新目录>/receipt.json

执行 apply 时暂停其他写入者。收据目录至少保留一个完整工作周期再清理。工具遇到未知或混合正文、符号链接、硬链接、非法 UTF-8、过期计划或被改动的备份都会拒绝执行。

## 升级与回滚

同一插件身份原地升级，不要另建第二个同名 marketplace：

    codex plugin list --json          # 记录当前版本与来源路径
    codex plugin add <现有插件ID>     # 刷新到新版本

升级前备份插件来源目录、项目 AGENTS.md、codex plugin list --json 输出和受管迁移收据。升级后新开一个 Codex 任务确认技能可发现。回滚时把来源目录恢复成备份内容再刷新同一身份，不要手改插件缓存。

## 哪些情况该停下来确认

出现下面任一情况，先别继续，保留现场：技能清单里同时出现裸名和 harness-codex-plugin: 前缀的同名技能；提示词里出现两份 Trio 正文；项目 AGENTS.md 被追加了受管块但已有完整旧规则；插件装好了但新任务里看不到技能。这四种都对应可测量的重复或缺失，不属于正常状态。

