# Visible worker Root 契约验证计划

## 原则

- 一次一个行为执行 RED → GREEN。
- Root runtime、Codex descriptor、静态文案和 Host 工具能力分开验证。
- “没有 visible route”以 descriptor/route evidence 断言证明。
- legacy strict 不能静默变成 native；历史 enum 可读不代表 active support。
- DSH 完全排除：不修改、不测试、不以其当前行为作为 Root acceptance gate。

## 当前基线

- focused root routing/capability：207/207 pass。
- `verify:trio`：417/417 pass。
- `verify:core`：359/359，plugin-kit 82/82 pass。
- 上述结果证明旧实现内部一致，不证明 visible contract 正确。

## Root 测试矩阵

| ID | 输入 | 期望 | 禁止 |
| --- | --- | --- | --- |
| R1 | default spawn，native capability safe | `native_subagent` | visible 优先、额外 user task |
| R2 | valid strict input，遍历五个 Host operation | `manual_pending` + `legacy_visible_worker_required_retired` | `visible_worker` descriptor |
| R3 | strict input，native capability safe | 同 R2 | native fallback |
| R4 | default operation，只有 authenticated visible capability | `manual_pending` | 新 `visible_worker` route |
| R5 | default native operation，identity/digest/permission/path 完整 | 原 native route/result | visible terminology 或权限变化 |
| R6 | default native 缺 capability/permission/path/identity | 原 `manual_pending` blocker | retired blocker 掩盖实际错误 |
| R7 | Codex handoff + strict input | retired error，且 role/profile 未生成 | Don handoff request |
| R8 | Codex handoff + default input | 原合法 descriptor | strict 退役影响默认路径 |
| R9 | child 越权、Ultra、跨模型 allowance 缺失 | 原 blocker | 因 visible 退役而放宽 |
| R10 | active lane/candidate_done/awaiting approval | 原 lane blocker | 新派发覆盖 |
| R11 | malformed packet、非法 operation、无效 model/authority/envelope + strict marker | 原基础错误 | retired blocker 掩盖损坏输入 |
| R12 | historical `visible_worker` route/evidence parser | 仍可读取/验证历史 vocabulary | resolver 新产出 visible route |

## 文档和投影检查

Current Root normative allowlist：

- `README.md`
- `docs/astra-harness-upgrade.md`
- `docs/trio-v2/{human-usage,workflow}.md`
- `docs/workflows.md`
- `docs/coding-harness-{sop,implementation-plan}.md`
- `docs/research/swf-60d-20260906/roadmap.md`
- canonical Trio/ChiefOps execution references 与 `.agents` projections

断言：

1. 不再提供 active strict intake、Don-only execution 或等待 Root bridge 的普通恢复条件。
2. native subagent 是内部 helper；用户可见独立任务需要用户明确请求。
3. `visible_worker_required` 仅存在于 migration、兼容测试和历史 evidence。
4. canonical/projected copies 字节一致。
5. current-surface scan 明确排除 `plugins/dsh/**`、archive、audit report 和历史 eval result。

## 行为回放

| Case | 用户意图 | 期望 |
| --- | --- | --- |
| H1 | “把有界核对交给 subagent，完成后你继续整合” | bounded native helper；主任务保留整合责任 |
| H2 | “新建一个独立任务让我之后跟进” | Host user-owned task；不声称是当前任务 worker |
| H3 | legacy `visible_worker_required` 请求执行 | retired blocker；不调用 native 或创建新 task |
| H4 | 只有静态 Corleone role/requested model | actual role/model/effort 保持 unknown |

## RED → GREEN

1. 保存旧断言通过结果。
2. 只改测试，运行 focused suite；R2、R4、R7 必须因旧行为 RED。
3. 实现最小 routing 变更，focused GREEN；复核 default/native 和 permission/lane backstop。
4. 实现 Codex renderer gate，相关 tests GREEN。
5. 更新 canonical docs，观察 projection check RED；正常同步后 GREEN。
6. 固定 diff，执行 full Root gates、DSH task-relative zero-delta 和独立 review。

## 命令

```sh
node --test tests/trio/host-routing.test.mjs tests/trio/model-routing.test.mjs tests/trio/permission-routing.test.mjs tests/trio/routing.test.mjs
npm run verify:trio
npm run verify:core
npm run plugin:verify
git diff --check
```

Projection/adoption 只执行 workspace-local read/write checks；没有 global adoption 授权时不得写用户目录。

DSH 只比较 E0 保存的 path-level diff/status hashes，不运行 `pnpm verify`。共享工作树已有 DSH 变更不应被误报为本任务修改：

```sh
git diff --binary -- plugins/dsh | shasum -a 256
git status --porcelain=v1 --untracked-files=all -- plugins/dsh | shasum -a 256
```

## 接受门槛

- R1–R12、H1–H4 满足预期。
- Root resolver 不再产出 visible route，Codex renderer 不再生成 strict handoff。
- default/native、权限、模型/effort、path、lane、Trio binding 和 candidate acceptance 无回归。
- Root normative docs、projection 和 roadmap 一致。
- `plugins/dsh/**` 相对 E0 baseline 零 task delta；DSH tests 未运行。
- 独立 reviewer 无 Critical/Major。

## 实际验收结果（2026-09-06）

- Root focused：212/212 pass；最后受影响面复跑：136/136 pass。
- `verify:trio`：422/422 pass。
- `verify:core`：core 359/359、plugin-kit 82/82 pass；独立 `plugin:verify` 82/82 pass。
- projection byte comparison 与 `git diff --check` 通过。
- DSH diff hash `b7aed4dbe291be955688dd6ad9257c62e6258d86f2f6e7b5ce9633cb09ab402c`、status hash `fec0e4c23b924a15905cd333044a8cdd18b46a1cf5fdd49f9b16040b468b23b0`，均与 E0 相同；未运行 DSH tests。
- Luna/high 独立 reviewer：无 Critical/Major；未提供 Host-authenticated actual model/effort 或用户可见交付证据。
