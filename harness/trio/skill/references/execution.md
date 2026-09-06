# Execution boundaries

Choose direct or delegated primary execution from user intent, risk, and available Host capability. Reuse existing authorization for its exact action, target, and scope; it does not override Host restrictions. Only ask again when scope changed or authorization is missing or ambiguous.

For direct work, the executor owns implementation, relevant verification, and completion writeback. Bounded independent helpers are allowed when useful. For delegated primary execution, Chief owns planning, assignment, gates, review, acceptance, and Trio writeback; the worker owns production changes and primary verification and returns a candidate.

Freeze the exact slice before dispatch: authority root/task, currentSlice, baseline, allowed files or paths, non-goals, dependencies, evidence sink, stop conditions, and expected return. Freeze only declared scope, not unrelated work or the entire workspace. A frozen authority binding includes the three file hashes; keep those authority bytes frozen until controlled rebind or acceptance writeback. Concurrent unrelated edits are preserved; an in-scope baseline change or binding mismatch blocks execution pending revalidation.

Bounded parallel delegation is useful for independent research, review, or disjoint execution when the Host and user permit it. Give each child a proper-subset scope and prevent conflicting writes. The primary executor integrates and verifies helper results. Human intent constrains model and effort choices; the agent recommends or selects supported intent, and the Host executes and attests. Actual execution remains unknown without authenticated Host evidence.

When `visible_worker_required` is selected, that strict topology is binding: no Chief inline execution or native-subagent substitution for the primary visible worker. Native helpers in that topology are worker-local and bounded. If the compliant visible worker is unavailable, return `manual_pending` or `blocked`; do not silently change topology. Follow ChiefOps delegated-execution guidance for packet integrity, permissions, and same-worker recovery when that lane is selected.

Human-gated destructive, external, credential/security-sensitive, merge, push, publish, release, deploy, send, and data-loss operations retain applicable gates. Existing authorization may satisfy a human gate; a route, capability, checkpoint, or worker result cannot supply it. A Host denial remains a denial.

## Optional model and effort starting points

Prefer the current model for small tasks; switching has a coordination cost. Respect explicit human choices and the Host's current supported catalog. When another model is useful, consider Luna for bounded inexpensive work, Terra for ordinary implementation, Sol for demanding coding, and Astra for hard reasoning or integration. These are recommendations, not benchmark claims or role locks.

Choose effort independently: low or medium for bounded work, high for material uncertainty, and xhigh or max only when a specific unresolved issue justifies it. The agent records the reason for a meaningful change; requested intent does not prove which model or effort the Host actually ran.
