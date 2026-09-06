---
name: codebase-design
description: Evaluate module interfaces and test seams when a design or refactor decision involves coupling, shallow wrappers, or unclear ownership.
---

# Codebase Design

A deep module offers substantial behavior through a small interface. Use this method for a concrete design decision, not as permission for a general refactor.

1. Read the relevant existing domain documents, ADRs, caller contracts, and tests. Keep the project's vocabulary and ownership boundaries.
2. Name the current interface, the complexity callers must understand, and the behavior to preserve. A seam is where behavior can be varied through an interface; test through the highest feasible public seam.
3. Propose the smallest change that improves locality or hides complexity within the authorized scope. Do not add abstractions or ports for hypothetical consumers.
4. Explain the trade-off and how public behavior will be verified. Implement only if implementation is in scope, using small refactors while tests remain green.

## Conditional references

- [DESIGN-PRINCIPLES.md](DESIGN-PRINCIPLES.md): vocabulary, interface depth, and examples when comparing shapes or testability.
- [DEEPENING.md](DEEPENING.md): dependency categories and coverage preservation when consolidating an existing cluster.
- [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md): alternative interfaces when the choice is material or alternatives were requested. Alternatives can be developed in the main session; subagents are optional.

Do not load every reference for a small, already-settled interface change. Existing standards and accepted decisions take precedence over these heuristics.
