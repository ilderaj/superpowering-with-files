# V1.4 实现计划

本文件保留可供后续 Sol/Luna 重放的最小变更契约。2026-09-07 已按该写集完成 source/package 与 semantic candidate；下列 `NEW` 和 `EXISTING` 标记是实施前 packet 的冻结分类，当前结果与未满足门槛见 [README](README.md)。

## 1. 基线、接缝和非目标

规划时基线为 `ca42a06638408a253e93cfb57c05ae6482e795b7`。实现者开始前必须确认 `HEAD`、三份 authority hash、当前 `git status --short` 和以下既有源文件 hash；dirty path 不能被覆盖。

| 类型 | 路径 | 规划时 hash/事实 | 用途 |
| --- | --- | --- | --- |
| EXISTING | `harness/trio/capabilities/office/SKILL.md` | `b66e3bfaf862ca475daa03422db0d77c33bec76250de6c458676b446d0998838` | Office 主契约；只补两个本地链接 |
| EXISTING | `harness/trio/projection.mjs` | `2bf9534ff1e8ddd641afe42b26d4b1de5da981dbfcd4fe6a6d653d9eb707b704` | 六个 primary 与 supporting source list |
| EXISTING | `tests/trio/office-capability.test.mjs` | `2b084ceba5f78523e78da7e749b26e3fc36a912c77d511985e7ecdf57bc44401` | Office 文件、链接和四类 native artifact 契约 |
| EXISTING | `tests/trio/projection.test.mjs` | `a3be5cbc3bd2b9f00b8c712ff1ee659e4fde8b9818ae2737e7c8c332c21b435c` | projection surface/target/ownership 契约 |
| EXISTING | `packages/plugin-kit/src/platform-contracts.mjs` | `601fa74933d722dbd8a76cf2891a8f527df63ce673540eb49f5d5cbde43062fe` | 从 projection 动态打包，不新建 registry |
| EXISTING | `scripts/verify-trio-office-artifacts.mjs` | 当前既有 verifier | 复用 unzip/soffice/pdfinfo/pdftoppm/pdftotext |
| EXISTING | `tests/fixtures/trio-v2/office/*` | 四类固定夹具 | 复用文档、PDF、PPTX、XLSX |
| NEW | `harness/trio/capabilities/office/references/source-backed-work.md` | 待新增 | 来源到事实/决策/中文总结/handoff 的按需参考 |
| NEW | `harness/trio/capabilities/office/references/artifact-and-delivery.md` | 待新增 | native artifact 验收和交付证据参考 |
| NEW | `tests/evals/v14-cross-domain/README.md` | 待新增 | 语义回放规则和 O/W 映射 |
| NEW | `tests/evals/v14-cross-domain/scenarios.json` | 待新增 | 固定输入、期望字段、数字和禁用断言 |
| NEW | `tests/evals/v14-cross-domain-contract.test.mjs` | 待新增 | 只验证 scenario/result contract，不模拟 O4 |

可能需要同步更新的 EXISTING 文档/测试：`tests/plugin-kit/matt-skills-package-contract.test.mjs`（当前对 supporting surface 数量有固定断言）、`tests/plugin-kit/platform-contracts.test.mjs`、`tests/plugin-kit/build-plugin.test.mjs`、`tests/trio/install-upgrade.test.mjs`、`docs/trio-v2/cutover.md`、`docs/install/codex.md`。只有既有断言或文档的 5 条 supporting 事实确实受影响时才改它们；不改 `plugins/dsh/**`。

非目标：新增 capability 或 skill identity；改 root routing；增加 worker bridge；接入 DSH dev/tests；创建 renderer/scheduler/auth/state；模拟 automation；规划阶段使用真实外部输入；未来pilot按精确授权绑定；修改 V2.0 主线；全局安装/adoption；提交、推送、合并。

## 2. 固定架构和参考接口

### 2.1 六个 primary surface 不变

`harness/trio/projection.mjs` 的 `SURFACES` 必须仍严格包含 `entry`、`trio`、`dev`、`office`、`safety`、`chiefops` 六项。Office 参考只进入 `SUPPORT_SURFACES`，不会成为新 capability、registry entry 或独立路由目标。

在现有 supporting list 中加入以下两项，顺序固定为追加在现有五项之后：先source-backed-work，再artifact-and-delivery；测试锁定该顺序：

```js
['office', 'source-backed-work.md'],
['office', 'artifact-and-delivery.md'],
```

实现结果应使 `SUPPORT_SURFACES` 从 5 项变为 7 项，`PROJECTION_SURFACES` 从 11 项变为 13 项。若实际源码的表结构不同，保持等价的 source/target/owner 语义，不扩张 primary 数量。

### 2.2 `source-backed-work.md` 内容 contract

文件必须是按需读取的 Office supporting reference，并包含以下固定标题或等价的机器可检索标签：

```md
# Source-backed work
## When to load
## Input contract
## Evidence classification
## Output contract
## Conflict and pending rules
## Stop conditions
```

固定语义：

- 输入记录 `sourceRef`、来源类型、获取时间/有效范围、原文位置和可验证字段；没有来源日期时写 `unknown`，不补猜测。
- 输出至少区分 `fact`、`assumption`、`conflict`、`recommendation`、`pending`；旧文档要求不得直接写成当前事实。
- 中文总结必须按“事实—动作—负责人—输出—期限/风险—来源”组织；未知项使用 `证据不足，待确认`。
- recommendation 必须说明依据和未决条件；不能把建议升级成已批准决策。
- 外部动作依用户已有授权和Host门禁执行；不伪造 source、recipient、automation 或 delivery evidence。
- 来源冲突、权限失效、范围不明时保留冲突，仅暂停依赖未决事实的部分；外部动作沿用同范围有效授权，无授权才暂停该动作。

### 2.3 `artifact-and-delivery.md` 内容 contract

文件必须包含：

```md
# Artifact and delivery
## When to load
## Native artifact checks
## Numeric and formula checks
## Language, link, and accessibility checks
## Delivery evidence states
## O4 live gate
## Stop and rollback
```

固定语义：

- 优先调用既有 Host native open/parse/render；不创建 renderer。
- spreadsheet 必须分别核验输入、公式、cached result、number format、错误和汇总；不能只看应用显示值。
- Office verifier 的四个现有夹具继续作为基础回归；全量新产物检查分页/共享样式/母版/公式依赖。
- `generated`、`opened`、`rendered`、`accepted`、`delivered` 是互不替代的状态。
- O4 只有授权 Host automation 已创建/执行，并且 recipient-visible evidence 可回读时才 pass；queued/local/generated 均不足。
- 无授权或缺真实输入时，只将 O4/pilot 标记 `blocked` 或 `unknown`，不造一个成功替身。

## 3. 结构化 evidence 接口

每个 O/D 案例和 W 工作流都使用同一份记录，避免八份重复 artifact：

```json
{
  "schemaVersion": "v1.4",
  "runId": "<executor-generated-unique-id>",
  "hostRunRef": "<Host reference or unknown>",
  "caseId": "O1|O2|O3|O4|D1",
  "workflowIds": ["W1", "W2", "W3"],
  "variant": "deterministic-fixture|semantic-replay|pilot",
  "requestedModel": "main/gpt-5.6-sol|main/gpt-5.6-luna|unknown",
  "requestedEffort": "high|unknown",
  "actualModelEvidence": "<authenticated Host evidence or unknown>",
  "hostEvidenceRef": "<Host artifact/event reference or unknown>",
  "sourceRefs": [{"ref": "<stable ref>", "range": "<date/range/unknown>"}],
  "artifactRefs": [{"pathOrHostRef": "<ref>", "state": "generated|opened|rendered|accepted|delivered"}],
  "result": "pass|fail|blocked|unknown",
  "limitations": ["<explicit boundary>"],
  "usage": {"freshTokens": "unknown", "cachedTokens": "unknown", "billing": "unknown"},
  "attempt": 1,
  "retries": 0,
  "delivery": {"authorized": "yes|no|unknown", "recipientVisible": "yes|no|unknown"},
  "liveGateEvidence": null
}
```

要求：上述字段全部必需；`actualModelEvidence`、`usage`、`delivery` 不能从请求字段或 prompt 长度推断；`unknown` 是合法结果。每次 attempt 独立保存 result，`retries=attempt-1`；单个 case 最多一次针对失败原因的定点重试，保留第一次结果。`tests/evals/v14-cross-domain/result-contract.mjs` 是记录形状的可执行校验器。非 O4 记录使用 `liveGateEvidence=null`；O4 记录必须分别给出 source、schedule、recipient、authorization、executionEvent、recipientVisible 的 state/ref。O4 的 `result=pass` 必须同时满足这六项均为 `yes` 且 ref 非 unknown、`authorized=yes`、`recipientVisible=yes`、非 unknown 的 Host execution evidence 和 `delivered` artifact state。

## 4. 有界实现分片

### V14-0：冻结输入和写集

**读取**：三份 authority、roadmap、`git rev-parse HEAD`、`git status --short`、上表源文件、V1.3 plan format。

**写入**：未来主执行者创建/恢复当次实施Trio；helper仅写handoff指定的证据目录，不改Trio。本次规划Trio完成不等于实施启动。

**依赖**：基线与 authority hash 一致；NEW路径若已存在先核对是否本任务先前完成，恢复时复用匹配证据，不要求重复创建；dirty path 已列入 packet。

**过程**：计算所有允许源文件 hash；生成 packet digest；把 existing/new path、read/write set、stop、rollback 写入 handoff；重读计划并做一致性检查。

**停止**：基线、authority、source hash、路径白名单或 primary surface 数量不一致。

**回滚**：不恢复或覆盖任何 dirty path；删除本分片新建的临时 evidence，仅在它属于本次 packet 且没有被后续分片引用时执行。

### V14-1：Office 按需参考

**读取**：`harness/trio/capabilities/office/SKILL.md`、Office fixtures/verifier、既有 projection refs。

**写入**：NEW `source-backed-work.md`、NEW `artifact-and-delivery.md`；EXISTING Office `SKILL.md` 只增加两个相对链接。

**依赖**：参考内容符合第 2 节 contract；链接目标在源码树存在；不改变 Office 主能力名、route 或 Host ownership。

**过程**：先写固定标题和边界，再加入两个相对链接；执行 `OFF-REF` reachability 检查；对中文术语、`unknown`、delivery 状态和 O4 gate 做语义审查。

**停止**：出现新 skill/capability、registry、外部写入动作、mock success、模型 fallback 或未定义的默认 role queue。

**回滚**：删除两个 NEW reference，恢复 Office 主文件到 packet 前 hash；不触碰其他 dirty path。

### V14-2：projection、安装和打包传播

**读取**：`harness/trio/projection.mjs`、`harness/installer/commands/install.mjs`、`harness/installer/commands/sync.mjs`及其backup依赖、`packages/plugin-kit/src/platform-contracts.mjs`、projection/install/plugin tests。

**写入**：EXISTING `harness/trio/projection.mjs` 加两个 Office support descriptors；按测试所需更新相关断言和 supporting 数量；必要时更新列出的 V2 文档中的“5”到“7”。不改 installer 算法，不新增 registry。

**依赖**：V14-1 两个源文件稳定；source map、Codex projection、manual projection、backup、package manifest 会共享同一列表。

**过程**：修改 source list；验证 six primary 不变、supporting 为 7、projection 为 13、target path 与 owner 一致；执行安装/升级/backup/package tests；检查 projection source list 变更只影响必要文件。

**停止**：安装器要求新命令、动态 source map 不能传播、supporting 数量出现第二套事实、或触碰 DSH/global target。

**回滚**：恢复 projection source list 和受影响测试/文档；删除新 projection/backup/package 输出；保留用户已有安装内容，不做未经授权的全局清理。

### V14-3：确定性夹具和 contract metadata

**读取**：`tests/fixtures/trio-v2/office/*`、`scripts/verify-trio-office-artifacts.mjs`、V1.4 O/W 规则。

**写入**：NEW `tests/evals/v14-cross-domain/README.md`、`tests/evals/v14-cross-domain/scenarios.json`、`tests/evals/v14-cross-domain-contract.test.mjs`；必要时只新增脱敏文本夹具。复用既有四类 Office 夹具，不复制八份 artifact。

**依赖**：scenario schema 固定；O4 明确为 live-only，contract test 不制造 automation 或 recipient evidence。

**过程**：为 O1/O2/O3/D1 写确定性输入与断言；为 O4 只写缺输入时的 `blocked` schema；锁定 spreadsheet 数值（见 verification）；运行既有 verifier 和 contract test。

**停止**：用 mock delivery 使 O4 通过、把 shadow result 当 live proof、或通过修改期望值绕过真实失败。

**回滚**：删除本分片新增的 scenario/contract files 和脱敏夹具；保留已由其他分片引用的既有 fixture。

### V14-4：语义 model replay

**读取**：V14-3 scenario、Host 可见 artifact、既有 Office verifier、当前运行时证据。

**写入**：只写每次 run 的 evidence result；不写 skill source、registry、Host auth/state 或外部系统。

**依赖**：Host能完成实际任务且source/output可绑定；actual模型无认证时记录unknown，不阻断不依赖型号归因的内容验收；无真实外部输入时只做 deterministic/semantic fixture replay。

**过程**：按 O1、O2、O3、D1 各执行一次 fresh Host run；仅允许一次针对失败原因的定点重试；保存请求模型、实际模型证据、source refs、artifact states、limitations；O3 运行 Office verifier。

**停止**：Host所需能力不可用、packet/hash漂移、来源缺失、输出越过范围；记录 `unknown`/`blocked`，不 Astra fallback。

**回滚**：保留全部已执行的成功/失败记录；仅清理不含运行证据的未用临时目录，不把重试覆盖第一次结果。

### V14-5：三工作流和 O4 pilot

**读取**：O/D evidence、Host automation API/界面返回、授权信息、recipient-visible 回读。

**写入**：Host 负责 automation、notification 和外部写入；本计划执行者只写 evidence index/回读记录。没有授权时不创建 automation。

**依赖**：W1/W2/W3 各有真实触发和可回读目标；O4 有明确 source、schedule、recipient 和权限；Host 返回实际交付证据。

**过程**：执行 W1 product、W2 summary、W3 design；分别记录 case/workflow 关系；O4 仅在授权条件齐全时执行真实 automation；回读收件人实际看到的内容/事件；把 delivery state 逐级记录。

**停止**：缺授权、缺 source、recipient 不可验证、只拿到 queued/local/generated、或外部写入 scope 不明。该停止只阻断 O4/W2 pilot gate，其他已完成 case 保留。

**回滚**：不得自行删除或修改 Host automation/外部消息；由授权 owner 按 Host 的既有取消/撤回流程处理。撤回本地 evidence index 不等于撤回外部交付。

### V14-6：候选审查和交接

**读取**：所有分片 result、git diff、source/target hash、测试输出、delivery evidence。

**写入**：候选 handoff report；不 commit、push、merge、global install。

**依赖**：所有 mandatory checks 有退出码/结果；未决 gap 有 owner 和下一步；candidate 与 acceptance 分开。

**过程**：做 Standards/Spec、sibling surface、边界、路径、hash、数值、语义和 delivery 复核；生成 `candidate_done` 或 `blocked`。

**停止**：任何 required check 无法验证、真实 O4 缺证、或 Chief acceptance boundary 不清。

**回滚**：撤回候选报告，不撤回用户已有修改；把阻断原因写入 result，不隐去失败。

## 5. 未来文档一致性要求

实现时检索 `supporting references`、`five`、`5`、`projection surfaces` 等固定数量描述。任何更新必须只反映同一个 `PROJECTION_SURFACES` source list；不新增第二份手工注册表。安装输出、backup、package manifest 和 manual projection 都应从现有动态列表得到同样的 7/13 计数。

## 6. 投影、状态入口与默认负担验收补充

V14-2先运行现有 `./scripts/harness sync --dry-run`，将Root workspace目标准确写入实施packet。当前预期为 `.agents/skills/trio/office/SKILL.md` 和其两个 `references/`文件，以及受管manifest/receipt实际列出的变更；清单以dry-run为准。只允许在已绑定Root workspace用 `./scripts/harness sync` 生成，再 `./scripts/harness sync --check`核验；禁止手工编辑生成文件。出现global/DSH/无关技能目标、非本任务dirty冲突时暂停投影，先处理绑定，不覆盖。package输出仅使用测试临时目录；release build另按发布授权处理。

V14-6允许最小更新 `docs/roadmap.md`、`docs/research/swf-60d-20260906/roadmap.md` 的链接、实际证据与限制；不得把未完成pilot写成已发布。源文件变更/生成目标清单分别报告。

新增参考采用按需载入；Office主SKILL只增加两条链接和短触发说明，不复制参考正文、不修改其他默认治理文件。用小中文总结的无参考/有参考真实输出比较事实正确、来源覆盖、未知标注、授权边界和可读性；基线与候选同输入/工具，reviewer逐项核对。候选质量不得下降，新增字段/步骤没有具体核验价值时删除后重验。短文本无需另造PDF/截图，领域分类沿用项目约定；“事实—动作…”只提供检查项，不强制每句套模板。

设计handoff固定模板：业务目标、冻结范围/非目标、选定设计引用、状态与交互、接口或数据约束、逐项验收例子、未决项及owner。已知部分应可执行；关键未决项只阻断其依赖切片，不交给执行者自行做业务选择。
