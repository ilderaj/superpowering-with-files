# 夜班—白班 loop 修复规格（2026-09-20）

## S1 身份和覆盖
每次读回核对 Linear 返回 identifier 与 UUID，title 用于人可读校验；改名更新缓存，不可将请求变量的票号覆盖返回票号。仅发现当前仓库 reports/linear 的绑定，缺失才用 legacy；taskMap/subIssues/subIssueIds 标识归一化为唯一任务。错误/重复映射 fail closed。多产品扩展复用 LMP-02/03，不能默认塞进 SUP。

## S2 领取、恢复和晋升
使用现有 progress.md 记录 runId/startedAt/attemptedIssueIds/currentSlice/promotion result，属于同一Trio任务记录，不引入状态库。恢复不得重置预算；未知原预算停止。entry 与每次结果后扫描所有已映射后继，不仅带queue标签者；依赖Done+授权+ready后read/compare/write/readback。写入失败保留sync pending，重复运行先回读，不能重复领取、不能把缺依赖视为无依赖。

## S3 人类注意力
Tonight是候选不是完成承诺；标签同时含nightly和agent-ready。Running仅表示有活动执行证据的叶任务，父项In Progress不需agent-running。ready-review只列有明确acceptance gate的交付；技术可验证事项由Chief审核，只有真实成本、范围、产品选择留给human。晨报按completed/review/decision/failed/running/remaining/skipped/coverage/next分组，列原因、下一步、owner；无变化静默。无权据此声称真人体验通过。

## S4 并发和环境
本地未提交不等于其他任务拥有全部文件；识别具体写入面与活动owner，冲突或未知则跳过该面。原子锁复用 LMP-07（canonical repo/worktree家族），先于产品试点。不用Linear标签伪装锁。sync --check当前失败需区分managed drift与manual destination-observation-unknown，禁止全量覆盖global skills作为快捷修复。

## 实施 tickets / plans

### N01 · Night loop recovery / promotion acceptance（新票）
范围：既有 night-queue helper/tests/workflow（需要时才新增最小纯函数），不新建scheduler/数据库，不进行生产外部写入。20分钟首片。
1. RED：构建来自本轮真实字段形状的去敏snapshot（identifier与uuid并存），覆盖不同scope同预算、attempted恢复不重试、未加label successor、依赖unknown、部分promotion失败后回读恢复。
2. GREEN：复用selector和progress checkpoint协议；如果纯helper无职责实现API重试，测试adapter contract并清楚标记模拟MCP，不能冒充live。
3. 验证缺预算拒绝、重复promotion no-op、一个scope失败不称全项目为空、claim失败不执行。
4. 把运行输入/输出/命令和未覆盖项写progress；需真实Host下一轮记录补齐，fixture不作为cron观测。
验收：上述失败与恢复路径可复现，无新增durable authority，无修改真实其他产品；窄测试通过，首个scheduled run证据另记录而不阻塞离线ticket。

### SUP-15 · 真实 nightly canary（复用）
今晚优先：执行原homepage两档视口build/preview/截图/测量与晨报，记录真实SHA及工作树，不沿用旧HEAD。它保持原验收，不以仅排队完成。当前手动queue readback只是预检；next cron记录才是本次scheduled observation。

### SUP-24 / LMP-02 · v2 首片（复用）
首片只做schema + v1 compatibility RED/GREEN，下一片resolver/root/worktree与原子写。每个slice写已做/未做，不以首片代替整票Done。单片目标20分钟；剩余预算不够则保留可恢复变更和明确下一步。

### SUP-25–34 · 产品生命周期（复用）
细化见LMP specs-and-tickets；本轮明确授权本地schema/guard/bootstrap fixture/intake/锁/sync/view contract/template开发与依赖满足后晋升。live新产品bootstrap在LMP11按一个明确产品+repo试点；当前未选择实际试点，不默认纳入工作用仓库，不自动升级套餐。锁与root验证完成前不运行真实多产品夜班。

### SUP-42 / SUP-45 / SUP-46（复用）
SUP42 producer shadow integration：仅实现+离线测试night-safe；首个真实调用需白班观察，无语义gate激活。SUP45 baseline依赖SUP42/43/44；独立outcome缺失标unknown，不能自造heldout标签。SUP46文档依赖SUP45，技术稿已存在但不宣称发布。

## Tonight admission
2026-09-21 01:30 Asia/Shanghai。全局最多3 attempts/45min；优先SUP15 canary，再SUP24/N01（同High按updatedAt排序），SUP18/42为后续候选。依赖票是已规划、条件晋升，不是已可执行。07:30晨报需报告未尝试原因和真实运行证据。不新增调度，保留原automation model/effort。

## Coverage gap 与安装诊断归属
本轮36个active目录并不等于36个正在执行任务；5份binding有效映射6个task（SUP15由MVP binding映射）。其余30个为local-only/未登记，不能声称dashboard覆盖所有本地工作，也不能自动批量排夜班。LMP06/SUP28补入intake coverage报告：识别已完成旧目录、明确local-only、需要tracked接入者；不自动建单或归档。SUP21既有采纳验收补入projection drift与manual unknown诊断，先dry-run，未经授权不全量apply。

## 最新追加：carrier/model审计
SUP47首片与优先级由 [carrier-model-spec.md](carrier-model-spec.md) 覆盖：先模型证据/路由契约，再原N01恢复晋升；同一ticket，不扩大全局预算。当前候选SUP15→SUP47→SUP24，实际按运行时排序。
