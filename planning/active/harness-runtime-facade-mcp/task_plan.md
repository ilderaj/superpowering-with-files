# Task Plan: Harness Runtime Facade MCP

## Goal
判断并固化 “harness runtime facade” MCP 路线是否可行，并产出可由 CLI agent 分阶段执行、验证、收敛到 agent governance runtime 的实施计划。

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason:

## Current Phase
Phase 6

## Phases

### Phase 1: 需求与边界确认
- [x] 明确 MCP 不是第五个普通 IDE adapter。
- [x] 明确现有多 IDE adapter 继续负责原生规则投影。
- [x] 明确 MCP 负责统一、安全、可审计地调用 Harness 能力。
- **Status:** complete

### Phase 2: Repo 事实与外部 MCP 事实核对
- [x] 核对现有 Harness 命令面和文档结构。
- [x] 核对当前 MCP TypeScript SDK 与 transport 建议。
- [x] 记录当前 repo 无 lock file，后续依赖引入必须生成 lock 并纳入验证。
- **Status:** complete

### Phase 3: 架构判断
- [x] 判断 facade 分层是否能复用现有 CLI/installer 能力。
- [x] 识别不确定点并用实施边界化解。
- [x] 定义 read-only/dry-run 到 safe-write 再到 remote 的升级路径。
- **Status:** complete

### Phase 4: 详细实施计划
- [x] 在 companion plan 中写入阶段化文件改动、工具清单、验收门槛和回滚策略。
- [x] 将 durable 结论同步回本 task-scoped planning。
- **Status:** complete

### Phase 5: 交付
- [x] 向用户输出可行性结论和执行计划摘要。
- [x] 提供完整参考路径。
- **Status:** complete

### Phase 6: 二次审查与 loophole 收敛
- [x] 复读 active plan、findings、companion plan。
- [x] 对照现有 `sync`、`doctor`、`verify`、`install`、`checkpoint` 实现检查可执行性风险。
- [x] 查询最新官方 MCP / TypeScript SDK / transport / authorization 文档事实。
- [x] 修正 root allowlist、stdio stdout、approval token、SDK dependency、remote auth、self-test 等执行漏洞。
- **Status:** complete

## Key Questions
1. 这条路线是否可行？可行，但必须定位为 runtime facade，而不是 adapter。
2. 是否能让 CLI agent 成功执行并验证？可以。修订后的计划把 Phase 1/2 限定为本地可完全验证的 stdio/read-only/dry-run 与 out-of-band approval safe-write；Phase 3/4 必须先通过本地 contract tests 和 simulator，真实云端启用不得跳过 live smoke。
3. 最大 loophole 是什么？把 MCP tool 直接 shell 到 CLI 写命令，或让 MCP 自己签发 approval token，都会绕过权限、审计和 dry-run 契约；必须先引入 runtime service layer、root allowlist、out-of-band approval gate 和 receipt ledger。

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| MCP 定位为 `harness runtime facade` | IDE adapter 负责投影，MCP 负责把 harness 能力暴露为 typed, auditable tools/resources。 |
| Phase 1 只做 read-only + dry-run + stdio | 本地可验证，最小安全风险，能快速证明 agent 调用面成立。 |
| Phase 2 写操作必须拆成 plan/approval/apply | 避免 MCP 直接变成高权限 remote shell。 |
| Phase 3 remote MCP 先以 Streamable HTTP + localhost/host validation + token gate 为边界 | MCP 官方文档将 Streamable HTTP 作为 remote server 方向，本地 stdio 作为 process-spawned integration。 |
| Registry/policy 放到 Phase 4 | 需要前面 runtime metadata 和 audit receipt 稳定后才值得团队级分发。 |
| MCP root 由 allowlist 控制，默认只允许当前 repo | 防止 `root?: string` 被用来读取 HOME、secret 或其他 repo。 |
| Phase 2 approval token 不得由 MCP tool 生成 | 防止 agent 自批自用；approval 必须来自外部 CLI/UI/预置签名文件。 |
| stdio server 所有日志只能写 stderr | stdout 属于 MCP JSON-RPC 通道，写普通日志会破坏协议。 |

## Companion Plan
- Companion plan: `docs/superpowers/plans/2026-05-08-harness-runtime-facade-mcp.md`
- Companion summary: 详细记录 MCP facade 的四阶段实施、文件改动、工具/resources 设计、验证命令、风险闸门、root allowlist、out-of-band approval、remote auth 和交付边界。
- Sync-back status: complete

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `fd` 不存在 | 1 | 按仓库偏好退回 `find` 做目录轻扫，并记录为环境事实。 |

## Notes
- 本任务使用 `using-superpowers` 和 `planning-with-files`，因此保留 companion plan，并让 `planning/active/harness-runtime-facade-mcp/` 继续作为权威任务记忆。
- 本轮只产出架构和实施计划，不修改 runtime 代码。
