# Simplicity Ladder A/B Acceptance Rubric

Use this rubric only for opt-in or scheduled acceptance runs. Do not treat it as an always-on CI gate.

## Scenario Set
- At least `5` scenarios:
  - `2` small implementation tasks
  - `2` review or debt-reduction tasks
  - `1` validation-sensitive task

## Comparison Shape
- A run: no explicit simplicity-ladder emphasis
- B run: explicitly require `Simplicity Ladder`

## Scorecard
- Record:
  - new dependencies added
  - files changed
  - diff lines
  - whether validation or trust-boundary checks were preserved
  - human judgment on "simpler without getting sloppier"

## Pass Rule
- B beats A on at least `3/5` scenarios for dependency count, files changed, or diff size.
- B must not regress validation or trust-boundary protection in any scenario.
- Human judgment must rate at least `4/5` scenarios as simpler without becoming sloppier.
