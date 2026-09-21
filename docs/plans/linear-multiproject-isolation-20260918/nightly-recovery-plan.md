# Nightly 停滞诊断与恢复计划

## Project-first policy — 2026-09-21（当前规则）

同一 workspace 内复用稳定 Team，产品/交付流由独立 Project UUID 隔离；本节替代下文旧的一产品一Team、四Team容量门和不迁移历史票建议。当前完整规格见 [Project-first spec](../project-isolation-20260921/spec.md)。SWF 已按 Core、Render、Isolation、Decision 划分Project。新产品先核验root、workspace、共享Team权限与Project ownership marker，再创建/复用独立Project；不自动建Team。夜班授权、root guard和并发锁仍是独立门。SUP25–34后续实施采用此规则；旧内容仅作决策历史，不能作为相反执行指令。


状态：用户已批准实施；R1–R6 本地部分已实施（含多 scope prompt 修订、live 回读与全量校验）；本轮只做文档窄修复并准备今晚开发切片与条件提升。真实 Team 创建、Team 删除/归档和 45 分钟内完成全部 LMP 不作承诺。

## 结论与证据

目标 thread：01a0b593-27c8-7c43-b96f-1921cd2bdf2a。
本地原始日志：~/.codex/sessions/2026/09/19/rollout-2026-09-19T01-31-55-01a0b593-27c8-7c43-b96f-1921cd2bdf2a.jsonl；末条 assistant 消息报告一项完成、其余跳过。Linear 当前 SUP-23 = In Progress + ready-review，无 nightly/agent-ready。未发现本次任务的崩溃或 workspace guard 拒绝证据。

1. **首夜范围过窄（已确认）**：前次建单明确只读预检且不继续下游。我在排期时选择了这一限制；夜班遵守了它，不能归因于执行器擅自停工。
2. **吞吐规则矛盾（已确认）**：live automation 第 2 条 at most one；第 6/7 条却要求遇阻塞/失败继续下一个。成功路径没有循环。SUP-17、SUP-15 未执行符合一项上限，却不符合用户希望队列持续推进的目标。
3. **预检与接入混在一个 gate（已确认）**：当前仅一个 Team 被写成不足四 Team 的阻断。真实事实是三个 Team 尚不存在；套餐容量与实际权限仍 unknown。schema/guard 的本地实现不依赖三个 Team 已存在。产品 Team 身份、repo 执行锁、intake 授权和 nightly 授权应分开判断。
4. **验收语义含混（已确认）**：SUP-23 的验收允许 unknown，但又要求 review 决策；夜班交 ready-review 有文字依据。应明确预检调查的完成标准，另把真实接入决策列为 rollout gate，不能自动宣称本次必须 Done。
5. **记录错误（已确认）**：本地 progress 写 nightly 无其它可领取任务，但同一夜班末条消息明确跳过 SUP-17/SUP-15；应区分本任务无后继 ready 与整个项目队列无任务。
6. **恢复/工具健壮性（次要）**：初始无 thread binding 已由当次运行修复；labels 首查误用 teamId 后改成 team。二者未造成最终中断，但应在入口约束参数和绑定。

## 修复顺序与验收

| 步骤 | 动作 | 验收 | 涉及对象 |
|---|---|---|---|
| R1 澄清并验收预检 | 独立复核四产品映射；将已核事实与 unknown 分开；更正不存在 Team 不等于容量不足；依据修订完成标准决定 SUP-23 Done 或保留精确 review 项 | unknown 有来源缺口及后续负责人；不把创建 Team 算入调查完成条件 | SUP-23、三文件 |
| R2 拆开依赖 | SUP-24/25 等本地基础只依赖映射契约；套餐/权限/真实 Team ID 只阻塞实际接入与试点。SUP-26 的接入机制开发也可用 fixture 完成，实际 bootstrap 独立验收 | 本地实现不会因外部未配置而停滞；真实外部写入仍有门 | SUP-24…34 依赖与 specs |
| R3 有界串行队列 | 将 at most one 改为 one at a time；建议每轮最多 3 个切片、45 分钟，任一预算到即停止；每项后重读队列与依赖，阻塞跳过，错误分类，不重复领取同项 | 三条独立 ready 可串行执行；一条 waiting-human 不挡其它；预算到输出 remaining；不承诺单夜完工 | canonical automation-workflows 与 Host live prompt |
| R4 明确解锁授权 | 已授权本地切片在真实前置完成、readiness 通过后可进入下一轮；生产接入/费用/发布等单列门。移除笼统每步都需 human review，也不以 nightly 标签替代授权 | 无新增授权不越界；已有授权无需重复询问；依赖未通过不领 | Chief intake、binding、tickets |
| R5 恢复和状态一致性 | 启动先以 issue 映射恢复正确三文件；选中后及时 running；以准确 team 参数查询；保持任务 checkpoint 与项目摘要可区分；记录 executed/skipped/remaining | 新 session 可恢复；无误判标签缺失；无“还有队列却写无任务” | helper、prompt、三文件 |
| R6 最小回归与观察 | 先用 fixture 验证队列/依赖/预算，再授权执行一个真实本地切片；回读 issue/评论/本地结果；次日观察计划触发 | 区分模拟通过、手动运行、自动触发；无重复领取或跨产品写入 | tests、执行证据 |

## 本轮优化规格与今晚提升条件

1. **身份与锁**：产品配置固定 `productKey → workspace → Team → allowed Projects`；repo 执行配置固定 `canonicalRepoId → root/worktree family`。每个 repo 独立持有 lease；未取得 lease、lease 丢失或旧 owner 未确认停止时，不领取、不写 Linear、不进入试点。
2. **Intake 与授权**：只有显式 tracked intake 才能进入 bootstrap。产品接入、具体 repo 执行、nightly/standing authorization 是三个独立门；默认 manual。folder/Codex project 开关、目录扫描和普通问答都不能自动创建或删除 Team。
3. **Bootstrap 恢复**：按 workspace/name/key 和已保存 ID 先查后建；权限不足、套餐容量未知、命名冲突、登录/MFA 或创建后无法回读时停在 `setup-needed`，不得继续写 Project/Issue。重试先回读，清理仅限本次运行确认产生的临时文件与 lease。
4. **票据更正**：`SUP-25` UUID 以 `3f702e3e...` 为准，`SUP-27` UUID 以 `4a09e47c...` 为准；主 agent 同步前回读完整 UUID。旧 audit 的 `SUP-25 ↔ SUP-26` 循环标注错误，不是真实依赖；LMP-04 只依赖 LMP-02/LMP-03 的契约与 fixture readiness。

### 今晚准备开发切片和条件提升

- 先准备并验证 LMP-02 的 v2 identity/binding fixture、LMP-03 的逐层目标校验和负向 fixture；不需要真实新增 Team。
- LMP-04 可在 LMP-02/03 契约稳定后准备 bootstrap 状态机、已创建 ID 记录和失败恢复测试；Team 创建仍受权限/容量/回读门约束。
- LMP-06 可并行准备 intake、repo 执行和 nightly 授权的语义检查；未通过授权门不得加 `nightly`。
- LMP-07 是 LMP-11 试点硬前置：只有 canonical repo 锁竞争、两个 worktree 互斥、lease 丢失停止和安全恢复证据齐全后，才允许提升 LMP-11。
- 每完成一个本地切片，重新检查依赖、readiness、授权和 repo 锁；满足条件才显式提升下一票。预算耗尽时保留 remaining，不把未执行票标为完成，也不承诺本轮全部交付。

实现顺序：R1/R2 → R3/R4/R5 → LMP-02/LMP-03 → LMP-04/LMP-06 → LMP-05 → LMP-07 → LMP-08 → R6 → LMP-11。队列循环仍按同一仓库串行；在 LMP-07 完成前，现有跨 session 无原子锁风险仍阻断试点和扩大无人值守范围，不能声称 prompt 已保证互斥。失败回退为单切片模式并保留队列，不回滚或删除业务记录。

## Team 创建：Agent 可以承担，Human 不必手点

当前 callable Linear connector 只有 get_team/list_teams，没有创建 Team 的工具。因此“只能使用当前 MCP”时无法直接创建，不代表 Agent 没有其它可用方式。

推荐受控 UI fallback：用户授权产品接入 → Agent 在已登录 Linear 设置中只读确认 workspace、套餐、权限及重名 → 在批准的名称/前缀范围创建 → 用 MCP 回读 Team ID → 写入产品映射 → 继续 Project/issue bootstrap。若创建失败先回读，避免重复。Human 只在登录/MFA、缺少权限、套餐升级/付费或命名冲突无法裁定时介入。页面可用性与当前套餐尚未实测，本轮不承诺创建已能成功。

现有 linear-work-control 规定所有写入经 MCP；要采用 UI fallback，必须在 LMP-04 明确增加“仅 Team bootstrap 的授权 UI 例外”，复用 workspace/目标校验及回读，不默默绕过契约。常规 issue/状态/评论仍走 MCP。

GraphQL/SDK 是另一种工程集成方向，但需要独立获授权的认证及 schema/权限核实，不能复用或提取 connector 内部 token。首版不增加这套基础设施。

官方依据：https://linear.app/docs/teams（创建入口、权限、套餐限制）；https://linear.app/developers/graphql（公开 API 与认证方式）。当前计划额度未知；Team 个数是实际对象数量，不是额度证据。

## 本轮 review 建议

采用 R1–R6；选择“有界串行、最多 3 项/45 分钟”的初始预算；Team 创建采用授权 UI bootstrap fallback。以上是拟实施方案，本轮没有修改生效配置或外部状态。

## 实施记录（2026-09-19）
两名 bounded subagents 分别实现队列 helper/测试与恢复契约；主执行者整合、调整 CLI 路径、复核 SUP-23 并解锁 SUP-24，更新现有 Night/Morning automation（时间/模型保持）。中断续跑补齐多 scope prompt 修订与 live 同步：canonical 夜班 prompt 增补预算全局、每 scope 快照、跨 scope 比较、budget stop 回退、successor 提升、空 scope 语义与 goalIssue.id 汇总；`swf-night-executor` live prompt 经 automation_update 更新并回读一致（night/morning identity 均 True，schedule/model/cwds 保持）。全量校验（只读 subagent）：verify:trio 403 pass / 0 fail、verify:core 531 pass / 0 fail（449+82），三份新测试 17 项全绿。真实 SUP-24 + Done SUP-23 快照通过 queue CLI 选择；这是 live-data dry-run，不是 SUP-24 已执行。SUP-23 预检验收是本轮已完成的真实复核切片；下一班自动执行是否按循环推进仍待观测。
