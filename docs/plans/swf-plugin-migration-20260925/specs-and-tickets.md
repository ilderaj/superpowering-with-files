# SWF Codex 插件迁移：Specs 与 Tickets

范围与完成定义见[完整迁移方案](../swf-codex-plugin-full-migration-20260925.md)。本组 tickets 使用 SWF Core Project；本地 Trio 三文件是进度权威，Linear 只发布绑定和人类可读状态。旧版插件 `2.0.1+codex.20260925230000` 是回滚基线。仅处理 Codex/Agents 与 SWF 自身来源，不触及其他 IDE 配置、Host MCP 凭据或其他任务的脏文件。

## Specs

| ID | 行为契约 | 必验失败语义 |
| --- | --- | --- |
| PM-S1 源码与分发 | 每个文件只有一个规范来源：可公开的 SWF 核心在本仓库，许可未核验的内化技能与完整组装在私有仓库。私有构建固定两边提交，产物保留 manifest、来源、许可和哈希；同插件身份升级。 | 缺失/脏的输入、未固定依赖、来源或许可不明时拒绝发布；不把第三方包推入公开仓库。 |
| PM-S2 路由与投影 | 运行时仅有一个 SWF 插件身份；全局与项目 AGENTS 分工，旧 Trio/ChiefOps 技能投影退出发现路径。旧投影代码仅服务明确的回滚/fixture。 | 发现同名重复、缺失插件、旧 CLI 向已退役目录写入或 AGENTS 受管块被改动时拒绝切换。 |
| PM-S3 原状态与可逆性 | 三文件任务、绑定、MCP 凭据、用户文件不迁移。政策和受管旧目录按原字节/清单备份并可回滚；跟踪文件用正常 Git 变更移除。 | 哈希漂移、归属未知、并发写入或目标路径新用户文件时拒绝覆盖/删除。 |
| PM-S4 能力与成本 | 42 个普通 skill 和显式 Pen 均能从已安装包读到；关键路由、恢复、权限、代码/Office 任务保持正确。全局/项目规则不再重复整段正文，模型可见 skill 表无五组旧/新入口并列。 | 仅包存在、文件存在或提示字符减少不能充当真实任务、模型身份或计费 token 证据；关键场景失败即停止切换。 |
| PM-S5 交付门 | 新版本先在干净 Container 安装/升级/回滚并验证，再在 Host 上用同身份替换；私有 Release 下载哈希和新任务读回一致。公开 PR 遵守分支保护。 | CI、当前 head 审阅、私有发布、真实新会话任一缺证据，不能宣称完成或清理备份。 |

## Tickets

| Ticket | 规格 | 依赖 | 交付与验收 |
| --- | --- | --- | --- |
| PM-01 基线与归属 | S1–S4 | 无 | 只读盘点全局/项目 AGENTS、两全局 skill 根、已登记项目中的旧入口、插件 ID/包、脏文件和 worktree；输出可机读差异及人工归属清单。旧/新提示基线、当前任务文件哈希可复测；不触碰运行入口。 |
| PM-02 私有规范源码 | S1 | 01 | 将内化技能、来源/许可和完整组装输入提交到私有仓库；公开安全核心在本仓库提交。干净检出固定两个 SHA 可构建候选并读回清单；关联合适的 GitHub issue #205。 |
| PM-03 移除旧投影耦合 | S2 | 01、02 | 将旧 Codex 投影从当前安装/同步路径移到明确兼容分支；项目五个跟踪入口经 PR 删除。项目与旧 fixture 各自测试通过，无调用方再读取项目旧目录。 |
| PM-04 AGENTS 策略迁移器 | S2、S3 | 01、03 | 全局/项目 `plan/apply/status/rollback`，保留用户段落；旧完整规则被替换而非追加；冲突、symlink、hardlink、坏 UTF-8 和并发修改拒绝。项目全局无重复整段规则；原字节可恢复。 |
| PM-05 容器与行为验收 | S3–S5 | 02–04 | 干净安装、升级、回滚、无凭据发现和登录后的真实模型任务；Trio/PWF/权限/代码/Office/缺能力场景通过；42+Pen 入口校验和提示/实际 token 对照有原始记录。未完成在线路径标记 unverified。 |
| PM-06 本机切换与新版本 | S2–S5 | 05、相关 PR 门 | 备份并读回；同身份安装新版本，替换全局/项目策略，按收据迁出受管全局旧技能；新 Codex 任务不再发现五组重复入口；私有 Release 下载哈希一致，任务三文件哈希不变。 |
| PM-07 归档和维护说明 | S1、S5 | 06 | README/操作说明以新规范源码和升级命令为准；旧八技能入口只作有期限的迁移兼容。核对无人使用后清理仅本任务所有的临时 worktree/branch，保留回滚备份跨一个正常工作周期。 |

## 顺序与停止条件

PM-01 可立即执行；PM-02 的公开/私有文件边界按文件审查，不把目前脏工作区整批提交。PM-03 和 PM-04 可以在隔离分支实现与测试，但不在 PM-05 通过前切换 Host。PM-06 是实际运行切换；关键验收失败或 PR 人工门未满足时停止在候选状态，继续修复独立工作。已有文档 PR #203 独立等待其非作者审阅，不作为绕过 PM-05 的理由。
## Linear 绑定

父票：[SUP-80](https://linear.app/ilderaj/issue/SUP-80/swf-codex-插件完整迁移与验收)。以下子票已在 SWF Core Project 创建并逐一读回；本地绑定见 `reports/linear/swf-plugin-repository-release-20260925/linear.json`。

| Spec ticket | Linear |
| --- | --- |
| PM-01 | [SUP-81](https://linear.app/ilderaj/issue/SUP-81/pm-01-基线与归属) |
| PM-02 | [SUP-82](https://linear.app/ilderaj/issue/SUP-82/pm-02-私有规范源码) |
| PM-03 | [SUP-83](https://linear.app/ilderaj/issue/SUP-83/pm-03-移除旧投影耦合) |
| PM-04 | [SUP-84](https://linear.app/ilderaj/issue/SUP-84/pm-04-agents-策略迁移器) |
| PM-05 | [SUP-85](https://linear.app/ilderaj/issue/SUP-85/pm-05-容器与行为验收) |
| PM-06 | [SUP-86](https://linear.app/ilderaj/issue/SUP-86/pm-06-本机切换与新版本) |
| PM-07 | [SUP-87](https://linear.app/ilderaj/issue/SUP-87/pm-07-归档和维护说明) |

## 执行状态（2026-09-26）

PM-01–04 的源码、旧投影退役和可逆策略迁移已落地；公开 PR #203、#206、#207、#209、#211 已合入 `dev`，并经 PR #208、#210、#212 提升到 `main`。私有规范源码的 PR #1、#2 已合入，稳定版 [`v2.1.0+codex.20260926`](https://github.com/ilderaj/swf-harness-codex-plugin/releases/tag/v2.1.0%2Bcodex.20260926) 已发布。Host 已从校验过的归档升级到同一插件身份；全局旧规则经原字节收据迁移，项目旧 Trio/ChiefOps 投影已退出当前发现路径。README、[日常操作说明](../../codex-plugin-daily-workflow.md)和[私有安装说明](../../install/codex-plugin-private.md)按此状态更新。仅本迁移拥有且已合并的分支已清理；其他任务的 worktree/分支保留。

PM-05 的无模型部分已通过干净 Container 安装、升级、发现和回滚验证。真实模型场景与计费 token 效果仍未验收：Container 测试账号报告额度到 2026-09-30 才恢复；同日 Host 的 Sol high 只读路由探针返回 429，未产生任务结果。此前的 Host 切换有备份和回滚收据，不能把它当作 PM-S4 的行为/成本通过证据。待模型访问恢复后，补齐 Trio、任务恢复、权限、代码、Office、缺能力场景和用量对照，再关闭 PM-05 与整体效果评价。
