# Goal Writer Examples

These examples are intentionally short and contract-focused. Full fixture outputs live in `outputs/`.

## Quick Round Example
- Fixture: `quick-task`
- Key behavior: use the compact frame, keep the round lightweight, and wrap the prompt in a fenced block
- Numeric target: `2 validation checks pass`
- Length target: inner prompt stays under `1200` chars

## Tracked Round Example
- Fixture: `tracked-task`
- Key behavior: use the standard frame, keep `planning/active/<task-id>/` authoritative, and require phase-by-phase sync-back
- Numeric target: `6 fixture prompts pass all hard checks`

## Deep-Reasoning Round Example
- Fixture: `deep-reasoning-task`
- Key behavior: use the standard frame and require a reviewer-gated companion plan only when the round is deep-reasoning
- Numeric target: `3 verifier rounds max`

## Context-Heavy Example
- Fixture: `context-heavy-task`
- Key behavior: cite the few repo surfaces that actually change execution, not the entire discovery history
- Numeric target: `4 authoritative surfaces updated and 3 validations pass`

## Full Outputs
- `outputs/sparse-intent.goal.md`
- `outputs/ambiguous-intent.goal.md`
- `outputs/quick-task.goal.md`
- `outputs/tracked-task.goal.md`
- `outputs/deep-reasoning-task.goal.md`
- `outputs/context-heavy-task.goal.md`
