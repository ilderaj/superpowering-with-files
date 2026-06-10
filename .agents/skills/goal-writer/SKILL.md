---
name: goal-writer
description: Use when preparing a Codex `/goal` prompt from sparse, ambiguous, or context-heavy intent and you need one stable, quantified goal contract instead of a plan explanation
---

# Goal Writer

## Overview
Goal Writer turns rough user intent, prior Q&A, and the minimum effective repo context into one complete Codex-ready `/goal ...` prompt. The prompt keeps the root goal stable, encodes SWF round-start discipline, stays within the 4000-character limit, always carries at least one measurable numeric done target, and scales down for genuinely simple goals instead of defaulting to a multi-thousand-character contract.

## Outcome Contract

- **Outcome:** the user receives one paste-ready markdown fenced block containing a `/goal ...` prompt instead of a plan walkthrough.
- **Done when:** the fenced block contains exactly one `/goal` prompt, the inner prompt stays `<=4000` characters, uses the required labeled sections, preserves `planning/active/<task-id>/` as authoritative memory, includes at least one numeric target inside `Done Criteria`, and shrinks appropriately for simple work.
- **Evidence:** the prompt passes `scripts/evaluate-goal-writer.mjs` across all fixtures and any repo tests that cover projection or rendering.
- **Output:** a single Codex-ready goal prompt with assumptions, validation, done criteria, stop/escalate rules, and next step.

## When to Use
- The user asks for a Codex `/goal` prompt, a goal contract, or a stable auto-continue objective
- Intent is sparse, prior Q&A is scattered, or repo context matters to write valid done criteria
- You need quantified completion rules without drifting into a full implementation plan

Do not use this skill when:
- the user already supplied a complete valid `/goal` prompt
- the task is to execute the work, not to draft the goal contract
- the missing information truly blocks any valid goal and a concise clarification is clearly required first

## Quick Reference
| Step | Rule |
| --- | --- |
| 1 | Capture the root objective in one stable sentence |
| 2 | Classify the goal as `simple` or `full` before drafting |
| 3 | Pull only context that changes execution or done criteria |
| 4 | Ask concise clarification only when a blocking fact prevents a valid goal |
| 5 | Otherwise infer defaults and write them as `Assumptions:` inside the prompt |
| 6 | Use the compact or standard frame from `template.md` |
| 7 | Put at least one numeric target in `Done Criteria`; if inferred, label it |
| 8 | Return exactly one markdown fenced block and keep the inner prompt within its budget |
| 9 | Run the evaluator and fix any failed hard checks |

## Implementation
1. Start from the root goal, not the implementation plan. The prompt should describe what success means, not narrate how you will reason.
2. Reuse current conversation answers when they exist. Inspect repo context only when it changes scope, constraints, validation, or the done metric.
3. Classify complexity before drafting:
   - `simple`: single-surface or low-risk quick work with a short feedback loop and no need for heavy repo context
   - `full`: tracked, context-heavy, or deep-reasoning work that needs a richer contract
4. For `simple` goals, compress aggressively. Keep every required section, but let `Context`, `Constraints`, `Validation`, and `Done Criteria` collapse to short one-liners. A simple prompt should usually stay comfortably below `1200` characters unless the user explicitly requires more.
5. Ask clarification only if a missing fact blocks a valid goal. Typical blockers are:
   - you cannot identify the execution surface or authoritative files
   - you cannot form any defensible numeric completion target
   - safety or scope boundaries are unknowable without one missing fact
6. If the goal is still valid without clarification, infer sensible defaults and say so inside the prompt with `Assumptions: ...`.
7. Output one prompt only, wrapped in exactly one markdown fenced block such as `````text````` or `````md````` . No prose before or after the fenced block.
8. Use these exact labeled sections, in order: `Objective`, `Context`, `Constraints`, `Work Discipline`, `Validation`, `Done Criteria`, `Stop/Escalate`, `Next Step`.
9. In `Work Discipline`, always encode SWF round-start behavior:
   - restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md`
   - reclassify each round as `quick`, `tracked`, or `deep-reasoning`
   - keep quick rounds lightweight
   - keep `planning/active/<task-id>/` authoritative for tracked rounds
   - use `docs/superpowers/plans/<date>-<task-id>.md` plus optional read-only verifier subagents only for deep-reasoning rounds
   - sync durable state back to `planning/active/<task-id>/` after each phase
10. Keep the root goal stable. The prompt may allow planning or replanning, but it must forbid goal drift.
11. Every prompt must contain a numeric done target. If the user did not supply one, derive an acceptable metric from tests, file counts, command counts, artifact counts, retry limits, checklist counts, or another defensible measurable boundary, and label it `Inferred acceptance metric`.
12. Prefer terse, high-signal phrasing. Keep each section short enough that the whole prompt remains under the character cap, and trim simple goals first rather than repeating the full tracked/deep structure verbosely.
13. Before returning, compare the prompt against `rubric.md` or run `scripts/evaluate-goal-writer.mjs`. Fix failures instead of explaining them away.

See:
- `template.md` for the exact prompt frame
- `examples.md` for quick / tracked / deep examples
- `rubric.md` for hard checks and scoring
- `scripts/evaluate-goal-writer.mjs` for repeatable fixture validation

## Common Mistakes
- Emitting the prompt as bare response text instead of one fenced block the user can copy directly
- Using the full long-form contract for a genuinely simple quick task
- Returning a planning explanation instead of one `/goal ...` prompt
- Omitting the numeric target or placing it outside `Done Criteria`
- Treating every task as deep-reasoning and forcing companion plans or subagents on quick work
- Failing to label inferred assumptions or inferred metrics
- Stuffing low-signal repo history into `Context` until the prompt exceeds 4000 characters
- Forgetting to tell the goal loop to sync durable state back to `planning/active/<task-id>/`
