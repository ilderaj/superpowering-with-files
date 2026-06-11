# Goal2Plan Rubric

## Hard Checks

Every generated Goal2Plan prompt must:

1. return exactly one markdown fenced block
2. start the inner prompt with `/goal`
3. keep the inner prompt `<=4000` characters
4. make the objective plan generation, not implementation execution
5. mention `planning/active/<task-id>/`
6. mention `docs/superpowers/plans/<date>-<task-id>.md`
7. mention a native `/goal`
8. state that it does not implement a runner or external runner
9. require `1` read-only reviewer subagent
10. include at least one numeric done criterion
11. include stop or escalate conditions

## Pass Threshold

- all hard checks pass
- score `>=9/10`

## Action Notes

- Missing authority: add `planning/active/<task-id>/`
- Missing artifact path: add `docs/superpowers/plans/<date>-<task-id>.md`
- Wrong objective: replace implementation execution language with plan-generation language
- Missing guardrail: say the skill does not implement a runner
- Missing reviewer gate: add `1` read-only reviewer subagent
