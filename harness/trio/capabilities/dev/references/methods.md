# Method selection

Use only methods justified by evidence. Installed Host skills are optional acceleration within the same scope; they grant no dispatch permission, model authority, or extra task-state surface.

| Trigger | Method and evidence |
|---|---|
| New, renamed, overloaded, or contradictory domain language | `domain-modeling`: inspect terminology and ADRs, resolve the term with a concrete scenario before interface design. Create CONTEXT.md or an ADR only within authorized scope. |
| Material interface expansion, unclear test seam, shallow adapters, coupling, or wide refactor | `codebase-design`: identify module ownership, interface and public seam, dependency category, test strategy, and depth/locality trade-off. Compare bounded alternatives only for material uncertainty. |
| Broken, throwing, failing, or slow behavior without a known cause | `diagnosing-bugs`: establish a fast deterministic reproduction, minimize the case, trace the bad value backward, and test a falsifiable hypothesis with one variable at a time. Keep a regression test for the root cause. |
| Requested review, delegated candidate, or risk-relevant fixed diff | `code-review`: inspect the fixed work product against repository Standards and the bound Spec; verify findings technically before applying them. |

Route and safety first; resolve domain language before design when needed; diagnose before a non-obvious fix; use behavior RED/GREEN during implementation and review the completed fixed diff. Repeated failure calls for evidence gathering and reconsidering assumptions, not more speculative patches or an automatic user question after a fixed count. Escalate only an actual missing decision, access, or authorization.

For a handoff, give the executor an objective, exact affected surfaces when known, baseline, behavior, non-goals, dependencies/order, RED or regression proof where relevant, implementation constraints, verification command, risk-relevant backstop, evidence sink, stop conditions, and return contract. Steps have concrete outcomes, not placeholders. Freeze only declared paths and authority binding. Wide mechanical changes may expand, migrate in green batches, then contract.

Use existing isolation and verify ownership before creating another workspace. Preserve unrelated changes; avoid concurrent writes to shared mutable paths. Cleanup needs provenance and applicable authorization, especially for Host-owned workspaces.
