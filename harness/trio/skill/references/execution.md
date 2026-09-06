# Execution boundaries

Choose direct or delegated primary execution from user intent, risk, and available Host capability. Reuse existing authorization for its exact action, target, and scope; it does not override Host restrictions. Only ask again when scope changed or authorization is missing or ambiguous.

For direct work, the executor owns implementation, relevant verification, and completion writeback. Bounded independent helpers are allowed when useful. For delegated primary execution, Chief owns planning, assignment, gates, review, acceptance, and Trio writeback; the worker owns production changes and primary verification and returns a candidate.

Freeze the exact slice before dispatch: authority root/task, currentSlice, baseline, allowed files or paths, non-goals, dependencies, evidence sink, stop conditions, and expected return. Freeze only declared scope, not unrelated work or the entire workspace. A frozen authority binding includes the three file hashes; keep those authority bytes frozen until controlled rebind or acceptance writeback. Concurrent unrelated edits are preserved; an in-scope baseline change or binding mismatch blocks execution pending revalidation.

Bounded parallel delegation is useful for independent research, review, or disjoint execution when the Host and user permit it. Give each child a proper-subset scope and prevent conflicting writes. The primary executor integrates and verifies helper results. Human intent constrains model and effort choices; the agent recommends or selects supported intent, and the Host executes and attests. Actual execution remains unknown without authenticated Host evidence.

Root migration rule: `visible_worker_required` is legacy input only. Root active routing has only direct/native-first and `manual_pending`. For a valid packet carrying that input, every Host operation returns `manual_pending` with blocker `legacy_visible_worker_required_retired`; do not restore a Host bridge or fall back to native. Resume only after an explicit `primaryExecution=default` rebind under the current Trio authority. A user explicitly requesting an independent visible task uses the Host's user-owned task workflow outside internal routing. Historical packet and evidence vocabulary may retain the legacy value.

Human-gated destructive, external, credential/security-sensitive, merge, push, publish, release, deploy, send, and data-loss operations retain applicable gates. Existing authorization may satisfy a human gate; a route, capability, checkpoint, or worker result cannot supply it. A Host denial remains a denial.

## Optional model and effort starting points

Prefer the current model for small tasks; switching has a coordination cost. Respect explicit human choices and the Host's current supported catalog. When another model is useful, consider Luna for bounded inexpensive work, Terra for ordinary implementation, Sol for demanding coding, and Astra for hard reasoning or integration. These are recommendations, not benchmark claims or role locks.

Choose effort independently: low or medium for bounded work, high for material uncertainty, and xhigh or max only when a specific unresolved issue justifies it. The agent records the reason for a meaningful change; requested intent does not prove which model or effort the Host actually ran.

## Recovery and completion handoff

For a tracked task, recovery starts by reading the bound `task_plan.md`, `findings.md`, and `progress.md` and checking their current binding. An explicit task id and a recorded summary may help navigation; neither replaces the three files or permits guessing from a recent directory timestamp. Missing, ambiguous, or truncated recorded content is a reason to return to the source and state the uncertainty.

Valid authorization continues only for the same recorded scope and action. A helper may not change the frozen Trio, its binding, or its lifecycle state. The Chief or the direct executor responsible for the task owns progress, acceptance, stop, close, archive, and any controlled rebind. A helper returns a candidate and evidence in its assigned output scope.

The optional recovery headings `## Current Decisions` and `## Deliverables` in `findings.md`, and `## Remaining Work` and `## Resume Conditions` in `task_plan.md`, are short navigation aids. Older tasks do not need migration. A missing heading remains missing; a duplicate heading is ambiguous; a long value is truncated only when the summary says so. These headings never grant permission, prove acceptance, or replace progress events.

Completion terms describe separate evidence: `generated` means a file or result was created; `opened` means a Host or named actor actually opened/read it; `rendered` means the stated pages, slides, sheets, or ranges were rendered or inspected; `accepted` means a named authority accepted the stated scope; `delivered` means the intended recipient has usable access with supporting evidence. One term does not imply the others. A local path, queued request, worker reply, or fixture result cannot by itself prove user-visible delivery.
