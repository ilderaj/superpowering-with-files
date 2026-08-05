# Repo Workflow Acceptance Matrix

This matrix describes the current repo-wide acceptance and UAT evidence surface.

It is not an always-on CI gate by itself. The goal is to map user-visible workflows to the strongest automated anchors we already have, show where the evidence lives, and make the remaining gaps explicit.

## Current Target Boundary

Codex is the only managed local target.

Other environments use a generic/manual fallback.

Copilot cloud dispatch is a separate external-behavior K3 DAG, not a repository host projection.

## Current Matrix

| Workflow family | Primary user-visible surface | Strongest automated anchors | Gate mode | Current completeness |
| --- | --- | --- | --- | --- |
| Planning context routing | native Trio planning files and main-session round start | `tests/trio/read.test.mjs`, `tests/trio/routing.test.mjs`, `tests/trio/recovery.test.mjs` | always-on Trio | Main-session round start restores the native Trio planning files before routing the current round. |
| Runtime health and verification | `./scripts/harness doctor --check-only`, `./scripts/harness verify` | `tests/runtime/doctor-verify-services.test.mjs`, `tests/installer/verification-contract.test.mjs`, `tests/core/repo-workflow-acceptance.test.mjs` | always-on core + focused supplement + opt-in replay | Runtime wrappers and verification-contract parsing are covered, and the cross-workflow replay now exercises clean, degraded, lifecycle-sensitive, trust-boundary, and managed-target variants. |
| Runtime status and sync preview | MCP read-only status / `./scripts/harness sync --dry-run` / `./scripts/harness sync --check` | `tests/runtime/status-sync-services.test.mjs`, `tests/installer/summary-service.test.mjs`, `tests/adapters/sync-skills.test.mjs`, `tests/installer/commands.test.mjs`, `tests/core/repo-workflow-acceptance.test.mjs` | always-on core + focused supplement + opt-in replay | Canonical root resolution and public report shape are covered, and the replay now exercises dry-run previews, a read-only out-of-sync `sync --check` failure from a nested leaf workspace, and linked nested-git leaf recovery back to the parent status surface. |
| Reporting and audit summaries | `./scripts/harness summary --task <task-id>`, `./scripts/harness token-audit` | `tests/installer/summary-command.test.mjs`, `tests/installer/commands.test.mjs`, `tests/core/repo-workflow-acceptance.test.mjs` | always-on core + opt-in replay | The targeted summary surface and weekly token audit both have direct command tests, and the replay now exercises the route line, multi-active-task targeting, and a seeded cross-session audit summary. |
| Task lifecycle summary and reconcile readiness | `./scripts/harness active-summary` | `tests/installer/active-summary-command.test.mjs`, `tests/installer/followup-closure.test.mjs`, `tests/core/companion-plan-lifecycle.test.mjs`, `tests/core/repo-workflow-acceptance.test.mjs` | always-on core + opt-in replay | The main lifecycle summary surface is well covered across JSON, text, nested cwd, reconciliation, followup closure variants, and now live replay lanes for execution-governance plus companion/reconciliation drift. |
| Upstream refresh and cloud-dev operations | guarded refresh workflows and cloud-dev issue/sync automation | `tests/installer/upstream.test.mjs`, `tests/installer/upstream-commands.test.mjs`, `tests/automation/*.test.mjs` | always-on core | Operational behavior is strongly unit-tested, but these are still command/workflow tests rather than a single fresh-session replay pack. |
| Opt-in cross-workflow replay | `install`, `sync --dry-run`, `sync --check`, `verify`, `doctor`, `summary`, `active-summary`, `token-audit`, `workspace-link` on one fresh fixture root | `tests/core/repo-workflow-acceptance.test.mjs`, `tests/evals/repo-workflow-replays/**` | opt-in eval + default replay regression | A live replay pack exercises the main command families on one fresh fixture root, including clean flow, warning/failure guardrails, lifecycle drift, managed-target boundaries, dry-run previews before projection writes, reporting/audit surfaces that must stay readable while remaining read-only, execution-receipt lifecycle governance, companion/reconciliation governance on the active-summary surface, and nested git leaf recovery through `workspace-link`. |
| Opt-in A/B acceptance benchmark | ponytail borrowings scorecard | `tests/core/acceptance-run-eval.test.mjs`, `tests/core/acceptance-run-cli.test.mjs`, `tests/core/simplicity-ladder-eval.test.mjs`, `tests/evals/ponytail-borrowings/**` | opt-in eval | The evaluator, CLI wrapper, and fixture scorecards are covered, but the benchmark is still specialized to the ponytail slice rather than repo-wide workflows. |

## Known Gaps

- The cross-workflow replay now has happy-path, degraded, lifecycle, trust-boundary, managed-target, sync-preview, reporting, execution-lifecycle, companion-reconciliation, and workspace-link lanes, but it is still a narrow matrix rather than a broad family of variants per workflow surface.
- The only explicit acceptance scorecard today is still `tests/evals/ponytail-borrowings/**`, which is useful but intentionally specialized.
- Runtime deep-branch coverage is much stronger than before, but some non-primary branches still remain thinner than the main workflow paths.
- The cross-workflow replay currently uses live command assertions rather than a reusable generalized scenario JSON schema plus scorecard evaluator.

## Next Expansion Candidates

- Add second-pass variants for the replay pack:
  - more explicit Codex-managed and generic/manual fallback scenarios beyond the first target-boundary lane
  - more explicit trust-boundary and lifecycle-anomaly scenarios beyond the first replay guardrail lanes
- If the replay pack grows beyond one happy-path lane, add a small shared scorecard layer on top of the live replay results instead of widening the always-on gate immediately.
- Reuse the new `evaluate-acceptance-runs` CLI override flags to score custom eval roots and file names without hard-coding the ponytail sample.
