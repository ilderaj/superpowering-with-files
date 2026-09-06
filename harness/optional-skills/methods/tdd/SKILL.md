---
name: tdd
description: Implement a behavior change test-first when TDD or red-green-refactor is requested or required by the task contract.
---

# Test-Driven Development

Use one vertical slice at a time: **red → green → refactor while green**. Preserve observable public behavior outside the authorized change.

Read the relevant existing domain glossary and ADRs once when establishing context. Use the approved requirements and repository contract to choose the highest feasible public seam. Clarify only when that choice materially changes behavior, architecture, risk, or scope; ordinary test design inside the assignment needs no new approval.

## The loop

1. Choose one observable behavior and an independent expected outcome from a requirement, worked example, or known-good literal.
2. Write a test through the public interface and run it. Confirm **RED for the intended behavior**, not a syntax, setup, or dependency failure. For a bug, reproduce the actual triggering pattern.
3. Make the smallest implementation change that turns that test **GREEN**, then run the relevant existing tests.
4. Refactor within the authorized scope only while **GREEN**. Preserve public behavior, take small steps, and rerun affected tests after each meaningful refactor. Do not remove or weaken assertions to manufacture green.
5. Continue with the next behavior; finish with fresh verification appropriate to the changed surface.

Avoid implementation-coupled assertions, internal collaborator mocks as proof, tautological expected values, and horizontal batches of speculative tests followed by bulk implementation. Tests should survive an internal refactor without changing their behavioral expectations. Multiple assertions may establish one coherent outcome.

## Read details when needed

- [tests.md](tests.md): examples when selecting assertions or reviewing a test's sensitivity to the actual behavior.
- [mocking.md](mocking.md): guidance when a slice crosses an external system, time/randomness, or another hard-to-control dependency.

Load the relevant reference once and revisit it only when new uncertainty or changed constraints warrant it. No every-section or every-cycle reread is required. Separate Standards/Spec review may follow implementation under the task's contract; it does not postpone ordinary green refactoring.
