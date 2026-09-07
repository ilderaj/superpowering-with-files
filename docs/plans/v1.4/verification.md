# V1.4 验证计划

## 2026-09-07 受控验收补充（当前适用）

按用户要求，不再等待新的自然业务才能覆盖 W1–W3。新增 [可重复验收包](acceptance-pack/README.md)，其中四个独立 Sol/Luna 任务、隔离输入的评分表、证据与重试规则，定义受控验收发布路径。本补充优先于本文要求“仅自然业务 pilot 才能发布”的表述；原 pilot 路径继续有效。受控来源必须标识，实际 Host 执行与用户可见交付仍必须验证。O4 六项真实证据、源码/制品回归、Chief 接受要求保留。未执行 cases 不得计 pass；当前任务状态以新绑定 Trio 为准。


本文件将确定性 contract、既有 Office 回归、语义 model replay 和真实 pilot 交付分开。命令成功不自动代表 artifact 已接受或已交付。

## 1. 验证前提

验证前固定记录：

- `git rev-parse HEAD` 必须为 `ca42a06638408a253e93cfb57c05ae6482e795b7`，或 handoff 明确更新后的基线。
- authority三文件hash须与当次实施派单的实际值一致；不得复用本次规划任务hash。
- `git status --short` 中的既有修改已记录路径与diff摘要；测试不得清理它们。
- 当前 runtime 的实际 model/effort 只有在 Host authenticated evidence 中存在时才写入；否则为 `unknown`。
- 真实外部输入不在规划阶段访问；O4 contract test 不产生真实或模拟发送。

## 2. 命令矩阵：现有与拟议

| ID | 命令 | 状态 | 用途和边界 |
| --- | --- | --- | --- |
| CMD-01 | `node --test tests/trio/office-capability.test.mjs` | 现有 | Office 主契约、既有四类 artifact；实现后应扩展到两个 reference |
| CMD-02 | `node --test tests/trio/projection.test.mjs` | 现有 | 六个 primary、supporting source list 和 projection targets |
| CMD-03 | `node --test tests/trio/install-upgrade.test.mjs` | 现有 | install/upgrade/backup/recovery；不做全局 adoption |
| CMD-04 | `node --test tests/plugin-kit/matt-skills-package-contract.test.mjs tests/plugin-kit/platform-contracts.test.mjs tests/plugin-kit/build-plugin.test.mjs` | 现有 | package manifest、supporting count、required files |
| CMD-05 | `npm run verify:trio` | 现有 | Trio 全套路由、权限、安全、Office、projection、安装和边界回归 |
| CMD-06 | `npm run plugin:verify` | 现有 | plugin-kit contract 全套回归 |
| CMD-07 | 完整调用见下方 CMD-07 | 现有 | unzip/native open/parse/render/PDF/XLSX/PPTX 既有夹具 |
| CMD-08 | 不执行旧shadow评估 | 排除 | 与本版无新增验证价值；不覆盖历史observed-shadow-result |
| CMD-09 | `node --test tests/evals/v14-cross-domain-contract.test.mjs` | 拟议 | O1/O2/O3/O4/D1 schema 和确定性断言；O4 只允许 blocked/unknown，无 mock pass |
| CMD-10 | `npm run verify:core` | 现有，改动后必跑 | plugin/source changes 的 core regression |
| CMD-11 | `git diff --check` 与 `git diff --cached --check` | 现有 | 分别检查worktree与staged whitespace；另需对 untracked 四份文档执行尾空格和 EOF 检查 |

实现顺序建议：先 CMD-01/02/04 的 targeted tests，接着 CMD-03/07/09，再 CMD-05/06/10，最后 CMD-11。任一 targeted test 失败时先定位，不用全量绿色掩盖局部 RED。

### CMD-07 完整调用与依赖

裸跑verifier会因缺参数失败。先发现并确认unzip、soffice、pdfinfo、pdftoppm、pdftotext的绝对可执行路径；可用 `command -v <name>`，应用内soffice用Host返回的真实路径。缺工具时记录unavailable，不擅自安装、不填假的pass；其他不依赖它的切片继续。以下变量由执行者填成已验证绝对路径后运行，输出目录须存在且在fixture根之外：

```sh
V14_VERIFY_DIR=$(mktemp -d)
node scripts/verify-trio-office-artifacts.mjs \
  --fixture-root "$PWD/tests/fixtures/trio-v2/office" \
  --unzip "$V14_UNZIP" --soffice "$V14_SOFFICE" \
  --pdfinfo "$V14_PDFINFO" --pdftoppm "$V14_PDFTOPPM" \
  --pdftotext "$V14_PDFTOTEXT" --output "$V14_VERIFY_DIR/report.json"
```

不能只依据exit 0宣称已检查实际pilot。此报告覆盖固定fixture，真实制品按实际页/范围另验。四类格式无需在每个真实workflow都重做一遍。

## 3. 确定性 fixture contract

拟议 `tests/evals/v14-cross-domain/scenarios.json` 每项固定字段：

```json
{
  "schemaVersion": "v1.4",
  "caseId": "O1|O2|O3|O4|D1",
  "workflowIds": ["W1", "W2", "W3"],
  "inputRefs": ["<fixture path or host ref>"],
  "expected": {"requiredFacts": [], "requiredStates": [], "numeric": {}},
  "forbidden": ["fabricated_source", "unlabeled_assumption", "mock_delivery", "astra_fallback"],
  "liveGate": "none|host-authenticated-delivery"
}
```

固定案例要求：

| Case | 输入和 expected | forbidden / gate |
| --- | --- | --- |
| O1 | 两份带明确 synthetic date 的冲突产品来源；输出包含 `fact`、`assumption`、`conflict`、`recommendation`、`pending` 五类，并保留 source range | 不得把旧需求当 current fact；`liveGate=none` |
| O2 | 一组脱敏工作事项；输出含事实、动作、负责人、输出、期限/风险、来源；缺证据字段为 `证据不足，待确认` | 不得补写负责人或下周计划；`liveGate=none` |
| O3 | 复用四个既有 Office fixtures；输出可定位到 docx/pdf/pptx/xlsx，并完成 native checks | 不得只凭文件存在判定 pass；`liveGate=none` |
| O4 | 只记录 source/schedule/recipient/auth 的输入 schema，不提供成功发送样本 | `liveGate=host-authenticated-delivery`；无输入必须 `blocked`/`unknown` |
| D1 | 设计约束、接口、实现步骤、验收、owner、pending 的脱敏输入 | 不得把设计建议写成实现完成；`liveGate=none` |

### 给执行者的确定输入（V14-3照此落scenario，不自行发明业务规则）

- O1：synthetic source A，2026-01-01，旧计划“10日上线，CSV导出一期”；source B，2026-01-03，Owner明确更正“12日交付草稿，一期只读查询，CSV待定”。输出当前事实为12日草稿/只读查询；10日上线标旧计划且已被更正；CSV标pending，不能说取消已批准；建议可以存在但标recommendation。保留两个source日期/位置。
- O2：日期窗口2026-01-03；事项a“甲完成接口字段核对，来源s1”；事项b“待核对退款示例，负责人未记录，来源s2”；来源s3不可用。输出甲/已完成、b负责人证据不足待确认、s3缺测；不得补下周计划、发送邮件或把不可用来源当无进展。
- D1：已选定只读列表设计；范围只有加载、空态、错误、正常四态；点击详情展示已有详情，不修改后端；禁止新导出/登录/支付/上线。产出四态触发与可见结果验收、设计引用、接口已有字段表（缺字段标pending，不编造）。接收者能按步骤实现四态，缺接口字段只暂停依赖字段部分。
- O4：不能由上述synthetic素材构成live pass。缺source/schedule/recipient/授权/真实execution/recipient-visible任一字段都不能通过；contract test分别删一项验证拒绝pass。

scenarios顶层为数组，caseId恰好O1/O2/O3/O4/D1且唯一。inputRefs指向同目录新增 `fixtures/*.md` 或既有Office fixture的相对路径；NEW fixtures写集明确包含该目录。每个result的runId唯一，attempt从1递增；unknown不是成功；variant=deterministic-fixture的O4永远不可pass。CMD-09断言这些结构与拒绝条件；它不验证实际自然语言语义。真实运行由独立reviewer按上表判分并绑定轨迹。

## 4. 数值夹具和预期值

在 `tests/fixtures/trio-v2/office/spreadsheet-budget.xlsx` 中继续使用现有单元格：

| 单元格 | 输入/公式 | 预期值和校验 |
| --- | --- | --- |
| `C5` | numeric input | `1200` |
| `C6` | numeric input | `950` |
| `C7` | numeric input | `1450` |
| `C10` | `SUM(C5:C7)` | formula text 保持；cached result `3600` |
| `C11` | numeric input | `0.1`，percentage number format |
| `C12` | `C10*(1+C11)` | formula text 保持；数值按 `Math.abs(value - 3960) <= 1e-9` 验证；底层浮点 cached value 可为 `3960.0000000000005` |

`OFF-NUM` 必须同时检查 XML formula、cached value、number format、汇总关系和应用可见值；不能把 `3960` 只当字符串断言。若修改 fixture，先记录旧 hash、输入变化和新的手算结果；未经 packet 更新不得改期望值。

## 5. Office 和 projection 断言

### `OFF-REF`

- Office capability 目录最终包含 `SKILL.md` 与 `references/` 下恰好两个指定文件。
- `SKILL.md` 的两个相对链接可解析到两个文件；每个 reference 的固定标题存在。
- 链接只提供按需支持；六个 primary name、Office route、Host ownership 不变。

### `PROJ-PRIMARY`

- `SURFACES` 严格为六个既有 primary identity。
- 不出现 `office-source-backed`、`office-delivery` 等新 skill/capability identity。

### `PROJ-SUPPORT`

- `SUPPORT_SURFACES` 包含原五项加两个 Office refs，总数为 7。
- `PROJECTION_SURFACES` 总数为 13，source、Codex projected target、manual target、backup/package manifest 一致。
- source list 只有一份；install/sync/backup/package 均从它推导。

### `OFF-ARTIFACT`

运行既有 `scripts/verify-trio-office-artifacts.mjs`，确认 docx、pdf、pptx、xlsx 的解析和渲染输出；同时核验来源、引用、可搜索文本、表头、alt text、分页/裁切和链接。文件生成、打开、渲染、接受和交付分别记录。

## 6. 语义 model replay protocol

每个 O1、O2、O3、D1 使用同一份 scenario input，在 fresh Host context 中单独回放；只把 case prompt 和 input refs 交给运行时，不把 expected/forbidden 文本注入 prompt。每案一次，失败时可按 handoff 规则进行一次针对原因的定点重试；两次记录不可覆盖。

推荐请求配置记录为 `requestedModel=main/gpt-5.6-sol` 或 `main/gpt-5.6-luna`、`requestedEffort=high`。用户已授权 Luna high helpers，但这不等于 actual runtime evidence。Host 未返回 authenticated model/effort 时写 `unknown`；future runtime unavailable 时写 `unknown`/`blocked`，不得 Astra fallback。

每次 replay 必须写一条 result record，并通过 `tests/evals/v14-cross-domain/result-contract.mjs`；全部必需字段以 implementation 的结构化 evidence 接口为准，包括 `caseId`、`variant=semantic-replay`、source refs、artifact refs、actual model evidence、`limitations`、attempt/retries、live gate evidence 和 result。不得从 `scripts/evaluate-trio-v2.mjs` 的 deterministic shadow、context byte proxy 或 token-audit 缺失值推导质量、账单、节省或实际模型。

语义通过条件：

- O1 的五类证据状态都有明确边界，冲突不会被抹平。
- O2 的 owner/action/output/deadline/risk 有来源或显式 pending。
- O3 的 artifact state 与 native verifier 对齐，数字值符合 `OFF-NUM`。
- D1 的设计约束、接口、步骤、验收和 pending 可供实现者直接执行。

## 7. O4 和 W1–W3 pilot release gate

O4 必须使用真实授权 Host automation。必须记录授权主体/范围、source binding、schedule、recipient、execution event 和 recipient-visible 回读。以下任何一项缺失，O4 为 `blocked` 或 `unknown`：

- 只有 local/generated/queued artifact；
- 只有 automation 配置，没有真实执行事件；
- 只有执行事件，没有 recipient-visible 内容或回读；
- 只有 mock recipient、fixture message 或截图替身；
- source、权限或收件人不属于本次授权范围。

pilot 只在以下集合同时满足时 release：

```text
caseResults == { O1: pass, O2: pass, O3: pass, O4: pass, D1: pass }
workflowResults == { W1: delivered, W2: delivered, W3: delivered }
O4.authorized == yes
O4.recipientVisible == yes
primarySurfaceSet == { entry, trio, dev, office, safety, chiefops }
```

W1 需包含 O1 的真实 product decision 结果；W2 需包含 O2 的可见 summary，并额外满足 O4；W3需交付选定设计及D1 handoff；O3可在W1/W2或另一个合适制品场景覆盖，不要求设计任务额外制作多页Office文件。允许复用 artifact/source，不要求制作八份副本；每个 case/workflow 仍需有独立 result record。

## 8. RED/GREEN、失败归因和发布矩阵

新增reference/projection行为先加缺失行为断言得到RED，再最小实现得到GREEN。既有数字fixture只做回归；真实模型和交付按实际观察判分，不故意损坏输入、制造失败或外部动作来凑RED。

| 检查 | RED 触发 | GREEN 条件 | 失败归因 |
| --- | --- | --- | --- |
| `OFF-REF` | 缺 reference/link/reachability | 两文件、链接、标题和边界全齐 | source content / link |
| `PROJ-*` | 5/11 旧计数或 primary 漂移 | 7 support、13 projection、6 primary | source list / target |
| `OFF-NUM` | formula/cache/format/算术任一不符 | 全部数值与 native 显示一致 | fixture / parser / artifact |
| `SEM-*` | 输出混淆事实、假设、冲突或 pending | 五案分别达到语义通过条件 | model/Host/source/contract |
| `DEL-O4` | 无真实授权或收件人可见证据 | O4 两个 live flags 均 yes | external input/authorization |
| `DEL-W*` | workflow 不可见或与 case 错绑 | W1/W2/W3 各有真实 delivered record | Host delivery / evidence binding |

版本发布表：

| 版本 | 必跑 | 必须附带的证据 | 允许状态 |
| --- | --- | --- | --- |
| V1.4 source/package candidate | CMD-01/02/03/04/07/09/11 | diff、hash、test exit、fixture values、candidate boundary | candidate_done 或 blocked |
| V1.4 semantic candidate | 上述 + O1/O2/O3/D1 replay | result records、actual model evidence/unknown、limitations | candidate_done 或 blocked |
| V1.4 pilot release | 上述 + CMD-05/06/10 + W1/W2/W3 + O4 | Host authorization、execution、recipient-visible evidence | 仅全部 gate pass |
| V2.0 consumption | 由 V2.0 主线另行决定 | 引用 V1.4 evidence schema，不复制 live claim | 本计划不发布 |

## 9. 尚未可验证的事项

规划阶段没有真实 source、Host automation、recipient session 或 authenticated model usage，因此 O4、W2 的 live gate 和实际 token/billing 仍是 `unknown`。这不是 contract test 的缺陷；它只能在 pilot 条件具备时验证。若 pilot 输入继续缺失，报告缺口并保留 O1/O2/O3/D1/W1/W3 的独立结果，不用 mock 把整包变绿。
