# Task Plan: Harness Runtime Facade MCP

## Goal
实现并验证 “harness runtime facade” MCP 路线，使 Harness 从 projection harness 升级为可被 MCP 安全调用的 agent governance runtime。

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason:

## Current Phase
Phase 11

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

### Phase 7: 执行前置与基线收敛
- [x] 建立隔离 worktree。
- [x] 记录 worktree base 与当前 branch。
- [x] 收敛现有测试依赖基线。
- **Status:** complete

### Phase 8: Phase 1 本地 MCP read-only + dry-run
- [x] 实现 runtime root policy / read-only services / stdio server。
- [x] 实现 read-only tools 与 resources。
- [x] 增加 real MCP client handshake tests。
- [x] 跑通本阶段验证。
- **Status:** complete

### Phase 9: Phase 2 safe write tools
- [x] 实现 write plan / approval token verify / receipt ledger。
- [x] 实现 write tools 与 `mcp-approve` CLI。
- [x] 跑通本阶段验证。
- **Status:** complete

### Phase 10: Phase 3 remote MCP contract
- [x] 实现 localhost HTTP transport / auth validator / profile policy。
- [x] 跑通 remote contract tests 与 self-test。
- [x] 评估 live smoke 是否具备外部条件。
- **Status:** complete

### Phase 11: Phase 4 registry + policy
- [x] 实现 registry / policy / signature 能力。
- [x] 跑通本阶段验证。
- [x] 完成最终全量验证。
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
| HTTP self-test 在受限 sandbox 下允许 skip，但必须额外跑一次提权 localhost self-test | 保证默认 `verify` 稳定，同时保留真实 Streamable HTTP contract 证据。 |

## Companion Plan
- Companion plan: `docs/superpowers/plans/2026-05-08-harness-runtime-facade-mcp.md`
- Companion summary: 详细记录 MCP facade 的四阶段实施、文件改动、工具/resources 设计、验证命令、风险闸门、root allowlist、out-of-band approval、remote auth 和交付边界。
- Sync-back status: complete

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `fd` 不存在 | 1 | 按仓库偏好退回 `find` 做目录轻扫，并记录为环境事实。 |
| `runHttpSelfTest()` 被测试导入时无条件执行 `main()` | 1 | 为 `stdio.mjs` / `http.mjs` 增加 direct-execution guard，只在脚本直接运行时启动 server。 |
| Streamable HTTP 初始化后丢失 session | 1 | 把 `onsessioninitialized` 改为 transport constructor option，并把无 session 的 `GET /mcp` 调整为 `405`。 |
| 公共 fixture 污染 installer tests | 1 | 将 live companion plan 拷贝和 `node_modules` symlink 改为显式 opt-in，恢复默认轻量 fixture。 |

## Notes
- 本任务使用 `using-superpowers` 和 `planning-with-files`，因此保留 companion plan，并让 `planning/active/harness-runtime-facade-mcp/` 继续作为权威任务记忆。
- 本轮已经完成 runtime / MCP / registry 实现，并通过 MCP 专项测试、CLI smoke 和全量 `verify` 验证。
