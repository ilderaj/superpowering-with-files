# 2026-09-22 仓库阶段审计

本次为直接执行的 tracked dev 任务。用户授权审计、清理、修复、上游更新及 commit/push/PR/merge/sync/adopt；plugin 架构与技能分类仅作方案。任务权威仍为本次 Trio，报告是可复核的结果记录。

## 规划与需求

审计起点有 39 个历史 active Trio。已关闭归档 30 个，保留 9 个真实未完成或持续性任务；本次审计另计，交付完成后关闭。每项归档路径与保留原因见 [完整清单](planning-final-inventory.json)。

归档区分“已完成”与“被当前架构取代”。没有把不可达的旧 worker commit 当作集成证据，也没有恢复退役的 Corleone、V0b overlay 或 tracked-lean 路由。此前已跟踪的两个 Trio 和 companion 保留在 Git 的 archive 路径中；其余本地规划按仓库既有忽略规则归档并完整备份。

保留项涉及：人类视觉验收、真实 fallback 运行与上下文恢复观测、独立 provider/usage 对照、Render 后续消费与治理、LMP 后续接入与隔离、持续周回顾、外部网络决策，以及另一仓库的许可阻断。这些门槛不能由本地测试代替。

## 代码、消融与近月落实

近月 history、当前需求和文件清单见 [模块清单](modules-inventory.json)。清单覆盖 harness、packages、scripts、plugins 和 homepage；上游快照、内容资产、薄封装与可执行行为分别判断，不把每个文本文件当独立运行模块。

主执行者在真实文件副本中完成 31 个能力边界的 baseline/mutant 实验：[实验结果](ablation-summary.json)。移除行为后均触发真实消费者失败，因此保留这些能力。初次选择错误测试入口而存活的三个 mutant，已改用 CDP integration、sync CLI、upstream update 消费者复验。另补 DSH/homepage 消融与预算恰好用满的边界测试。

实际精简包括：

- 删除 3 行 Linear intake 重复校验；完整 inventory 与 project admission 已在此前执行等价检查，16 项针对性测试保持通过。
- 删除误提交的五个 installer `.debug-*` 树，共 3,875 个生成文件、542,534 行；加入 ignore 与 tracked-file guard，保留真正 fixtures。
- 清理历史规划与无效 Git 工作副本，保留可恢复证据。

修复覆盖 decision shadow 错误隔离/三态统计/独立评估、release policy 与 backend 来源、portable root、上游 PR 锁持久化、规划 close/archive/reopen、缓存造成的技能假冲突、渲染 no-clip/多 selector/主文档 HTTP/显式 CLI 输入优先级。渲染 HTTP 判断区分主 frame、iframe、redirect 和重复导航。

本次不宣称离线测试证明真实模型更准确、省 token、生产运行成功或不同 IDE 能力完全相同。暂未证实的 gate activation 与 usage 收益继续保留为未完成。

## 上游与插件方案

主执行者重新查询官方 release/tag，确认：

| 来源 | 接受结果 |
| --- | --- |
| planning-with-files | 稳定版 v3.20.5，commit `5ac39bcb41a9251d4253f7a2372b32147bfe6c2c`；保留 SWF overlay 的任务身份、UTC+8 和 chronology 行为 |
| Matt skills | 最新稳定版仍为 v1.2.3，commit `6acc160e4e0cd062dbbbd7a1b26ae92855edf07e`；整合原 PR179 的 24 技能/67 文件完整目录及递归来源锁，保留现代四产物 packaging |
| show-me | HumanLayer 正文无变化；唯一新增的 explicit-invocation-only 元数据与 SWF 按上下文选择能力的目标冲突，明确不吸收；Anthropic 参考源无变化，更新审查 provenance |
| ux-design / methods | SWF 自研或有来源的改编，不伪装成可机械覆盖的第三方发行版本 |

[PWF 官方发布](https://github.com/OthmanAdi/planning-with-files/releases/tag/v3.20.5)、[Matt 官方发布](https://github.com/mattpocock/skills/releases/tag/v1.2.3)。详细基线与更新判定见 [来源清单](upstream-inventory.json)。

[跨 IDE plugin 与目标分类可行性方案](../../../../docs/research/harness-plugin-feasibility-20260922.md)：现有打包基础可继续使用；文本能力与宿主 API/调度/认证模型证据须分开验证。建议五类目标索引，不移动上游目录，不改变技能身份。未实施新的架构、分类注册表或调度层。

## Linear 与排班

覆盖 5 个 Project、17 个 label 和初始 53 个 issue；本次新增 SUP-54 后为 54 个。四个 SWF 交付流共享 Team，另一个 onboarding Project 为人类参考，不能当 agent 队列。共享且仍有真实工作的 Project 保留。

SUP-25/LMP-03 已依据本地验收转 Done 并移除运行/排队标签。SUP-5/47/52/53 的关闭归档路径已更新到 description 和已有 status comment，逐项经过 workspace/Project/issue/comment guard 与写后回读。SUP-15 保留人类 review；WP-10/11 保留独立实证门槛。LMP-04/06 在依赖、整合和并发检查通过后才晋升后续队列。

夜班主任务与晨间交接已有真实完成记录；fallback 新 provider 路由仍是 configured，当前 Host 需要重载 catalog 并观察真实成功执行。未把模型配置当作认证模型证据，也未因本次审计新建重复排班。

## Git 与恢复证据

起点：24 个本地分支、40 个远端分支、18 个 worktree、13 个 stash；main/dev 与 origin 的共同基线为 `45f3fe81`。有效 dirty decision 与计划内代码已分别验收集成；旧 PWF PR125 被最新稳定版候选取代，PR179 的有效目录已选择性整合而未回退新 packaging。

[逐项 Git 判定](git-final-decisions.md) 明确区分 ancestry、内容等效、架构退役和备份。清理前分别保存全部 refs、13 个 stash 的全部历史父节点、17 个历史 worktree 的完整 tar。对 tar 做 SHA256、成员列表、当前 HEAD、patch 及逐文件字节回读后才删除工作副本。主工作区永久保留。

私有机器状态、原始连接器回读、完整测试日志和恢复包保留在 `.harness/backups/repo-phase-20260922/`，不发布到公共仓库。公开结果使用相对路径；历史跨工作区 session 登记采用匿名摘要，原始对应关系仍保留在本地备份。

## 验证与交付状态

本报告提交时的验证和交付实况见 [verification.json](verification.json)。PR merge、四个 main/dev refs、workspace clean、全局 sync/adopt 与本地既有 Matt plugin 更新必须由最终回读确认，不能用“已提交候选”替代。最终交付 receipt 保存在本地审计备份，并回写 SUP-54 和最终用户答复。

审计过程未接受子代理自报即完成：早期不隔离的实验、错误来源判断、弱化原有断言的候选均被拒绝或纠正；只有主执行复核与有效验证计入结果。
