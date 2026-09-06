# SWF Coding Harness and Upstream Implementation Plan

**Status:** proposed; this document is a rollout map, not authorization to mutate source, refresh an upstream, commit, or publish.
**Authoritative task record:** [`planning/active/swf-coding-harness-upstream-implementation-20260903/`](../planning/active/swf-coding-harness-upstream-implementation-20260903/)

**Root routing migration (current):** Root active routing has only direct/native-first and `manual_pending`. `visible_worker_required` is legacy input only; for any Host operation it yields `manual_pending` with blocker `legacy_visible_worker_required_retired`, without Host bridge restoration or native fallback. Under the current Trio authority, resume requires an explicit `primaryExecution=default` rebind. An independent visible task explicitly requested by the user follows the Host's user-owned task workflow outside internal routing. Older plan text that refers to a visible-worker requirement is historical/superseded by this migration note; V1.3 acceptance boundaries remain unchanged.

## Outcome

Deliver two independently verifiable improvements:

1. Refresh Planning with Files (PWF) safely from `v3.9.0` to `v3.12.1`, adapting SWF's language-variant curation for PWF's new `skills/i18n/` layout.
2. Strengthen SWF's existing development workflow so evidence, specification, vertical slices, TDD, code review, codebase design, bug diagnosis, domain modeling, preventive quality gates, and PR feedback form one lightweight harness—without importing upstream corpus, adding a capability family, or creating another task authority.

The result is paired with the operator procedure in [Coding Harness SOP](coding-harness-sop.md).

## Fixed decisions

- PWF is the only refreshable upstream in this rollout. Superpowers is excluded.
- Matt remains the tag-pinned optional companion at `v1.2.3`; its current `main` branch is not imported.
- The Trio remains the sole durable authority for tracked tasks: `task_plan.md`, `findings.md`, and `progress.md`.
- The `dev` capability is strengthened in place. No new core skill, task board, ticket store, scheduler, or fourth capability family is created.
- `code-review`, `codebase-design`, `diagnosing-bugs`, and `domain-modeling` are absorbed as first-class **SWF-owned methods**. If a Host exposes the exact named skill, `dev` may select it as the method implementation; otherwise it follows the equivalent owned method contract. The Host, not repository text, owns actual skill/tool lifecycle.
- A `change-quality-gate` is an SWF-owned `dev` protocol, automatically selected when a non-empty development diff is about to cross a commit, push, PR-open/update, candidate-acceptance, or closure boundary. It composes the applicable TDD, diagnosis, design/domain, and fixed-point review methods; it is not a new capability family or a bypassable claim that a local Git hook ran.
- A five-minute PR feedback loop is opt-in and binds exactly one live PR to one existing Trio. Codex Heartbeat is its future control plane; the Trio remains its only durable task authority. It observes quietly when nothing changed and writes only meaningful observations to the bound Trio.
- A review comment is a triage signal, not proof and not an automatic patch command. The feedback loop must bind the current head/base/spec, fetch complete review-thread state, classify the current-code evidence, and deduplicate by PR, head SHA, thread/comment identity, and update time.
- Critical and major confirmed findings block integration and re-enter the bounded repair → quality-gate → review cycle. Minor/non-blocking findings become an external issue only when the bound PR policy expressly authorizes issue creation; otherwise they remain a draft follow-up in the Trio.
- Native platform auto-merge is permitted only as a separately implemented, explicit per-PR policy: the user must opt in before it is enabled, a required human review must approve the current head, current required checks and severe-thread gates must pass, and repository/Host support must be observed. The harness never merges directly, self-approves, dismisses reviews, weakens branch protection, or treats a quiet interval as approval.
- Direct execution can establish technical verification. Chief acceptance is required only when a delegated worker is the primary executor, or when the chosen governance lane explicitly requires independent acceptance. A user-owned visible task is outside Root internal routing.
- Merge, push, release, publish, deploy, send, credential, destructive, and external actions retain their human/safety gates regardless of lane.

## Rollout order

| Wave | Deliverable | Execution lane | Depends on | Completion proof |
|---|---|---|---|---|
| 0 | This plan and the SOP | Tracked direct documentation | predecessor evidence | docs review and link check |
| 1 | PWF `i18n` compatibility hardening | Chief-governed tracked execution | clean bound worktree and bound Host workflow | focused RED→GREEN plus targeted installer tests |
| 2 | PWF baseline uplift to `v3.12.1` | Chief-governed tracked execution | Wave 1 accepted in the baseline | refresh verification, overlay/projection proof, no Matt/Superpowers change |
| 3 | Coding-harness core contract and method-selection matrix | Chief-governed tracked execution | Wave 0; approved policy wording | Trio/projection/package tests and fresh docs check |
| 4 | Four-method pilot | Each task routed by the SOP | Wave 3 accepted | evidence from one feature, defect, bounded refactor, and completed-diff review |
| 5 | Preventive change-quality gate | Chief-governed integration protocol | Wave 3 accepted and pilot evidence | preflight contract, focused test matrix, fixed-point two-axis review, clean-CI proof |
| 6 | PR feedback loop and conditional native auto-merge | Chief-governed PR integration | Wave 5 accepted; explicitly bound pilot PR | read-only heartbeat observation, triage/repair recurrence, human-approval native auto-merge proof |
| 7 | Optional diagnostics and merge-conflict protocol | Separate, individually approved work | measured pilot gap | dedicated safety/contract proof |

Waves 1–2 and 3 can be designed in parallel, but they must not write overlapping source/projection paths. Wave 4 begins only after Wave 3 is accepted.

## Wave 1 — PWF `i18n` compatibility hardening

### Scope

| Owner | Change |
|---|---|
| `harness/installer/lib/upstream.mjs` | Extend PWF candidate curation to recognize the known nested `skills/i18n/` layout while preserving the final top-level English, `zh`, and `zht` contract. |
| `tests/installer/upstream-commands.test.mjs` | Add a nested-layout fixture that first fails against the old guard, then proves promotion of `zh`/`zht`, removal of `i18n`, exclusion of `ar`/`de`/`es`, and unchanged rejection of unknown nested variants. |
| `tests/automation/upstream-refresh-lib.test.mjs` and `tests/automation/upstream-refresh-workflow.test.mjs` | Update only if the compatibility report or refresh workflow observably changes. |

### Required behavior

1. Keep the old flat PWF language layout working.
2. When the candidate contains `skills/i18n/`, validate the nested variant names before changing the target.
3. Promote only known `planning-with-files-zh` and `planning-with-files-zht` directories to their existing top-level destinations.
4. Exclude known `ar`, `de`, and `es` variants and remove the intermediate `i18n` directory from the curated result.
5. Fail closed for an unknown nested variant and prove that the existing target is unchanged.
6. Do not broaden the final projected inventory or add a Matt/Superpowers source path.

### Gates and proof

- Use the successor task's isolated-worktree and bound Host workflow requirements; do not reuse or clean the predecessor's preserved dirty worktree. Any historical visible-worker requirement in this wave is superseded by the Root routing migration note above.
- Bind the exact Trio hashes and source scope before mutation. If the packet carries legacy `visible_worker_required`, record `manual_pending` with `legacy_visible_worker_required_retired` and rebind `primaryExecution=default` under the current Trio authority before internal dispatch; do not restore a bridge, fall back to native, or substitute an external user-owned task for Root routing.
- Observe a real RED from the nested-layout test before changing source.
- Require, at minimum:

  ```sh
  node --test tests/installer/upstream-commands.test.mjs
  node --test tests/automation/upstream-refresh-lib.test.mjs tests/automation/upstream-refresh-workflow.test.mjs
  git diff --check
  ```

- Chief accepts only the candidate whose changed paths, test output, and scope match the bound slice.

### Recovery

This wave changes only refresh compatibility code and tests. If it fails, retain the original source lock and vendored PWF baseline, report the exact failed condition, and stop. Do not reset or clean an unowned/Host-owned worktree by inference.

## Wave 2 — PWF baseline uplift

### Scope

| Owner | Change |
|---|---|
| `harness/upstream/.source-lock.json` | Advance only `planning-with-files` from `v3.9.0` / `0e2b00ce…` to `v3.12.1` / `f21d94bb…`. |
| `harness/upstream/planning-with-files/**` | Apply the vetted PWF upstream snapshot. |
| `harness/core/upstream-overlays/planning-with-files/**` | Reconcile SWF-owned behavior against the new upstream snapshot; do not patch the vendored baseline for local policy. |
| PWF projections and source-owned tests | Regenerate/adjust only through the repository's supported source-and-projection workflow. |

### Preconditions

- Wave 1 is accepted into the execution baseline. This separation avoids the predecessor's invalid no-commit combined-refresh proof lane: the CI refresh allow-list can evaluate the baseline compatibility code as committed source, rather than rejecting its uncommitted edits.
- Matt release metadata is rechecked only to confirm the expected no-op; no Matt body, lock, or package change is included.
- The worktree is clean, isolated, bound, and within one declared PWF-only scope.

### Proof and acceptance

```sh
node scripts/ci/run-upstream-refresh.mjs
npm run verify:upstream-refresh
node --test tests/installer/upstream-commands.test.mjs tests/automation/upstream-refresh-lib.test.mjs tests/automation/upstream-refresh-workflow.test.mjs
./scripts/harness sync --check
./scripts/harness doctor --check-only
git diff --check
```

The exact command set may expand after the overlay diff is known; it may not shrink the targeted refresh, overlay, projection, and no-out-of-scope-path proof. A Matt provenance check and a path-level proof that no Superpowers path changed are mandatory acceptance evidence.

## Wave 3 — Coding-harness core contract

### Design

The coding harness is a compact set of methods selected by evidence, not a list of rituals that all run on every task:

1. **Evidence to decision:** material external or repository claims are cited in `findings.md`; assumptions and the stop condition are explicit.
2. **Decision to vertical slices:** tracked work records the behavior, highest feasible public seam, dependencies, non-goals, exact RED proof, smallest GREEN change, backstop command, and return contract. Wide mechanical changes use expand → migrate in green batches → contract.
3. **Seam-disciplined TDD:** each slice observes a real RED before production code, tests behavior rather than internals, rejects tautological/mock-only proof, and remains independently verifiable.
4. **Domain modeling:** ambiguous or conflicting domain terms are resolved against existing context/ADR sources and recorded in the Trio; a glossary or ADR changes only under an explicit artifact authorization.
5. **Codebase design:** a material interface/seam decision uses module, interface, seam, depth, adapter, leverage, and locality analysis; alternatives are compared only when the choice is material.
6. **Bug diagnosis:** a non-obvious defect or regression first gets a tight red-capable loop, minimized reproduction, ranked falsifiable hypotheses, targeted probes, and a regression proof.
7. **Code review:** a completed fixed diff is checked on independent Standards and Spec axes before candidate acceptance or risk-triggered direct closure.
8. **Preventive quality gate:** before a diff crosses a commit, push, PR, acceptance, or closure boundary, its risk-relevant test matrix, regression assets, fresh verification, and fixed-point review evidence are complete. A PR then adds clean-machine CI and live-feedback evidence; neither one substitutes for the other.

`grill-with-docs` and broader architecture review remain opt-in diagnostics; merge-conflict handling remains a later safety protocol.

### Automatic method-selection contract

| Method | Trigger | Required output | Selection effect | Escalation / non-effect |
|---|---|---|---|---|
| `domain-modeling` | New, renamed, overloaded, or contradictory domain term/rule/state/role. | Existing terminology source read; resolved term and scenario recorded in Trio. | Runs before design if language would affect the interface. | Does not create/update `CONTEXT.md` or ADRs without explicit authority; material unresolved terminology escalates. |
| `codebase-design` | New/materially expanded interface, unclear test seam, repeated adapters, shallow/pass-through friction, wide refactor, or a diagnosis finding of coupling/locality failure. | Module/interface/seam/depth rationale, dependency category, test strategy, selected trade-off. | Runs after domain modeling when both match; alternatives only for material choices. | Does not refactor, create abstractions, or fan out automatically; major interface decisions escalate to Chief. |
| `diagnosing-bugs` | Reported broken/throwing/failing/slow behavior, unexpected test failure, or three disciplined failed attempts. | Exact red-capable loop, minimized repro, 3–5 ranked falsifiable hypotheses, probes, regression/backstop evidence. | Runs before a root-cause fix unless a known repro already supports ordinary TDD. | No speculative patch, broad instrumentation, or production/environment access without the applicable gate. |
| `code-review` | User asks for review, a fixed non-empty diff is ready for phase advance/closure, or a worker returns a candidate. | Resolved fixed point; separate Standards and Spec reports/counts; technically validated material findings. | Runs after implementation/verification and before Chief acceptance or risk-triggered direct closure. | Does not merge axes, mutate source automatically, merge, or replace human acceptance. |

Automatic selection means the `dev` contract must choose and execute the named method when its trigger is observed. If the exact skill is available in the active Host catalog, use it under the same Trio scope and dispatch policy; otherwise use the owned method steps in `dev`. This is declarative method routing—not a repository-owned Host runner, tool call, model choice, or child-worker permission.

### Quality-gate selection and control boundary

| Protocol | Trigger | Required result | Never implied |
|---|---|---|---|
| `change-quality-gate` | A non-empty development diff is ready to commit, push, open/update a PR, enter candidate acceptance, or close. | A bound base/spec/head; risk-relevant test matrix; real RED→GREEN/regression proof where behavior changed; fresh verification; `git diff --check`; fixed-point Standards/Spec review; evidence recorded in the Trio. | A commit, push, PR creation, approval, merge, release, or a claim that a local hook alone proved quality. |
| `pr-feedback-loop` | A user explicitly binds an open PR, its Trio, a five-minute heartbeat, a severity policy, and allowed external actions. | Current PR/head/check/thread snapshot; evidence-backed triage table; deduplicated meaningful changes; a `repair_required`, `follow_up`, `awaiting_human`, or `eligible_for_native_auto_merge` result. | Background monitoring without a bound PR, source mutation by the monitor, issue/reply/resolve writes without policy, or direct Git merge. |

The feedback loop may select the installed `gh-review-comment-triage` method for changed review threads, and it composes the four foundational methods when their signals appear. It does not make any optional Host skill a required SWF package or repository-controlled scheduler.

### Source-owned surfaces

| Owner | Intended responsibility |
|---|---|
| `harness/trio/capabilities/dev/SKILL.md` | Add compact, testable evidence/specification/slice/TDD/expand-contract clauses plus the automatic method-selection matrix and four owned method contracts; preserve lightweight Quick work. |
| `harness/trio/skill/SKILL.md` | Clarify the choice between direct tracked execution and Chief-governed delegated execution; record the Root legacy-input migration and keep Host skill/task lifecycle outside repository control. |
| `harness/trio/templates/entry-policy.md` | Keep the materialized entry-policy source aligned with the clarified routing language. |
| `harness/trio/governance/chiefops/SKILL.md` | State that its acceptance gate applies when ChiefOps governs a delegated/Chief lane; it must not become a mandatory runner for direct work. |
| `docs/workflows.md` | Add a short link and route summary for the SOP. |
| `docs/trio-v2/human-usage.md` | Document the legacy-input migration, direct/native-first route, manual recovery, and the separate user-owned Host task workflow. |
| `docs/coding-harness-sop.md` | Be the detailed human-facing procedure, not a new source of task state. |

Do not change `packages/plugin-kit/src/platform-contracts.mjs`: the desired result stays inside the existing Trio/ChiefOps source map. Do not directly edit generated `AGENTS.md` or `.agents/**`; update source and prove projections.

### Contract tests and proof

- Add focused assertions in `tests/trio/dev-capability.test.mjs` for the four triggers, priority/precedence, required evidence, and no-automatic-mutation clauses; add route/projection assertions only where their source contracts change.
- Prove that a matching Host skill is optional acceleration, not a new projected inventory entry, implicit dispatch permission, or a claim of authenticated Host execution.
- Add focused assertions in the existing Trio tests for the direct-versus-Chief route, while retaining authority, inventory, worker-binding, safety, and human-gate invariants.
- Update projection assertions when entry-policy source text changes; preserve the approved fixed inventory.
- Update documentation contract tests only for new supported claims; never reintroduce retired control surfaces.
- Require:

  ```sh
  npm run verify:trio
  node --test tests/plugin-kit/platform-contracts.test.mjs tests/plugin-kit/docs-contract.test.mjs
  npm run plugin:verify
  ./scripts/harness sync --check
  git diff --check
  ```

Use `npm run verify:all` when the final change touches a cross-cutting surface outside the declared Trio/docs/package scope.

## Wave 4 — Evidence-driven pilot

Route three real tasks after Wave 3 is accepted:

| Pilot | Expected lane | Required evidence |
|---|---|---|
| Domain-bearing feature | tracked direct or Chief, depending on topology | terminology decision, chosen public seam, RED command/result, GREEN/backstop verification |
| Reproducible defect | tracked direct unless the root cause is materially unclear | minimized reproduction, 3–5 falsifiable hypotheses, regression RED/GREEN, fresh suite |
| Bounded refactor | Chief if blast radius/coordination is material; otherwise tracked direct | stated architecture friction, module/interface/seam/depth trade-off, green-safe slice or expand–contract sequence |
| Completed fixed diff | same lane as the originating task | resolved baseline plus independent Standards and Spec report with verified material findings |

Success requires all four to produce useful evidence without unwanted tracker state, mandatory ADR/report creation, background worker assumptions, or unapproved external effects. If a practice only adds ceremony, remove or narrow it before Wave 5.

## Wave 5 — Preventive change-quality gate

### Purpose

The gate makes reviewable evidence a prerequisite for integration boundaries, rather than a report that is written after a PR exposes defects. It is a process gate with a testable read-only command; it is **not** a mandatory Git hook or a new durable ledger. A local hook may later be offered as a convenience, but a skipped hook can never satisfy the gate by itself.

### Required preflight protocol

| Boundary | Required evidence | Stop / reroute condition |
|---|---|---|
| **Before commit** | Pin the intended base and task/spec; define the risk-relevant test matrix; run a real RED→smallest GREEN cycle for every behavior-changing slice; add a minimal old-code-failing regression for a bug; run focused verification and `git diff --check`. | The RED is absent, the behavior/spec is unclear, the suite does not cover a material risk cell, or the diff exceeds the bound slice. Diagnose/design/escalate before committing. |
| **Before push** | Reconfirm the exact commit/head against the preflight evidence; rerun changed-path tests and any required backstop; conduct fixed-point Standards and Spec review over the complete accumulated diff; record unresolved/non-actionable findings separately. | The head changed after review, a material finding is unverified/unresolved, or the branch requires a human/Chief integration gate that is not bound. Repeat the affected gate; do not push under an obsolete result. |
| **Before PR open or update** | Assemble the evidence packet: base/head, changed paths, behavior/spec, risk test matrix and results, regression links, two-axis review, limitations, and required CI. Validate the PR description against this packet. | Evidence is missing, the PR contains unrelated change, CI requirements are unknown, or the external-action gate is absent. Keep the candidate local/blocked. |

The test matrix is risk-oriented, not a target line count. Every changed behavior gets its normal and invalid/boundary case. Add only the applicable cells for stateful, asynchronous, concurrent, or external-effect work: stale or late results, ordering/cancellation, retry/partial failure, persistence/upgrade, side effects that report success without producing the expected state, and no-op/safety boundaries. The user-provided examples—an input changing after a scan, a late old task overwriting a new result, or a command returning success while the product is unchanged—are canonical prompts to ask whether an analogous false-green condition exists in the current slice.

For every defect, preserve three assets when they are useful and within scope: (1) the smallest reproduction that makes the old behavior fail, (2) a real-seam regression that stays green after the smallest root-cause correction, and (3) a sibling-path scan for the same faulty assumption. If the correction reveals a durable invariant or a reason not visible in the test name, record it first in the Trio and then in an existing authorized module rule/decision artifact with a link to its regression. Rules stay modular and lazily loaded; stale rules are revalidated or removed when the owning behavior changes.

### Complexity and multi-plane checks

- The Standards review must actively challenge speculative settings, compatibility switches, listeners, background work, privilege requests, and persistent state. A new entity needs demonstrated user value, a safe default, ownership/lifecycle, cost, and an exit/removal story; otherwise it is removed or held out of scope.
- Every task declares the verification planes that actually apply: source/test behavior, generated/package artifact, clean CI, and runtime/release/public delivery. A green result in one plane is never presented as proof for another. Release and external delivery remain separately human-gated.
- Architecture decisions and project rules are living assets, not automatic paperwork. `codebase-design` uses existing decision/architecture sources when present; a new ADR, architecture document, or glossary is created only by explicit authorization.

### Intended source-owned implementation

| Owner | Intended responsibility |
|---|---|
| `harness/trio/capabilities/dev/SKILL.md` | Add the quality-gate trigger, risk-matrix expectations, defect-regression/sibling-scan discipline, complexity guard, multi-plane proof rule, and direct-to-Chief integration handoff. |
| `harness/trio/skill/SKILL.md` and `harness/trio/governance/chiefops/SKILL.md` | Make commit/push/PR integration a Chief-governed human-gate slice while allowing prior bounded coding and local preflight to stay direct; require a quality-gate packet before candidate acceptance. |
| `scripts/ci/lib/pr-quality.mjs` and `scripts/ci/run-pr-quality-gate.mjs` | Add a pure, fixture-tested preflight evaluator that validates a supplied evidence packet and emits a read-only machine-readable result. It must not stage, commit, push, create a PR, or retain a new task-state file. |
| `package.json` | Expose the read-only quality-gate command without replacing the existing `verify:*` suites. |
| `tests/trio/dev-capability.test.mjs`, `tests/automation/pr-quality-lib.test.mjs`, and existing contract tests | Prove triggers, required evidence, no-hook-as-proof semantics, no external mutation commands, and compatibility with Trio/Chief/safety invariants. |
| `docs/coding-harness-sop.md`, `docs/workflows.md`, and `docs/trio-v2/human-usage.md` | Surface the operator flow without creating a second state or reviving the superseded visible-worker topology. |

### Acceptance proof

1. Fixtures prove rejection for missing base/spec/head, no real RED for a behavior-changing slice, insufficient risk coverage, stale review after head movement, and an external action requested from the read-only evaluator.
2. Fixtures prove accepted packets preserve separate Standards and Spec results, regression/sibling-scan evidence when a bug trigger applies, and exact required verification planes.
3. The existing complete test suite passes in a clean PR machine through `repo-verify`; an end-to-end pilot shows the same gate was run before commit, before push, and before PR update without inventing a second authority.
4. `npm run verify:trio`, `npm run verify:core`, `npm run plugin:verify`, `./scripts/harness sync --check`, and `git diff --check` pass for the implemented scope.

## Wave 6 — PR feedback loop and conditional native auto-merge

### PR monitor binding

No heartbeat exists until an operator records this **within the bound Trio**, then explicitly asks Codex to create a five-minute Heartbeat for the current task:

| Binding field | Required value |
|---|---|
| PR identity | Repository, PR number/URL, base ref, current head SHA, and the fixed diff/spec reference. |
| Evidence sources | Required checks, complete GraphQL review-thread data, reviews/decision, mergeability, and any repository-specific required status. |
| Severity policy | The project rubric below, including what counts as a blocker and which non-blocking findings are eligible for follow-up. |
| Write policy | Independently opt in/out of GitHub replies/thread resolution, issue creation, repair push, and platform-native auto-merge. Absence means read-only/draft-only. |
| Human gate | Named rule: a human `APPROVED` review on the current head is mandatory before native auto-merge can be enabled or complete. |
| Stop policy | Stop on merge/close, explicit cancellation, lost access, changed task authority, or a blocked repair/human decision. |

The heartbeat itself is a Host control-plane object, not a fourth Trio state. Its prompt must stay silent on unchanged observations, wake/report only on a changed head, check, review/thread, severity, blocked state, or a newly eligible human gate, and never turn a quiet five-minute interval into acceptance evidence.

### Observation, triage, and repair cycle

1. Observe the PR at its current head: resolve identity; fetch all review threads with pagination; collect status checks, review decision, mergeability, and compare range.
2. Compare it to the last meaningful Trio observation. Deduplicate by PR, head SHA, thread/comment ID, updated time, and verdict. Resolved/outdated comments are retained as history but do not trigger duplicate work.
3. For each changed thread, create a compact triage record: claim, current-code/spec/test evidence, verdict (`real`, `already fixed`, `stale`, `false positive`, or `needs user decision`), severity, and proposed action. Old line numbers or plausible bot prose do not establish a defect.
4. A confirmed critical or major finding produces `repair_required`: stop merge eligibility, bind a narrow repair slice under the existing Chief/worker rules, add a targeted RED regression, correct the root cause, run the complete change-quality gate again, push only under the pre-authorized gate, then restart observation at the new head.
5. A minor/non-blocking confirmed finding produces a deduplicated follow-up candidate. With explicit `issue_creation=allowed`, create one scoped GitHub issue carrying the evidence and PR/thread link; otherwise record an issue draft in the Trio for human review. Replying to or resolving a thread always needs the separately bound GitHub-write policy and concrete explanation.
6. An uncertain/spec-conflicting comment is `needs_user_decision`, not a patch or issue. A stale/already-fixed/false-positive comment may be documented and resolved only when the write policy permits it.

| Severity | Examples | Integration action |
|---|---|---|
| **Critical** | Security/authorization break, data loss/corruption, release/upgrade integrity break, or a failed required check. | Block immediately; repair and repeat full gate. Never defer to an issue. |
| **Major** | Current user-visible behavior/spec is wrong, a likely correctness/reliability regression, or a missing test exposes a material false-green path. | Block by default; repair and repeat full gate. A waiver requires an explicit human decision recorded in the Trio. |
| **Minor** | Naming, narrow maintainability, non-behavioral documentation, or low-risk test clarity with no current correctness/safety effect. | Do not block merge after triage; create a deduplicated issue only under policy, otherwise draft it. |
| **Informational / uncertain** | Suggestion without sufficient evidence, stale line, or a proposal conflicting with the bound spec. | Document verdict; ask the human if a product/spec choice is required. |

### Conditional native auto-merge

The system may use the repository's **native** auto-merge only after all conditions hold on the same current head: the binding explicitly allowed it; the change-quality gate is current; required clean-CI checks pass; no critical/major actionable thread remains; required conversations are resolved or evidence-backed non-actionable; GitHub reports the PR mergeable; and the required human reviewer has submitted `APPROVED`. The monitor may then enable native auto-merge if Host/repository capability is observed. It never runs a direct Git merge, approves for a human, changes protection, dismisses a review, force-pushes, or auto-merges a promotion/release PR without an explicit separate policy.

### Intended source-owned implementation and proof

| Owner | Intended responsibility |
|---|---|
| `harness/trio/capabilities/dev/SKILL.md` and `harness/trio/governance/chiefops/SKILL.md` | Define PR monitor binding, triage/repair recurrence, severity policy, human-gate escalation, and the narrow native-auto-merge exception; preserve the default prohibition. |
| `scripts/ci/lib/pr-review-feedback.mjs` | Purely normalize snapshots, enforce binding completeness, calculate deduplication keys and severity routes, and emit proposed actions. It has no GitHub mutation executor. |
| `scripts/ci/run-pr-review-observation.mjs` | Read-only adapter invoked by the Heartbeat to collect `gh`/GraphQL observation data and pass it to the pure reducer. It rejects absent PR binding/credentials and never writes GitHub state. |
| `tests/automation/pr-review-feedback.test.mjs` and `tests/trio/dev-capability.test.mjs` | Fixture-test pagination, current-head invalidation, stale/resolved handling, severity, idempotency, no direct-merge path, and the human-approval/current-CI/native-capability conjunction. |
| `docs/coding-harness-sop.md` | Define operator setup, status transitions, quiet-notification rules, and the issue/auto-merge policies. It is the template source; runtime observations remain in the existing Trio. |

Acceptance requires a read-only five-minute pilot on one explicitly bound PR, including at least one unchanged observation and one changed-state triage. It may not perform GitHub writes. A second separately authorized pilot is required before reply/resolve or issue creation. Native auto-merge requires its own explicit per-PR authorization and an observed human approval; it is never inferred from the successful pilots.

## Wave 7 — Conditional extensions

- **Decision capture:** design an opt-in extension to the existing `grilling` companion only if pilots repeatedly need durable ADR/glossary output. Default destination remains the Trio decision record.
- **Architecture review:** design a read-only hotspot-led diagnostic only if pilot findings show repeated locality/deep-module friction. It must require user selection before any code change.
- **Merge conflict protocol:** handle only as a separately safety-reviewed integration task. It must preserve intent, record trade-offs, verify results, and ask before any staging, continuation, commit, abort, merge, or push decision.

## Release, rollback, and stopping rules

- This documentation plan does not itself merge, push, release, publish, deploy, create a monitor, or write GitHub state. Any future Wave 6 native-auto-merge use remains a separately authorized per-PR action under its observed human-approval conditions; all other integration effects remain separate human decisions.
- If a focused RED is not reproducible, source/projection ownership is unclear, an unknown language variant appears, an overlay drifts, a route loses its bound worker, or a change needs an undeclared path, stop and update the bound Trio.
- Roll back an accepted source wave only through an explicitly authorized, scoped revert/recovery task with fresh proof. Do not use broad cleanup or reset commands as a substitute for a recovery plan.
- The accepted implementation plan is not permission to broaden Matt packaging, revive Superpowers maintenance, or bypass any human gate.
