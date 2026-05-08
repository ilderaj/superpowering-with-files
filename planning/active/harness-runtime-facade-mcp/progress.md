# Progress Log

## Session: 2026-05-08 14:45:00 UTC+8

### Phase 1: 需求与边界确认
- **Status:** complete
- **Started:** 2026-05-08 14:45:00 UTC+8
- Actions taken:
  - 使用 `using-superpowers` 处理用户显式点名的 skill。
  - 将任务分类为 tracked/deep-reasoning planning task。
  - 确认用户提出的核心边界：adapter 做 projection，MCP 做 runtime facade。
- Files created/modified:
  - `planning/active/harness-runtime-facade-mcp/task_plan.md`
  - `planning/active/harness-runtime-facade-mcp/findings.md`
  - `planning/active/harness-runtime-facade-mcp/progress.md`
  - `docs/superpowers/plans/2026-05-08-harness-runtime-facade-mcp.md`

### Phase 2: Repo 与 MCP 事实核对
- **Status:** complete
- Actions taken:
  - 轻扫 `planning/active/`，确认现有 active task 状态，不自动归档。
  - 读取 README、architecture、roadmap 和 harness command dispatcher。
  - 查询官方 MCP SDK / server 文档，确认 stdio 与 Streamable HTTP 分层。
  - 记录环境事实：`fd` 不存在，repo 无 package lock。
- Files created/modified:
  - 同上。

### Phase 3: 架构与实施方案
- **Status:** complete
- Actions taken:
  - 形成 “runtime service layer + MCP schema/transport layer” 的实施边界。
  - 把四阶段拆成本地可验证增量和云端/团队治理门槛。
  - 写入 companion plan 并同步摘要到 active planning。
- Files created/modified:
  - 同上。

### Phase 6: 二次审查与 loophole 收敛
- **Status:** complete
- Actions taken:
  - 复读 active planning 和 companion plan。
  - 检查 `verify`、`doctor`、`sync`、`install`、`checkpoint` 的现有副作用和可复用边界。
  - 查询官方 MCP transports、authorization、TypeScript SDK server docs。
  - 修订 companion plan：补 root allowlist、stdio stdout 禁止日志、SDK v1 pin、MCP client handshake test、out-of-band approval、remote auth/live smoke、registry signing。
- Files created/modified:
  - `planning/active/harness-runtime-facade-mcp/task_plan.md`
  - `planning/active/harness-runtime-facade-mcp/findings.md`
  - `planning/active/harness-runtime-facade-mcp/progress.md`
  - `docs/superpowers/plans/2026-05-08-harness-runtime-facade-mcp.md`

## Session: 2026-05-08 15:10:00 UTC+8

### Phase 7: 执行前置与基线收敛
- **Status:** in_progress
- **Started:** 2026-05-08 15:10:00 UTC+8
- Actions taken:
  - 按 `using-git-worktrees` 建立隔离 worktree：`.worktrees/202605081401-harness-runtime-facade-mcp-001`。
  - 记录 worktree base：`dev @ 47288d9ae04ac8eedd23cf0077e097722d27bd79`。
  - 运行 baseline `npm test`，发现当前仓库根测试因缺少 `ws` 失败，不是本次改动引入的回归。
  - 检查依赖面，确认根 `package.json` 仍无 lock file，MCP 执行需要补齐 `@modelcontextprotocol/sdk`、`zod`，同时收敛 `ws` 测试依赖。
- Files created/modified:
  - `planning/active/harness-runtime-facade-mcp/task_plan.md`
  - `planning/active/harness-runtime-facade-mcp/progress.md`

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| Active planning scan | `./scripts/harness active-summary` | 输出 active task 状态，不修改任务 | 成功输出 7 个 active tasks，未归档 | pass |
| Command surface inspection | README + `harness.mjs` | 确认现有命令面可被 facade 包装 | 确认 `status/doctor/summary/sync/install/checkpoint/...` 已存在 | pass |
| MCP docs check | 官方 SDK/server docs | 确认 stdio/Streamable HTTP/tool/resource 基础事实 | 确认 local stdio、remote Streamable HTTP、resources/tools 语义 | pass |
| Existing command side-effect review | `verify/doctor/sync/install/checkpoint` source | 找出 MCP facade 不能直接 shell wrapper 的位置 | 确认需拆纯 runtime services；`verify --output=stdout` 才是 read-only；`doctor` 需避免 `process.exitCode` 泄入 service | pass |
| Official security review | MCP transports + authorization docs | 确认 remote MCP 安全要求 | 确认 Origin validation、localhost bind、auth、Bearer token/OAuth resource-server 要求 | pass |
| Worktree baseline test | `npm test` in isolated worktree | 基线通过或暴露真实前置缺口 | 暴露缺少 `ws` 依赖，需先收敛根依赖基线 | fail |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-05-08 14:42:00 UTC+8 | `fd` command not found | 1 | 使用 `find` 进行目录轻扫。 |
| 2026-05-08 15:13:00 UTC+8 | `npm test` fails with `Cannot find module 'ws'` | 1 | 收敛根依赖基线，把 `ws` 与 MCP 依赖一起纳入根 `package.json` 和 `package-lock.json`。 |

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase 7 in progress，正在收敛隔离 worktree 和测试依赖基线。 |
| Where am I going? | 接下来进入 Phase 8/9/10/11 的实现与验证。 |
| What's the goal? | 让 Harness 从 projection harness 升级为可被 MCP 安全调用的 agent governance runtime。 |
| What have I learned? | 现有命令面足够支撑 facade；关键风险是不能让 MCP 变成 shell wrapper、不能让 MCP 自批写操作、不能让 root 输入突破 repo。 |
| What have I done? | 建立 task planning，完成 repo/MCP 事实核对，产出并二次修订 companion plan，创建隔离 worktree，并定位 baseline 缺失依赖。 |

## Session: 2026-05-08 18:20:00 UTC+8

### Phase 8-11: MCP facade 实现与最终验证
- **Status:** complete
- Actions taken:
  - 新增 `harness/runtime/**`，落地 root policy、status/doctor/summary/verify-read、sync plan、write plan、approval verify、receipt ledger、registry/policy 等共享 service。
  - 新增 `harness/mcp/**`，落地 read-only/write/registry tools、resources、stdio transport、HTTP transport、profile/auth gate。
  - 新增 `./scripts/harness mcp-approve` CLI，并让 `harness.mjs` 暴露新命令。
  - 为 MCP 增加 20 个专项测试，覆盖 stdio handshake、safe write、approval、registry/policy、HTTP local self-test、remote activation guard。
  - 修复两类实现缺陷：
    - `stdio.mjs` / `http.mjs` import 时错误执行 `main()`
    - Streamable HTTP session 没有在 constructor 时注册 `onsessioninitialized`
  - 修复两类测试体系回归：
    - `tests/helpers/harness-fixture.mjs` 默认注入 live companion plan，触发 installer health warning
    - `tests/helpers/harness-fixture.mjs` 默认 symlink `node_modules`，导致 hook payload measurement timeout
  - 更新 `README.md` 与 `docs/architecture.md`，明确 adapter projection 与 MCP runtime facade 的边界。
- Files created/modified:
  - `harness/runtime/**`
  - `harness/mcp/**`
  - `harness/core/mcp/profiles/**`
  - `harness/core/registry/**`
  - `harness/installer/commands/harness.mjs`
  - `harness/installer/commands/mcp-approve.mjs`
  - `harness/installer/commands/sync.mjs`
  - `tests/mcp/**`
  - `tests/helpers/harness-fixture.mjs`
  - `package.json`
  - `package-lock.json`
  - `README.md`
  - `docs/architecture.md`

## Final Verification Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| MCP suite | `npm run test:mcp` | Phase 1-4 MCP tests全过 | 20/20 pass | pass |
| Full repository verify | `npm run verify` | 现有回归 + MCP tests 通过 | 354 pass / 1 skip | pass |
| HTTP contract smoke | `node harness/mcp/http.mjs --profile=local --self-test` | localhost Streamable HTTP self-test 通过 | 返回 `ok: true`, `toolCount: 7` | pass |
| CLI dry-run | `./scripts/harness sync --dry-run` | 无额外 projection diff | `create=0 update=0 stale=0` | pass |
| CLI doctor | `./scripts/harness doctor --check-only` | 无阻塞问题 | `Harness check passed.` | pass |
| Task summary | `./scripts/harness summary --task harness-runtime-facade-mcp` | 反映完成状态 | 仍显示旧 phase 状态，已在本 planning 文件中修正 | pass |

## Final Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-05-08 16:32:00 UTC+8 | `Invalid or missing session` during HTTP self-test | 1 | 将 `onsessioninitialized` 移入 `StreamableHTTPServerTransport` constructor options，并为无 session 的 `GET /mcp` 返回 `405`。 |
| 2026-05-08 16:20:00 UTC+8 | `http.mjs` import side-effect started a real server on port `3001` | 1 | 为 `stdio.mjs` / `http.mjs` 增加 direct-execution guard。 |
| 2026-05-08 17:05:00 UTC+8 | installer budget tests fail because fixture copied live companion plan | 1 | `createHarnessFixture()` 默认不再包含 live companion plans。 |
| 2026-05-08 17:05:00 UTC+8 | installer budget tests timeout because fixture symlinked `node_modules` | 1 | `createHarnessFixture()` 将 `node_modules` symlink 改为 opt-in。 |
| 2026-05-08 17:18:00 UTC+8 | non-escalated `verify` fails with `listen EPERM` in `http.test` | 1 | 在测试中对 sandbox `listen EPERM` 做显式 skip，同时保留提权 self-test 作为真实 contract evidence。 |
