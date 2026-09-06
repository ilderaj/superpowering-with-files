---
name: domain-modeling
description: Resolve new, overloaded, or contradictory domain terms, rules, states, or roles when they affect a design decision.
---

# Domain Modeling

Clarify the project's domain model when terminology or rules affect behavior. Merely reading an existing glossary does not require this method.

1. Find the authoritative domain sources already used by the project: a glossary, specification, domain documentation, context map, or ADRs. Follow their structure, vocabulary, and precedence. `CONTEXT.md` is one possible convention, not a required file.
2. Identify the disputed term or relationship and check relevant code and tests. Distinguish documented intent, observed implementation, and a proposed change; implementation does not automatically override the accepted model.
3. Test the distinction with concrete scenarios and edge cases. Derive answers from available evidence first. Ask about unresolved decisions only when they materially affect behavior or scope; avoid an interview for facts available in the repository.
4. Record resolved terms and decisions in the existing authorized task or documentation surface. For analysis-only work, return a proposal. Create or update domain documents only within the user's or repository's authorized scope; never create a new glossary, ADR tree, or planning authority merely because this skill is active.

## Optional formats

- [CONTEXT-FORMAT.md](CONTEXT-FORMAT.md): a lightweight glossary format when a glossary edit is authorized and no existing format already governs it.
- [ADR-FORMAT.md](ADR-FORMAT.md): a decision record when the choice is hard to reverse, surprising without context, and the result of a real trade-off.

Preserve existing documents that also contain implementation or decision context; do not rewrite them into a glossary-only format. Keep unresolved alternatives labelled as proposals, and link an authorized documentation change from an existing task record when the task uses one.
