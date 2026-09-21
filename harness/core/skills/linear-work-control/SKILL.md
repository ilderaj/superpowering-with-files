---
name: linear-work-control
description: Use when a goal or tracked task is bound to a Linear workspace and a session must publish checkpoints, blockers, decisions, and validated completion to Linear while local files stay the durable source of truth
---

# Linear Work Control

## Overview
Linear Work Control connects one local SWF goal or tracked planning task to one Linear issue so a human can learn what is running, what finished, what is blocked, and what needs a decision by opening Linear instead of asking a chat. Linear is the human-facing control plane. Local files remain the durable execution state. This skill never mutates Linear by itself: normal writes go through the authenticated Linear MCP after the wrong-workspace guard passes. Only authorized [Team bootstrap](reference.md#5a-team-bootstrap-ui-fallback) may use the narrow UI fallback when MCP lacks Team creation.

The deterministic half lives in [scripts/linear-work-control.mjs](scripts/linear-work-control.mjs) with logic in [lib/linear-work-control.mjs](lib/linear-work-control.mjs). The full protocol is in [reference.md](reference.md), the publishable surface shapes are in [templates.md](templates.md), and the scheduled workflows are in [automation-workflows.md](automation-workflows.md).

The LMP-02 v2 product/task resolver lives in [lib/linear-product-binding.mjs](lib/linear-product-binding.mjs) and is exposed through the same CLI. It validates separate product and task schemas, checks the independent Git root registration, and keeps v1 explicit sync readable without upgrading it.

## Outcome Contract

- **Outcome:** a bound task publishes concise, human-readable checkpoints, blockers, decisions, and validated completions to its Linear issue, and a human can answer "what is the agent doing, what finished, what is next, what is blocked, what do I need to decide" within about a minute.
- **Done when:** local durable state exists first, the workspace guard passed for the write, the published checkpoint reflects the mapping in [reference.md](reference.md), and Linear `Done` was only set after validation passed with no unresolved blocker.
- **Evidence:** the local files written in the same checkpoint, the guard decision from `guard`, and the Linear comment or issue state that resulted from the MCP call.
- **Output:** one updated issue status, labels, and a single updated status comment per meaningful checkpoint.

## When to Use
- A tracked task or goal has a Linear binding and work is starting, resuming, checkpointing, blocking, or completing.
- A human left a Linear comment that may contain `DECISION:`, `PAUSE`, `RESUME`, `CANCEL`, `REPLAN:`, or `PRIORITY:` that must be consumed into local files.
- An overnight or scheduled run must publish an attention summary for the next morning.
- Do not use this skill to build a dashboard, mirror logs into Linear, or store credentials.

## Project-first adoption

Follow [project-first intake and execution](project-first.md) for adopted repositories and new projects explicitly requesting Linear day/night management. Team is shared organization; Project is exact product/delivery scope. In adopted repositories new tracked work enrolls automatically; missing enrollment is explicit setup-needed, never silently omitted. Run the additional project-routing target guard before every claim/write, preserving legacy maps and unrelated labels.

## Binding

Resolve the binding before anything else. Prefer, in order:

1. `reports/linear/<task-id>/linear.json` — external metadata beside the task, so a tracked task directory keeps exactly `task_plan.md`, `findings.md`, and `progress.md`.
2. `planning/active/<task-id>/linear.json` — the earlier in-directory location, still read as a legacy fallback and only when the external file is absent.
3. The path named by the operator or the goal prompt; `resume-brief --binding <file>` overrides the resolution entirely.
4. `.goal/LINEAR.json` for non-SWF repositories.

A path that exists but cannot be read or parsed fails closed with `**Binding:** invalid`; it is never treated as "no binding". Outside adopted/requested Linear management, a missing binding remains local-only. In an adopted repository or requested enrollment, follow project-first.md automatic intake; a failed setup stays visible as setup-needed and cannot enter unattended execution.

```bash
node harness/core/skills/linear-work-control/scripts/linear-work-control.mjs validate-binding reports/linear/<task-id>/linear.json
node harness/core/skills/linear-work-control/scripts/linear-work-control.mjs resume-brief --dir planning/active/<task-id> --observed-workspace <slug>
```

The binding schema, including the fields that must never appear, is in [reference.md](reference.md).

## Workflow

1. **Guard the workspace.** Read the authenticated workspace with the Linear MCP, then decide:
   ```bash
   node harness/core/skills/linear-work-control/scripts/linear-work-control.mjs guard --binding <binding> --observed-workspace <slug>
   ```
   `DENY` for any reason means finish every local-only task, record the mismatch, and report the exact human action needed. Never write to the wrong workspace.
2. **Read local state first.** Goal, plan, progress, blockers, validation, and the binding, then the bound issue plus comments. A resumed session must not need the original chat.
3. **Reconcile human intent.** Turn an unambiguous comment into a durable local decision; a `DECISION:` line is durable local state, not a chat message. A material scope change triggers the repository's replan path rather than a silent rewrite.
   ```bash
   node harness/core/skills/linear-work-control/scripts/linear-work-control.mjs parse-human-input --file <comment file>
   ```
   The parser reports unrecognized lines instead of inferring intent. An exact prefix is not required: when natural-language intent is unambiguous, act on it and record the quoted line plus your interpretation in the local files. Vague commentary is never a decision.
4. **Work locally, publish at checkpoints only.** Follow the local-first order in [reference.md](reference.md). Do not publish every tool call.
5. **Render, then publish.** Render the human snapshot with the helper and send it through the Linear MCP as a comment update on the stored status comment id, with the status and labels from the state mapping.
6. **Block clearly.** For resolved dependencies, unknown investigation results, or missing Teams, apply [recovery readiness](reference.md#4a-recovery-readiness) before assigning a human blocker. Local blocker first, then a structured Linear blocker whose question a human can answer with `DECISION: <option>`.
7. **Complete only through the gate.** Run `completion-gate`; mark Linear `Done` only when it returns `DONE ALLOWED`.
8. **Survive failure.** A failed Linear publish never invalidates local state. Record the failure with `sync.lastResult` and retry at the next checkpoint.

## Guardrails
- Local files are the source of truth; Linear is a projection.
- No credentials, tokens, or secrets in the binding, the repository, or any comment.
- One issue per task, one status comment per issue, updated by id instead of posting a new comment per checkpoint.
- Labels carry agent semantics so no custom workflow status is required.
- Never mark `Done` from an implementation-only signal.
- Do not create the whole dashboard: publish attention, not agent telemetry.

## Common Mistakes
- Publishing to Linear before the local checkpoint files are written.
- Treating a Linear comment as authority without reconciling it into durable local state.
- Marking the issue `Done` because the code looks finished rather than because validation passed.
- Writing to the authenticated workspace without comparing it to the binding workspace.
- Creating a second comment per checkpoint instead of updating the stored status comment.
- Mirroring the entire worklog into Linear and burying the human signal.
- Blocking the whole queue on one missing human answer when independent tasks remain.

For close/archive/reopen, follow [lifecycle.md](lifecycle.md) and reconcile the staged event immediately; do not wait for night execution.
