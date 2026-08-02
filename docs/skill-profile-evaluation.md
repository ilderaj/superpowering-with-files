# Skill Profile Evaluation

`matt-pilot`, `superpowers-pilot`, and `hybrid-candidate` are historical matched-task evaluation arms. They remain available for diagnosis and are not three permanent workflow authorities. The production prior is Standard Matt coding plus Harness governance, with non-overlapping Superpowers lifecycle skills added only by the hybrid/high-assurance path.

The current decision comparison is `standard` as the baseline versus the retained `hybrid-candidate` under a named `risk-triggered assurance` condition. This comparison does not create a production profile or change the default selection.

## Decision Comparison

Compare `standard` and `hybrid-candidate` from the same base SHA with the same Assignment Packet and acceptance rubric. The `risk-triggered assurance` condition is satisfied only when the evidence includes real cross-session tracked work and a high-risk migration or release-closure task. These are required decision gates, not optional examples.

The comparison records the common metrics in `tests/fixtures/skill-profile-evaluation/tasks.json`, including task success, evidence completeness, rework or escalation, tokens, latency, trustworthy cost when available, scope drift, false skill invocation, and extra authority files. A matched result may inform a reviewed recommendation, but it is not runtime or Host enforcement and it does not perform automatic profile routing.

`standard` remains the baseline and `hybrid-candidate` remains a retained compatibility candidate until the evidence gate is accepted. No default or workspace-profile change follows from a fixture or test result. Production selection requires a separate human gate.

This gate covers lifecycle-skill expansion, not merely profile selection: no Superpowers lifecycle-skill expansion may be proposed or accepted without the matched decision evidence and a reviewed human gate. It is an auditable review/test contract, not runtime or Host enforcement.

## Trial Design

Replay the same historical task from the same base SHA with the same Assignment Packet and acceptance criteria. Run all three arms before trying one low-risk live task. Keep Office work as a control lane: Office uses its artifact-specific runtime and does not compete as a coding owner.

The six representative task classes are:

1. small bug fix;
2. ordinary feature;
3. complex diagnosis;
4. multi-file refactor;
5. cross-session tracked task;
6. high-risk migration or release closure.

Office remains a separate non-competing control lane.

For every run record:

- task success;
- required-evidence completeness;
- rework or escalation count;
- total input/output tokens;
- latency;
- trustworthy cost when available;
- subagent count;
- human confirmation count;
- scope drift;
- false skill invocation count;
- extra authority files created.

## Adoption Rule

Do not declare a winner from profile size, static prose comparison, or one random project. A proposal is admitted only when matched replay preserves task success and required-evidence completeness, does not introduce task-authority drift, and has an explicitly preferable token/latency/rework trade-off. If Matt-only loses lifecycle proof, retain hybrid. If Superpowers-only adds process without improving proof, retain Matt ownership for daily coding. Escalate ambiguous results to one low-risk live pilot; do not use money, security, migration, or release work as the first live trial.

Every task record carries a common-base reference, bounded Assignment Packet, expected evidence, and acceptance rubric. The machine-readable fixture is `tests/fixtures/skill-profile-evaluation/tasks.json`.
