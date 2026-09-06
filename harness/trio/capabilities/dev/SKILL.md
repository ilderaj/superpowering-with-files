---
name: dev
description: Shared development quality and risk-relevant verification contract.
---

# Development

Inspect user intent, current code, baseline, ownership, constraints, and success criteria before editing. Reuse existing authorization within scope. Preserve others' changes and architectural ownership. Choose the smallest root-cause change, reuse existing public surfaces, and avoid speculative abstractions; add a fallback only under an explicit contract.

For behavior changes, test the observable requirement at the highest feasible public seam: observe a real RED, implement the smallest GREEN, then refactor while green. Reject implementation-coupled assertions, tautological expectations, and mock-only proof. Work in independently verifiable slices. For typo or wording-only edits, do not add tests; verify the affected text or structure. Instruction changes that alter decisions need semantic contract checks.

Select tests from changed behavior, dependencies, and risk. Unchanged relevant evidence remains valid for the same tested content and environment; reuse it. A change, failure, or unresolved uncertainty triggers a targeted rerun or new verification. Read exits, counts, and failures before claiming results. Partial runs, adjacent green checks, and worker reports alone do not establish proof.

Load detail only when needed:

- [Methods](references/methods.md): uncertain domain/design choices, debugging, or a bounded execution handoff.
- [Review and integration](references/review.md): fixed-diff Standards and Spec review, commit/PR boundaries, or closure risk.
- [PR feedback](references/pr-feedback.md): explicitly bound PR observation and its terminal lifecycle.

Direct work can complete with its own relevant verification and tracked writeback. Delegated primary work returns `candidate_done` for Chief acceptance; retain any explicitly selected independent acceptance lane. Return changed paths, commands/exits/counts, evidence, and unresolved limits. Host controls and existing human gates still govern external actions; local verification is not evidence that they occurred.

For tracked recovery, read the bound Trio before acting and use its recorded goal, decisions, deliverables, remaining work, and resume conditions as navigation only. Preserve the same scope and authorization; do not let a helper edit the frozen Trio or turn a candidate into acceptance. Report the result path, verification scope, and unresolved work separately. `generated`, `opened`, `rendered`, `accepted`, and `delivered` each require their own evidence; a file path or queued Host action does not prove that a user saw the result.
