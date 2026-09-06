# V1.3 完整实施计划

本文件固定设计与包边界；命令/用例见 [verification.md](verification.md)。执行者只读取当前包列出的源文件及直接依赖，避免重新加载整份历史审计。相对路径均以执行 checkout 根目录为基准。

## 1. 基线与不可改变项

当前源码确认：

- `harness/installer/commands/trio.mjs` 的 `status` 调用 `readExactTrioTask`，输出 JSON；`taskReport` 只含 taskId/taskDir/status/terminal/source，缺少恢复内容。
- `harness/trio/core/read.mjs:355` 返回 files/paths/binding；`store.mjs:439` 继续检查精确三文件和当前字节。必须复用该读取链。
- `store.mjs:1087` 的 close 要求 actor=chief、active、accepted/stopped 证据；本版不改变它。
- `harness/trio/projection.mjs` 有六个逻辑入口及五个支持引用。优先修改既有引用，不扩展 manifest。
- `tests/trio/import-boundaries.test.mjs` 有固定文件 inventory。因此摘要放入现有 read.mjs，不新建 core 模块，不改变依赖方向。
- `verify` 当前只支持 stdout，且验证投影，不是全仓测试或页面渲染。修正帮助即可。

**禁止在本版顺手做的事**：routing/store 全面拆分；模型默认值/CLI 模型参数扩展（留 V2.0）；生命周期与权限重写；archive 历史批量转换；新缓存/数据库/常驻进程；自动打开摘要中的路径；新增通知/自动化；技能全量重新 adopt；支付等业务领域内置；版本号或 release 自动推进。

## 2. 固定摘要契约

### 2.1 CLI

当前入口：

```sh
node harness/installer/commands/trio.mjs status --root /absolute/workspace --task exact-task-id --summary
```

规则：

1. `--summary` 是无值布尔开关，默认 false；重复开关、`--summary=true`、`--summary value` 拒绝。
2. 仅 `status` 接受；`next/init/progress/accept/stop/close/archive` 带它均拒绝，exit 1。
3. summary 要求显式 `--task`；不新增 archive 搜索或最近任务猜测。普通 status 的 unique-active 行为不变。
4. 默认 status 的 JSON 形状保持原样；开关启用后仅新增顶层 `summary`。`model` 仍为 null，`readOnly` 为 true，不调用 routing/model/tool/网络。
5. 所有读取/精确三文件/损坏/符号链接等现有错误继续向上传递。摘要不把错误吞掉后返回空成功。
6. stdout 一份 JSON 加换行；错误 stderr/exit1 沿用当前主入口处理。不开 summary 时不计算新摘要。

### 2.2 纯函数

在 `harness/trio/core/read.mjs` 新增导出：

```js
summarizeTrioTask(trio)
```

输入是已经由 `readExactTrioTask` 得到的快照（具有 taskId、status、terminal、files、paths、binding）；函数本身不读写磁盘、不遍历目录、不做模型调用。遇到不是该形状的输入抛 TypeError；仅检查所需字段的类型/存在，复用现有 binding 校验，不再创造另一套路径/生命周期校验。该函数不是绕过 exact reader 的公共 CLI 捷径。

返回固定形状，字段顺序按下例；正常生产例中的 path/hash 由读取快照给出：

```json
{
  "schemaVersion": 1,
  "kind": "recorded-trio-summary",
  "taskId": "example-task",
  "status": "active",
  "terminal": false,
  "requiresSourceReview": true,
  "fields": {
    "goal": {"state": "recorded", "text": "完成导出方案", "source": {"file": "task_plan.md", "path": "/workspace/planning/active/example-task/task_plan.md", "startLine": 3, "endLine": 3, "sha256": "<64 hex>"}, "truncated": false},
    "decisions": {"state": "missing", "text": null, "source": null, "truncated": false},
    "deliverables": {"state": "missing", "text": null, "source": null, "truncated": false},
    "remainingWork": {"state": "missing", "text": null, "source": null, "truncated": false},
    "resumeConditions": {"state": "missing", "text": null, "source": null, "truncated": false}
  }
}
```

每个字段只有 `state/text/source/truncated` 四项。state 只取 `recorded|missing|ambiguous`。missing/ambiguous 均 text/source=null、truncated=false。歧义通过 state 表达，无需另一套 warnings/error code。摘要里的记录不是授权/最新事实/实际交付认证，`requiresSourceReview` 恒为 true。

### 2.3 提取规则——不要自行扩展 Markdown 语法

| 字段 | 唯一源 | 识别方式 |
| --- | --- | --- |
| goal | task_plan.md | 围栏代码块外、列首 `Goal:` 单行；值 trim 后非空 |
| decisions | findings.md | 精确二级标题 `## Current Decisions` 后的内容 |
| deliverables | findings.md | 精确二级标题 `## Deliverables` 后的内容 |
| remainingWork | task_plan.md | 精确二级标题 `## Remaining Work` 后的内容 |
| resumeConditions | task_plan.md | 精确二级标题 `## Resume Conditions` 后的内容 |

- 行号从 1 开始；支持 LF/CRLF。代码围栏仅处理 Markdown 常用反引号或波浪号、最多三空格缩进、至少三个同类字符；同类且长度不短于开启围栏的关闭行结束。未闭合围栏之后内容均视为代码，不解析其中字段。
- 段落从匹配标题下一行开始，到围栏外下一个一级/二级 ATX 标题前结束；三级及更深标题保留在正文中。二级标题识别允许尾随空格，但不支持中文别名、闭合井号、HTML 标题或 setext。规则固定，避免关键词猜测。
- 同一字段有两个或更多有效标签/标题，即 ambiguous；不擅自选最后一个，空值也计入重复次数。只有一个但内容为空，返回 missing。
- 输出正文移除首尾空白行，保留内部换行/列表/原始顺序，不做翻译、排序、状态推断、链接解析或指令执行。goal 的 text 取冒号后 trim 值。
- source startLine/endLine 指向未截断的非空原始内容范围；goal 指向所在行。hash 引用对应整个源文件的 binding sha256，便于发现后来修改。
- 每字段最多 **2,000 Unicode code points**。超过时取前 2,000、truncated=true，不追加冒充原文的省略号；source 仍指向完整原始范围。测试覆盖 emoji 边界。
- 全部缺失仍返回摘要，加上现有 task/source 路径供执行者回源；不扫描所有聊天历史，也不制造虚假恢复决定。
- progress.md 不新增语义解析。其已验证快照依旧属于 Trio，正常恢复需读 progress 中最新事实；本版不复刻 store 的私有事件解析器。

### 2.4 持久化写法与兼容性

这些是三文件内的**可选栏目**，不是额外文件，不是强制迁移。未来执行者在真实里程碑更新有关栏目，当前决定保留最新有效取舍；旧决定和原因仍在既有 findings/progress 中留痕。

```markdown
# Task Plan
Goal: 完成交易导出审阅稿
## Current State
Status: active
Archive Eligible: no
Close Reason:
## Remaining Work
- 核对筛选条件是否完整。
## Resume Conditions
- 延续已批准的只读分析范围；输出草稿，不更新外部文档。
```

```markdown
# Findings
## Current Decisions
- 采用抽屉方案；取消单独的时区选择。
## Deliverables
- 候选：docs/export-draft.md；本地已生成，尚未进行页面检查。
```

只增补短约定，不修改初始化模板；没有必要写恢复栏目时不添加。不得把例子的权限决定作为其他任务的授权。普通 quick 任务不为使用 summary 创建 Trio。旧任务缺栏目时正常读取，其 lifecycle 行为仍由现有实现决定。

## 3. 实施包

**阶段与写入责任**：下面 E0–E8 固定实施步骤与责任边界；本轮已按这些步骤完成到 E8，当前实现、证据和 Chief 接受由 `planning/active/swf-v13-implementation-20260906-exec/` 绑定。主执行者负责三文件的里程碑更新与绑定：派单前冻结 → worker只读与产出候选 → 主执行者验收 → 更新三文件 → 为下一包重绑。worker不能自行解除冻结。主执行者独立直接执行时可按既有direct规则回写，不要求新建固定Chief角色。

每包的业务/源码写集与证据写集分开：主执行者在派单前创建 `.harness/verification/v1.3/<run-id>/<E编号>/`，并把该精确目录加入该worker allowed writes；worker只写自己的证据目录。R1/R2的测试Trio与draft全部属于隔离fixture，不能拿fixture的授权修改真实任务权威。

**唯一评估目录**：`tests/evals/v13-reliable-completion/`。只有本文件和 verification.md 定义实施要求；忽略目录的 test-map.md 是调查候选建议，不是另一个实施spec。固定六个主场景加一个必测交付变体，共七个执行记录；schema中的caseId仍为六个主ID，H2的scenarioVariant区分default/delivery。无需新增自有runner/evaluator。

所有包都遵循 E0 基线，写集只允许表中路径。`新增` 路径表示本版新增时的设计边界；已执行路径以当前差异和验证证据为准，其他文件不存在或接口已变则返回差异证据，不扩大扫描/重写。

### E0：建立可恢复的执行基线（Luna high，已执行）

**读**：本计划、当前 Trio、`git status --short`、HEAD、package.json。**写**：绑定的三文件及 `.harness/verification/v1.3/<run-id>/` 证据。

步骤：

1. 获得后续实施授权时绑定一个实施 Trio，记录本计划版本/哈希；本轮规划 Trio 不假装代码已开工。用户没有指定新任务时，可由同一主执行者恢复并受控重新绑定当前 Trio。
2. 记录 `git rev-parse HEAD`、`git status --short`、`node --version`、包版本。为每个包的 allowed paths 记录存在/缺失和 SHA256，包含未跟踪文件；派单前冻结三文件 SHA256。**HEAD 一致不代表工作区字节一致。**
3. 当前已脏：README.md、homepage/UX-TOKENS.md、旧 roadmap-backlog Trio、scripts/adopt-global-skills.mjs、tests/installer/global-adoption.test.mjs；未跟踪包括 show-me、docs/research、插件/报告/lockfile 等。按现场 status 更新清单。README 的既有增量必须保留，其他无关改动不纳入本版补丁。
4. 默认当前 checkout 串行执行，按路径冻结，避免 worktree 丢失未提交 show-me 与文档依赖。若 Host 提供隔离 checkout，先显式移交所需基线字节并验证哈希，不能只 checkout HEAD。
5. 运行 V0 的小范围基线命令，记录退出码及失败名称。已有失败不自动授权修复；区分计划影响与现有问题。不要在 E0 跑全部 UI 构建或刷新上游。

**完成**：当前包写集、基线、执行 Trio、测试前态可追溯。若同范围有另一个 worker 在写，先串行化，不修改对方文件。

### E1：冻结行为案例与判分说明（Luna high）

**写集（新增）**：`tests/evals/v13-reliable-completion/scenarios.json`、`tests/evals/v13-reliable-completion/README.md`。

1. 按 verification.md 的 Q1/Q2/R1/R2/H1/H2 和 H2-delivery 变体写去敏输入、预置文件/消息、必需动作、禁止动作、断言、来源案例编号。
2. JSON 顶层 `schemaVersion:1`、`cases:[]`；每项固定 `id,scenarioVariant,prompt,setup,expected,forbidden,evidenceRequired`。字段为字符串或字符串数组（id/scenarioVariant/prompt 字符串，其余字符串数组）；id只取Q1/Q2/R1/R2/H1/H2，scenarioVariant默认default，H2另有delivery；组合唯一，共七条。
3. README 固定判分、人工观察字段、模型请求/实际证据区别；不调用 API、不写 evaluator 分数捷径、不导入私人日志。
4. 在 E3/E5 修改前冻结哈希；主执行者以后只可修正已证明错误的案例并记录原因，不能为让实现通过而缩小要求。2026-09-06 的 H1 修正属于已记录的架构纠偏：原案例错误地把 opt-in strict-visible Host 可用性设为普通版本门槛，修正后必须重跑，旧 unavailable 不计为 pass。

**完成**：七条记录可解析、输入具体、无真实商业信息；参考标准足以判结果。纯数据/文档不造 RED。

### E2：修正 CLI 帮助（Luna high）

**写集**：`harness/installer/commands/harness.mjs`、`harness/installer/commands/verify.mjs`。

1. 顶层 trio 描述使用 `Inspect a Trio, plan its next action, or explicitly write its lifecycle`；不能再统称只读。现有 commands.test.mjs 对整个命令块禁用字面 `status`（不仅命令名），本次用上述措辞保留该测试，不顺手改测试范围。
2. 顶层 verify 描述改为校验投影同步、stdout 报告。verify 子帮助只列 `--output=stdout`，说明不是 test suite/rendering proof。
3. 保持 parser、调用顺序和运行行为不变。不为帮助新增目录输出。
4. 跑 V1 三条帮助命令，对照既有支持参数；这是文案修正，不新增仅匹配字符串的测试。

**完成**：帮助与源码当前行为一致；diff 仅预定文案。**依赖**：E0；可与 E3 并行。

### E3：实现确定性恢复摘要（Terra high 或 Luna high）

**写集**：`harness/trio/core/read.mjs`、`tests/trio/read.test.mjs`。

1. 先把 verification.md S01–S12 的行为用例加到现有 read.test 文件；复用既有临时目录和 readTrioTask fixture 方法，不造外部 mock SDK。
2. 跑 V2，确认新导出/行为缺失造成 RED；不要把依赖缺失、拼错路径或现有失败当 RED。
3. 在 read.mjs 增加纯函数及局部私有行扫描 helper，按 2.2/2.3 实现。不得引入新 npm 包、fs 写操作或生命周期依赖。
4. 跑 V2 GREEN、现有 read/recovery/import-boundaries，检查默认 reader 输出未改变。
5. 复核大字段截断、围栏、重复字段与来源行号；避免只测试快乐路径。

**完成**：S01–S12 通过、原 reader 合同保留；没有第四文件。**依赖**：E0/E1；可与 E2 并行。

### E4：接入只读 CLI（Terra high 或 Luna high）

**写集**：`harness/installer/commands/trio.mjs`、`tests/trio/command-read.test.mjs`。

1. 添加 C01–C08 用例；先验证新选项被拒绝等真正 RED。
2. parseTrioArgs 增加 summary:false 和单独的 --summary 分支；做 duplicate、command=status、explicit task 检查。其他错误/参数行为不顺手调整。
3. import summarizeTrioTask；只在 status+summary、readExactTrioTask 成功后调用，报告新增顶层 summary。
4. 不改变 taskReport，不向 write/next/default status 注入 summary；不调用模型选择。
5. 帮助补新选项、只读、显式任务和源记录性质；运行 V3 与真正 CLI 子进程 stdout 验证。

**完成**：C01–C08、当前 command-read/recovery 测试通过；目录快照证明无写入。**依赖**：E2/E3，禁止和 E2 并发改 CLI。

### E5：恢复与交付方法（Luna high）

**写集**：`harness/trio/skill/references/execution.md`、`harness/trio/capabilities/dev/SKILL.md`、`harness/trio/capabilities/office/SKILL.md`、`tests/trio/recovery.test.mjs`、`tests/trio/dev-capability.test.mjs`、`tests/trio/office-capability.test.mjs`。

1. execution 追加短段：tracked 恢复先读绑定三文件；已存在显式 task 时可用 summary 导航；缺失/歧义/截断回源；同范围有效授权继续复用；冻结期间不能由 helper 改 Trio。
2. 同段说明可选栏目写法，或直接引用仓库操作文档（E6）；不可假设安装后的技能能访问仓库 docs，必要的栏目名与边界必须留在这个既有支持引用内。
3. dev/office 各补短交付约定：结果路径、核验范围、未完项；generated/opened/rendered/accepted/delivered 各自举证。`queued` 不等于用户看到，模型自述不等于 Host 认证；实际文件不存在不返回“已完成”链接。
4. 说明 direct 完成可依据自身验证；CLI close 是特定生命周期操作，委派候选仍需接受。保留既有人类/Host 门，不写所有任务统一审批。
5. 用 T01–T05 及七条真实模型回放检查决策意义。沿用现有 contract 测试风格，只锁定必要不变量，不增加字数/整段字符串快照。
6. 新措辞从 canonical source 投影；禁止只改 `.agents/skills` 或 `~/.agents/skills`。本包不新增 support 文件/manifest 项，不修改模板强迫所有任务填栏目。

**完成**：规范可在安装环境独立理解，语义检查通过，六个入口/五个支持引用库存不变。**依赖**：E4；E1 的实际回放留 E7。

### E6：产品叙述与旧规划处置（Luna high）

**写集**：`README.md`、`PRODUCT.md`、`docs/roadmap.md`、`docs/backlog.md`、`docs/architecture.md`、`docs/trio-v2/human-usage.md`、新增 `docs/trio-recovery.md`。

1. README/PRODUCT 将当前 Owner 使用目的、quick/tracked 与 Host 分工对齐；保留 prior show-me 段落。不宣称已证明一般市场/跨 Host 兼容/成本收益。
2. 新增 trio-recovery.md：三文件可选栏目、summary命令及完整示例、missing/ambiguous/truncated处置、旧任务无需迁移、direct完成vsCLIclose、交付词汇。不得写自动归档/重新授权流程。
3. human-usage 的“当前工作方式”增加恢复入口链接和显式 task 示例，严格治理的底层章节保持原范围；architecture 只更新新 summary 的读取接缝与准确包装/执行边界，不改架构图制造不存在组件。
4. roadmap 顶部转成 1.3 当前实施线，链接本包；1.4/2.0 保留 proposed。将旧1.0.11–1.0.13规划放在“历史计划”下，明确不是当前执行指令；不把旧编号自动标成全部实现。
5. backlog 保留原条目 ID 和内容，增加下表 disposition 与证据链接；既有 `Status` 若无独立完成依据不写 done。需要新维度时使用 `V1.3 disposition:`，并在头部说明仅是归类，不是任务执行状态。

| 条目 | 固定处置 |
| --- | --- |
| KER-001 | deferred：本版不全面拆 sync；只修本计划确认问题 |
| KER-002 | carried into E1/E7：本版真实任务证明，不能提前写 done |
| GOV-001 | superseded-in-scope：以现行轻量契约为准；旧 profile 默认不是恢复依据 |
| GOV-002 | carried into E7/E8 的可发现证据；不新建常驻报表服务 |
| REC-001/002 | scope-replaced：现有 Trio 内恢复/完成证据；不新增第四权威、不迁移历史 |
| REC-003 | carried into E6 的来源/实现/验证边界说明 |
| UPD-001 | retained-deferred：不启动上游刷新 |
| OFFICE-001 | V1.4 proposed：本版只补交付边界 |
| MCP-001/ADOPT-001/CDX-001至CDX-011 | retained-deferred：不据本版扩建外部能力；原已完成证据保留 |

6. 链接本计划与研究结论，不把 docs/research 原始审计改写为新事实。检查引用与命令。

**完成**：当前入口清楚；旧条目去向明确且无伪造完成状态；E6无文案镜像测试。**依赖**：E4/E5。

### E7：集成、投影与行为回放（Luna high 主执行；Terra high 仅修有界失败）

**写集**：相关失败只能返回其所属 E2–E6 包写集；`tests/evals/v13-reliable-completion/README.md` 可补实际执行说明；结果放 `.harness/verification/v1.3/<run-id>/`，Trio只引用。

1. 固定当前所有相关字节，跑 V5 集成组。新增测试已加到现有测试文件，因此无需改 package.json 的固定 verify:trio 清单。
2. 按 V6 在一次性目标验证投影/包装；不把一次性夹具的成功称为全局采用。现有全局源基线不一致单独归类，不用强制接管解决。
3. 按 verification.md 的真实 Host 回放步骤完成六场景+变体；H1 使用普通 default/native continuation，strict-visible 兼容行为由确定性 routing tests 证明。只使用 Terra/Luna，不将预先填入的期望输出当模型观察结果。
4. 一次全套必要回归；后续仅因变化/失败重跑受影响部分。禁止每包跑 verify:all/refresh。

**完成**：每项有源哈希、命令、退出码、计数、错误、回放来源；缺测如实保留。**依赖**：E1–E6。

### E8：独立审阅、验收与后续交接（Luna high）

**写集**：绑定 Trio 与证据目录；必要修复回所属包。reviewer 不直接越过 allowed paths 扩写代码。

1. 固定 diff，分别作 Standards（接缝/安全/兼容）与 Spec（本计划接口/场景/非目标）审阅，检查同类参数解析、读取入口及投影说明。
2. 确认没有新增默认工作步骤、解析器推断授权、摘要执行链接、缺失证据冒充成功等问题。
3. `git diff --check`；列每个包的 RED/GREEN 或纯文案检查、实际Host回放证据与未验证项。修复后只重跑受影响验证。
4. Chief/主执行者接受候选并回写 Trio；“执行者”“Chief”是责任，不绑定 Astra。所有剩余 blockers 必须有具体恢复条件。
5. 此时交付代码候选。若后续要求全局采用/PR/发布，另按已有授权进行目标锁定、投影、测试和审阅，不能由本计划自动触发。本切片首次接受时包版本仍为 1.2.0；后续独立 release Trio 已将当前发布候选定为 1.3.0。

## 4. 停止、修复与恢复

- 普通测试失败：在本包范围内修复并重跑。不能改断言遮盖要求。
- 包内连续两次修复仍失败，或需要改 store/lifecycle/额外module/授权语义：输出最小复现、失败用例、预期/实际和建议差异给主执行者。主执行者可以用 Luna/Terra 再拆包；不自动升级 Astra，不直接丢给用户开放式架构题。
- baseline/Trio hash 改变：先确认改动归属，主执行者受控 rebind 后续接同一包；无关路径变化无需冻结全仓。
- 本计划执行时对 strict-visible 的判断保留为历史验收语境；后续 Root visible-worker maintenance slice 已将 `visible_worker_required` 退役为固定迁移 blocker。当前行为以 [visible-worker contract](../visible-worker-contract/README.md) 为准，不恢复 Host bridge，也不静默回退到 native。
- 回滚按包撤销本包 diff；保留 prior 用户/worker变更，不用 reset --hard/git clean。新摘要失败可暂不启用 --summary，默认路径必须继续工作。没有历史迁移，所以无需批量回滚旧Trio。
