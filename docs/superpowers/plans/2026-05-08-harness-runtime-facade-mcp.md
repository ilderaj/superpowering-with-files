# Harness Runtime Facade MCP Implementation Plan

Active task path: `planning/active/harness-runtime-facade-mcp/`
Lifecycle state: waiting_review
Sync-back status: complete

## 结论

这条路线可行，并且是正确的升级方向：superpowering-with-files 应该从 projection harness 升级为 agent governance runtime。

但 MCP 不能成为第五个 IDE adapter。现有 adapter 继续负责把 `harness/core` 投影为 Codex、Copilot、Cursor、Claude Code 的原生入口、skills、hooks 和 profiles。MCP 只新增 runtime control plane：让任何支持 MCP 的 agent 以 typed、safe、auditable 的方式调用 Harness 能力。

我对修订后的 plan 有执行信心，原因是它把外部不确定性从实现核心里剥离了：

- Phase 1/2 是本地、可重复、无云凭证依赖的实现与验证。
- Phase 3 先交付 localhost HTTP + auth contract tests，再要求真实云端 live smoke 后才算 platform activated。
- Phase 4 先交付本地 registry/policy/signature 验证，再接团队发布系统。

CLI agent 不允许把 simulator 通过说成 cloud activation，也不允许把 dry-run 通过说成 write capability 完成。

## Non-Negotiable Boundaries

1. MCP server 不能复制 adapter projection logic。
2. MCP tools 不能直接拼 shell 命令执行 Harness CLI。
3. CLI commands 和 MCP tools 必须共享 `harness/runtime/**` service layer。
4. `root` 输入必须经过 realpath + allowlist；默认只允许当前 repo。
5. stdio MCP server 不能向 stdout 写普通日志；stdout 只属于 MCP JSON-RPC。
6. 写操作 approval token 不能由 MCP tool 生成；MCP 只能验证外部 approval。
7. 所有 apply 都必须写 receipt；denied remote write attempts 也必须有 audit record。
8. 所有 tool input 必须 schema validate 并 reject unknown fields。
9. 所有 resource/tool output 必须有 size cap 和 secret/path redaction policy。
10. Phase 3/4 真实平台完成必须有 live smoke receipt；没有凭证时只能标记 contract complete。

## Target Architecture

```text
harness/core
  policy, templates, skills, safety, metadata

harness/adapters
  codex, copilot, cursor, claude-code projection manifests

harness/installer
  existing CLI wrappers

harness/runtime
  pure services for root policy, status, doctor, summary, verify-read,
  sync planning, safe apply, approvals, receipts, registry, policy

harness/mcp
  MCP schema registration, resources, tools, stdio transport, HTTP transport
```

`harness/runtime` is the keystone. If implementation skips this layer and wraps `./scripts/harness`, reject the PR.

## Phase 0: Execution Preflight

Goal: remove dependency and environment ambiguity before implementation.

### Required Checks

Run:

```bash
git status --short --branch
node --version
npm --version
node -e "console.log(process.versions.node)"
```

Then inspect package manager state:

```bash
find . -maxdepth 2 -type f \( -name package-lock.json -o -name pnpm-lock.yaml -o -name bun.lockb -o -name bun.lock -o -name yarn.lock \) -print
```

Current repo has no lock file and existing scripts use npm. Therefore the implementation should use npm and commit the generated `package-lock.json`.

### Dependency Pin

Use MCP TypeScript SDK v1 for this project until a separate SDK migration task explicitly moves to v2.

Expected install:

```bash
npm install @modelcontextprotocol/sdk@1.29.0 zod@^3.25.0
```

Reasons:

- Official TypeScript SDK README currently says the main branch is v2 pre-alpha while v1.x remains the recommended production line.
- v1 server docs expose `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`.
- v1 server docs expose stdio transport from `@modelcontextprotocol/sdk/server/stdio.js`.

If `npm install` cannot resolve that version, stop before coding and update only the dependency/version section after checking official docs. Do not improvise against v2 packages inside the same task.

## Phase 1: Local MCP Read-Only + Dry-Run

Goal: prove the facade locally with zero writes from MCP tools.

### Files

Add:

- `harness/runtime/root-policy.mjs`
- `harness/runtime/status-service.mjs`
- `harness/runtime/doctor-service.mjs`
- `harness/runtime/summary-service.mjs`
- `harness/runtime/verify-service.mjs`
- `harness/runtime/sync-plan-service.mjs`
- `harness/runtime/resource-service.mjs`
- `harness/runtime/redaction.mjs`
- `harness/mcp/server.mjs`
- `harness/mcp/stdio.mjs`
- `harness/mcp/tools/read-only.mjs`
- `harness/mcp/resources/read-only.mjs`
- `tests/mcp/root-policy.test.mjs`
- `tests/mcp/read-only-tools.test.mjs`
- `tests/mcp/resources.test.mjs`
- `tests/mcp/stdio-handshake.test.mjs`

Update:

- `package.json`
- `package-lock.json`
- existing CLI command modules only as thin wrappers over runtime services where needed.

### Runtime Refactor Rules

- `status-service` returns structured health data from `readHarnessHealth`.
- `doctor-service` returns `{ ok, problems, warnings, markdown }`; it must not call `process.exitCode`.
- `verify-service` supports read-only report generation only; it must not accept output paths.
- `sync-plan-service` returns the same semantic diff as `sync --dry-run`; it must not write manifest or state.
- `summary-service` returns task and active summaries without parsing CLI stdout.
- CLI commands may print output and set exit codes, but MCP services may not.

### Root Policy

Default:

- allowed root is `process.cwd()`.
- every requested root is resolved by `realpath`.
- symlinks are resolved before allowlist check.
- `..`, HOME-relative, absolute external repo, and non-existing roots are rejected.

Optional expansion:

- `HARNESS_MCP_ROOTS=/repo/a:/repo/b`
- profile files may add roots in Phase 3.

Every tool input with `root` must call `resolveHarnessRoot(input.root)`.

### Tools

Expose only:

- `harness_status`
- `harness_doctor`
- `harness_active_summary`
- `harness_task_summary`
- `harness_sync_dry_run`
- `harness_verify_read`

Tool response contract:

```js
{
  content: [{ type: "text", text: "short human summary" }],
  structuredContent: { ...stableJson }
}
```

Input schemas must reject unknown fields. No Phase 1 tool may accept arbitrary command args.

### Resources

Expose:

- `harness://status`
- `harness://active-tasks`
- `harness://task/{taskId}/task_plan`
- `harness://task/{taskId}/findings`
- `harness://task/{taskId}/progress`
- `harness://verification/latest`
- `harness://policy/base`
- `harness://adapters`
- `harness://commands`

Resource rules:

- max response size enforced.
- no HOME path exposure unless local profile explicitly permits.
- secret-like env values and token-looking strings redacted.
- no prompts in Phase 1.

### MCP Handshake Test

`stdio-handshake.test.mjs` must use a real MCP client from the SDK:

1. start `node harness/mcp/stdio.mjs --root <fixture>` via `StdioClientTransport`;
2. initialize client;
3. list tools;
4. call `harness_status`;
5. read `harness://active-tasks`;
6. assert server exits cleanly after client close.

Do not replace this with “process started successfully”.

### Verification

Run:

```bash
npm run test:mcp
npm run verify
./scripts/harness sync --dry-run
./scripts/harness doctor --check-only
git status --short
```

Required pass conditions:

- MCP server handshakes with a real client.
- tool list contains only read-only/dry-run tools.
- no Phase 1 MCP tool writes files.
- git status shows only expected implementation files and lock file.
- `sync --dry-run` and `doctor --check-only` still work.

## Phase 2: Safe Write Tools

Goal: add controlled writes without giving agents self-approval.

### Files

Add:

- `harness/runtime/write-plan.mjs`
- `harness/runtime/approval-token.mjs`
- `harness/runtime/audit-receipt.mjs`
- `harness/runtime/safe-apply.mjs`
- `harness/mcp/tools/write.mjs`
- `tests/mcp/safe-write.test.mjs`
- `tests/mcp/approval-token.test.mjs`
- `tests/mcp/receipt-ledger.test.mjs`

### Approval Model

MCP may expose apply tools, but it must not expose approval-token creation.

Approval tokens are created out-of-band by a local CLI or UI path:

```bash
./scripts/harness mcp-approve --plan <plan-id>
```

The approve command is not an MCP tool.

Token must bind:

- `planId`
- `planHash`
- operation
- resolved root
- actor label
- createdAt
- expiresAt

Apply rejects if any field differs from the current plan.

### Write Tools

Expose:

- `harness_install_plan`
- `harness_install_apply`
- `harness_sync_plan`
- `harness_sync_apply`
- `harness_checkpoint_plan`
- `harness_checkpoint_apply`
- `harness_record_progress`

Rules:

- `*_plan` never writes.
- `*_apply` requires approval token and exact plan hash.
- `harness_record_progress` is append-only.
- `harness_record_progress` may write only under `planning/active/<task-id>/{task_plan.md,findings.md,progress.md}`.
- `harness_record_progress` rejects root-level planning files, `docs/plans/**`, and `docs/superpowers/plans/**` unless the operation is an explicit companion-plan sync action.
- max append size enforced.

### Receipts

Every apply writes:

```text
.harness/mcp/receipts/<timestamp>-<operation>.json
```

Receipt includes:

- schemaVersion
- operation
- root
- actor
- planId
- planHash
- approval token id
- changed files
- verification commands
- result status
- denied reason if denied

### Verification

Run:

```bash
npm run test:mcp
npm run verify
./scripts/harness sync --check
./scripts/harness doctor --check-only
git status --short
```

Required pass conditions:

- apply without token fails.
- token generated for one plan cannot apply another plan.
- expired token fails.
- modified plan hash fails.
- successful apply writes exactly one receipt.
- receipt changed files match actual diff.
- MCP cannot generate approval token.

## Phase 3: Cloud-Ready Remote MCP

Goal: support remote agents without weakening governance.

### Split Completion Definition

Phase 3 has two statuses:

- `contract complete`: localhost HTTP, auth validator, profile policy, and contract tests pass.
- `platform activated`: real Codespaces/Copilot cloud/remote-agent live smoke passes and writes a receipt.

Do not mark Phase 3 fully complete without platform activation, unless the task explicitly scopes only to contract complete.

### Files

Add:

- `harness/mcp/http.mjs`
- `harness/mcp/auth.mjs`
- `harness/mcp/session-store.mjs`
- `harness/mcp/profile-policy.mjs`
- `harness/core/mcp/profiles/local.json`
- `harness/core/mcp/profiles/codespaces.json`
- `harness/core/mcp/profiles/copilot-cloud.json`
- `harness/core/mcp/profiles/remote-agent.json`
- `tests/mcp/http.test.mjs`
- `tests/mcp/auth.test.mjs`
- `tests/mcp/profile-policy.test.mjs`
- `tests/mcp/remote-security.test.mjs`

### Transport Rules

- local default is stdio.
- HTTP default binds `127.0.0.1`.
- binding beyond localhost requires explicit `--host`, auth config, and profile.
- validate `Origin` to prevent DNS rebinding.
- validate `Host` against profile allowlist.
- unauthenticated HTTP may expose only a health ping, not Harness resources.

### Auth Rules

For externally reachable HTTP, implement MCP-compatible resource-server behavior:

- Bearer token validation interface.
- Protected Resource Metadata endpoint or equivalent documented metadata.
- tests with mock token validator.
- no write tools unless principal + profile policy allows them.

Do not implement a full OAuth authorization server inside Harness. Harness should validate tokens issued by an external provider or local test issuer.

### Profiles

Profiles define:

- allowed tools
- allowed resources
- allowed roots
- path redaction mode
- write policy
- receipt location
- max response size
- allowed hosts/origins

Codespaces profile must not expose user-global files by default.

### Verification

Contract complete:

```bash
npm run test:mcp
node harness/mcp/http.mjs --profile=local --self-test
npm run verify
```

Platform activated:

```bash
node harness/mcp/http.mjs --profile=codespaces --self-test-live
```

The live test may require credentials and platform setup. If credentials are missing, record `contract complete; platform activation blocked by missing credentials`, not `complete`.

## Phase 4: Registry + Policy

Goal: team-level governed Harness distribution.

### Files

Add:

- `harness/core/registry/schema.json`
- `harness/core/registry/policies/local-dev.json`
- `harness/runtime/registry-service.mjs`
- `harness/runtime/policy-evaluator.mjs`
- `harness/runtime/policy-signature.mjs`
- `harness/mcp/tools/registry.mjs`
- `tests/mcp/registry-policy.test.mjs`
- `tests/mcp/policy-signature.test.mjs`

### Registry Entries

Each bundle records:

- harness version
- source repo commit
- policy bundle digest
- supported IDE targets
- allowed MCP profiles
- required verification gates
- rollout channel
- deprecation status
- signature metadata

### Policy Rules

- local-dev may allow unsigned bundles only in fixtures.
- team profiles require signed bundles.
- older bundles cannot silently overwrite newer verified bundles.
- policy diff must be deterministic.
- distribution apply requires out-of-band approval and receipt.

### Tools

Expose:

- `harness_registry_status`
- `harness_policy_evaluate`
- `harness_policy_diff`
- `harness_distribution_plan`
- `harness_distribution_apply`

### Verification

Run:

```bash
npm run test:mcp
npm run verify
./scripts/harness doctor --check-only
```

Required pass conditions:

- invalid policy fails schema validation.
- unsigned team policy fails.
- deterministic policy diff snapshot passes.
- distribution apply requires approval token.
- receipt records policy digest and target channel.

## Final Acceptance Contract

The overall migration reaches the stated goal only when all of these are true:

1. `npm run verify` passes.
2. `npm run test:mcp` passes.
3. `./scripts/harness doctor --check-only` passes.
4. MCP stdio handshake test passes with a real SDK client.
5. Read-only tools cannot write files.
6. Write tools cannot run without out-of-band approval.
7. Every successful or denied write attempt creates an audit receipt.
8. Root allowlist tests prove external paths are rejected.
9. Remote HTTP contract tests prove host/origin/auth/profile boundaries.
10. Registry policy tests prove deterministic policy and signed team distribution.
11. Docs state clearly that adapter projection and MCP runtime facade are separate layers.

If any item fails, CLI agent must not report the migration complete.

## Why This Plan Is Now Executable

The original idea was directionally right but still had execution loopholes. The revised plan closes the ones that would most likely break CLI implementation:

- dependency line is pinned to MCP SDK v1;
- runtime services are required before MCP wrappers;
- root inputs cannot escape allowed repos;
- stdio protocol cannot be corrupted by logs;
- write approval cannot be self-issued by the agent;
- remote cloud support has a contract-complete vs platform-activated split;
- registry distribution requires signed policy outside local fixtures.

This is enough for a gpt5.4 CLI agent to implement in phases, verify each phase, and avoid falsely claiming completion.
