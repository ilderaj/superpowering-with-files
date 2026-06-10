---
name: goal-writer
description: Use when preparing a Codex `/goal` prompt from sparse, ambiguous, or context-heavy intent and you need one stable, quantified goal contract instead of a plan explanation
---

# Goal Writer

## Overview
Goal Writer turns rough user intent, prior Q&A, and the minimum effective repo context into one complete Codex-ready `/goal ...` prompt. The prompt keeps the root goal stable, encodes SWF round-start discipline, stays within the 4000-character limit, and always carries at least one measurable numeric done target.

## Outcome Contract

- **Outcome:** the user receives one paste-ready `/goal ...` prompt instead of a plan walkthrough.
- **Done when:** the prompt starts with `/goal`, stays `<=4000` characters, uses the required labeled sections, preserves `planning/active/<task-id>/` as authoritative memory, and includes at least one numeric target inside `Done Criteria`.
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
| 2 | Pull only context that changes execution or done criteria |
| 3 | Ask concise clarification only when a blocking fact prevents a valid goal |
| 4 | Otherwise infer defaults and write them as `Assumptions:` inside the prompt |
| 5 | Use the exact labeled frame from `template.md` |
| 6 | Put at least one numeric target in `Done Criteria`; if inferred, label it |
| 7 | Trim until the entire prompt is `<=4000` characters |
| 8 | Run the evaluator and fix any failed hard checks |

## Implementation
1. Start from the root goal, not the implementation plan. The prompt should describe what success means, not narrate how you will reason.
2. Reuse current conversation answers when they exist. Inspect repo context only when it changes scope, constraints, validation, or the done metric.
3. Ask clarification only if a missing fact blocks a valid goal. Typical blockers are:
   - you cannot identify the execution surface or authoritative files
   - you cannot form any defensible numeric completion target
   - safety or scope boundaries are unknowable without one missing fact
4. If the goal is still valid without clarification, infer sensible defaults and say so inside the prompt with `Assumptions: ...`.
5. Output one prompt only. No preface, no explanation, no extra bullets outside the `/goal ...` body.
6. Use these exact labeled sections, in order: `Objective`, `Context`, `Constraints`, `Work Discipline`, `Validation`, `Done Criteria`, `Stop/Escalate`, `Next Step`.
7. In `Work Discipline`, always encode SWF round-start behavior:
   - restore `planning/active/<task-id>/task_plan.md`, `progress.md`, and `findings.md`
   - reclassify each round as `quick`, `tracked`, or `deep-reasoning`
   - keep quick rounds lightweight
   - keep `planning/active/<task-id>/` authoritative for tracked rounds
   - use `docs/superpowers/plans/<date>-<task-id>.md` plus optional read-only verifier subagents only for deep-reasoning rounds
   - sync durable state back to `planning/active/<task-id>/` after each phase
8. Keep the root goal stable. The prompt may allow planning or replanning, but it must forbid goal drift.
9. Every prompt must contain a numeric done target. If the user did not supply one, derive an acceptable metric from tests, file counts, command counts, artifact counts, retry limits, checklist counts, or another defensible measurable boundary, and label it `Inferred acceptance metric`.
10. Prefer terse, high-signal phrasing. Keep each section short enough that the whole prompt remains under the character cap.
11. Before returning, compare the prompt against `rubric.md` or run `scripts/evaluate-goal-writer.mjs`. Fix failures instead of explaining them away.

See:
- `template.md` for the exact prompt frame
- `examples.md` for quick / tracked / deep examples
- `rubric.md` for hard checks and scoring
- `scripts/evaluate-goal-writer.mjs` for repeatable fixture validation

## Common Mistakes
- Returning a planning explanation instead of one `/goal ...` prompt
- Omitting the numeric target or placing it outside `Done Criteria`
- Treating every task as deep-reasoning and forcing companion plans or subagents on quick work
- Failing to label inferred assumptions or inferred metrics
- Stuffing low-signal repo history into `Context` until the prompt exceeds 4000 characters
- Forgetting to tell the goal loop to sync durable state back to `planning/active/<task-id>/`
