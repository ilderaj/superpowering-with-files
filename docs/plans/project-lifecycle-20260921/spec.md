# Stable product, task identity and lifecycle

## Contract

Product identity is a stable productKey bound to a verified repository/Git family, not a Codex sidebar entry or local directory basename. Team owns shared workflow and organizational access. Project owns product/delivery stream. Label is a filter for workstream/executor/attention. Issue owns tracked task/slice lifecycle. Labels do not supply identity or authority.

New requested product enrollment defaults to a single `<product name> — Work` Project (`main`). Existing defaultProjectId wins for adopted products. Extra Projects require a specifically requested independent delivery stream. SWF's four streams are existing explicit configuration, not a template copied to other products. Multiple Trios under one root remain separate stable taskIds and share the configured Project. A Codex project removal changes no durable product/task identity.

Task ID is preserved in task_plan.md through close/archive/reopen; bindings remain reports/linear/<Task ID>/linear.json. Archive names are locators only. No timestamp stripping, guessed marker, replacement issue or automatic Project deletion. Legacy archived tasks lacking stable identity fail closed until explicit evidence-backed backfill.

Close/archive stages a pending event in the existing binding. The current agent immediately reconciles it using local completion evidence, complete child coverage, workspace/root/issue guards and post-write receipt. Failures are visible debt; night/morning retry it before admitting work. Reopen restores the same issue to Backlog, then rechecks readiness and authorization. Retired Projects require explicit repair. Latest lifecycle event supersedes obsolete pending events; stale receipts must not clear it. Unrelated prior synchronization failures remain owed.

## Implementation and acceptance / SUP-53

- Stable identity and safe path transitions in planning scripts and both binding resolvers.
- Pure Project bootstrap planner plus CLI; ownership uniqueness, existing default, explicit stream, exact destination and known active status.
- Pure lifecycle planner and receipt verification; local staging/ack helper using existing binding only.
- Source and installed skill protocols; existing day/night prompts receive recovery step without another scheduler.
- Meaningful RED/GREEN tests, independent review, installed-file readback, own issue live close/archive/reopen demonstration.

## Limits

Helpers consume caller-supplied authenticated evidence. They do not intercept arbitrary Host/MCP calls or provide distributed transactions. Local commands cannot authenticate Linear; an executing agent drains the pending event immediately. Offline completion is not reported as synchronized. Existing Git-family identity checks do not automatically enroll non-Git folders or independent clones; explicit root/product setup is required. No bulk retirement of a Project containing archived tasks or a remaining Roadmap.
