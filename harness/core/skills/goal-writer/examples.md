# Goal Writer Examples

These examples are intentionally short and contract-focused. Full fixture outputs live in `outputs/`.

## Quick Round Example
- Fixture: `quick-task`
- Key behavior: use the compact frame, keep the round lightweight, name `2` concrete proofs, and wrap the prompt in a fenced block
- Numeric target: `2 validation checks pass`
- Length target: inner prompt stays under `1200` chars

## Tracked Round Example
- Fixture: `tracked-task`
- Key behavior: use the standard frame, keep `planning/active/<task-id>/` authoritative, and give one clear finish line before any deeper escalation
- Numeric target: `6 fixture prompts pass all hard checks`

## Proof-First Example
- Fixture: `acceptance-proof-task`
- Key behavior: make `Validation` name exact commands or evidence surfaces, then tie `Done Criteria` back to those proofs
- Numeric target: `2` concrete proof commands and `1` updated workflow surface

## Bounded Orchestration Example
- Fixture: `moderate-tracked-task`
- Key behavior: keep a moderate tracked goal smaller than a planning loop unless the round really becomes deep-reasoning
- Numeric target: `2` proof commands and `1` bounded publishing workflow surface

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
