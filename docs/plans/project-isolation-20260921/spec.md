# Project-first 本地工作隔离方案

## 决策
2026-09-21用户授权替代一产品一Team方案，迁移现有Linear任务/Roadmap并自动接入未来tracked工作。Team采用稳定组织/权限/状态工作流边界，当前复用SUP；不因新repo创建Team。Project表示一个本地产品的交付工作流；小产品默认一个Project，大产品按有独立验收的长期工作流拆多个Project。Issue对应tracked任务或可验收切片；不为每个thread/临时目录建Project。不同产品禁止共享Project ID；多个Project共享同一Git根仍共享并发互斥。

## 四层语义
| 层 | 职责 | 规则 |
|---|---|---|
| Team | 人员、权限、状态工作流 | 当前SUP；新Team仅组织/权限变化时另行显式配置 |
| Project | 产品/交付工作流与Roadmap | productKey+project key映射到固定UUID；名称非身份 |
| Label | 工作流分类、执行者、注意力/夜班资格 | workstream:*；swf-managed兼容通用管理标记；executor:codex-local；nightly；agent-ready/running/review等；标签不授予权限 |
| Status | 生命周期 | Backlog未就绪；Todo就绪；In Progress执行/父计划进行中；In Review待验收；Done需完成门；Canceled/Duplicate保留原义 |

## 本轮迁移allowlist
完整workspace清单51 issue，无后续页：SUP1–4为Linear入门，放Workspace onboarding（无nightly/managed）；SUP5–14及47归SWF — Core & Operations（复用原MVP Project UUID）；SUP15–21归SWF — Render Verification；SUP22–34归SWF — Project Isolation & Automation；SUP35–46及48–51归SWF — Decision Runtime。所有原UUID、Team、依赖、父子关系、评论、优先级、完成状态保留；SUP15的ready-review对应In Review（同started类）。不迁移其他产品私有数据，不自动排全部backlog。

## 自动intake与执行
1. 首次明确要求本地tracked任务走Linear时，读取当前repo的project routing policy及Git common dir。无policy时先显式bootstrap：验证workspace和现有Team；按product marker查完整Project清单，唯一则复用，零个则创建一个默认Project，多个则停止歧义；读回UUID后写本地配置。普通问答/开关文件夹不触发。
2. 已有binding/父issue归属优先，显式project key次之；冲突拒绝；无指定的新任务落该产品default Project，不能靠标题关键词猜测。相同task marker查全量已有issue，唯一复用，多个拒绝；保存exact UUID与Trio路径。创建回包丢失先读回再重试。
3. 每次写入/领取前除workspace guard，还执行project-routing guard-target：真实root/worktree family + policy + exact binding team/project/issue + live回读一致。允许Project列表中的另一个Project也不能冒充当前任务目标。标签不能覆盖错误身份。读回漂移停止后续写入。
4. 夜班只发现当前repo绑定，逐Project读取并全局去重、共享3 attempts/45min。跨Project绝不代表可并行修改同repo。依赖Done、授权与root/锁就绪才nightly。白班按Project分组显示完成、review、阻断、覆盖unknown。v1父子映射暂保持无损，叠加project guard；不强行转为丢子任务的单issue v2。
5. policy是配置，binding是外部元数据，Trio仍是唯一任务执行权威。Project archived/completed不自动重开，新intake应显式选择后续Project。不同产品在同Team可扩展，不受一产品一Team数量增长；保密需求仍需private Team/workspace，Project不是权限沙箱。

## 有效性审计与验收
强项：Team少而稳定、UUID明确、Project可按成果独立收尾、labels低基数、status不承担归属语义。风险：重复project、手工移动票、v1子项漏扫、非事务写入、并发共享repo、未接入root；分别用完整读回/幂等marker/exact guard/迁移manifest/共享锁或冲突停止处理。无Host拦截器能保证任意agent永不绕过工具：本轮交付有测试的helper与所有既有白夜班/Chief强制调用协议，实际未来cron仍需观测。

## Roadmap
已在Linear落地的LMP/Render/DCR作为三个Project的Roadmap；Core保留基础和日常工作。主docs/roadmap.md与backlog只加归属表和待接入规则，历史已完成/被替代条目不重新建单排夜班。Initiatives连接器不可用则通过UI核实，不把工具不存在当无Roadmap。
