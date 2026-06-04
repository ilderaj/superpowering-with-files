# Harness Reconcile Roadmap Evolution — Long Implementation Plan

Date: 2026-05-17 UTC+8  
Planning task: `planning/active/harness-reconcile-roadmap-evolution/`  
Policy anchor: `docs/reconciliation.md`  
Roadmap anchor: `docs/roadmap.md`  
Backlog anchor: `docs/backlog.md`

## Executive Intent

Evolve Harness from durable planning plus deep reasoning into a more complete coding-project coordination system with a lightweight post-implementation reconciliation loop. The system should remain concise, traceable, coding-first, easy to adopt, easy to update from upstream, cross-IDE compatible, MCP-friendly, and usable for everyday office work through templates rather than core generalization.

The goal is not to write more documents for their own sake. The goal is to prevent source-of-truth drift after implementation by recording a small, verifiable alignment layer between intent, actual changes, verification evidence, and follow-up product/docs decisions.

## Non-Negotiable Principles

- **精炼**: Prefer small artifacts with clear fields over large generated specs.
- **克制**: Reconciliation is mandatory only for tracked/risky coding work and cloud work; trivial tasks can mark it not required.
- **可溯源**: Every important implementation should link intent, actual change, evidence, and follow-up.
- **深度 + 广度**: Keep superpowers for depth; use roadmap/backlog/templates/MCP to broaden adoption safely.
- **当面 teamwork**: Humans must be able to review issue, plan, PR, verification, and reconcile summary without reconstructing history.
- **Upstream-friendly**: Preserve update-then-sync separation and report patch drift before projection changes.
- **Deploy/adopt-friendly**: New repositories should understand minimal-global, full-local, and cloud-dev profiles quickly.
- **Cross-IDE**: Preserve Claude/Cursor/Copilot/Codex surfaces without forcing all behavior into one adapter.
- **MCP compatibility**: MCP is the low-risk compatibility facade, not a new platform-specific adapter.
- **Coding-first, office-capable**: Office workflows are lightweight templates layered on planning lifecycle, not a replacement for coding workflow.

## Current Baseline

Harness already has:

- durable task state in `planning/active/<task-id>/`;
- archive history under `planning/archive/`;
- companion deep-reasoning plans under `docs/superpowers/plans/`;
- workflow lanes in `docs/workflows.md`;
- cloud-dev guidance in `docs/cloud-dev-harness.md`;
- roadmap/backlog docs;
- MCP runtime facade implementation awaiting final review;
- cross-IDE projections and install docs.

Known gaps:

- no explicit post-implementation reconcile lane;
- active planning, roadmap, and backlog can drift in status;
- cloud-dev parity does not yet require implementation summary/reconcile evidence;
- MCP adoption is not yet framed as the default compatibility tier for new agents;
- adoption/upstream-update docs can be made more approachable;
- office work support is implicit, not templated.

## Execution Model

This plan is designed for review first, then execution by one or more agents. Each iteration should be executed as its own tracked task unless the owner explicitly wants a single monolithic implementation task.

Recommended agent split:

- Iteration 1: documentation/governance agent or senior developer agent.
- Iteration 2: developer agent with docs + lifecycle test ownership.
- Iteration 3: developer/operator agent for MCP contract and adoption docs.
- Iteration 4: product/developer pair for cloud contract and evidence-gated parity.
- Iteration 5: operator/developer pair for install/update/adoption verification.
- Iteration 6: product/designer/docs-oriented agent for lightweight templates.

Each iteration must end with a reconciliation artifact or a clearly justified `reconcile: not required` note.

---

## Iteration 1 — State Convergence And SOT Boundaries

### Goal

Make the current Harness state legible and internally consistent before adding more workflow surface.

### Inputs

- `docs/reconciliation.md`
- `docs/roadmap.md`
- `docs/backlog.md`
- `docs/architecture.md`
- `docs/maintenance.md`
- `planning/active/**/{task_plan.md,progress.md,findings.md}`

### Tasks

1. Audit `planning/active/` and classify each task:
   - truly active;
   - waiting review;
   - blocked;
   - complete but intentionally retained;
   - archive-ready.
2. Compare roadmap status against active planning evidence.
3. Compare backlog status against roadmap and planning evidence.
4. Update docs only where status is materially wrong or misleading.
5. Add SOT/drift references from `docs/workflows.md`, `docs/architecture.md`, and `docs/maintenance.md` to `docs/reconciliation.md` if missing.
6. Produce a short state convergence report.

### Checkpoints

- Checkpoint 1.1: active task inventory exists.
- Checkpoint 1.2: roadmap status conflicts are listed and either fixed or intentionally documented.
- Checkpoint 1.3: backlog items reference the new reconciliation policy where relevant.
- Checkpoint 1.4: no doc claims unsupported cloud-agent behavior.

### Verification

Run:

```bash
grep -R "docs/reconciliation.md\|REC-003\|SOT" -n docs planning/active/harness-reconcile-roadmap-evolution
npm test -- tests/core/*.test.mjs
```

If docs-only, `npm test -- tests/core/*.test.mjs` may be replaced by a documented reason plus targeted markdown/link checks, but a later implementation iteration must restore automated verification.

### Reconcile Node

Create or update `planning/active/<iteration-task>/reconciliation.md` with:

- status conflicts found;
- conflicts fixed;
- conflicts intentionally left open;
- next backlog updates needed.

### Exit Criteria

- Source-of-truth responsibilities are discoverable.
- Current roadmap/backlog/planning contradictions are reduced or explicitly tracked.
- Iteration 2 can implement reconcile behavior without re-arguing policy.

---

## Iteration 2 — Post-Implementation Reconcile Lane

### Goal

Make `reconcile` a first-class Harness workflow lane after implementation/verification and before finish/archive.

### Inputs

- `docs/reconciliation.md`
- `docs/workflows.md`
- `docs/maintenance.md`
- planning lifecycle scripts/tests if present
- existing archive and active-summary behavior

### Tasks

1. Update `docs/workflows.md` with the `reconcile` lane:
   - purpose;
   - entry conditions;
   - exit conditions;
   - required vs optional cases;
   - relationship to finish/archive.
2. Update `docs/maintenance.md` archive rules so reconciliation artifacts are preserved.
3. If lifecycle scripts support task summaries/archive checks, add or plan fields for:
   - `reconcile: complete`;
   - `reconcile: not required`;
   - `reconcile: open`.
4. Add a template for `reconciliation.md` if this repo has a template location; otherwise document the recommended shape in `docs/reconciliation.md` and maintenance docs.
5. Run one representative tracked coding-task dry run or fixture test showing the expected artifact flow.
6. Ensure cloud-dev docs mention that remote implementation should still produce local reconciliation evidence before promotion/archive.

### Checkpoints

- Checkpoint 2.1: workflow lane documented.
- Checkpoint 2.2: artifact persistence documented or tested.
- Checkpoint 2.3: tiny-task escape hatch documented.
- Checkpoint 2.4: cloud-dev path includes reconcile expectation.

### Verification

Run relevant checks depending on code changes:

```bash
npm run verify
```

If the iteration is docs-only:

```bash
grep -R "reconcile\|reconciliation.md\|not required" -n docs planning/active
npm test -- tests/core/*.test.mjs
```

### Reconcile Node

The iteration must generate a real reconciliation artifact for itself. It should prove the format is useful and not bloated.

### Exit Criteria

- A future coding task can follow `plan -> implement -> verify -> reconcile -> finish/archive`.
- Reconciliation is report-first and does not automatically mutate roadmap/backlog.
- Archive/preservation expectations are unambiguous.

---

## Iteration 3 — MCP Read-Only Compatibility Layer

### Goal

Use MCP read-only as the default compatibility tier for agents and environments that do not yet justify native adapter work.

### Inputs

- MCP runtime facade implementation and tests.
- `docs/architecture.md`
- `docs/install/platform-support.md`
- `docs/backlog.md` item `MCP-001`
- Alma/thin-adapter planning artifacts if selected as pilot context.

### Tasks

1. Define three compatibility tiers:
   - native adapter;
   - MCP read-only;
   - docs-only/manual.
2. Document which Harness surfaces MCP read-only should expose:
   - status;
   - active summary;
   - task summary/details;
   - verification summaries;
   - safe dry-run outputs.
3. Confirm MCP remains a runtime facade and does not own IDE projection.
4. Pick one pilot integration path, preferably Alma-style read-only adoption, without committing to a full adapter.
5. Add or adjust tests for MCP read-only behavior if code changes are needed.
6. Record write-capability boundaries and future promotion criteria.

### Checkpoints

- Checkpoint 3.1: compatibility tier doc exists.
- Checkpoint 3.2: MCP read-only surfaces are enumerated.
- Checkpoint 3.3: pilot can inspect state without modifying files.
- Checkpoint 3.4: no platform-specific projection leaks into MCP.

### Verification

Run:

```bash
npm run test:mcp
npm run verify
```

If docs-only:

```bash
grep -R "MCP read-only\|native adapter\|docs-only\|runtime facade" -n docs
npm run test:mcp
```

### Reconcile Node

Record:

- which MCP surfaces are proven;
- which are only documented;
- whether any write capability was deferred;
- whether a native adapter is still justified.

### Exit Criteria

- A new agent can understand Harness state through MCP read-only or know why it cannot.
- MCP remains compatible, conservative, and projection-neutral.

---

## Iteration 4 — Agent-Neutral Cloud-Dev Parity

### Goal

Advance cloud-dev parity through a shared task contract instead of platform-specific UI assumptions.

### Inputs

- `docs/cloud-dev-harness.md`
- `docs/workflows.md`
- `docs/reconciliation.md`
- `docs/backlog.md` items `CDX-001`, `CDX-006`, `CDX-011`
- GitHub issue/PR evidence from existing cloud-dev runs.

### Tasks

1. Build or update a cloud parity matrix with local-vs-cloud comparison across:
   - planning state;
   - branch base;
   - task handoff;
   - skills/hooks availability;
   - verification;
   - PR target;
   - promotion;
   - reconciliation;
   - recovery.
2. Define agent-neutral cloud task contract fields:
   - source issue/spec;
   - base branch;
   - target PR base;
   - acceptance criteria;
   - verification commands;
   - implementation summary path;
   - reconciliation status;
   - docs/backlog update-needed flag.
3. Keep evidence levels explicit:
   - verified direct Copilot assignment;
   - comment handoff prompt emission but not proven task/PR behavior unless evidence changes;
   - Agent tab research only;
   - Codex/Claude cloud research only.
4. Add cloud reconcile requirement before human promotion from `cloud-dev` where practical.
5. Avoid claiming support without real PR/task evidence.

### Checkpoints

- Checkpoint 4.1: parity matrix includes reconciliation.
- Checkpoint 4.2: shared contract is platform-neutral.
- Checkpoint 4.3: evidence labels prevent overclaiming.
- Checkpoint 4.4: promotion playbook includes review of verification and reconcile summary.

### Verification

Run docs and workflow checks plus any relevant automation tests:

```bash
grep -R "base_branch=cloud-dev\|reconciliation status\|agent-neutral" -n docs .github planning/active
npm run verify
```

If GitHub live validation is required, record the issue/PR IDs and exact observed behavior. Do not substitute assumptions for evidence.

### Reconcile Node

Record:

- which cloud paths are verified;
- which remain blocked/research;
- any roadmap/backlog status changes required;
- any evidence gaps that must remain open.

### Exit Criteria

- Cloud-dev parity is defined by contract and evidence, not vibes.
- Human reviewers can inspect issue, PR, verification, and reconciliation before promotion.
- Unsupported cloud agents remain clearly marked as research.

---

## Iteration 5 — Deployment, Adoption, And Upstream Update Kit

### Goal

Make Harness easier to adopt and safer to update from upstream.

### Inputs

- `docs/install/**`
- `docs/maintenance.md`
- `docs/release.md`
- `scripts/harness` commands and tests
- backlog items `ADOPT-001`, `UPD-001`

### Tasks

1. Produce or update quickstart guidance for:
   - `minimal-global`;
   - `full-local`;
   - `cloud-dev`.
2. Document rollback, doctor, sync dry-run, verify, and smoke-check flow.
3. Define upstream update compatibility output:
   - changed upstream files;
   - affected projections;
   - required re-sync;
   - risk level;
   - patch-drift warnings.
4. Preserve update-then-sync separation.
5. Add fixture/disposable-home verification where possible.
6. Include adoption path for teams, not just solo local usage.

### Checkpoints

- Checkpoint 5.1: new user can pick a profile without reading the whole repo.
- Checkpoint 5.2: rollback is clear.
- Checkpoint 5.3: upstream update cannot be mistaken for automatic projection overwrite.
- Checkpoint 5.4: adoption smoke test exists or is explicitly manual with commands.

### Verification

Run:

```bash
./scripts/harness sync --dry-run
./scripts/harness doctor --check-only
npm run verify
```

If disposable-home tests exist or are added, run them and record the path used.

### Reconcile Node

Record:

- profile guidance delivered;
- tested commands and results;
- any adoption path still too manual;
- upstream update risks still unresolved.

### Exit Criteria

- A new project can adopt Harness with predictable safety and rollback guidance.
- Upstream updates are reviewable before local projection changes.

---

## Iteration 6 — Everyday Office Work Lightweight Templates

### Goal

Support everyday work while keeping Harness coding-first.

### Inputs

- planning lifecycle docs;
- `docs/reconciliation.md`;
- backlog item `OFFICE-001`;
- existing task plan/progress/findings conventions.

### Tasks

1. Add lightweight templates for:
   - research;
   - decision record;
   - document review;
   - meeting/follow-up;
   - approval tracking if useful.
2. Make clear these templates do not require worktrees, code diffs, or code tests.
3. Preserve evidence and finish/archive semantics at lower ceremony.
4. Include optional reconciliation for decisions that alter docs/process/roadmap.
5. Run one example non-coding task through the template or fixture.

### Checkpoints

- Checkpoint 6.1: templates are visibly lighter than coding tasks.
- Checkpoint 6.2: coding workflow remains unchanged.
- Checkpoint 6.3: non-coding evidence is still traceable.
- Checkpoint 6.4: office tasks can archive cleanly.

### Verification

Run:

```bash
grep -R "research\|decision\|document review\|follow-up" -n docs planning
```

If templates are executable or generated by scripts, add targeted tests and run `npm run verify`.

### Reconcile Node

Record:

- office templates added;
- any coding workflow impact;
- whether office support should remain template-only;
- adoption guidance needed.

### Exit Criteria

- Harness can manage non-coding work without becoming a generic task manager.
- Coding projects remain the primary design center.

---

## Global Verification Strategy

Before owner review of the full program, run documentation consistency checks:

```bash
grep -R "REC-001\|REC-002\|REC-003\|MCP-001\|ADOPT-001\|UPD-001\|OFFICE-001" -n docs planning/active/harness-reconcile-roadmap-evolution
grep -R "docs/reconciliation.md\|reconcile\|reconciliation.md" -n docs planning/active/harness-reconcile-roadmap-evolution
npm test -- tests/core/*.test.mjs
```

Before merging code-affecting implementation iterations, run:

```bash
npm run verify
./scripts/harness verify --output=.harness/verification
```

When GitHub/cloud behavior is part of the claim, record exact issue/PR/task IDs. Platform assumptions are not acceptable evidence.

## Global Reconciliation Strategy

Each iteration must leave behind:

- a short progress update;
- verification commands and outputs;
- reconciliation artifact or `reconcile: not required` with reason;
- backlog/roadmap update recommendations if implementation facts changed.

The final program is complete only when:

- roadmap direction matches actual delivered state;
- backlog statuses match evidence;
- active tasks are either active for a reason or archived;
- specs/docs that are affected by implementation are updated or explicitly listed as follow-up;
- MCP/cloud/adoption/office claims are evidence-gated.

## Handoff Packet For Future Agents

When delegating an iteration, include:

- this plan path;
- relevant backlog IDs;
- exact files in scope;
- non-goals;
- required verification commands;
- expected reconciliation artifact path;
- instruction not to overclaim unsupported cloud or MCP behavior.

Suggested prompt fragment:

> Execute Iteration N from `docs/superpowers/plans/2026-05-17-harness-reconcile-roadmap-evolution-implementation-plan.md`. Keep scope limited to the iteration. Update progress and create a reconciliation artifact. Run the listed verification commands or explain any blocked command with evidence. Do not claim cloud/agent support without observed issue/PR/task evidence.

## Review Questions For Owner

1. Should `reconcile` be required for all tracked coding tasks, or only tracked coding tasks that touch user-facing behavior, workflow, adapter, MCP, safety, or cloud-dev surfaces?
2. Should reconciliation artifacts be standalone `reconciliation.md` files, or is a `progress.md` section enough for small tasks?
3. Should active task cleanup happen before code implementation, or together with Iteration 1?
4. Which pilot should prove MCP read-only adoption first: Alma, another local agent, or a generic MCP client?
5. Should office templates ship as docs-only first, or should there be generation commands later?
