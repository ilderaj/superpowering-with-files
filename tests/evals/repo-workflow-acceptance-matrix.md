# Repo Workflow Acceptance Matrix

This matrix describes the current repo-wide acceptance and UAT evidence surface.

It is not an always-on CI gate by itself. The goal is to map user-visible workflows to the strongest automated anchors we already have, show where the evidence lives, and make the remaining gaps explicit.

## Current Matrix

| Workflow family | Primary user-visible surface | Strongest automated anchors | Gate mode | Current completeness |
| --- | --- | --- | --- | --- |
| Planning context routing | task-scoped planning hook output | `tests/hooks/task-scoped-hook.test.mjs`, `tests/hooks/hook-budget.test.mjs` | focused supplement | Route-aware prompt shaping is covered, including the route-less `tracked-lean` default and repeated-prompt budget behavior. |
| Runtime health and verification | `./scripts/harness doctor --check-only`, `./scripts/harness verify` | `tests/runtime/doctor-verify-services.test.mjs`, `tests/installer/verification-contract.test.mjs`, `tests/core/repo-workflow-acceptance.test.mjs` | always-on core + focused supplement + opt-in replay | Runtime wrappers and verification-contract parsing are covered, and the cross-workflow replay now exercises clean, degraded, lifecycle-sensitive, trust-boundary, mixed-scope, and additional-target variants. |
| Runtime status and sync preview | MCP read-only status / `./scripts/harness sync --dry-run` | `tests/runtime/status-sync-services.test.mjs`, `tests/installer/summary-service.test.mjs`, `tests/adapters/sync-skills.test.mjs` | always-on core + focused supplement | Canonical root resolution and public report shape are covered. Cross-target dry-run replay remains indirect. |
| Task lifecycle summary and reconcile readiness | `./scripts/harness active-summary` | `tests/installer/active-summary-command.test.mjs`, `tests/installer/followup-closure.test.mjs`, `tests/core/companion-plan-lifecycle.test.mjs` | always-on core | The main lifecycle summary surface is well covered across JSON, text, nested cwd, reconciliation, and followup closure variants. |
| User-global adoption and status | `./scripts/harness adopt-global`, `./scripts/harness adoption-status` | `tests/installer/adoption.test.mjs`, `tests/core/repo-workflow-acceptance.test.mjs` | always-on core + opt-in replay | Bootstrap, nested authority-root resolution, profile selection, safety rejection, receipts, backup-based takeover, and selected Claude/Copilot status variants are covered. |
| Upstream refresh and cloud-dev operations | guarded refresh workflows and cloud-dev issue/sync automation | `tests/installer/upstream.test.mjs`, `tests/installer/upstream-commands.test.mjs`, `tests/automation/*.test.mjs` | always-on core | Operational behavior is strongly unit-tested, but these are still command/workflow tests rather than a single fresh-session replay pack. |
| Opt-in cross-workflow replay | `install`, `sync --dry-run`, `verify`, `doctor`, `active-summary`, `adopt-global`, `adoption-status`, `workspace-link` on one fresh fixture root | `tests/core/repo-workflow-acceptance.test.mjs`, `tests/evals/repo-workflow-replays/**` | opt-in eval + default replay regression | A live replay pack now exercises the main command families on one fresh fixture root, and it now covers clean flow, warning/failure guardrails, lifecycle/adoption drift, target/trust-boundary scenarios, real mixed-scope installs, and target-specific install defaults plus an all-target replay. |
| Opt-in A/B acceptance benchmark | ponytail borrowings scorecard | `tests/core/acceptance-run-eval.test.mjs`, `tests/core/acceptance-run-cli.test.mjs`, `tests/core/simplicity-ladder-eval.test.mjs`, `tests/evals/ponytail-borrowings/**` | opt-in eval | The evaluator, CLI wrapper, and fixture scorecards are covered, but the benchmark is still specialized to the ponytail slice rather than repo-wide workflows. |

## Known Gaps

- The cross-workflow replay now has happy-path, degraded, lifecycle, trust-boundary, mixed-scope, and additional-target lanes, but it is still a narrow matrix rather than a broad family of variants per workflow surface.
- The only explicit acceptance scorecard today is still `tests/evals/ponytail-borrowings/**`, which is useful but intentionally specialized.
- Runtime deep-branch coverage is much stronger than before, but some non-primary branches still remain thinner than the main workflow paths.
- The cross-workflow replay currently uses live command assertions rather than a reusable generalized scenario JSON schema plus scorecard evaluator.

## Next Expansion Candidates

- Add second-pass variants for the replay pack:
  - deeper workflow permutations beyond the first real `codex` / `copilot` / `cursor` / `claude-code` target matrix
  - more explicit trust-boundary, lifecycle-anomaly, and mixed-scope scenarios beyond the first replay guardrail lanes
- If the replay pack grows beyond one happy-path lane, add a small shared scorecard layer on top of the live replay results instead of widening the always-on gate immediately.
- Reuse the new `evaluate-acceptance-runs` CLI override flags to score custom eval roots and file names without hard-coding the ponytail sample.
