# Source-backed work

## When to load

Load this reference when an Office artifact summarizes external sources, turns source material into a decision, or needs a traceable handoff. Keep the detailed source method on demand so the default Office surface stays focused on capability selection and verification.

## Input contract

For each source, record its identifier, source type, retrieval time or validity window, original location, covered scope, and the fields that can be verified from it. Also record the intended audience, requested decision, and project-owned taxonomy. Use `unknown` when the source date, retrieval time, validity window, location, or verifiable fields are absent; do not infer them. Preserve the input boundary: a source, a parsed value, a report, and a recommendation are separate objects.

## Evidence classification

Label each material statement as one of these:

- `fact`: directly supported by an identified source, with its date and scope.
- `assumption`: required to proceed but not established by the available source.
- `conflict`: sources or inputs disagree; retain both sides and identify the mismatch.
- `recommendation`: a proposed action with its evidence basis and unresolved conditions.
- `pending`: required evidence, owner confirmation, or source access is still missing.

Do not promote an assumption, conflict, recommendation, or pending item into a current fact. Do not replace a project-owned taxonomy with a generic category without recording that classification choice.

## Output contract

Return a concise summary with the facts, assumptions, conflicts, recommendation, and pending items separated. Trace each fact to its source identifier, source date, and source scope. State the taxonomy used, the owner or action for pending items, and the boundary of any partial result.

For concise Chinese work summaries, check 事实、动作、负责人、输出、期限或风险、来源 as evidence fields rather than a sentence template. Write `证据不足，待确认` for an unsupported field; do not invent an owner, deadline, next-period plan, or source content.

## Conflict and pending rules

Keep a source-date or source-scope mismatch as `conflict` until an owner resolves it. A recommendation must state its evidence basis and the condition that remains unresolved. A partial blocker stays `pending` and must name the affected claim; complete the supported portion without implying that the blocked portion was verified.

## Stop conditions

Stop the affected claim when the source is unavailable, access is not authorized, source date or scope cannot be established, taxonomy ownership is unclear, or a conflict changes the decision. Record `unknown` or `pending` as appropriate and request the missing evidence or owner decision. Never invent a source, date, scope, approval, or handoff outcome.
