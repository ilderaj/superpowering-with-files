# Repo Workflow Replay Acceptance Scenarios

## Purpose
These scenarios are an opt-in cross-workflow acceptance replay for the main user-visible Harness command families.

Unlike the ponytail A/B pack, this replay does not compare two prompting styles. It exercises a single fresh fixture root and checks that the top-level command surfaces still produce sane user-facing outcomes when used in sequence.

The replay currently has eleven lanes:
- `happy-path`:
  - one clean sequence showing the main command families all work together
- `degraded`:
  - warning-bearing and expected-failure scenarios that prove user-visible guardrails still fire correctly
- `lifecycle`:
  - reconciliation-open scenarios that prove status surfaces still describe unhealthy state accurately
- `trust-boundary`:
  - target expansion plus authority-root and install guardrails that should fail loudly instead of mutating the wrong scope
- `mixed-scope`:
  - real multi-target and both-scope install flows that should stay explainable on user-visible verify surfaces
- `additional-targets`:
  - target-specific install defaults and a real all-target replay that widen the live target matrix
- `sync-preview`:
  - cross-target dry-run previews that prove multi-target projection plans stay readable and read-only before sync writes anything
- `reporting`:
  - reporting and audit surfaces that should stay readable, targetable, and read-only even when they fail loudly
- `execution-lifecycle`:
  - execution receipt and followup-closure governance signals that should stay visible on the active-summary surface
- `companion-reconciliation`:
  - companion drift and placeholder reconciliation signals that should stay governable on the active-summary surface
- `workspace-link`:
  - nested git leaf workspaces that should recover parent authority-root routing after an explicit workspace-link

## Method
- Start from one fresh Harness fixture root.
- Keep the same repo fixture root for the entire replay.
- Use a nested leaf directory whenever root-resolution behavior is part of the claim.
- Allow scenario-local state reseeding when a user-global workflow would otherwise be blocked by an earlier workspace install.
- Record the replay with `scripts/run-repo-workflow-acceptance.mjs`.
- Use `--variant=degraded`, `--variant=lifecycle`, `--variant=trust-boundary`, `--variant=mixed-scope`, `--variant=additional-targets`, `--variant=sync-preview`, `--variant=reporting`, `--variant=execution-lifecycle`, `--variant=companion-reconciliation`, or `--variant=workspace-link` when replaying the non-happy-path lanes.

## Scenario Set

### Happy-Path Lane

### 1. Workspace Install From Leaf
- Surface:
  - `./scripts/harness install --scope=workspace --targets=codex`
- Claim:
  - a nested leaf cwd still resolves to the authority root and produces a usable workspace install.

### 2. Sync Dry Run
- Surface:
  - `./scripts/harness sync --dry-run`
- Claim:
  - the user can inspect the desired projection diff without mutating sync state.

### 3. Verify Report
- Surface:
  - `./scripts/harness verify --output=<dir>`
- Claim:
  - verification writes a stable markdown and JSON report to the requested directory.

### 4. Doctor Check Only
- Surface:
  - `./scripts/harness doctor --check-only`
- Claim:
  - a healthy projected fixture reports a clean user-visible doctor result.

### 5. Active Summary JSON
- Surface:
  - `./scripts/harness active-summary --json`
- Claim:
  - the task lifecycle summary still reports the active task correctly from a nested leaf directory.

### Degraded Lane

### 6. Verify Overlap Warning
- Surface:
  - `./scripts/harness verify`
- Claim:
  - a both-scope Copilot install still surfaces overlap guidance and ledger detail instead of silently looking healthy.

### 7. Doctor Personal-Path Problem
- Surface:
  - `./scripts/harness doctor --check-only`
- Claim:
  - projected entry content containing a personal path still fails loudly on the user-visible doctor surface.

### Lifecycle Lane

### 8. Active Summary Reconciliation Open
- Surface:
  - `./scripts/harness active-summary --json`
- Claim:
  - a closed archive-eligible task with an open reconciliation signal still stays non-ready and emits a lifecycle anomaly.

### Trust-Boundary Lane

### 9. Install Rejects User-Global Safety Profile
- Surface:
  - `./scripts/harness install --scope=user-global --profile=safety`
- Claim:
  - workspace-only safety profiles still fail loudly instead of mutating a user-global install.

### 10. Workspace-Link Rejects External Authority Root
- Surface:
  - `./scripts/harness workspace-link --root=<external-root>`
- Claim:
  - a leaf workspace still refuses to bind itself to an unrelated authority root outside its ancestry.

### Mixed-Scope Lane

### 11. Workspace Install Cursor From Leaf
- Surface:
  - `./scripts/harness install --scope=workspace --targets=cursor`
  - `./scripts/harness sync`
  - `./scripts/harness verify`
- Claim:
  - a nested leaf workspace can install Cursor, project the native `.cursor/rules/harness.mdc` rule, and still verify cleanly.

### 12. Verify Copilot Overlap After Real Both-Scope Install
- Surface:
  - `./scripts/harness install --scope=both --targets=copilot --hooks=on`
  - `./scripts/harness verify`
- Claim:
  - a real both-scope Copilot install still surfaces overlap guidance on the user-visible verification report instead of relying on seeded state only.

### 13. Install Both-Scope Codex Defaults Minimal-Global
- Surface:
  - `./scripts/harness install --scope=both --targets=codex`
  - `./scripts/harness verify`
- Claim:
  - a both-scope Codex install keeps the minimal-global default while still producing a coherent verification report.

### Additional-Targets Lane

### 14. Workspace Install Copilot Default Profile
- Surface:
  - `./scripts/harness install --scope=workspace --targets=copilot`
  - `./scripts/harness verify`
- Claim:
  - a Copilot-only workspace install keeps the target-specific `copilot-default` skills profile while still producing a coherent verification report.

### 15. Workspace Install Claude Code With Hooks
- Surface:
  - `./scripts/harness install --scope=workspace --targets=claude-code --hooks=on`
  - `./scripts/harness verify`
- Claim:
  - a Claude Code workspace install can enable hooks, project `CLAUDE.md`, and still verify coherently on the user-visible surface.

### 16. Install Both-Scope All Targets
- Surface:
  - `./scripts/harness install --scope=both --targets=all`
  - `./scripts/harness verify --output=<dir>`
- Claim:
  - a real all-target both-scope install still yields an explainable verification report whose selected-target set matches the live install state.

### Sync-Preview Lane

### 17. Sync Dry Run Both-Scope All Targets From State
- Surface:
  - `./scripts/harness sync --dry-run`
- Claim:
  - a both-scope all-target preview exposes the multi-target projection plan while leaving projections and sync state untouched.

### 18. Sync Dry Run Both-Scope Copilot Hooks From State
- Surface:
  - `./scripts/harness sync --dry-run`
- Claim:
  - a both-scope Copilot preview exposes hook-config and hook-script work for both scopes without writing any projection state.

### 19. Sync Dry Run Workspace Claude Hooks From State
- Surface:
  - `./scripts/harness sync --dry-run`
- Claim:
  - a workspace Claude Code preview exposes settings-format hook work without writing `CLAUDE.md` or sync metadata.

### Reporting Lane

### 20. Sync Check Out Of Sync From Leaf
- Surface:
  - `./scripts/harness sync --check`
- Claim:
  - a nested leaf workspace still fails loudly when projections drift, while keeping entries and projection manifests untouched.

### 21. Summary Task Route Line With Multiple Active Tasks
- Surface:
  - `./scripts/harness summary --task <task-id>`
- Claim:
  - an explicitly requested task still renders the compact route line even when other active tasks exist.

### 22. Token Audit Weekly Summary
- Surface:
  - `./scripts/harness token-audit --sessions-root=<path> --date-from=<iso> --date-to=<iso>`
- Claim:
  - the weekly audit still renders a stable markdown summary with token totals, model mix, and heuristic task-family hints.

### Execution-Lifecycle Lane

### 23. Active Summary Blocked Execution Open Followup
- Surface:
  - `./scripts/harness active-summary --json`
- Claim:
  - blocked execution receipts and their open followups stay visible as first-class governance anomalies on the live summary surface.

### 24. Active Summary Failed Execution Unit
- Surface:
  - `./scripts/harness active-summary --json`
- Claim:
  - failed execution units stay distinguishable from blocked ones instead of collapsing into generic warnings.

### 25. Active Summary Resolved Followup Closure
- Surface:
  - `./scripts/harness active-summary --json`
- Claim:
  - once closure evidence resolves a followup, the live summary suppresses the open-followup anomaly while still retaining receipt history.

### Companion-Reconciliation Lane

### 26. Active Summary Archive-Ready Companion Blocker
- Surface:
  - `./scripts/harness active-summary --json`
- Claim:
  - a supposedly archive-ready task still stays blocked when its companion lifecycle metadata drifts out of sync.

### 27. Active Summary Active Companion Drift Warning
- Surface:
  - `./scripts/harness active-summary --json`
- Claim:
  - active tasks surface companion drift as a warning before archive readiness is even in play.

### 28. Active Summary Placeholder Reconciliation Open
- Surface:
  - `./scripts/harness active-summary --json`
- Claim:
  - blank or template reconciliation artifacts stay open instead of silently becoming archive-ready.

### Workspace-Link Lane

### 29. Workspace-Link Restores Parent Status Across Git Boundary
- Surface:
  - `./scripts/harness workspace-link --root=<authority-root>`
  - `./scripts/harness status`
- Claim:
  - a nested leaf workspace with its own git boundary can recover the parent authority-root status surface after an explicit workspace-link.

### 30. Workspace-Link Rewrites Bogus Override And Restores Summary
- Surface:
  - `./scripts/harness workspace-link --root=<authority-root>`
  - `./scripts/harness summary`
- Claim:
  - a bogus leaf override can be rewritten deterministically, after which the leaf regains access to parent planning summaries.

### 31. Workspace-Link Routes Install And Sync Back To Parent Authority Root
- Surface:
  - `./scripts/harness workspace-link --root=<authority-root>`
  - `./scripts/harness install --scope=workspace --targets=cursor`
  - `./scripts/harness sync`
  - `./scripts/harness verify`
- Claim:
  - once linked, a nested git leaf can install and sync through the parent authority root without writing local Harness state or local target projections.
