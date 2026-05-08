# Findings & Decisions

## Requirements
- 用户希望判断 MCP 路线是否可行。
- 用户明确边界：多 IDE adapter 继续负责规则投影；MCP 负责统一、安全、可审计地调用 Harness 能力。
- 用户希望 MCP 定位为 `harness runtime facade`，不是第五个普通 IDE adapter。
- 用户给出的路线为四阶段：read-only/dry-run；safe write；cloud-ready remote MCP；registry + policy。
- 用户要求计划必须足够具体，能由 CLI agent 执行、验证，并最终达到 agent governance runtime 的改造目的。

## Research Findings
- 当前 repo 已有 CLI 命令：`install`, `sync`, `doctor`, `status`, `summary`, `active-summary`, `verify`, `checkpoint`, `checkpoint-push`, `cloud-bootstrap`, `link-personal`, `adopt-global`, `adoption-status`, `worktree-preflight`。
- 当前 repo 架构是 `harness/core`, `harness/adapters`, `harness/installer`, `harness/upstream`；MCP facade 应加在 installer/runtime 之上，而不是 adapter 旁边复制一套投影逻辑。
- 当前 repo 没有 package lock file。引入 MCP SDK 时必须显式生成并提交 lock，避免 CLI agent 在不同机器拿到不同依赖解析结果。
- 官方 MCP TypeScript SDK 当前存在 v2/main 与 v1 production 推荐的分歧；实施应 pin 稳定 v1，或在执行前再次核对最新 SDK 状态。
- MCP server 官方文档支持 local stdio 和 remote Streamable HTTP；remote 阶段必须处理 host validation / auth / session model，不能从 stdio 直接跳到公网可写。
- MCP transport 官方文档要求 Streamable HTTP server 防 DNS rebinding：校验 `Origin`，本地优先 bind `127.0.0.1`，并对连接做认证。
- MCP authorization 规范对 HTTP transport 的授权建议基于 OAuth 2.1 / Protected Resource Metadata；stdio transport 不走 HTTP auth，凭据应来自环境。
- TypeScript SDK v1 文档显示 `McpServer` 来自 `@modelcontextprotocol/sdk/server/mcp.js`，stdio 使用 `@modelcontextprotocol/sdk/server/stdio.js`；SDK 支持 resources/tools/prompts、Streamable HTTP 和 stdio。
- GitHub README 显示 main 分支是 v2 pre-alpha，v1.x 仍是生产推荐线，latest release 为 v1.29.0；实施必须 pin v1 而不是误用 v2 split package。
- `verify` 只有默认 `--output=stdout` 是无写入；`--output=<dir>` 会写 `latest.json/latest.md`，因此 MCP read-only tool 必须固定 stdout/read mode。
- `doctor` 当前 CLI 实现会设置 `process.exitCode` 并输出文本；runtime service 需要拆出纯返回值，CLI wrapper 再负责 stdout/stderr/exit code。
- `sync --dry-run` 已经输出 JSON diff 且不写 manifest/state；Phase 1 可以复用其语义，但更稳的是把 planning 和 apply 拆成可导出的 runtime helper。
- `fd` 不可用，本机文件搜索用 `find` 退路。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 新增 `harness/runtime/**` service layer | 让 CLI 与 MCP 共用业务语义，避免 MCP wrapper 直接拼 shell 命令。 |
| 新增 `harness/mcp/**` server layer | 只承载 MCP schema/transport/registration，不承载 projection 业务逻辑。 |
| 工具命名使用 `harness_*` | 便于 MCP clients 展示和审计，避免与通用 shell/tools 混淆。 |
| Phase 1 使用 stdio server | 与本地 agent client 最契合，且无 HTTP 暴露面。 |
| 所有 write tools 都需要 `mode: "plan" | "apply"` 和 approval token/receipt | 让 dry-run 输出成为 apply 的输入基础，避免 agent 重新解释危险操作。 |
| 所有 MCP inputs 都必须 schema validate 且 reject unknown fields | 防止 client 多传路径、mode、command 等未审计字段。 |
| Tool response 同时返回 `structuredContent` 和短 text summary | 让 CLI tests 可稳定断言，同时保持人类可读。 |
| Phase 1 不暴露 prompts | 当前目标是 runtime facade，不需要 prompts；先避免 prompt injection / policy drift。 |
| Remote auth 拆成 3A localhost HTTP、3B authenticated remote | 让 CLI 可以先本地验证 transport，再对真实远端加 OAuth/resource-server 合规门槛。 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| “100% 确信”在云端/团队 registry 上受外部环境影响 | 将计划拆成本地可验证增量和外部门槛；Phase 1/2 必须完全本地可验证，Phase 3/4 先交付可测试骨架和模拟验证，再接真实平台凭证。 |
| MCP SDK 版本在 2026 年仍处于迁移期 | 执行时 pin 稳定 production SDK，并把 SDK upgrade 作为独立后续任务，不让它阻塞 facade 语义设计。 |
| `root?: string` 可能突破工作区边界 | 新增 `harness/runtime/root-policy.mjs`，默认只允许当前 repo；额外 roots 只能来自 `HARNESS_MCP_ROOTS` 或 profile 文件，并必须 realpath 后校验。 |
| MCP 自己签发 approval token 会让 agent 自批自用 | approval 只能由 MCP 外部命令/UI/预置签名文件生成；MCP apply tool 只验证 token，不生成 token。 |
| stdio server 如果用 `console.log` 会污染协议 stdout | MCP server 层禁止业务日志写 stdout；所有日志写 stderr，tool 内容走 MCP response。 |
| 真实云端支持不能靠 simulator 声称完成 | Phase 3 完成定义分为 contract complete 与 platform activated；platform activated 必须有 Codespaces/Copilot cloud/remote agent live smoke receipt。 |

## Implementation Findings
- `harness/mcp/stdio.mjs` 和 `harness/mcp/http.mjs` 必须区分 “被 import” 与 “被直接执行”；否则测试 import `runHttpSelfTest()` 时会意外启动常驻 server，污染 session 和端口。
- Streamable HTTP stateful session 需要在 `StreamableHTTPServerTransport` 构造时传入 `onsessioninitialized`；后设属性不会生效，客户端初始化后的第二个 POST 会丢 session。
- 对不支持 standalone SSE 的 server，`GET /mcp` 无 session 时返回 `405` 更符合 SDK client 预期；返回 `400` 会把“未实现该模式”误判成协议错误。
- MCP HTTP localhost self-test 在当前 sandbox 下会触发 `listen EPERM`；仓库级 `verify` 需要对这种环境限制做显式 skip，而不能让整套测试红掉。
- 公共 `createHarnessFixture()` 不能默认注入 live companion plans，也不能默认 symlink 整棵 `node_modules`；这会污染 health diagnostics，并把 hook payload measurement 拉慢到超时。

## Final Verification Facts
- `npm run test:mcp`：20/20 通过；包含 stdio handshake、safe-write、approval、registry/policy、HTTP local self-test、remote live-guard。
- `npm run verify`：354 通过，1 skip；唯一 skip 是 sandbox 阻止 localhost listen 的 `tests/mcp/http.test.mjs`。
- `node harness/mcp/http.mjs --profile=local --self-test`：提权环境通过，返回 `ok: true` 与 `toolCount: 7`。
- `./scripts/harness sync --dry-run`：零 diff。
- `./scripts/harness doctor --check-only`：通过，无 warning/problem。

## Documentation Decisions
- README 和 `docs/architecture.md` 现在显式区分三层：adapter projection、shared runtime services、MCP runtime facade。
- MCP 被定义为 control plane，不承担 IDE projection，不允许成为“第五个普通 adapter”。

## Resources
- Local: `/Users/jared/SuperpoweringWithFiles/README.md`
- Local: `/Users/jared/SuperpoweringWithFiles/docs/architecture.md`
- Local: `/Users/jared/SuperpoweringWithFiles/docs/roadmap.md`
- Local: `/Users/jared/SuperpoweringWithFiles/harness/installer/commands/harness.mjs`
- Local: `/Users/jared/SuperpoweringWithFiles/harness/installer/commands/status.mjs`
- Local: `/Users/jared/SuperpoweringWithFiles/harness/installer/commands/summary.mjs`
- External: `https://github.com/modelcontextprotocol/typescript-sdk`
- External: `https://modelcontextprotocol.io/docs/sdk`
- External: `https://ts.sdk.modelcontextprotocol.io/documents/server.html`
- External: `https://modelcontextprotocol.io/docs/concepts/transports`
- External: `https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization`

## Visual/Browser Findings
- No visual/browser screenshots used.
