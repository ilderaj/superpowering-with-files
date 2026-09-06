# Visible worker Root 契约实施计划

## 目标结果

Root Harness 的新 Host routing 只产生 `native_subagent` 或 `manual_pending`。`visible_worker_required` 作为 legacy 输入仍可解析，但对 `spawn/continue/status/interrupt/collect` 一律返回 `legacy_visible_worker_required_retired`；`visible_worker` route 仅保留为历史 evidence vocabulary。Codex handoff renderer 不再为 strict input 生成执行请求。

用户可见独立任务继续由 Host 按明确用户请求创建，保持在 Root internal routing 之外。DSH 完全不在本次实施和验证范围内。

## 固定边界

- 版本位置：V1.4 preflight maintenance slice。
- 不修改 `plugins/dsh/**`、DSH tests、DSH docs 或 DSH projections。
- 不新增 scheduler、registry、runner、daemon、worker DB、第四个 task-state 文件或 Host API wrapper。
- 不提高 assignment packet schema/version；`visible_worker_required` 本身是 legacy discriminator。
- 不删除 Corleone roster、历史 persona ID、`visible_worker` enum 或历史 evidence parser。
- 不改写 historical packet、receipt、eval result 或 archived planning。
- 不执行 commit、push、PR、merge、release 或 global adoption。

## 固定行为

1. `resolveHostOperation` 对 default operation 不再考虑 visible capability；只选择安全 native route，否则 `manual_pending`。
2. structurally valid 且基础 model/authority 校验通过的 `visible_worker_required` input，在 child/topology/capability routing 前返回：
   - route：`manual_pending`
   - blocker：`legacy_visible_worker_required_retired`
   - resume：负责人显式 rebind 到 `default`；不能静默 fallback。
3. malformed packet、非法 operation、无效 model policy 或无效基础 authority/envelope 继续报告更基础错误，不被 retired blocker 掩盖。
4. `renderCodexHandoffRequest` 对任何 strict Host operation 返回同一 retired blocker/error，不选择 Don、不渲染 handoff。
5. default/native 的 model、effort、permission、path、lane、delegation 和 candidate acceptance 约束保持不变。
6. `selectCorleoneRole`、roster 和 profile renderer 保留作为静态/历史兼容面；本切片不做 persona 重构。

## 精确写入范围

### Root source

- `harness/trio/core/routing.mjs`
- `harness/trio/hosts/codex.mjs`

### Root tests

- `tests/trio/host-routing.test.mjs`
- `tests/trio/model-routing.test.mjs`，仅在 strict model/role expectation 实际受影响时修改
- `tests/trio/permission-routing.test.mjs`，仅在 blocker precedence assertion 需要时修改
- `tests/trio/routing.test.mjs`，仅在 exported vocabulary assertion 需要时修改

### Canonical docs and projections

- `README.md`
- `docs/astra-harness-upgrade.md`
- `docs/trio-v2/human-usage.md`
- `docs/trio-v2/workflow.md`
- `docs/workflows.md`
- `docs/coding-harness-sop.md`
- `docs/coding-harness-implementation-plan.md`
- `docs/research/swf-60d-20260906/roadmap.md`
- `harness/trio/skill/references/execution.md`
- `harness/trio/governance/chiefops/references/delegated-execution.md`
- canonical source 的 `.agents/**` projections；不得直接设计 generated copy

### Planning reconciliation

- 本 execution Trio 三文件。
- `swf-visible-worker-bridge-repair-20260904`、`visible-worker-lifecycle-bridge-20260809`、`swf-coding-harness-upstream-implementation-20260903` 的三文件，只记录 superseded/completed disposition。

## 实施阶段

### E0：冻结基线

1. 记录 HEAD、dirty inventory、目标文件 preimage hashes 和 allowlist。
2. 重扫 active assignment packet/evidence；当前已知 strict packet 没有 evidence/Host handle。
3. 若发现可信 active visible Host handle，停止实施并单独规划收尾；不得恢复通用 bridge。
4. 保存 focused root 207/207 基线。

### E1：Root RED

在 public `resolveHostOperation` 和 Codex handoff seam 先写测试：

- 五个 strict Host operation 都返回 retired blocker。
- strict input 即使 visible capability safe 也不能产生 `visible_worker`。
- strict input 即使 native capability safe 也不能 fallback。
- default operation 只有 visible capability 时不得产生 visible route。
- default/native happy path 和 permission/path/model/lane blockers 保持。
- Codex renderer 对 strict input 不生成 handoff，也不选择 Don。

只改测试并运行，确认失败来自旧 visible route/strict behavior。

### E2：Root GREEN

1. 在 packet build、基础 model/authority/envelope 校验后识别 retired marker。
2. retired gate 位于 child/profile、Host observation、lane 和 capability routing 前。
3. 删除 current visible-first resolution branch；default 只走 native 或 pending。
4. 保留 `HOST_ROUTE_KINDS` 的 `visible_worker` 以读取历史 evidence，不从 resolver 返回。
5. Codex handoff 在 role selection 前拒绝 strict operation。
6. focused tests GREEN 后才做小范围重构。

### E3：规范和投影

1. 当前规范改为 direct/native-first + explicit user-owned task。
2. `visible_worker_required` 只出现在 legacy migration、兼容测试和历史说明。
3. July/August “tracked production 默认 visible” 与“等待 bridge”声明加 superseded 指向，不重写历史正文。
4. Roadmap 将该项放入 V1.4 preflight；V1.3 历史验收不改写。
5. 从 canonical source 生成/同步 `.agents` projection，并验证字节一致。
6. 对 `plugins/dsh/**` 保持零写入；DSH 中的旧术语不作为本次 current-surface 扫描失败。

### E4：旧 Trio disposition

1. bridge repair：Phase 1–5 证据保留，Phase 6 被 Root direct/native-first supersede。
2. lifecycle bridge：保留本地历史证据，停止等待 Root Host bridge。
3. upstream implementation：引用已完成 successor，关闭过时 strict blocker。
4. 不移动目录；archive cleanup 另行执行。

### E5：验证和接受

1. 运行 verification.md 的 focused/full root gates 和 projection checks。
2. 对 `plugins/dsh/**` 比较 E0 保存的 diff/status hashes，证明本任务没有新增 DSH delta；共享工作树已有 DSH 变更保持原样。不运行 DSH tests。
3. Luna/high 独立 reviewer 检查没有 visible route、新 bridge、权限退化或 roadmap 扩 scope。
4. Chief 解决所有 Critical/Major 后接受。

## 执行分工

| Slice | 推荐执行者 | 写入 |
| --- | --- | --- |
| Root RED/GREEN | Luna/high 或 Terra/high | routing、Codex adapter、focused tests |
| Docs/projection | Luna/high | canonical docs 和 root projections |
| Planning reconciliation | Luna/high | 指定旧 Trio 三文件 |
| Independent review | Luna/high，只读 | 无 |

## 回滚

- 只撤销本 Trio allowlist 内候选，禁止 `reset --hard`、`clean` 或覆盖共享 dirty 状态。
- 若 root default/native 回归，回滚当前 resolution slice；不恢复 bridge。
- 若 projection 不一致，从 canonical source 修正后重新投影。
- DSH 不参与本次回滚，因为本次不得修改 DSH。

## 完成定义

- Root resolver 不再产出 `visible_worker`。
- valid strict input 对五个 Host operation 返回稳定 retired blocker，且不 native fallback。
- Codex renderer 不生成 strict handoff。
- default/native 和全部既有权限、模型、路径、lane、Trio/candidate gates 无回归。
- current Root normative docs 与 roadmap 一致，历史 evidence 保留。
- `plugins/dsh/**` 相对 E0 baseline 零 task delta、未运行 DSH tests。

## 执行结果（2026-09-06）

- E0–E5 全部完成；Root resolver、Codex handoff 和 inherited Corleone role instructions 已按冻结行为收口。
- focused Root routing 212/212、`verify:trio` 422/422、`verify:core` 359/359 + 82/82、`plugin:verify` 82/82、最后受影响面复跑 136/136 全部通过；`git diff --check` 通过。
- canonical Trio/ChiefOps references 与 workspace `.agents` projections 字节一致；没有执行 global adoption。
- Luna/high 独立 reviewer 无 Critical/Major；请求的 model/effort 仍只表示 intent，没有 Host-authenticated actual 证据。
- DSH diff/status 哈希与 E0 基线完全相同，且未运行 DSH tests。
