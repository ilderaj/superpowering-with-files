# Cloud Dev Harness Feasibility Report

Active task path: `planning/active/cloud-dev-harness-feasibility/`
Lifecycle state: waiting_review
Sync-back status: complete
Implementation plan: `docs/superpowers/plans/2026-05-10-cloud-dev-harness-implementation-plan.md`

## Executive Summary

结论：可行，但应做成一个 **Copilot cloud repo-local overlay + protected `cloud-dev` staging lane**，而不是把 Harness 全量 global adoption 推进 GitHub cloud，也不是让 cloud agent 直接写 `dev`、`main` 或本地 checkout。

本项目已经具备一半以上基础：

- `cloud-safe` policy 已存在。
- `deploymentProfile=github-cloud` 已存在，并把 Copilot workspace skills 切到 `.github/skills`。
- `cloud-bootstrap --target=codespaces` 已能生成 Codespaces bootstrap，并运行 `install --scope=workspace --profile=cloud-safe --deployment-profile=github-cloud --hooks=on`。
- 现有 upstream refresh workflow 已提供一个可复用的自动化治理模式：显式开关、最小权限、artifact 结果、可选 PR 创建、固定 automation 分支。

推荐路线：

1. 在 `main` 或当前默认分支中合入最小 cloud harness baseline，使 Copilot cloud agent 能稳定读取 `.github/**` 下的 instructions/hooks/skills。
2. 创建受保护的 `cloud-dev` 分支，作为云端任务的 staging base，不作为本地开发分支，也不自动 sync 到本地。
3. 每个 issue/task 生成独立工作分支，例如 `cloud-dev/123-short-slug`，PR base 指向 `cloud-dev`。
4. `cloud-dev` 到 `dev` 必须通过人工 review 或严格 gate 的 PR；`dev` 到 `main` 继续走现有 release lane。
5. 用 Issues label/assignment/`@copilot` 作为 v1 触发方式；Actions 只做 triage、preflight、状态记录和可选提醒。只有在 GitHub 提供稳定 API 后，再让 Actions 主动创建 cloud agent sessions。

## Feasibility Verdict

| Area | Verdict | Notes |
| --- | --- | --- |
| 本项目采用自身 Harness | 可行 | 已有 workspace install、cloud-safe overlay、github-cloud deployment profile。 |
| 只作用于 cloud dev 分支 | 基本可行 | repo-level instructions/hooks 一旦在 default branch 生效，对该 repo 的 Copilot cloud 都可见；但写入和 merge 可以限制到 `cloud-dev` lane。 |
| 不污染关键 branches | 可行 | 需要 branch protection、rulesets、required checks、禁止 direct push、PR-only promotion。 |
| 不 sync 到本地 | 可行 | 技术上不要建立本地自动 fetch/merge；流程上把 `cloud-dev` 标为 remote-only staging。用户本地仍可手动 fetch，但不自动改变本地 `dev`。 |
| issue 触发 cloud agent 开发测试提交 PR | 部分可行 | issue assignment / `@copilot` / GitHub UI 是稳定入口；Actions 主动触发 cloud agent 需要确认可用 API。Actions 可先做 triage 与 gating。 |
| 推广到其它 repos | 可行 | 需要 repo capability checklist 和 opt-in bootstrap；不能盲目全量投影到所有 repo。 |

## Hard Constraints

1. Copilot cloud agent 在 GitHub Actions-powered ephemeral environment 中工作，可以研究、计划、改代码、跑测试、推 branch、开 PR。
2. 单次任务只能操作指定 repository、一个 branch、一个 PR。
3. `.github/hooks/*.json` 必须存在于 default branch 才会被 Copilot cloud agent 使用。
4. Project skills 支持 `.github/skills`、`.claude/skills`、`.agents/skills`；本方案应优先使用 `.github/skills`。
5. 一旦 cloud harness 文件进入 repository，本地 checkout 会看到这些文件；无法做到“repo 文件存在但本地完全不可见”。能做到的是：不自动同步本地分支，并把 cloud 专用能力限制在 `.github/**`，减少本地 Codex/Claude/Cursor 串扰。
6. 不应把 `git worktree` 当作 GitHub cloud 持久隔离面。cloud 的可靠隔离面是 branch、PR、ruleset、environment 和 workflow permissions。

## Recommended Architecture

### Branch Topology

| Branch | Role | Write Policy | Promotion |
| --- | --- | --- | --- |
| `main` | release/default baseline | protected, PR only | from `dev` release gate |
| `dev` | human/local integration | protected, PR only | from reviewed feature or `cloud-dev` PR |
| `cloud-dev` | remote-only cloud staging base | protected, no direct human/agent push except controlled base sync | PR into `dev` after checks/review |
| `cloud-dev/<issue>-<slug>` | per-task cloud work branch | Copilot/automation may push | PR into `cloud-dev` |
| `automation/*` | workflow-owned maintenance branches | workflow only | PR into configured base |

`cloud-dev` should be treated as a rebuildable staging branch whose base is `origin/dev`, not as an independent long-lived product branch. The safest invariant is:

```text
main <- dev <- cloud-dev <- cloud-dev/<issue>-<slug>
```

Promotion is one-way and PR-only:

```text
cloud task branch -> cloud-dev -> dev -> main
```

### Base Sync Policy

`origin/dev` remains the integration source of truth. `cloud-dev` should be refreshed from `origin/dev` only under safe conditions:

1. If `cloud-dev` has no commits ahead of `origin/dev`, fast-forward or reset it to `origin/dev` through a controlled workflow.
2. If `cloud-dev` has cloud commits not yet promoted, do not force-update it. Either wait for promotion/closure, or create a new staging branch such as `cloud-dev-next` for new tasks.
3. Never use local `dev` as cloud base. Use `refs/remotes/origin/dev` or GitHub branch refs only.
4. Record the base SHA for each cloud task in PR body and/or `planning/active/<task-id>/progress.md` when the task creates planning state.
5. If `origin/dev` advances while a cloud task is open, the task branch should rebase/merge from `cloud-dev` only after `cloud-dev` has been safely refreshed.

This avoids the local/dev vs origin/dev mismatch: cloud never depends on local `dev`; local never auto-ingests `cloud-dev`.

### Harness Projection Surface

Use only Copilot cloud-native repo-local surfaces for v1:

| Path | Use |
| --- | --- |
| `.github/copilot-instructions.md` | Thin Harness entry for Copilot cloud. |
| `.github/instructions/*.instructions.md` | Optional smaller instruction modules if the entry needs to stay thin. |
| `.github/skills/planning-with-files/**` | Project planning skill projected through `github-cloud` deployment profile. |
| `.github/skills/superpowers/**` | Only if cloud agent must use Superpowers; otherwise keep skill surface minimal. |
| `.github/hooks/*.json` | Planning/safety hooks that must be available from default branch. |
| `.github/hooks/*` scripts | Hook helpers referenced by hook JSON. |
| `.github/agents/*.agent.md` | Optional custom agents, e.g. planner/tester/implementation agent. |

Avoid in v1:

- root `AGENTS.md` as a cloud-only control surface
- shared `.agents/skills` for cloud-only skills
- user-global install or `--scope=both`
- broad MCP write access before branch/ruleset gates are proven

### Cloud Agent Flow

Recommended v1 flow:

1. Human creates or labels an issue with `cloud-dev` and a task type label such as `agent:plan`, `agent:impl`, or `agent:test`.
2. A triage workflow validates the issue labels, branch protection status, and whether `cloud-dev` is safe to use.
3. The issue is assigned to Copilot or receives an explicit `@copilot` instruction with required base: `cloud-dev`.
4. Copilot creates a per-task branch and commits changes there.
5. Copilot opens or updates a PR into `cloud-dev`.
6. Required checks run: `npm run verify`, `./scripts/harness verify --output=.harness/verification`, `./scripts/harness doctor --check-only`, and any focused tests.
7. Human reviews and merges into `cloud-dev`.
8. A separate promotion PR from `cloud-dev` to `dev` is opened manually or by a guarded workflow when `cloud-dev` is green.

Actions should not be responsible for silently merging agent output. They can prepare, validate, comment, open PRs, and block unsafe states.

## Implementation Plan

### Phase 1: Repo Policy And Branch Rules

Goal: establish cloud branch isolation before giving any agent write path.

Tasks:

1. Create `cloud-dev` from `origin/dev`.
2. Protect `main`, `dev`, and `cloud-dev`.
3. Require PR before merging into all three protected branches.
4. Require status checks for `cloud-dev` and `dev`:
   - `npm run verify`
   - Harness verify or equivalent workflow job
   - Harness doctor/check-only job
5. Restrict direct pushes to `main` and `dev`.
6. Allow Copilot or automation to push only to task branches, not directly to `cloud-dev`.
7. Document branch roles in `docs/workflows.md` or a new cloud workflow doc.

Finishing criteria:

- `cloud-dev` exists on origin.
- Branch protection prevents direct push to `dev` and `main`.
- A test PR into `cloud-dev` must pass checks before merge.

### Phase 2: Cloud Harness Baseline

Goal: install the repo-local Copilot cloud Harness surface without touching user-global state.

Tasks:

1. Run in a controlled branch:

```bash
./scripts/harness install --targets=copilot --scope=workspace --profile=cloud-safe --deployment-profile=github-cloud --hooks=on
./scripts/harness sync
./scripts/harness doctor --check-only
```

2. Review generated files and ensure cloud-specific content is limited to `.github/**` and `.harness/state.json` if tracked by design.
3. If Codespaces is desired, run:

```bash
./scripts/harness cloud-bootstrap --target=codespaces
```

4. Commit only the intended repo-local cloud files.
5. Merge the baseline through PR into default branch so hooks become available to cloud agent sessions.

Finishing criteria:

- `.github/copilot-instructions.md`, `.github/skills/**`, and `.github/hooks/**` are present as intended.
- `doctor --check-only` reports healthy installation.
- Hooks are present on default branch before relying on them.

### Phase 3: Issue Triage Workflow

Goal: convert GitHub issues into safe, explicit cloud tasks without giving Actions unchecked merge authority.

Suggested workflow triggers:

```yaml
on:
  issues:
    types: [labeled, assigned, opened]
  issue_comment:
    types: [created]
  workflow_dispatch:
```

Suggested behavior:

1. Detect labels such as `cloud-dev`, `agent:plan`, `agent:impl`, `agent:test`.
2. Validate branch state:
   - `origin/cloud-dev` exists
   - `origin/dev` exists
   - `cloud-dev` is not dangerously behind `origin/dev`
   - no promotion freeze label or repo variable is active
3. Comment with a normalized Copilot prompt that states:
   - base branch: `cloud-dev`
   - required verification commands
   - forbidden branches: `main`, `dev`
   - PR target: `cloud-dev`
4. Optionally assign Copilot if GitHub exposes stable assignment behavior for the repo plan.
5. Upload a small artifact or issue comment with the preflight result.

Finishing criteria:

- Labeling an issue produces a deterministic preflight comment.
- Unsafe branch state results in a blocking comment, not an agent task.
- The workflow does not merge or force-push.

### Phase 4: Cloud Dev Base Sync Workflow

Goal: keep `cloud-dev` fresh enough without local sync or unsafe force-pushes.

Suggested triggers:

```yaml
on:
  workflow_dispatch:
    inputs:
      mode:
        type: choice
        options: [check, sync]
        default: check
  schedule:
    - cron: '0 2 * * 1-5'
```

Safe sync rules:

1. Default scheduled mode should be check-only unless repository variable `CLOUD_DEV_SYNC_ENABLED=true`.
2. Sync only when no open PR targets `cloud-dev` or when all open PRs are explicitly marked rebase-safe.
3. If `cloud-dev` is strictly behind `origin/dev`, fast-forward it.
4. If `cloud-dev` has commits ahead of `origin/dev`, stop and report.
5. If history diverged, stop and require manual intervention.

Finishing criteria:

- Check-only run reports exact SHAs for `origin/dev` and `origin/cloud-dev`.
- Sync run refuses divergent histories.
- No local branch is touched.

### Phase 5: Promotion From Cloud To Dev

Goal: make cloud output visible to the normal development lane only after review.

Tasks:

1. When `cloud-dev` is green, open a PR from `cloud-dev` to `dev`.
2. Require human review or a stricter owner review for files under Harness policy/projection areas.
3. Run full verification before merge.
4. After merge, run existing local sync helper only if the human wants local `dev` updated.

Finishing criteria:

- `dev` receives cloud changes only through PR.
- Local checkout does not update unless explicitly fetched/merged by the developer.

### Phase 6: Generalize To Other Repos

Goal: make this repeatable without assuming every repo can accept the same Harness surface.

Create a per-repo adoption checklist:

1. Repo is hosted on GitHub and Copilot cloud agent is enabled.
2. Repo has CI that can run from PRs.
3. Branch protection can be configured.
4. Project accepts `.github/**` customization files.
5. Secrets needed by tests are either absent, mockable, or explicitly placed in a constrained Copilot environment.
6. No production deploy workflow runs automatically from cloud task branches.
7. The repo has an agreed promotion path from `cloud-dev` to its normal integration branch.

Suggested rollout tiers:

| Tier | Scope | Use Case |
| --- | --- | --- |
| Tier 0 | docs-only cloud planning | Low trust / first adoption |
| Tier 1 | tests/docs/refactors | Safe incremental work |
| Tier 2 | feature implementation behind PR gates | Mature CI and branch protection |
| Tier 3 | multi-repo orchestration | Not recommended until MCP/API governance is explicit |

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Cloud harness visible in local checkout | Local users see `.github/**` files | Accept repo visibility; avoid user-global writes and shared roots. |
| Agent PR targets wrong branch | Pollution of `dev` or `main` | Branch protection, prompt template, workflow preflight, PR base checks. |
| `cloud-dev` drifts from `origin/dev` | Conflicts and stale work | Scheduled check-only sync, fast-forward-only refresh, stop on divergence. |
| Actions over-automates agent triggering | Unreviewed work starts too easily | Start with comments/assignment only; require labels and repo variable gates. |
| Hooks fail because not on default branch | Cloud Harness appears installed but inactive | Merge hook baseline to default before depending on hooks. |
| Secrets leak or unsafe network writes | Credential exposure | `cloud-safe`, Copilot environment scoping, no host credential files, no broad MCP write access. |
| Other repos lack CI maturity | Bad PR quality | Tiered rollout; require per-repo readiness checklist. |

## Recommended First Pilot

Pilot this repository first, but keep the first run conservative:

1. Enable `cloud-dev` branch protection.
2. Create a docs-only issue labeled `cloud-dev` and `agent:plan`.
3. Let Copilot cloud agent produce a markdown-only PR into `cloud-dev`.
4. Confirm hooks, planning files, PR body, and verification output.
5. Promote `cloud-dev` to `dev` only after human review.
6. Then try a low-risk test/doc/code hygiene issue.

The first pilot should not touch release logic, signing, secrets, publishing, or cross-repo changes.

## Open Questions For Execution

These do not block the feasibility conclusion, but they should be answered before implementation:

1. Is `main` currently the repository default branch in GitHub settings, and will hooks be merged there first?
2. Should `cloud-dev` PRs eventually target `dev` directly after confidence grows, or always stage through `cloud-dev`?
3. Which GitHub plan/org policy controls Copilot cloud agent access for this repo?
4. Should custom agents live in `.github/agents/` for planner/tester roles, or should v1 rely on default Copilot cloud agent plus skills?
5. Is Actions allowed to assign Copilot automatically in this repo, or should it only comment with a prompt for manual assignment?

## Final Recommendation

Proceed with a staged pilot. The architecture is sound if the repo treats GitHub cloud development as a remote-only PR lane with explicit promotion gates. Do not try to make cloud Harness invisible to local checkouts; instead, constrain it to `.github/**`, keep all write activity on cloud task branches, and make `cloud-dev` a protected staging branch whose base is always reasoned from `origin/dev`, never local `dev`.

## References

- `docs/install/copilot.md`
- `docs/workflows.md`
- `docs/architecture.md`
- `harness/core/policy/cloud-safe.md`
- `harness/installer/commands/cloud-bootstrap.mjs`
- `harness/installer/lib/state.mjs`
- `harness/core/metadata/platforms.json`
- `planning/archive/20260506-220241-origin-cloud-harness-deployment-plan/findings.md`
- https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent
- https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/use-hooks
- https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/create-custom-agents
- https://docs.github.com/copilot/concepts/agents/about-agent-skills
