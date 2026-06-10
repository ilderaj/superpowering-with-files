# Goal Writer Rubric

## Hard Checks

Every generated prompt must pass all hard checks:

1. Starts with `/goal`
2. Is `<=4000` characters
3. Contains these labeled sections in order:
   - `Objective`
   - `Context`
   - `Constraints`
   - `Work Discipline`
   - `Validation`
   - `Done Criteria`
   - `Stop/Escalate`
   - `Next Step`
4. `Done Criteria` contains at least one numeric target
5. Preserves SWF authoritative memory rules with `planning/active/<task-id>/`
6. Encodes quick / tracked / deep-reasoning round discipline and limits companion-plan/verifier use to deep-reasoning rounds
7. Includes validation and stop/escalate conditions

## Scored Rubric (10 points)

| Category | Points | Pass signal |
| --- | --- | --- |
| Format and section order | 2 | One complete `/goal ...` prompt with exact labeled sections |
| Quantified completion target | 2 | `Done Criteria` has at least one numeric target; inferred metrics are labeled |
| SWF loop discipline | 2 | Prompt restores planning files, reclassifies rounds, keeps quick lightweight, and syncs back |
| Goal stability | 1 | Prompt allows replan but rejects goal drift |
| Validation quality | 1 | Validation names concrete commands or evidence checks |
| Stop/Escalate clarity | 1 | Prompt states when to stop, ask, or escalate |
| Immediate execution handoff | 1 | `Next Step` tells the agent what to do first |

Pass threshold:
- all hard checks pass
- score `>=9/10`

## Actionable Failure Notes

Use these notes when refining the prompt:

- Missing numeric target: add a measurable count, threshold, command total, artifact total, retry cap, or checklist size to `Done Criteria`
- Missing assumptions: label the inference instead of pretending the fact was provided
- Over budget: shorten `Context` first, then `Constraints`, while preserving the section labels
- Quick-task overreach: remove default companion-plan or subagent language unless the round becomes deep-reasoning
- Weak validation: replace generic “verify the work” wording with named commands or evidence surfaces
