# Harness Global Auto-Apply Adoption Plan

> Companion artifact for deep reasoning. Authoritative task memory remains under `planning/active/global-auto-apply-adoption/`.

## Linked Task Memory

- Active task: `planning/active/global-auto-apply-adoption/`
- Task plan: `planning/active/global-auto-apply-adoption/task_plan.md`
- Findings: `planning/active/global-auto-apply-adoption/findings.md`
- Progress: `planning/active/global-auto-apply-adoption/progress.md`

## Problem Framing

用户要解决的不是“如何更新仓库 upstream baseline”，而是：

1. 当 `HarnessTemplate` repo 自身更新后，
2. 如何把新的 Harness 规则自动 apply 到当前机器的 user-global 安装面，
3. 并能验证 adoption 确实成功、逻辑已经对齐，
4. 同时不碰存量 workspace harness。

## Current Capability Split

### Already exists

- `fetch` / `update`: 处理 upstream baseline 刷新
- `install`: 记录安装意图（scope / targets / profile / hooks / projection）
- `sync`: 根据 state 把 projection 写到 target roots
- `doctor`: 判断安装健康
- `status`: 输出结构化健康状态
- `verify`: 输出验证报告

### Missing closure

- 没有一个命令把“user-global adoption”当成一等动作
- 没有 adoption receipt / repo-head stamp
- 没有自动触发器把 repo 更新和 global apply 绑定起来
- 没有专门针对“当前机器是否 adopt 到当前 repo HEAD”的 drift detector

## Option Comparison

### Option A: Keep manual `sync`

- 做法：
  - 每次 repo 更新后，手动运行 `./scripts/harness sync && ./scripts/harness doctor --check-only`
- 优点：
  - 实现最便宜
  - 风险最低
- 缺点：
  - 仍依赖人工记忆
  - 没有 adoption receipt
  - 无法保证长期收敛

### Option B: Make `update` implicitly apply user-global

- 做法：
  - `update` 之后自动跑 user-global `sync/doctor/verify`
- 优点：
  - 用户感知最少
- 缺点：
  - 语义耦合错误：`update` 是 repo baseline mutation，不应偷偷改 operator machine
  - CI / disposable env / local testing 都会被混入真实全局副作用
  - 不利于 workspace-only or repo-only use cases

### Option C: Add explicit `adopt-global` orchestration plus optional local automation

- 做法：
  - 新增专门命令，例如 `./scripts/harness adopt-global`
  - 命令负责：
    - 校验或写入 user-global install state
    - 执行 sync
    - 执行 doctor/status/verify
    - 写 adoption stamp / receipt
  - 再通过本机自动化触发它，例如 launchd、Codex automation、或本地 git post-merge wrapper
- 优点：
  - 命令语义清楚
  - 可单独验证和回滚
  - 既支持手动执行，也支持后续自动化
  - 不污染 `update` 的边界
- 缺点：
  - 需要补一层 orchestration 和 state stamp

## Recommended Architecture

采用 Option C。

核心原则：

1. 保持 `update` 只负责 repo baseline。
2. 新增 `adopt-global` 作为 user-global 收敛入口。
3. 自动化只调 `adopt-global`，不直接拼装零散命令。
4. adoption success 以 receipt / stamp + health report 为准，不以“命令跑过了”作为成功定义。

## Proposed Flow

### Phase A: Add a first-class global adoption command

Command sketch:

```bash
./scripts/harness adopt-global --targets=all --profile=minimal-global --mode=ensure
```

Responsibilities:

1. Read desired config from repo defaults or explicit flags
2. Ensure user-global install state exists and is consistent
3. Run `sync`
4. Run `doctor --check-only`
5. Run `status`
6. Run `verify --output=.harness/verification`
7. Persist adoption receipt

### Phase B: Persist adoption evidence

Add a file such as:

- `.harness/adoption/global.json`

Suggested fields:

- `repoHead`
- `repoBranch`
- `appliedAt`
- `scope`
- `targets`
- `skillProfile`
- `hookMode`
- `status`
- `doctorPassed`
- `verificationReportPath`

This becomes the machine-local proof that “this machine has adopted repo HEAD X”.

### Phase C: Add drift detection

Add a lightweight check command:

```bash
./scripts/harness adoption-status --scope=user-global
```

It should compare:

- current repo HEAD
- current install state
- current projection health
- last adoption receipt

Possible statuses:

- `in_sync`
- `needs_apply`
- `apply_failed`
- `state_mismatch`

### Phase D: Add local trigger

Preferred trigger order:

1. Local scheduled/heartbeat automation
2. Local wrapper command around repo update
3. Git hook / post-merge only as optional convenience

Reason:

- repo update may happen via multiple tools, not only CLI git pull
- scheduled reconciliation is more robust than assuming one update path

## Why not auto-apply workspaces

- 用户已经明确要求不动存量 workspace。
- workspace adoption 可能有 project delta / autonomous rules / historical plans。
- 全局 baseline 和 workspace delta 是两层治理，不应混在一次自动 apply 里。

## Verification Definition

Adoption is considered successful only if all conditions hold:

1. `sync` finished without projection conflicts
2. `doctor --check-only` passed
3. `status` has no target problems
4. verification report generated successfully
5. adoption receipt records current repo HEAD

## Failure Handling

- Default policy: fail-fast, no partial success claim
- If `sync` or `doctor` fails:
  - do not update receipt to success
  - keep previous successful receipt
  - record failure receipt or log
- Optional future enhancement:
  - add backup conflict mode for safer reconciliation

## Implementation Shape

Expected new code areas:

- `harness/installer/commands/adopt-global.mjs`
- `harness/installer/commands/adoption-status.mjs`
- `harness/installer/lib/adoption.mjs`
- tests for:
  - receipt write/read
  - drift detection
  - doctor/status/verify orchestration
  - fail-fast behavior
  - user-global-only scope enforcement

## Deliverable For This Task

本任务只输出：

- feasibility judgment
- recommended architecture
- phased executable plan

本任务不直接实现自动化。
