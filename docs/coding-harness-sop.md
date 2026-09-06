# SWF Coding Harness SOP

**Status:** target operating procedure. The direct tracked lane becomes normative only after the Coding Harness core contract in [the implementation plan](coding-harness-implementation-plan.md) is accepted and projected. Until then, follow the currently installed Trio policy for delegated work.

## The mental model

Use the lightest route that still produces trustworthy evidence.

```text
Request
  ├─ one clear, reversible, local outcome? ── yes → Quick direct intake
  │                                            no
  ├─ one owner, durable record needed, no delegated/high-risk work? ── yes → Tracked direct
  │                                                                    no
  └─ delegated execution, material risk/uncertainty, coordination, or a human gate → Chief-governed
```

**Deep** is not a fourth route. It is a temporary reasoning setting for material uncertainty and may occur inside either a direct or Chief-governed task.

## Choose the lane

| Lane | Choose it when every condition holds | Do not choose it when |
|---|---|---|
| **Quick direct intake** | One obvious outcome; one local/reversible change or answer; known surface; one focused proof; no durable research/recovery need; no external or integration effect. | The request needs several slices, repository research that must survive the session, a non-obvious diagnosis/design decision, or a human/safety gate. |
| **Tracked direct execution** | A durable record or more than one slice is useful; one executor can own the bounded scope; no delegated worker is required; no concurrent writer; no external, merge, push, release, security, credential, or destructive operation. | Work needs delegated execution, cross-cutting architecture judgment, materially uncertain root cause, shared/concurrent changes, or independent governance acceptance. |
| **Chief-governed execution** | Any delegated worker; explicit legacy-input migration; multi-slice coordination; high blast radius; material architecture/requirements uncertainty; security/safety risk; untrusted multi-source evidence; merge/conflict work; or any human-gated action. | Never skip this lane merely because the code diff looks small. Topology and risk, not line count, decide it. |

When unsure, start **tracked** and spend one bounded intake slice on evidence. Escalate to Chief before production mutation if the uncertainty, scope, or safety condition proves material.

## What “Chief” means

Chief is a governance role, not a synonym for “a smarter model” or “more ceremony.” It owns intake, route, plan, worker binding, gates, independent review, and acceptance **when that role is activated**.

Technical verification and Chief acceptance are different:

| Activity | Who may perform it | What it proves |
|---|---|---|
| Focused verification | Direct executor or worker | The observed command/check supports the claimed behavior. |
| Independent review | A separate reviewer or Chief, when risk calls for it | The bounded work matches requirements and repository standards. |
| Chief acceptance | Chief in a delegated/Chief-governed lane | A worker candidate is in scope, sufficiently proven, and may be written back as accepted. |
| Human gate | You | Permission for merge, push, release, publish, deploy, send, credentials, destructive actions, or other external effects. |

A self-contained direct task can be verified without Chief. A delegated worker result cannot: it remains `candidate_done` until Chief acceptance and Trio writeback. An independent visible task requested by the user follows the Host's user-owned task workflow and is outside Root internal routing.

## Give a good intake

Natural language is enough. Include these five facts when known:

1. **Goal:** what should become true.
2. **Surface:** repository/module/file or user behavior affected.
3. **Constraints:** what must not change; dependencies; performance/security limits.
4. **Proof:** expected behavior, test or check, and desired evidence.
5. **Gate:** where to stop—e.g. “draft only, do not merge” or “ask before publishing.”

Useful examples:

```text
Quick: 修正 <file> 的文案拼写；只改这一处；跑相关检查后告诉我结果。

Tracked direct: 跟踪实现 <feature>；先建 Trio；不委派；不改公共 API；每个切片要有 RED→GREEN 和完整验证。

Chief: 这个改动涉及多个模块和迁移；请用 Chief 先做证据和切片计划，再由 delegated worker 执行；停在 draft，绝不 merge。
```

## Automatic method selection

`dev` selects methods from task evidence; it does not run every method on every task. A matching installed skill is the preferred implementation when the Host makes it available. Otherwise, follow the same method directly under the current Trio scope. Neither case creates a worker, changes the selected capability, grants permission, or writes a durable artifact by itself.

| Signal | Automatically select | First required result | Do not do automatically |
|---|---|---|---|
| A domain term/rule/state/role is new, overloaded, or conflicts with code/glossary language. | `domain-modeling` | Read existing context/ADRs; test the term with a concrete scenario; record the resolved terminology in the Trio. | Create/change `CONTEXT.md`, an ADR, or a domain document. |
| An interface/seam is new or materially changing; testing lacks a credible seam; a module is shallow; adapters repeat; or a wide refactor is proposed. | `codebase-design` | State module, interface, seam, depth, dependency category, and test strategy; apply the deletion test. | Refactor, add a port/adapter, or create alternative-design workers. |
| A user reports broken, throwing, failing, or slow behavior; a check fails unexpectedly; or three disciplined attempts fail. | `diagnosing-bugs` | Run a tight red-capable loop, minimize the repro, then record ranked falsifiable hypotheses before probes. | Guess a root-cause fix, add broad/production instrumentation, or access an unapproved environment. |
| A user asks for review; a fixed non-empty diff is ready to advance; or a worker returns a candidate. | `code-review` | Resolve the fixed point; report Standards and Spec separately; verify material findings. | Auto-edit code from the review, merge the axes, merge/push, or substitute for human acceptance. |

Priority: route and safety first; domain modeling before design when terms affect the interface; diagnosis before a non-obvious bug fix; TDD inside every behavior-changing slice; review after the fixed diff is complete. Record the selected methods and their evidence in the existing Trio. If a trigger reveals material ambiguity, broad impact, or a required human gate, escalate to Chief before production mutation.

## Automatic integration-gate selection

Two additional protocols are selected by **an integration boundary**, not by every code edit. They compose the methods above and never create a new capability, background worker, task state, or permission.

| Signal | Automatically select | Required outcome | Never automatic |
|---|---|---|---|
| A non-empty development diff is about to be committed, pushed, opened/updated as a PR, accepted as a candidate, or closed. | `change-quality-gate` | Bound base/head/spec, risk-oriented test matrix, current RED→GREEN/regression evidence, fresh verification, `git diff --check`, and a fixed-point Standards/Spec review. | Git commit/push/PR creation, a claim that a skipped/passing local hook proves quality, approval, merge, or a release. |
| You explicitly bind one open PR to the current Trio and ask for five-minute monitoring. | `pr-feedback-loop` | Read-only current PR/head/check/thread observation, deduplicated triage of changed comments, and one routed state: repair required, follow-up, awaiting human, or eligible for native auto-merge. | Monitoring an unbound PR, background polling by default, code edits by the monitor, GitHub replies/resolve/issues without policy, or direct Git merge. |

When a changed PR thread is present, prefer `gh-review-comment-triage` if the Host exposes it; otherwise follow the same SWF-owned triage steps. This only chooses a method. It does not assert that the Host can schedule a heartbeat, access GitHub, dispatch a worker, or use a particular model.

## Standard coding flow

### 1. Quick direct intake

1. Inspect the exact surface and baseline, then apply a matching method only if a listed trigger is present.
2. State the narrow behavior and proof.
3. Make the smallest bounded change.
4. Run the focused check and report the command, exit/result, changed path, limitation, and selected method if any.

No Trio, worker, architecture review, or ceremony is added by default. If the work grows beyond the original one-step assumption, stop and re-route to tracked.

### 2. Tracked direct execution

1. Create or restore exactly one Trio under `planning/active/<task-id>/`.
2. Put external/repository evidence and assumptions in `findings.md`; keep goal, scope, risks, and stop conditions in `task_plan.md`.
3. Select the triggered methods. Resolve domain language before material design, run diagnosis before non-obvious bug fixes, and record their results in the Trio.
4. Define the smallest independently verifiable vertical slice: behavior, public seam, non-goals, dependencies, exact RED proof, GREEN change, backstop command, evidence sink, and risk-relevant test cells.
5. Run one RED → smallest GREEN cycle at a time. Tests observe behavior through the highest feasible public seam; avoid implementation-coupled, tautological, bulk-horizontal, and mock-only proof. For a bug, first make the old behavior fail with a minimum reproduction, then keep that regression and scan sibling paths for the same assumption.
6. Run fresh backstop verification. For a fixed non-empty diff, select `code-review` when the trigger applies and keep Standards and Spec distinct. Record commands, exits/counts, changed paths, limitations, and follow-up findings in the Trio.
7. Before a commit, push, PR, candidate acceptance, or closure boundary, select `change-quality-gate`. The direct executor prepares its evidence packet but does not perform the external integration effect; hand the bounded candidate to a Chief-governed integration slice.
8. Perform independent review when the risk trigger below applies. Otherwise report the direct verified result for user acceptance.

The Trio is a task record, not a ticket tracker. Do not create separate project boards, local ticket state, report folders, or automatic ADRs merely to follow this SOP.

### 3. Chief-governed execution

1. **Chief intake:** restore one Trio, route the work, select `dev`/`office`/`safety`, and identify gates.
2. **Plan one slice:** freeze objective, exact allowed files/operations, non-goals, dependency order, proof, evidence sink, stop conditions, return contract, and any triggered methods.
3. **Bind before dispatch:** establish the authority hashes, clean/isolation evidence, requested permissions, and worker packet. If a legacy `visible_worker_required` input is present, return `manual_pending` with `legacy_visible_worker_required_retired`; do not restore a Host bridge, fall back to native, or perform the requested task inline. Resume only after an explicit `primaryExecution=default` rebind under the current Trio authority.
4. **Worker execution:** the delegated worker performs the scoped change and primary verification, then returns changed paths, selected-method evidence, RED/GREEN evidence, full verification output, limitations, and `candidate_done` or `blocked`.
5. **Integration gate when needed:** before committing, pushing, opening/updating a PR, or accepting a candidate, check the `change-quality-gate` packet against the current head. A changed head invalidates the affected review and verification evidence.
6. **Chief gate:** independently check binding, scope, requirements, fresh proof, required review evidence, and human-gate status. Accept and write back only if all are satisfied; otherwise request changes or block.
7. **Human gate and closure:** stop before merge/push/release/publish/destructive action unless you explicitly authorize it. A PR monitor may use platform-native auto-merge only under the dedicated policy below, after an observed human approval. Closure records the accepted evidence but never substitutes for your external permission.

## Change-quality gate

Use this gate whenever its automatic-selection signal appears. It is a repeatable evidence protocol; after Wave 5 is installed it will have a read-only command as a convenience, but it is not a Git hook and a hook cannot substitute for the evidence below.

The convenience command is `npm run verify:pr-quality -- <packet.json>`; use `npm run --silent verify:pr-quality -- <packet.json>` or the underlying Node command when stdout must contain JSON only. It reads one JSON evidence packet (or JSON from standard input when the path is `-`) and emits one machine-readable JSON result. An accepted result has `status: "accepted"`; an incomplete packet has `status: "rejected"` with stable `{code, reason, field}` errors and a non-zero exit. The packet uses the `swf/change-quality-gate-packet` schema and binds `binding.base`, `binding.taskOrSpec`, and `binding.head`; it does not modify the repository or perform an integration action.

The packet's `verificationPlanes.required` and `verificationPlanes.declared` arrays must match exactly. Use the known plane names `source-test`, `generated-package`, `clean-ci`, and `runtime-release-public`; declare only the planes actually required for this slice and record unproven planes in `limitations`. A behavior-changing slice must include observed RED evidence and an explicitly smallest passing GREEN result. A defect-triggered slice must also include the minimal old-code-failing regression and sibling-scan evidence.

| Stage | Do before crossing it | Evidence to retain in the Trio | Do not continue when |
|---|---|---|---|
| **Pre-commit** | Freeze the intended base and bound spec; map the changed behavior to the highest feasible public seam; choose the relevant test cells; run RED → smallest GREEN; run focused tests and `git diff --check`. | Base/ref, changed paths, behavior, public seam, exact RED result, GREEN command/result, risk cells, and limitations. | A behavior change has no real RED, a bug has no old-code-failing repro, the specification is ambiguous, or the diff is no longer the declared slice. |
| **Pre-push** | Confirm the current commit/head still matches pre-commit evidence; rerun the affected focused/backstop checks; review the full accumulated fixed diff on separate Standards and Spec axes. | Head SHA, baseline, full review result/counts, current test results, and every material finding's verdict. | Head changed after the evidence, a material finding is unverified/unresolved, a required check is unknown, or the source scope widened. |
| **Pre-PR / PR update** | Build the review packet and verify the target CI contract; ensure the PR contains only the bound change. | PR/base/head identity, description/spec link, test matrix, regression links, review reports, CI expectations, non-goals, and follow-ups. | The packet is incomplete, unrelated work entered the diff, or the human/Chief external-action gate is absent. |

### Build the test matrix from risk, not a coverage count

Start each behavior with the normal path and an invalid/boundary path. Add only the cells that the slice makes plausible:

- state transitions, cancellation, retry, partial failure, persistence, migration, or upgrade;
- stale, reordered, duplicated, or very late results in asynchronous/concurrent work;
- a command/API reporting success while the intended externally observable state was not changed;
- permissions, destructive/no-op safeguards, malformed input, and compatibility boundaries;
- generated artifacts, clean CI, runtime delivery, or release surfaces when the task crosses those planes.

The point is to catch a **false green**: output that looks healthy but violates the behavior. Do not add a horizontal batch of speculative tests just to raise a count. A test must correspond to an actual behavior/risk and assert at a credible public seam.

### Defect and rule-retention discipline

For a confirmed defect, use the sequence: prove the smallest reproduction against old code → identify the root cause → make the smallest correction → rerun the **same** test green → inspect sibling paths for the same mistaken assumption → run the fresh backstop. Do not accept “fixed” without the displayed red/green evidence.

When a repair teaches an invariant that the test result cannot explain by itself, record the rationale and regression link first in the Trio. Update an existing, authorized module rule/decision source only if it will help future work in that module. Keep rules close to their module and load them only when relevant; revalidate and remove a rule when its behavior or rationale becomes obsolete. An architecture document, ADR, glossary, setting, listener, privilege, background job, or persistent state is never created merely because the gate noticed it—each needs a demonstrated user need, safe default, owner/lifecycle, cost, and removal story.

### Verification planes

State which planes apply before claiming completion: local source/test behavior, generated/package artifact, clean CI, and runtime/release/public delivery. A green local test does not prove a generated artifact; a green CI job does not prove a released file or live behavior. The gate requires the applicable planes to be named, but production/release verification remains a separately authorized human-gated task.

## Five-minute PR feedback loop

This loop starts only after an open PR is explicitly bound to the current Trio and you request a five-minute Codex Heartbeat. It is a monitor and dispatcher, not a second project board or an autonomous author.

### Bind before starting it

Record these fields in the task plan before configuring the Heartbeat:

| Field | Required policy/value |
|---|---|
| PR | Repository, number/URL, base ref, current head SHA, and fixed diff/spec reference. |
| Check contract | `requiredChecks` must be a non-empty list of non-empty names; bind `humanReviewPolicy=current_head_human_approved_required`, `mergeabilityPolicy=current_head_mergeable_required`, and any repository-specific branch rule. |
| Severity | `severityPolicy=critical_major_repair_minor_follow_up`; use the rubric below and identify any project-specific blocker. |
| Thread writes | `read_only` by default; separately opt in to replies/resolutions only with evidence text. |
| Follow-up issues | `draft_only` by default; allow GitHub issue creation only if you explicitly enable it for this PR. |
| Repair pushes | `repairPushPolicy=disabled` by default; an authorized repair still uses the bound Chief/worker and quality-gate path. |
| Auto-merge | `autoMergePolicy=disabled` by default; if enabled, allow only GitHub-native auto-merge after a required human `APPROVED` review on the current head. |
| Stop | Merge/close, explicit cancellation, inaccessible PR, task/binding change, or an unresolved repair/human decision. |

The Heartbeat remains silent when every observed field is unchanged. On a changed head, review/thread, check, review decision, mergeability, or severity it records a compact observation in the existing Trio. The observation key is PR + current head SHA + thread/comment ID + update time + verdict; this prevents duplicate alerts, repeated issue creation, and re-triaging a resolved/outdated comment.

The source observer is read-only by construction: it may fetch the bound PR, paginated review threads/reviews, and current status checks through `gh` and GraphQL, then pass that snapshot to the pure reducer. It rejects an absent or incomplete binding and absent credentials before any read. Thread replies/resolution, issue/review/label/close actions, repair pushes, commits, merges, native auto-merge, approvals, and credential changes are disabled external actions for the observer.

The reducer emits a fail-closed lifecycle decision. Treat approval as effective only when the current PR `reviewDecision` is `APPROVED` and an `APPROVED` review targeting the exact current head carries authenticated `author.__typename: User` evidence; bot or missing actor type fails closed. `CHANGES_REQUESTED` or `REVIEW_REQUIRED` defeats older approval. Compare the complete normalized PR, check, review, mergeability, and thread/comment snapshot for quietness. Keep review, thread/comment, and check pagination cursors independently monotonic. Continue only for a bounded genuinely pending machine state. Stop for `repair_required`, `deferred_follow_up_recording` after deduplicating accepted nonblocking findings into draft issues, `awaiting_human_gate`, `landing_eligibility` with exact-current-head and human-gate evidence, `stale_binding`, `rejected_binding`, `terminal_pr`, or unreadable observation.

### Each changed observation follows this loop

1. Confirm repository, PR, base, current head, and bound spec. Fetch all review threads with pagination plus status checks, review decision, and mergeability.
2. For each changed thread, inspect current code, exact and nearby symbols, related call sites, tests, diff, and spec. Classify it as `real`, `already fixed`, `stale`, `false positive`, or `needs user decision`; assign severity; record claim, evidence, verdict, and route.
3. Never infer a defect from bot prose or an old line number. Never resolve/reply until the task's thread-write policy authorizes that external action and the explanation cites the current evidence.
4. When the head changes, invalidate prior head-specific CI/review/gate evidence and repeat the appropriate preflight and fixed-point review. A quiet heartbeat interval is only an observation, not a closure condition.

| Severity | Treat as | Route |
|---|---|---|
| **Critical** | Security/authorization, data integrity/loss, release/upgrade integrity, or required-CI break. | Immediately remove merge eligibility; create `repair_required`; repair through the bound Chief/worker path; re-run the full quality gate and PR review. Never defer. |
| **Major** | Current behavior/spec wrong, likely correctness/reliability regression, or a material false-green test gap. | Block and repair by default; repeat the same loop. Only an explicit human waiver in the Trio can change that result. |
| **Minor** | Low-risk maintainability, naming, narrow non-behavioral documentation, or test clarity. | Leave merge eligible after evidence triage. Create one deduplicated external issue only under `follow-up issues=allowed`; otherwise leave an issue draft in the Trio. |
| **Informational / uncertain** | Stale comment, insufficient evidence, or a suggestion that conflicts with the approved spec. | Record the verdict; ask you for a product/spec decision when needed. Do not patch mechanically. |

`repair_required` returns to the normal engineering loop: bind one narrow repair slice, prove a regression RED, fix the root cause, scan siblings, run the quality gate, then resume Heartbeat observation at the new head. The monitor must not edit source inline or silently substitute itself for a required delegated worker.

### Human approval and native auto-merge

After the feedback loop finds no critical/major actionable thread, the state is **awaiting human**, not “done.” The PR is eligible for GitHub-native auto-merge only when all of these are true on the same current head:

1. You enabled `auto-merge` for this exact PR when binding the monitor.
2. The change-quality gate and required clean-CI checks are current and passing.
3. Required conversations are resolved or have documented evidence-backed non-actionability; no critical/major actionable thread remains.
4. GitHub reports the PR mergeable, and a required human reviewer has submitted `APPROVED` for the current head.
5. The Host and repository actually support native auto-merge.

Only then may the integration lane enable **native platform auto-merge**. It must never execute `git merge`, approve as a human, dismiss/change branch protection, force-push, merge a promotion/release PR without separate authorization, or treat a passing bot review/quiet interval as human approval. If any condition changes, return to observation or repair and notify only that meaningful state change.

## Mandatory escalation triggers

Escalate from direct intake to Chief before production mutation when any condition becomes true:

- a delegated worker becomes the primary executor, or the user explicitly requests an independent Host task;
- more than one active slice or concurrent writer needs coordination;
- a design, architecture, domain, or root-cause choice is materially uncertain;
- the change has broad shared-library, schema, migration, authorization, data, or compatibility impact;
- source intent conflicts, evidence is untrusted or contradictory, or a decision needs an independent reviewer;
- the work touches merge/rebase conflicts, external systems, credentials, production configuration, destructive cleanup, or any human-gated action;
- the original focused proof does not fail or pass as predicted after three disciplined attempts.

Use a read-only architecture review or decision-grilling session only when one of those triggers shows it will reduce uncertainty. Its output is evidence and options; it never authorizes a refactor or creates an ADR automatically. A missing credible seam after diagnosis is itself a `codebase-design` finding and requires an escalation decision before broad restructuring.

## Evidence standard

Every completed coding task reports, at the level appropriate to its lane:

- changed paths and the bounded behavior delivered;
- the chosen public seam and an actual RED result when code behavior changed;
- GREEN and fresh backstop commands with exits/test counts;
- selected methods, their trigger, and their required evidence (for example: terminology decision, design trade-off, minimized repro/hypotheses, or separate Standards/Spec review);
- constraints/non-goals honored, unresolved limitations, and any out-of-scope findings;
- for delegated work: the frozen binding, worker candidate status, Chief acceptance result, and unknown Host facts kept as `unknown`.

Never claim a previous run, a partial run, a nearby green test, a worker summary, or a requested model/effort as proof of completion.

## Safety and closure rules

- Route selection never grants permission.
- A safety-sensitive or external action remains `ask`/human-gated even if tests are green.
- Do not directly edit generated `AGENTS.md` or `.agents/**`; change source-owned policy and prove the projection.
- Do not reset, clean, delete, stage, commit, merge, push, publish, deploy, send, or expose credentials outside an explicit scope and applicable gate.
- If blocked, record the exact blocker and resume condition in the Trio. `manual_pending` is a correct outcome when the required Host or human condition is absent.

## Review the SOP after use

After the feature, defect, refactor, and fixed-diff review pilots, evaluate only these questions:

1. Did the chosen lane catch a real uncertainty or prevent a real mistake?
2. Did the evidence make acceptance materially easier?
3. Did any mandatory step add ceremony without reducing risk?
4. Did any task need a missing optional diagnostic or a stronger safety gate?
5. Did automatic method selection invoke the lightest useful method and avoid unapproved writes or delegation?

Keep the parts that demonstrably improve decisions and remove the rest. The goal is stronger harness behavior, not a larger ritual.
