# Linear Work Control — protocol reference

This file is the detailed half of the `linear-work-control` skill. The skill entry holds the short workflow; this reference holds the schemas, the mapping, the publish protocol, and the capability boundary a session must respect.

## 1. Separation of concerns

```text
Linear                     human-facing control plane (projection only)
local files                durable execution state (source of truth)
local Codex session        worker
SWF harness / trio         execution governance
Linear MCP                 normal write path; Team bootstrap exception in section 5a
Codex automations          scheduled execution, where the Host supports it
```

A Linear sync failure must never corrupt, rewrite, or roll back valid local state. Nothing in this protocol makes Linear the canonical runtime store, and nothing here adds a scheduler, daemon, database, or web service.

## 2. Binding

Location, in resolution order:

1. `reports/linear/<task-id>/linear.json` — external metadata beside the task, so the task directory holds exactly the three planning files.
2. `planning/active/<task-id>/linear.json` — the earlier in-directory location, read only when the external file is absent.
3. The path given by the operator or goal prompt, including `resume-brief --binding <file>`, which overrides both.
4. `.goal/LINEAR.json` — non-SWF repositories.

Existence is decided by `lstat`, not by a failed read: a directory or a dangling symlink at the preferred path is present-but-unreadable and fails closed instead of falling back. External metadata is optional and never authoritative: it carries the binding, while blockers stay in `progress.md` and evidence stays in the Trio files.

Minimal enabled binding:

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "workspace": { "name": "superpoweringwithfiles", "url": "https://linear.app/superpoweringwithfiles" },
  "team": { "id": "<team-uuid>", "name": "<team name>" },
  "project": { "id": "<project-uuid>", "name": "SWF — Agent Workbench MVP" },
  "goalIssue": { "id": "<issue-uuid>", "identifier": "SWF-1", "url": "https://linear.app/..." },
  "statusComment": { "id": "<comment-uuid>" },
  "executor": "executor:codex-local",
  "taskMap": {
    "<task-id>": { "issueId": "<uuid>", "identifier": "SWF-12", "state": "running" }
  },
  "sync": { "lastCheckpointAt": "2026-09-17 21:10:00 UTC+8", "lastResult": "ok", "lastError": null, "pendingRetry": false }
}
```

Field rules enforced by `validate-binding`:

- `schemaVersion` must be `1`, `enabled` must be a boolean, `workspace.name` must be the bare workspace slug (no scheme, no trailing slash, lowercase).
- Only the keys `schemaVersion`, `enabled`, `workspace`, `team`, `project`, `goalIssue`, `statusComment`, `executor`, `taskMap`, `sync` are accepted; an unknown key is an error so drift cannot hide.
- `taskMap` entries need an `issueId` or `identifier`, and any `state` must be one of the nine canonical states.
- The binding is valid before bootstrap: leave `team`, `project`, `goalIssue`, and `statusComment` absent until the corresponding object exists.
- **Forbidden:** any key whose name carries a credential marker (`token`, `secret`, `password`, `credential`, `apiKey`, `auth`, `bearer`, `jwt`, `cookie`, `session`, `oauth`, `passphrase`, `privateKey`) at any depth. The match runs against the normalized key name, so `apiToken`, `LINEAR_API_KEY`, and `bearerToken` all fail the way `apiKey` does. Host MCP authentication owns credentials: the binding, the repository, and every published comment stay credential-free.

A goal without a binding keeps working exactly as before. Do not create a binding for a task that does not need Linear.

## 3. Wrong-workspace guard

The guard is a required feature, not a one-time check. Before any Linear write:

```bash
node harness/core/skills/linear-work-control/scripts/linear-work-control.mjs guard --binding <binding> --observed-workspace <slug-read-from-the-mcp>
```

| Code | Meaning | Action |
| --- | --- | --- |
| `ok` | authenticated workspace equals the binding workspace | proceed with the write |
| `workspace-mismatch` | authenticated workspace is a different workspace | no Linear write at all |
| `workspace-unknown` | the MCP could not report a workspace | no write until it can |
| `binding-disabled` | `enabled` is not true | treat the task as local-only |
| `binding-invalid` | the binding failed validation: missing or non-slug `workspace.name`, schema drift, an unknown key, a credential-shaped key, or a non-canonical task state | fix the binding before any Linear write |

The guard refuses to allow a write on a binding that has not passed `validate-binding`: a valid binding is a precondition for every Linear mutation, not a suggestion. The comparison itself is exact — a URL form and trailing slashes are tolerated, but case differences and a `www.` prefix are not folded away, so a lookalike workspace can never pass as the bound one.

The guard always answers on stdout, even when it cannot read the binding: `ALLOW <code>: ...` or `DENY <code>: ...` with exit 0/1, including for a missing file, a directory, or a file that is not JSON (the reason says which). With `--json` the same decision is printed as an object. A wrapper can decide on the first word alone and never has to inspect a stack trace.

On a denial: finish every independent local task, write the mismatch and the exact human action into the local task files, and only then report. The minimum human action is to re-authenticate the Linear connection against the intended workspace, or to correct `workspace.name` after an intentional workspace change.

## 4. State mapping

Runtime state is the local truth (`progress.md` / `task_plan.md` status plus the task map). Linear receives stock workflow status plus semantic labels.

| Runtime state | Linear status | Semantic label | Human action |
| --- | --- | --- | --- |
| `planned` | Backlog | — | no |
| `ready` | Todo | `agent-ready` | no |
| `running` | In Progress | `agent-running` | no |
| `waiting_human` | In Progress | `waiting-human` | yes |
| `blocked` | In Progress | `blocked` | yes |
| `review` | In Progress | `ready-review` | attention, not blocking |
| `failed` | In Progress | `agent-failed` | attention, not blocking |
| `done` | Done | — | no |
| `canceled` | Canceled | — | no |

Every managed issue also carries `swf-managed` and `executor:codex-local` so managed work is distinguishable from unrelated Linear work and no fake Linear users are created for agents. The human assignee stays the human owner.

The `humanActionRequired` flag from `map-state` is the blocking signal: it is true only for `waiting_human` and `blocked`, the two states that stop the agent queue. `review` and `failed` still belong in the human's attention set, under their own views, and the morning handoff reads both.

Verify status names with `linear_list_issue_statuses` for the target team before the first write; if a team renamed a stock status, map to the closest equivalent and record the substitution in the local task files (`task_plan.md` / `findings.md`) rather than creating a new workflow status or inventing a binding field. A read-only probe of the connected workspace on 2026-09-17 returned `Backlog / Todo / In Progress / In Review / Done / Canceled / Duplicate`, which confirms the stock names above; the table stays an assumption until a session re-reads it for the team it is about to write into.

```bash
node harness/core/skills/linear-work-control/scripts/linear-work-control.mjs map-state waiting_human --json
node harness/core/skills/linear-work-control/scripts/linear-work-control.mjs labels
```

## 4a. Recovery readiness

Preserve already-authorized scope. A bounded local successor may become `ready` after verified prerequisites, written acceptance, and non-overlapping edit surfaces establish readiness; it may also receive `nightly` when existing authorization covers unattended execution. Record the evidence without repeat permission. Pending human gates or changed scope still require the corresponding decision.

Team absence means not yet created, not capacity exceeded; establish capacity from visible plan/limit evidence. An investigation may complete with explicit unknowns, sources, and follow-ups when its acceptance permits that result and required validation passes. Keep fixture and local implementation acceptance separate from actual onboarding: missing live Team IDs or capacity evidence blocks the dependent onboarding step, not independent authorized local work. Actual rollout, new costs or plan upgrades, and login or permission ambiguity retain their applicable human gates; local tests prove none of those outcomes.

## 5. Bootstrap

Run once per workspace/team, in this order, and only after the guard returns `ok`. Record every returned id in the binding.

1. `linear_list_issue_statuses` for the team — confirm the status names above exist.
2. `linear_save_issue_label` for each of: `swf-managed`, `executor:codex-local`, `agent-ready`, `agent-running`, `waiting-human`, `blocked`, `ready-review`, `agent-failed`, `nightly`. Skip labels that already exist.
3. `linear_list_projects` — reuse a suitable SWF project if one exists, otherwise `linear_save_project` with `name` and `addTeams`: `SWF — Agent Workbench MVP`.
4. `linear_save_issue` for the parent goal issue `MVP: Linear × Local Codex Human-Agent Control Plane` (labels `swf-managed`), then one sub-issue per implementation phase using `parentId`.
5. Create the status comment on the goal issue with `linear_save_comment` and store its id as `statusComment.id`; every later checkpoint updates that comment by id.
6. Write the binding file, then re-run `validate-binding`.

Custom view creation is not exposed by the MCP surface, so the eight attention views are a human setup step (section 9).

## 5a. Team bootstrap UI fallback

Use this exception only for Team bootstrap when the authenticated MCP lacks Team creation and existing authorization covers the same Team creation scope. If creation is available through MCP, use MCP. This exception grants no broader UI write authority.

1. Pass the workspace guard with authenticated MCP evidence; in the logged-in UI verify the same workspace, approved Team name and key, no duplicate name/key, creation permissions, and visible plan/capacity sufficient for the approved Teams. Reuse a matching existing Team only after verifying its identity. Missing evidence, login or permission ambiguity, or a required upgrade stops creation for a human decision; continue independent local work.
2. Create only within the approved scope through the normal UI. Never extract cookies or tokens, build an alternate API path, change plans, or broaden scope to bypass a gate. Preserve already-authorized scope without asking again for the same action.
3. Obtain MCP readback of the created Team's identity and IDs before adding them to the binding; verify workspace, name, and key match. If readback fails, record the unconfirmed result and reconcile before retrying creation to avoid duplicates. Resume normal writes through MCP, including projects, issues, labels, and comments; validate the binding after recording verified IDs.

## 6. Checkpoint sync protocol

Local first, Linear second. Every meaningful checkpoint runs the same six steps:

1. update the local worklog / `progress.md`;
2. update local state / `task_plan.md`;
3. run or refresh validation when the change is verifiable;
4. persist blockers in local durable files;
5. render the concise human snapshot;
6. publish or update the Linear checkpoint.

```bash
node harness/core/skills/linear-work-control/scripts/linear-work-control.mjs render --kind checkpoint --input checkpoint.json
```

A checkpoint answers, in this order: current state, how much is complete, what just completed, what is happening now, what is next, whether the human must act, and the latest validation result. Publish it by updating the stored status comment (`linear_save_comment` with `id`), together with the status and labels from section 4. Never mirror the worklog. Never publish per tool call.

## 7. Blocker and human attention protocol

Order is fixed: local blocker file first, then the Linear projection.

Write every blocker into the task's local ledger with one machine-readable state marker per entry, as an HTML comment on its own line. The authoritative ledger is `progress.md`; a legacy `blockers.md` stays counted while the file is present, so neither location can hide an open blocker:

```html
<!-- swf:blocker-state id=B2 state=waiting_human -->
```

`resume-brief` counts an entry as open unless its state is `resolved`, `canceled`, or `done`. The marker may be plain, indented, or decorated as a list item, ordered-list item, task checkbox, blockquote, emphasis, or inline code. A lookalike spelling of the token is still detected and fails closed as unreadable: different case or width, invisible and format characters (zero-width space/joiner, soft hyphen), hyphen variants, a homoglyph letter of the token, a stray space anywhere inside the token, or a line break that splits it. A marker-looking spelling within two edits of the token is treated as a marker candidate as well. **Any line that mentions the token, or a near-miss of it, without parsing as a well-formed marker, also counts as open**, so a published blocker can never look answered by accident. Detection is deliberately best-effort beyond that envelope, and the two mechanisms do not compose: several arbitrary substitutions can still be dropped, and an un-mapped homoglyph combined with a stray space inside the token defeats both the prefix scan and the edit-distance window. The candidate scan also matches the `swf:block` prefix anywhere on a whitespace-stripped line, so it over-matches by design: prose containing `swf:blockchain` reads as a malformed marker and counts as open. That is why the ledger keeps one well-formed marker per blocker, and why ledger prose must not contain the `swf:block` prefix — describe the convention instead. Publishing to Linear does not close an entry: verified prerequisite evidence may resolve a dependency blocker within existing authorization; a human decision blocker still requires the recorded human decision. Update the local marker and evidence before projecting the resolution.

```bash
node harness/core/skills/linear-work-control/scripts/linear-work-control.mjs render --kind blocker --input blocker.json
```

A published blocker contains context, the exact question, options when they exist, the impact of staying unanswered, and the resume condition. Set the task to `waiting_human` (a decision the agent cannot make) or `blocked` (an external condition), and give it the matching label so the `Needs Human` view can find it.

The renderer appends a marker comment of the form `<!-- swf:blocker task=<id> at=<timestamp> -->`. Keep it: it makes a checkpoint identifiable and makes retries idempotent.

## 8. Resume protocol

On resuming a bound task:

1. read local `GOAL`/plan, state, blockers, validation, and the binding;
2. fetch the bound issue and its recent comments with `linear_get_issue` and `linear_list_comments`;
3. reconcile explicit human intent — `DECISION:`, `PAUSE`, `RESUME`, `CANCEL`, `REPLAN:`, `PRIORITY:` — into durable local files before acting;
4. only then resume execution.

Reconciliation is mechanical, not interpretive:

```bash
node harness/core/skills/linear-work-control/scripts/linear-work-control.mjs parse-human-input --file comment.md --json
```

The parser returns recognized decisions, replans, priorities, and control verbs, plus every unrecognized line. `summarizeHumanInput` reports whether the resume condition is met; `PAUSE` and `CANCEL` keep it closed. Unrecognized prose is never upgraded into a decision mechanically.

Exact syntax is not required. When a human's natural-language intent is unambiguous, the session may act on it, but it must quote the source line and record its interpretation in the local files before acting. The parser is the deterministic floor, not the only accepted phrasing; vague or partial commentary stays unrecognized and keeps the resume condition closed until the human answers.

Two things are never an answer, however plausible they look: a command inside a fenced code block (that is a quote or an example), and a value that is still the published placeholder, such as `DECISION: <option or free-form answer>`. `PRIORITY:` counts only when the value is one of the four allowed levels; anything else is reported as unrecognized rather than as a recognized command.

A casual comment never silently rewrites an immutable goal. Material scope changes go through the repository's replan path (update `task_plan.md` phases, record the decision in `findings.md`, and re-publish the plan). The workflow must survive closing and reopening the session: no step may depend on the original chat.

## 9. Attention views

Target views and their intent:

| View | Intent | Filter concept |
| --- | --- | --- |
| Needs Human | what the human must act on today | label `waiting-human` or `blocked` |
| Agent Queue | what is ready for the agent | label `agent-ready` |
| Running | what is in flight now | label `agent-running` |
| Ready for Review | what finished and waits for a human review | label `ready-review` |
| Failed | what the agent could not finish | label `agent-failed` |
| Tonight | what the night executor may pick up | `agent-ready` + `nightly` |
| Scheduled | what is automated | label `nightly` |
| Recently Completed | what finished lately | status Done, ordered by updated |

The MCP surface exposes no view-creation tool, so a human creates these eight views in Linear once: `Views` → new view → scope to the SWF project/team → add the label and status filters above → save and pin. Exact picker wording can differ between Linear versions; the filter concepts are what matter. `Needs Human` is the one that must work: opening it should list every required intervention with no reading required.

## 10. Completion semantics

Linear `Done` means validated completion, never merely "implementation looks finished".

```bash
node harness/core/skills/linear-work-control/scripts/linear-work-control.mjs completion-gate --input completion.json
```

The gate requires all three: the goal's `done when` conditions are satisfied, required validation ran and passed, and no blocking condition is unresolved. Anything else keeps the issue open in `review` with `ready-review`. The final update records what changed, the validation result, important artifacts, and remaining follow-ups.

## 11. Capability boundary observed through the connected MCP

Verified read-only against the connected Linear MCP surface on 2026-09-17 (74 `linear_*` tools exposed in that session):

| Capability | Status | Note |
| --- | --- | --- |
| workspace / team read | available | `linear_get_workspace`, `linear_list_teams` |
| project read / create / update | available | `linear_list_projects`, `linear_save_project` |
| issue read / create / update | available | `linear_get_issue`, `linear_list_issues`, `linear_save_issue` |
| sub-issues | available | `parentId` on `linear_save_issue` |
| comments read / create / update | available | `linear_list_comments`, `linear_save_comment` |
| labels read / create | available | `linear_list_issue_labels`, `linear_save_issue_label` |
| workflow statuses read | available | `linear_list_issue_statuses` |
| status changes | available | `state` on `linear_save_issue` |
| custom view create | unavailable | human setup step, section 9 |
| real Linear users for agents | not used | the human stays the assignee |

Do not build API or token infrastructure to work around the view gap.

## 12. Failure handling

- A Linear publish failure after local state is secured: keep local state, record `sync.lastResult = "failed"` with `sync.lastError`, mark `pendingRetry`, and retry at the next checkpoint.
- A publish failure before local state is secured: write local state first; the publish is never the first step.
- Work is never marked complete because a sync failed.
- An overnight run continues with independent tasks after one task fails or blocks.

## 13. Operational prerequisites

This is a local MVP. Overnight execution requires the machine to be awake and powered, the Codex app available, the repository readable, network access, and an authenticated Linear connection. A missed window is an observation, not a delivery claim: the morning handoff reports what actually ran.

## 14. Verification recipes

| Scenario | Recipe |
| --- | --- |
| A - autonomous success | `agent-ready` task, session reads it locally, checkpoints appear, validation passes, `completion-gate` returns `DONE ALLOWED`, Linear ends `Done` |
| B - human blocker | decision required, local blocker written, Linear shows `waiting-human`, `DECISION:` comment is supplied, a fresh session consumes it into local files, work resumes, completion validates |
| C - scheduled run | task carries `agent-ready` + `nightly`, the night executor selects it, checkpoints sync, one blocker does not stop an unrelated task, the morning summary exists |
| D - recovery | close and reopen the session; local files plus the binding must reconstruct goal, state, task mapping, blocker, last checkpoint, and next action |
| E - Linear failure | force a publish failure; local state stays valid, the failure is visible and retryable, and nothing is marked complete |

The guard, the mapping, and every renderer are covered by `tests/core/linear-work-control-eval.test.mjs`, which also spawns the CLI to pin the exit codes of `guard`, `completion-gate`, `parse-human-input`, and `resume-brief`. The Linear legs of scenarios A, B, and C still need a bound workspace; nothing in that file proves a Linear round-trip.
