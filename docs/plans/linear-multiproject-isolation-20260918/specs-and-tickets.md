# 多项目隔离 Specs 与 Tickets

## Project-first policy — 2026-09-21（当前规则）

同一 workspace 内复用稳定 Team，产品/交付流由独立 Project UUID 隔离；本节替代下文旧的一产品一Team、四Team容量门和不迁移历史票建议。当前完整规格见 [Project-first spec](../project-isolation-20260921/spec.md)。SWF 已按 Core、Render、Isolation、Decision 划分Project。新产品先核验root、workspace、共享Team权限与Project ownership marker，再创建/复用独立Project；不自动建Team。夜班授权、root guard和并发锁仍是独立门。SUP25–34后续实施采用此规则；旧内容仅作决策历史，不能作为相反执行指令。


> 已于 2026-09-18 按用户授权创建 Linear 父单 SUP-22，LMP-01–12 对应 SUP-23–34；SUP-23 已验收 Done；SUP-24 已进入 nightly，其余按真实依赖与已有授权推进。没有既定工期或实现完成承诺。任务状态唯一记录在绑定 planning 三文件。

## 规格

| Spec | 必须满足的契约 | 失败语义 |
|---|---|---|
| S1 产品身份 | 稳定 productKey + 本机执行根映射 + workspace/team/project ID；名称仅展示 | identity-unknown / ambiguous / root-mismatch，禁止外部写与远程领取 |
| S2 任务路由 | task 与 issue 一对一绑定；跨层 ID 核验；comment/parent 所属验证；创建后回读 | target-drift，保留本地工作，不跟随人工移动 |
| S3 接入 | 首次显式 intake 触发；先查后建；步骤可恢复；重复调用返回同一映射 | setup-needed，禁止默认落到 SUP |
| S4 状态与标签 | workspace 语义标签优先；API 使用 ID；九种状态保留；不删除用户其它标签 | mapping-missing，不能凭相同名字选第一个 |
| S5 执行 | 只领本产品任务；readiness、授权和锁全部通过；canonical repo 串行；首版单 Host | lease-lost / authorization-missing，停止依赖动作 |
| S6 同步 | 本地先写，单 status comment 更新；重试查重；Done 必须通过验证与适用验收 | sync-pending，不丢失本地事实、不伪报完成 |
| S7 监督 | All teams managed 视图，按 Team 分组；聚合展示 stale/unavailable；新产品自动纳入 | 不用空结果冒充健康，不扩大执行授权 |
| S8 兼容 | v1 原有 SWF 显式同步可读；v2 才能进入多产品自动队列；legacy 单主写 | 不静默升级，不强制移动历史 issue |

### 建议 v2 数据形状（待实现；当前 helper 尚不接受）

```json
{
  "schemaVersion": 2,
  "productKey": "sequre",
  "workspaceId": "<verified-id>",
  "teamId": "<verified-id>",
  "allowedProjectIds": ["<verified-id>"],
  "rootIdentity": "<stable-local-registration>",
  "hostProjectId": "<verified-or-null>",
  "executionMode": "manual",
  "labelIds": {"managed": "<verified-id>"},
  "statusIds": {"ready": "<verified-id>"}
}
```

本机目录映射与可迁移配置分离；完整 schema 需枚举必填、可空、禁用、未知字段和凭据拒绝规则。task binding 引用产品身份及配置版本，同时保存 task/issue/project/comment IDs。配置不保存 blockers 或实施进度。所有写入使用预检产出的目标，不由模型重新猜名称。

### 本轮优化边界（2026-09-20）

- **稳定身份与执行互斥分层**：`productKey`、Linear Team、允许的 Project 集合属于产品配置；`canonicalRepoId`、root/worktree 家族和本地 lease 属于 repo 执行配置。多个 repo 可以共享产品 Team，但不得共享 repo 锁；同一 canonical repo/worktree 家族必须先取得锁，才可领取、写入或启动试点。
- **Intake 与授权分层**：显式 tracked intake 才能创建或复用产品映射；产品接入授权不等于 repo 执行授权，也不等于 nightly/standing authorization。默认 `manual`。folder、Codex project 或目录发现事件不得自动创建或删除 Team；删除、归档和迁移 Team 均不属于自动 bootstrap。
- **Bootstrap 失败恢复**：每一步先查后建并保存已回读 ID；权限不足、套餐容量未知、命名冲突、登录/MFA 或创建后无法回读时进入 `setup-needed`，停止后续 Project/Issue 写入。重试先按 workspace/name/key 和已保存 ID 回读，确认不存在后才继续；不得靠重名猜测或重复创建。清理只删除本次运行产生且已确认归属的临时文件/lease，不删除 Linear 对象。
- **试点硬前置**：LMP-07 的 canonical repo 原子锁、lease 丢失停止和双进程竞争验证，是 LMP-11 新产品试点的硬前置。没有锁证据只能继续 fixture/本地验证，不能扩大无人值守或真实多产品执行。

### 本轮 ticket 身份与依赖更正

- `SUP-25`（LMP-03）Linear issue UUID 以 `3f702e3e...` 为准；`SUP-27`（LMP-05）Linear issue UUID 以 `4a09e47c...` 为准。主 agent 同步 Linear 前须用当前 workspace 回读完整 UUID、identifier、Team 和 Project。
- 旧 audit 所称 `SUP-25 ↔ SUP-26` 循环是错误标注，不是真实依赖。按本规格，LMP-04（SUP-26）只依赖 LMP-02/LMP-03 的可复用契约与 fixture readiness；不得把该旧循环作为阻塞理由。若 Linear 仍保留循环关系，先读回并按本更正处理，禁止据此提升或跳过其它票。

### LMP-02…12 供主 agent 同步 Linear 的规格增补

| Ticket | 同步用短句 |
|---|---|
| LMP-02 / SUP-24 | 产品 Team/Project 配置与 repo/root binding 分离；复制 binding、未知版本、重复 productKey 或 root 不匹配必须 fail closed；保留 v1 读取。 |
| LMP-03 / SUP-25 | 写入前后核验 root → product → workspace → Team → Project → issue/comment；`SUP-25` UUID 前缀为 `3f702e3e...`；发现 target drift 零后续写入。 |
| LMP-04 / SUP-26 | 显式 intake 才 bootstrap；先查后建、逐步保存 ID；权限/容量/登录/MFA/回读失败进入 `setup-needed`，不继续建 Issue；不因 folder 开关创建或删除 Team。 |
| LMP-05 / SUP-27 | 按各 Team 回读状态与标签 ID，保留旧标签兼容；`SUP-27` UUID 前缀为 `4a09e47c...`；不得按同名对象猜 ID。 |
| LMP-06 / SUP-28 | 产品接入、repo 执行、nightly/standing authorization 分层；默认 manual；接入不自动授予执行权，Chief 不承担跨产品派工。 |
| LMP-07 / SUP-29 | canonical repo/worktree 家族锁是试点硬前置；竞争只允许一个 owner，丢 lease 停止写入，旧 owner 未确认停止不得接管。 |
| LMP-08 / SUP-30 | 本地先写、Linear 后同步；响应丢失先查重；失败可重试且不重复评论；未通过验证不得 Done。 |
| LMP-09 / SUP-31 | 监督聚合按真实产品/Team/Project 查询，显示 stale/unavailable；聚合器只读，不因 folder 或空结果改变业务状态。 |
| LMP-10 / SUP-32 | 每个已授权产品最多一个 execution automation；默认暂停；明确 cwd/binding；不因新建 Codex project 自动启用夜班。 |
| LMP-11 / SUP-33 | 单产品单 repo 试点；必须先通过 LMP-07 锁与恢复证据，再验证串台拒绝、重复 intake、断线恢复和回退。 |
| LMP-12 / SUP-34 | 仅在试点和监督通过后扩展；逐产品取得接入/调度授权；缺少真实触发或失败路径证据保持待验收，不以配置完成关闭。 |

### 全局验收场景

| 场景 | 预期 |
|---|---|
| SeQure issue 被误贴 SUP 的 nightly 标签 | SWF 执行器拒绝，SeQure 仍须自己的授权 |
| 把 SWF binding 复制到 Löffi 根目录 | root/product 映射不符，零 Linear 写入 |
| 人工把 issue 移到另一 Team/Project | 下次恢复或写入前拒绝，显示需重新绑定 |
| 两个进程/两个 worktree 同领一个仓库 | 恰好一个获锁，另一方不执行；过期不能盲目接管 |
| 新产品第二次 intake，首次响应曾丢失 | 回读复用 Team/issue/comment，无重复 |
| 同名不同 ID 的状态/标签 | 使用本产品 ID 映射，保留无关标签 |
| 某产品 Linear 或本地路径不可用 | 该产品 unavailable，其它产品可继续 |
| 用户撤销无人值守授权 | 下次领取拒绝；在运行检查点停止依赖动作 |
| Done 有实现结果但未完成要求的验收 | 不发布 Done |
| 新产品完成接入 | All teams 视图可见，已有产品的 issue 与执行范围不变 |
| v1 恢复以及迁移回退 | 原 SWF 同步可用；不会启用跨产品自动领取 |
| 评论属另一个 issue、issue 在预检后移动 | 拒绝错误评论；回读发现竞态则停止并报 drift |

## Tickets

所有 Owner 均为建议角色，不指派真实人员。实施 tickets 在本次 review 后才进入 ready；外部接入/调度启用须沿用对应授权范围。

### LMP-01 · 冻结产品映射与接入预检

- 优先级：P0；依赖：无；规格：S1/S3。
- Owner（角色）：Chief + Human。
- 范围：核对套餐/权限、四产品根目录、Host ID、Team 名称与前缀；识别已有同名对象。
- 验收：输出已核实 ID 或明确 unknown；Team 缺失与容量 unknown 分开列明，真实接入单独核实；不创建重复 Team。
- 交付：产品映射清单与接入预检结果；review 决策。
- 回退：暂停该能力启用，保留原映射和所有外部对象；若涉及数据迁移先恢复经过核实的旧引用，不删除对象模拟回退。

### LMP-02 · 实现 v2 配置、task binding 与兼容读取

- 优先级：P0；依赖：01；规格：S1/S8。
- Owner（角色）：开发执行者。
- 范围：扩展 helper schema 与 resolver；产品配置和 task binding 分离；兼容 v1 与 legacy 路径；根目录/worktree 身份验证。
- 验收：坏 JSON、未知版本、重复身份、复制根目录均 fail closed；v1 fixture 保持可读；原子写不出现半配置。
- 交付：schema、迁移 dry-run、兼容与错误场景测试。
- 回退：暂停该能力启用，保留原映射和所有外部对象；若涉及数据迁移先恢复经过核实的旧引用，不删除对象模拟回退。

### LMP-03 · 实现逐次目标校验和写入回读协议

- 优先级：P0；依赖：02；规格：S2。
- Owner（角色）：开发执行者。
- 范围：核对 root/product/workspace/team/project/issue/comment；创建与更新分别校验；跨产品父子关系拒绝；处理目标漂移。
- 验收：错误 team/project/comment 零写入；自洽但属于另一产品的 binding 也拒绝；预检后移动可通过回读发现，披露非事务边界。
- 交付：guard helper、连接器调用契约、负向 fixture 与写入证据。
- 回退：暂停该能力启用，保留原映射和所有外部对象；若涉及数据迁移先恢复经过核实的旧引用，不删除对象模拟回退。

### LMP-04 · 实现幂等首次接入流程

- 优先级：P0；依赖：02/03；规格：S3。
- Owner（角色）：Chief 协议维护者。
- 范围：参数化 bootstrap，移除固定 MVP 标题；先查后建；保存步骤 ID；缺 Team 创建能力时提供 UI/人工恢复入口。
- 验收：二次 intake 不重复建对象；断线重试可恢复；未完成 Team 创建不会写 issue；普通问答不触发接入。
- 交付：接入流程、恢复清单、故障注入验证。
- 回退：暂停该能力启用，保留原映射和所有外部对象；若涉及数据迁移先恢复经过核实的旧引用，不删除对象模拟回退。

### LMP-05 · 统一标签与各 Team 状态映射

- 优先级：P1；依赖：02/04；规格：S4/S8。
- Owner（角色）：开发执行者。
- 范围：新增 agent-managed；过渡期读取旧 swf-managed；逐 Team 回读状态 ID；语义标签复用 workspace 级对象。
- 验收：不删除旧标签或其它用户标签；同名标签不误绑定；不覆盖自定义 workflow；所有九种状态有确定映射。
- 交付：迁移预览、ID 映射、现有视图影响清单。
- 回退：暂停该能力启用，保留原映射和所有外部对象；若涉及数据迁移先恢复经过核实的旧引用，不删除对象模拟回退。

### LMP-06 · 明确 Chief intake 与持续授权职责

- 优先级：P0；依赖：02/03；规格：S3/S5。
- Owner（角色）：Chief 协议维护者。
- 范围：改 canonical Chief/Linear 技能并投影；intake 展示归属和授权来源；manual 默认；standing authorization 可选；委派验收语义保留。
- 验收：未授权不加 nightly；已有明确授权不反复征询；接入不等于执行授权；Chief 不变成跨产品调度器。
- 交付：契约改动、必要语义测试、canonical/projection 校验。
- 回退：暂停该能力启用，保留原映射和所有外部对象；若涉及数据迁移先恢复经过核实的旧引用，不删除对象模拟回退。

### LMP-07 · 加入本地原子锁与限定队列

- 优先级：P0；依赖：03/05/06；规格：S5。
- Owner（角色）：开发执行者。
- 范围：按 canonical repo 获取跨进程锁；队列过滤和结果二次核验；owner/恢复验证；各独立 repo 分开执行。
- 验收：双进程竞争仅一个执行；两个 worktree 互斥；丢锁停止；外来 issue 即使标签匹配也拒绝；单 Host 限制明确。
- 交付：竞争测试、恢复测试、执行诊断日志。
- 回退：暂停该能力启用，保留原映射和所有外部对象；若涉及数据迁移先恢复经过核实的旧引用，不删除对象模拟回退。

### LMP-08 · 同步重试、错误可见性与 Done 门

- 优先级：P0；依赖：03/05/07；规格：S6。
- Owner（角色）：开发执行者。
- 范围：保持本地优先；issue/comment 创建响应丢失时先查证；更新唯一 comment；保留同步失败与可重试信息。
- 验收：失败不丢本地状态、不重复评论；未验收不 Done；无 Linear 时可通过获授权 Host 渠道报告；无通道时明确仅本地可见。
- 交付：恢复与幂等测试、通知失败边界证据。
- 回退：暂停该能力启用，保留原映射和所有外部对象；若涉及数据迁移先恢复经过核实的旧引用，不删除对象模拟回退。

### LMP-09 · 统一 Human 视图与只读聚合

- 优先级：P1；依赖：05/08；规格：S7。
- Owner（角色）：监督流程维护者。
- 范围：复用现有视图；配置 All teams managed 过滤与 Team 分组；统一摘要按已注册产品查询，包含 stale/unknown。
- 验收：新产品无需改 team 白名单即可可见；API 聚合按真实 ID；一次产品失败不漏报；聚合器零业务状态写入。
- 交付：四入口配置、UI 截图与查询覆盖证明。
- 回退：暂停该能力启用，保留原映射和所有外部对象；若涉及数据迁移先恢复经过核实的旧引用，不删除对象模拟回退。

### LMP-10 · 产品自动化模板与调度接入

- 优先级：P1；依赖：06/07/08/09；规格：S5/S7。
- Owner（角色）：Host 自动化配置者。
- 范围：每个已授权产品一个执行入口；按需全局早报；创建默认暂停；指定 Host project/cwd/config；接入记录可重建。
- 验收：不会因新建项目自动启用夜班；产品 A automation 不能操作 B；无变化不通知；既有 SWF 早报在替代验证前保留。
- 交付：工具创建/更新回读、计划与实际运行区别记录。
- 回退：暂停该能力启用，保留原映射和所有外部对象；若涉及数据迁移先恢复经过核实的旧引用，不删除对象模拟回退。

### LMP-11 · SWF 兼容迁移与一个新产品试点

- 优先级：P0；依赖：04/05/06/07/08；规格：S1–S8。
- Owner（角色）：试点执行者 + 独立评审者。
- 范围：保留 SUP 原对象；试点一个经确认的新产品；跑正确路由与串台反例、断线恢复、重复 intake。
- 验收：SWF 历史 ID 不变；试点只写目标 Team；反例全部拒绝；用户可从视图定位产品/任务/下一步；回退演练通过。
- 交付：端到端报告、迁移前后对照、review 门。
- 回退：暂停该能力启用，保留原映射和所有外部对象；若涉及数据迁移先恢复经过核实的旧引用，不删除对象模拟回退。

### LMP-12 · 扩展到四产品并完成真实自动化验收

- 优先级：P1；依赖：09/10/11；规格：S1–S8。
- Owner（角色）：Chief + Human。
- 范围：在授权后接入其余产品；验证真实夜班、Human 决策恢复、统一摘要；发布新产品操作指南。
- 验收：四产品归属明确；至少一次真实运行及失败/决策路径证据；无跨产品写入；缺失观测保持待验收，不以配置成功关闭。
- 交付：上线/回退手册、观测证据、最终验收记录。
- 回退：暂停该能力启用，保留原映射和所有外部对象；若涉及数据迁移先恢复经过核实的旧引用，不删除对象模拟回退。

## 实施顺序与批准边界

本地基础：01 → 02 → 03；04 与 06 可在契约稳定后分别开展；05 → 07 → 08；随后 09/10；11 通过后进入 12。01–08 构成最小可靠执行基础，09 提供统一监督，10/12 才启用自动化。LMP-07 的 canonical repo 锁是 LMP-11 试点硬前置；不能先扩散到四产品再补隔离。

本轮 review 应确认产品与 Team 的映射原则、接入触发点、默认执行方式和迁移策略。批准本地实现不自动代表批准升级套餐、启用调度、迁移其它产品数据或发布代码。外部动作按实际已授范围执行，不重复索取已有授权。

## 2026-09-19 恢复修正（现行）
SUP-23 预检以有来源的映射与 unknown 清单验收，不含真实创建 Team。SUP-24–30 的本地实现/fixture/测试在依赖完成且 readiness 通过后可按条件提升到已授权 nightly；今晚只准备开发切片和提升条件，不承诺在 45 分钟内全部完成。所有实际产品接入/费用/调度启用仍按各自目标与授权核验。SUP-26（LMP-04）移除重复预检阻塞，仅依赖 SUP-24/25；旧 audit 记录的 SUP-25/SUP-26 循环不是真实依赖。Team 创建支持协议 §5a 的授权 UI fallback，但不因 folder/Codex project 开关自动创建或删除 Team。夜班预算为同一轮最多 3 个尝试切片、45 分钟；成功和失败均计入预算。

## 已核实容量与试点选择（2026-09-20）
当前UI显示Free plan，官方Free上限2 Teams，已有SUP 1个。LMP11先选SeQure主repo为第二Team试点，完整依赖/权限/root核验后再创建；当前仍仅安排实现与试点步骤。LMP12四Team推广受容量约束：不自动升级，不悄悄把其余产品塞入SUP。第三Team前比较升级与共享Team/独立Project方案，并取得该实际选择；本地开发不因此阻塞。官方：https://linear.app/docs/teams 。
