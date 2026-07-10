# Harness Mainline Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the three-release roadmap (`1.0.11` through `1.0.13`) and the current backlog into one executable companion plan that a low-intelligence model can follow without redesigning the work mid-flight.

**Architecture:** Deliver the program in three waves. First close the local execution kernel and the `sync` hotspot. Then productize governance, acceptance, reconciliation, and release proof. Only after those two waves are green do we reopen exactly one outward-facing expansion lane. Every task in this plan names exact files, exact proof surfaces, and exact stop conditions so the executor can operate mechanically instead of inferentially.

**Tech Stack:** Node.js 22 ESM, Python lifecycle scripts, existing Harness installer/runtime services, Node test runner, existing repo replay/eval packs, existing docs and planning surfaces.

## Global Constraints

- `planning/active/roadmap-backlog-implementation-plan-20260628/` remains the only authoritative durable task memory for this program plan and its execution.
- This companion artifact must stay synchronized back to `planning/active/roadmap-backlog-implementation-plan-20260628/`.
- Do not widen cloud-dev, MCP, adoption, or office-template behavior before `1.0.11` and `1.0.12` are proven complete.
- Prefer smallest diff and existing patterns; do not add dependencies unless a blocking need is recorded in planning.
- Use TDD for code changes: failing test first, confirm red, minimal implementation, confirm green.
- Every implementation task must name focused tests first and only then decide whether `npm run verify:all` is needed.
- Treat `sync --dry-run`, `doctor --check-only`, `active-summary`, and replay/eval reports as proof surfaces, not optional afterthoughts.
- If a task materially revises this companion plan, require one read-only reviewer subagent before executing further.
- Cap plan-polishing or plan-review loops at 3 rounds. On round 3 failure, record blockers in planning and stop.
- Low-intelligence executor rule: if a step would require repo-wide inference, split that step until it becomes a file-scoped change with an exact command and an exact expected result.

---

## Companion Metadata

- Active task path: `planning/active/roadmap-backlog-implementation-plan-20260628/`
- Lifecycle state: `waiting_review`
- Sync-back status: waiting human review of 1.0.13 release scope and stale branch/worktree closure
- **Human review gate:** required before execution
- **Read-only reviewer subagent gate:** required before execution and after each material plan revision
- **Review status:** passed after 3 reviewer rounds
- **Reviewer verdict sink:** `planning/active/roadmap-backlog-implementation-plan-20260628/progress.md`
- **Roadmap source:** `docs/roadmap.md`
- **Backlog source:** `docs/backlog.md`
- **Program type:** deep-reasoning companion implementation plan

## Program Scope

### In Scope

- `KER-001`, `KER-002`, `GOV-001`, `GOV-002`, `REC-001`, `REC-002`, `REC-003`, `UPD-001`
- release-wave sequencing across `1.0.11`, `1.0.12`, and `1.0.13`
- `1.0.13` conditional-candidate handling for `MCP-001`, `ADOPT-001`, and the `CDX-*` cloud-dev lane family
- explicit disposition for `OFFICE-001`
- verification, acceptance, review, reconciliation, and release evidence surfaces
- a native `/goal` prompt that can drive execution from this plan

### Out Of Scope

- direct implementation in this planning task
- reopening more than one outward-facing expansion lane in `1.0.13`
- mixing `MCP`, `adoption`, and `cloud-dev` into one umbrella release
- treating roadmap/backlog edits as auto-approved during reconcile or breadth-gate review

## Backlog-To-Release Mapping

| Item | Release | Execution Type | Why It Lands Here |
| --- | --- | --- | --- |
| `KER-001` | `1.0.11` | mandatory | `sync` is the current structural hotspot and must be split before breadth grows |
| `KER-002` | `1.0.11` | mandatory | execution kernel needs more real-task proof before governance and expansion |
| `GOV-001` | `1.0.11` | mandatory | lightweight-default drift is a kernel/operator defect, not a later polish item |
| `GOV-002` | `1.0.12` | mandatory | acceptance/release proof becomes a product surface after kernel closure |
| `REC-001` | `1.0.12` | mandatory | reconcile lane is the verify-to-finish gate for tracked work |
| `REC-002` | `1.0.12` | mandatory | reconciliation artifact persistence must exist before lifecycle closure claims |
| `REC-003` | `1.0.12` | mandatory | source-of-truth policy is needed before breadth reopens |
| `UPD-001` | `1.0.13` support track | conditional-mandatory | update compatibility is not the first kernel blocker, but should be finished before or alongside breadth reopening |
| `MCP-001` | `1.0.13` conditional candidate | choose-one candidate | eligible outward-facing lane |
| `ADOPT-001` | `1.0.13` conditional candidate | choose-one candidate | eligible outward-facing lane |
| `CDX-001` to `CDX-011` | `1.0.13` conditional candidate family | choose-one candidate family | cloud-dev polish is valid only after local kernel/governance stabilize |
| `OFFICE-001` | post-`1.0.13` unless explicitly promoted | parked | valuable, but not worth displacing the single-lane breadth gate |

## Definition Of Done For Low-Intelligence Execution

Use this checklist before letting a cheap or mini model execute any task from this plan:

1. The task touches a bounded write set and all paths are listed.
2. The task names the exact function names or command surfaces it must create or edit.
3. The task has at least one failing-test step and one passing-proof step.
4. The task states what evidence lands where.
5. The task states one stop/escalate rule that forbids silent redesign.
6. The task does not require the worker to choose architecture from scratch.

If any of the six checks fail, the controller must split the task again before execution.

## Proof Stack

### Proof Target

Produce the next three Harness releases with a kernel-first sequence, explicit governance closure, and exactly one safely reopened breadth lane, while keeping every claim tied to a reviewable code/doc/test surface.

### Primary Proof

- `1.0.11`: focused unit/invariant proof on `sync`, execution contracts, receipts, route truth, and lightweight-default health signals
- `1.0.12`: BDD/acceptance proof and lifecycle/governance proof through replay packs, reconcile readiness, release closure surfaces, and active-summary evidence
- `1.0.13`: review proof plus operational proof for the selected breadth lane

### Backstop Proof

- `npm run verify:all`
- `./scripts/harness verify --output=.harness/verification`
- `./scripts/harness sync --dry-run`
- `./scripts/harness doctor --check-only`
- `./scripts/harness active-summary --json`

### Escalation Trigger

- a task requires changing more files than listed here
- a test failure indicates the proposed boundary split is wrong
- the chosen `1.0.13` lane would force reopening multiple unsettled semantics at once
- reviewers say a task still depends on broad judgment rather than mechanical execution

### Evidence Sink

- code/tests in repo
- `.harness/verification/**`
- `planning/active/roadmap-backlog-implementation-plan-20260628/progress.md`
- `planning/active/roadmap-backlog-implementation-plan-20260628/findings.md`
- optional `planning/active/roadmap-backlog-implementation-plan-20260628/reconciliation.md`

### Reconcile Rule

- after every completed release wave, update planning directly, but treat roadmap/backlog rewrites as report-only by default until explicit owner approval is recorded
- do not mark a wave complete if code proof is green but lifecycle evidence is still open

### Unacceptable Substitute

- “tests passed locally” without naming which tests
- “docs updated” without linking the exact operator surface
- “should be straightforward” instead of naming the exact file/function/command
- “future executor can decide” in any mandatory step

## Program File Map

### Existing Core Files To Reuse

- `harness/installer/commands/sync.mjs`
- `harness/runtime/sync-plan-service.mjs`
- `harness/runtime/execution-contract.mjs`
- `harness/runtime/execution-receipt.mjs`
- `harness/runtime/summary-service.mjs`
- `harness/installer/commands/active-summary.mjs`
- `harness/installer/commands/verify.mjs`
- `harness/runtime/verify-service.mjs`
- `harness/core/upstream-overlays/planning-with-files/scripts/task_lifecycle.py`
- `harness/core/upstream-overlays/planning-with-files/scripts/archive-task.sh`
- `harness/core/upstream-overlays/planning-with-files/scripts/companion_sync.py`
- `scripts/ci/lib/upstream-refresh.mjs`
- `scripts/ci/verify-upstream-refresh.mjs`
- `docs/workflows.md`
- `docs/reconciliation.md`
- `docs/maintenance.md`
- `docs/upstream-update-compatibility.md`
- `docs/install/adoption-starter-kit.md`
- `docs/cloud-dev-harness.md`
- `docs/mcp-read-only-compatibility.md`
- `docs/office-templates.md`

### New Files Expected During Execution

- `harness/installer/lib/sync-plan.mjs`
- `harness/installer/lib/sync-apply.mjs`
- `harness/installer/lib/sync-report.mjs`
- `tests/installer/sync-boundary.test.mjs`
- `tests/evals/repo-workflow-replays/execution-kernel-real-tasks/README.md`
- `tests/evals/repo-workflow-replays/release-proof-surface/README.md`
- `docs/selective-breadth-entry-gate.md`

## Execution Order

1. Complete all `1.0.11` tasks.
2. Reconcile and verify `1.0.11`.
3. Complete all `1.0.12` tasks.
4. Reconcile and verify `1.0.12`.
5. Run `1.0.13` entry gate.
6. Choose exactly one breadth lane.
7. Execute `UPD-001` plus the chosen breadth lane.
8. Reconcile and verify `1.0.13`.

Do not reorder these steps.

---

## Release 1.0.11: Kernel Closure

### Task 1: Split `sync` Into Planning, Apply, And Report Boundaries (`KER-001`)

**Files:**
- Create: `harness/installer/lib/sync-plan.mjs`
- Create: `harness/installer/lib/sync-apply.mjs`
- Create: `harness/installer/lib/sync-report.mjs`
- Modify: `harness/installer/commands/sync.mjs`
- Modify: `harness/runtime/sync-plan-service.mjs`
- Test: `tests/installer/sync-boundary.test.mjs`
- Test: `tests/adapters/sync.test.mjs`
- Test: `tests/installer/commands.test.mjs`

**Interfaces:**
- Consumes: current projection planning in `planSkillProjections`, `planHookProjections`, `planSafetyProjections`, state and manifest helpers already imported by `sync.mjs`
- Produces:
  - `buildSyncPlan(args, context) -> Promise<{ state, desiredManifest, operations, report }>`
  - `applySyncPlan(plan, options) -> Promise<{ wroteFiles, removedFiles, projectionMode }>`
  - `renderSyncReport(report) -> { state, currentManifest, plan, diff, summary, warnings, details }`

- [ ] **Step 1: Write the failing boundary tests**

Create `tests/installer/sync-boundary.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSyncPlan } from '../../harness/installer/lib/sync-plan.mjs';
import { renderSyncReport } from '../../harness/installer/lib/sync-report.mjs';

test('buildSyncPlan returns a stable plan object with operations and report payload', async () => {
  const plan = await buildSyncPlan(['--dry-run'], {
    rootDir: '/tmp/project',
    homeDir: '/tmp/home',
    state: {
      scope: 'workspace',
      projectionMode: 'link'
    },
    targets: ['codex']
  });

  assert.equal(Array.isArray(plan.operations), true);
  assert.equal(typeof plan.report, 'object');
  assert.equal(plan.report.mode, 'dry-run');
});

test('renderSyncReport preserves legacy sync report keys and adds detail buckets', async () => {
  const report = renderSyncReport(
    {
      state: { scope: 'workspace' },
      currentManifest: { entries: [] },
      plan: { targets: ['codex'] },
      diff: { create: [], update: [], stale: [], unchanged: [] },
      summary: { create: 0, update: 0, stale: 0, unchanged: 0 }
    },
    {
      mode: 'dry-run',
      warnings: ['hook payload budget exceeded for planning-with-files on codex'],
      details: { projections: ['codex'], hooks: ['planning-with-files'] }
    }
  );

  assert.equal(report.summary.create, 0);
  assert.equal(Array.isArray(report.warnings), true);
  assert.equal(report.details.mode, 'dry-run');
});
```

- [ ] **Step 2: Confirm the new test fails**

Run:

```bash
node --test tests/installer/sync-boundary.test.mjs
```

Expected:

```text
FAIL
Cannot find module '../../harness/installer/lib/sync-plan.mjs'
```

- [ ] **Step 3: Create the plan builder**

Create `harness/installer/lib/sync-plan.mjs`:

```js
export async function buildSyncPlan(args = [], context = {}) {
  const mode = args.includes('--dry-run') ? 'dry-run' : args.includes('--check') ? 'check' : 'apply';
  const targets = context.targets ?? ['codex', 'copilot', 'claude-code', 'cursor'];

  return {
    state: context.state ?? {},
    desiredManifest: context.desiredManifest ?? { entries: [] },
    operations: context.operations ?? [],
    report: {
      mode,
      targets,
      warnings: []
    }
  };
}
```

- [ ] **Step 4: Create the apply helper**

Create `harness/installer/lib/sync-apply.mjs`:

```js
export async function applySyncPlan(plan, options = {}) {
  return {
    wroteFiles: 0,
    removedFiles: 0,
    projectionMode: options.projectionMode ?? plan?.state?.projectionMode ?? 'link'
  };
}
```

- [ ] **Step 5: Create the report renderer**

Create `harness/installer/lib/sync-report.mjs`:

```js
export function renderSyncReport(baseReport, extras = {}) {
  return {
    ...baseReport,
    warnings: extras.warnings ?? [],
    details: {
      mode: extras.mode ?? 'apply',
      projections: extras.details?.projections ?? [],
      hooks: extras.details?.hooks ?? []
    }
  };
}
```

- [ ] **Step 6: Refactor `harness/installer/commands/sync.mjs` to call the new helpers**

Apply this structural pattern inside `harness/installer/commands/sync.mjs`. Preserve the current public signatures and legacy report keys; add detail buckets incrementally instead of replacing the report shape:

```js
import { buildSyncPlan } from '../lib/sync-plan.mjs';
import { applySyncPlan } from '../lib/sync-apply.mjs';
import { renderSyncReport } from '../lib/sync-report.mjs';

export async function planSyncOperations(args = [], options = {}) {
  return buildSyncPlan(args, options);
}

async function computeBaseSyncPlanReport({ rootDir, homeDir, state }) {
  // Move the current computeSyncPlanReport body here without changing behavior.
}

export async function computeSyncPlanReport({ rootDir, homeDir, state }) {
  const baseReport = await computeBaseSyncPlanReport({ rootDir, homeDir, state });
  return renderSyncReport(baseReport, {
    mode: 'plan',
    warnings: baseReport.plan?.warnings ?? [],
    details: {
      projections: baseReport.plan?.targets ?? [],
      hooks: baseReport.plan?.hookWrites?.map((entry) => entry.parentSkillName ?? entry.kind) ?? []
    }
  });
}

export async function sync(args = [], options = {}) {
  const plan = await buildSyncPlan(args, options);
  const applyResult = await applySyncPlan(plan, options);
  const report = await computeSyncPlanReport({ rootDir, homeDir, state });
  const payload = { mode: dryRun ? 'dry-run' : check ? 'check' : 'apply', ...report, applyResult };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}
```

- [ ] **Step 7: Re-run focused tests**

Run:

```bash
node --test tests/installer/sync-boundary.test.mjs tests/adapters/sync.test.mjs tests/installer/commands.test.mjs
```

Expected:

```text
PASS tests/installer/sync-boundary.test.mjs
PASS tests/adapters/sync.test.mjs
PASS tests/installer/commands.test.mjs
```

- [ ] **Step 8: Run dry-run proof**

Run:

```bash
./scripts/harness sync --dry-run
```

Expected:

```text
{
  "summary": {
  "diff": {
  "warnings": [
```

- [ ] **Step 9: Sync planning evidence**

Write to `planning/active/roadmap-backlog-implementation-plan-20260628/progress.md`:

```md
### Sync boundary split
- Extracted planning/apply/report helpers from `harness/installer/commands/sync.mjs`
- Focused proof: `node --test tests/installer/sync-boundary.test.mjs tests/adapters/sync.test.mjs tests/installer/commands.test.mjs`
- Live proof: `./scripts/harness sync --dry-run`
```

**Acceptance for Task 1**

- `sync.mjs` is no longer the only place that knows planning, apply, and report concerns
- dry-run output keeps the current JSON contract and gains additive warning/detail buckets instead of a breaking shape swap
- focused sync tests remain green

### Task 2: Prove `sync` Boundaries Against Projection And Hidden-Hook Surfaces (`KER-001` continuation)

**Files:**
- Modify: `harness/runtime/sync-plan-service.mjs`
- Modify: `harness/installer/lib/health-projection-inspection.mjs`
- Modify: `harness/installer/lib/health-context-budgets.mjs`
- Test: `tests/adapters/sync-hooks.test.mjs`
- Test: `tests/adapters/sync-skills.test.mjs`
- Test: `tests/runtime/status-sync-services.test.mjs`

**Interfaces:**
- Consumes: `computeSyncPlanReport`, `planHookProjections`, hook payload measurement surfaces
- Produces:
  - sync dry-run report that distinguishes projections, hook config, and warnings
  - hidden-hook proof that stays tied to explicit health output

- [ ] **Step 1: Add one failing hook-proof test**

In `tests/adapters/sync-hooks.test.mjs`, append a real CLI-path failing test that uses the file's existing fixture helpers. Do not refactor the test scaffold; only add this case:

```js
test('sync --dry-run emits a warnings array when hook-aware reporting is enabled', async (t) => {
  const root = await createHarnessFixture();
  try {
    await writeState(root, {
      schemaVersion: 1,
      scope: 'workspace',
      projectionMode: 'link',
      hookMode: 'on',
      targets: {
        codex: { enabled: true, paths: [path.join(root, 'AGENTS.md')] }
      },
      upstream: {}
    });

    let stdout = '';
    t.mock.method(process.stdout, 'write', (chunk) => {
      stdout += String(chunk);
      return true;
    });

    await withCwd(root, () => sync(['--dry-run']));
    const payload = JSON.parse(stdout);
    // This assertion is specifically about the JSON emitted by `sync --dry-run`.
    assert.equal(Array.isArray(payload.warnings), true);
  } finally {
    await removeHarnessFixture(root);
  }
});
```

- [ ] **Step 2: Add one failing runtime report-shape test**

Append to `tests/runtime/status-sync-services.test.mjs`:

```js
test('getSyncDryRun exposes report buckets needed by operator review', async () => {
  const dryRun = await getSyncDryRun({ root: process.cwd() });
  assert.equal(typeof dryRun.rootDir, 'string');
  assert.equal(typeof dryRun.summary, 'object');
  assert.equal(typeof dryRun.diff, 'object');
  assert.equal(Array.isArray(dryRun.warnings), true);
});
```

- [ ] **Step 3: Update `harness/runtime/sync-plan-service.mjs` to return the new report object directly**

Keep the current public shape and extend it additively:

```js
export async function getSyncDryRun(input = {}) {
  const report = await computeSyncPlanReport({
    rootDir: resolved.rootDir,
    homeDir: input.homeDir ?? os.homedir(),
    state
  });
  return {
    rootDir: resolved.rootDir,
    targets: report.plan.targets,
    summary: report.summary,
    diff: report.diff,
    warnings: report.warnings ?? [],
    details: report.details ?? {}
  };
}
```

- [ ] **Step 4: Ensure projection health warnings stay explicit**

When editing `harness/installer/lib/health-projection-inspection.mjs` and `harness/installer/lib/health-context-budgets.mjs`, do not collapse hook payload warnings into generic strings. Preserve the words `hook`, `payload`, and `budget` in warning text so reviewers can tell projection drift from lifecycle drift.

Target warning style:

```js
warnings.push('hook payload budget exceeded for planning-with-files on codex');
```

- [ ] **Step 5: Run focused proof**

Run:

```bash
node --test tests/adapters/sync-hooks.test.mjs tests/adapters/sync-skills.test.mjs tests/runtime/status-sync-services.test.mjs
./scripts/harness sync --dry-run
./scripts/harness doctor --check-only
```

Expected:

```text
PASS focused sync/hook/runtime tests
doctor output still names hook payload or projection warnings explicitly when present
```

**Acceptance for Task 2**

- hook/projection drift is reviewable before writes
- sync dry-run report shape is stable enough for runtime/operator surfaces

### Task 3: Prove The Execution Kernel On More Real Tracked Tasks (`KER-002`)

**Files:**
- Modify: `harness/runtime/execution-contract.mjs`
- Modify: `harness/runtime/execution-receipt.mjs`
- Modify: `harness/runtime/summary-service.mjs`
- Modify: `harness/installer/commands/active-summary.mjs`
- Create: `tests/evals/repo-workflow-replays/execution-kernel-real-tasks/README.md`
- Test: `tests/installer/execution-contract.test.mjs`
- Test: `tests/installer/execution-receipt.test.mjs`
- Test: `tests/installer/summary-service.test.mjs`
- Test: `tests/installer/active-summary-command.test.mjs`

**Interfaces:**
- Consumes: execution contract parser, receipt writer/reader, follow-up closure state, active-task summary
- Produces:
  - stable receipt summaries on multiple real tracked-task fixtures
  - route truth visible in summary surfaces

- [ ] **Step 1: Add failing execution-contract coverage for multiple units**

Append to `tests/installer/execution-contract.test.mjs`:

```js
test('validateExecutionContract accepts multiple units with explicit Do and Not do boundaries', async () => {
  const contract = parseExecutionContract(`
## Execution Contract
### Unit: unit-a
- Kind: implementation
- Status: planned
- Scope:
  - Do: change code
  - Not do: widen scope
- Owner Mode: inline
- Allowed Ops:
  - Files: a
  - Commands: b
  - External effects: none
- Dependencies:
  - x
- Verification Plan:
  - y
- Return Artifacts:
  - z
- Integration Target:
  - p
- Exit Criteria:
  - q
`);

  assert.equal(validateExecutionContract(contract).ok, true);
});
```

- [ ] **Step 2: Add failing receipt-summary test**

Append to `tests/installer/execution-receipt.test.mjs`:

```js
test('summarizeExecutionReceipts counts blocked, failed, and open followups independently', async () => {
  const summary = summarizeExecutionReceipts([
    {
      unitId: 'u1',
      resultStatus: 'blocked',
      followups: [{ type: 'doc', target: 'docs/a.md', status: 'open' }]
    },
    {
      unitId: 'u2',
      resultStatus: 'failed',
      followups: []
    }
  ], []);

  assert.equal(summary.blockedUnits, 1);
  assert.equal(summary.failedUnits, 1);
  assert.equal(summary.openFollowups, 1);
});
```

- [ ] **Step 3: Add summary-surface fixture notes**

Create `tests/evals/repo-workflow-replays/execution-kernel-real-tasks/README.md`:

```md
# Execution Kernel Real Tasks

This directory records replay fixtures that prove:

1. multiple tracked tasks can carry execution contracts
2. receipts remain evidence-only
3. summary surfaces can rely on receipt summaries
4. open followups remain visible until explicitly closed
```

- [ ] **Step 4: Keep route notice and companion notice stable in `harness/runtime/summary-service.mjs`**

When editing summary logic, preserve these lines:

```js
`Route: ${routingDecision.selectedRoute} - ${compactCompanionReason(routingDecision.routeReason, 120)}`
`Companion: blocks archive readiness - ${reason}`
```

Do not rename them unless matching tests are updated deliberately.

- [ ] **Step 5: Run focused execution-kernel proof**

Run:

```bash
node --test tests/installer/execution-contract.test.mjs tests/installer/execution-receipt.test.mjs tests/installer/summary-service.test.mjs tests/installer/active-summary-command.test.mjs
./scripts/harness active-summary --json
```

Expected:

```text
PASS execution contract, receipt, summary, and active-summary tests
JSON report includes execution signal counts and route notices where present
```

**Acceptance for Task 3**

- more than one tracked-task fixture can carry the execution kernel without custom rescue rules
- receipt summaries and route truth are operator-visible

### Task 4: Close Lightweight-Default Drift Across Hooks, Installs, And Docs (`GOV-001`)

**Files:**
- Modify: `harness/installer/lib/health-context-budgets.mjs`
- Modify: `harness/installer/lib/health-governance.mjs`
- Modify: `docs/maintenance.md`
- Modify: `docs/install/adoption-starter-kit.md`
- Test: `tests/installer/adoption.test.mjs`
- Test: `tests/installer/policy-render.test.mjs`
- Test: `tests/runtime/doctor-verify-services.test.mjs`

**Interfaces:**
- Consumes: current install profiles, payload measurement rules, doctor/adoption warning surfaces
- Produces:
  - lighter wording and proof for `minimal-global`
  - stable warnings only where the heavier choice is intentional

- [ ] **Step 1: Identify wording that over-promises context**

Search:

```bash
rg -n "tracked-lean|lightweight|minimal-global|session-start|payload" docs harness tests -S
```

Expected:

```text
List of docs/runtime/test locations that mention lightweight or minimal-global behavior
```

- [ ] **Step 2: Add a failing policy-render assertion**

Append to `tests/installer/policy-render.test.mjs`:

```js
test('rendered policy does not imply heavy persistent context for lightweight defaults', async () => {
  const readme = await readFile(path.join(process.cwd(), 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /always receives full deep-task context/i);
});
```

- [ ] **Step 3: Normalize warning language in code**

Use this warning style when editing `harness/installer/lib/health-governance.mjs`:

```js
warnings.push(
  'minimal-global stays the recommended default; choose a heavier profile only when the task explicitly needs broader projected context.'
);
```

- [ ] **Step 4: Update operator docs with the same wording**

Insert this exact sentence in both `docs/maintenance.md` and `docs/install/adoption-starter-kit.md` where install posture is described:

```md
`minimal-global` is the recommended default. Move to a heavier profile only when the task explicitly needs broader projected context and the operator accepts the extra payload/runtime cost.
```

- [ ] **Step 5: Run focused proof**

Run:

```bash
node --test tests/installer/adoption.test.mjs tests/installer/policy-render.test.mjs tests/runtime/doctor-verify-services.test.mjs
./scripts/harness doctor --check-only
./scripts/harness adoption-status
```

Expected:

```text
PASS lightweight/adoption/policy tests
doctor and adoption-status explain default posture without implying hidden heavy context
```

**Acceptance for Task 4**

- lightweight-default wording and runtime warnings say the same thing
- `minimal-global` is clearly the default and the heavier posture is explicit, not implied

### Release 1.0.11 Exit Gate

Run all of the following before marking the release wave complete:

```bash
node --test tests/installer/sync-boundary.test.mjs tests/adapters/sync.test.mjs tests/installer/commands.test.mjs tests/adapters/sync-hooks.test.mjs tests/adapters/sync-skills.test.mjs tests/runtime/status-sync-services.test.mjs tests/installer/execution-contract.test.mjs tests/installer/execution-receipt.test.mjs tests/installer/summary-service.test.mjs tests/installer/active-summary-command.test.mjs tests/installer/adoption.test.mjs tests/installer/policy-render.test.mjs tests/runtime/doctor-verify-services.test.mjs
./scripts/harness sync --dry-run
./scripts/harness doctor --check-only
./scripts/harness active-summary --json
```

Expected:

```text
all focused tests PASS
sync dry-run report is bucketed
doctor output remains explicit
active-summary exposes route/reconciliation/execution signals
```

If any focused proof fails, do not start `1.0.12`.

---

## Release 1.0.12: Governance Productization

### Task 5: Promote Acceptance Replay And Release Closure Into First-Class Proof Surfaces (`GOV-002`)

**Files:**
- Modify: `harness/installer/commands/verify.mjs`
- Modify: `harness/runtime/verify-service.mjs`
- Modify: `docs/workflows.md`
- Modify: `docs/maintenance.md`
- Create: `tests/evals/repo-workflow-replays/release-proof-surface/README.md`
- Test: `tests/runtime/doctor-verify-services.test.mjs`
- Test: `tests/automation/repo-verify-workflow.test.mjs`

**Interfaces:**
- Consumes: current verify lane, current replay packs, `.harness/verification` output
- Produces:
  - one discoverable acceptance/release proof surface
  - operator answer to “where is the authoritative acceptance proof?”

- [ ] **Step 1: Add a failing verify-service report-shape test**

Append to `tests/runtime/doctor-verify-services.test.mjs`:

```js
test('verify service returns an evidence surface summary path', async () => {
  const result = await runHarnessVerify({ root: process.cwd() });
  assert.equal(typeof result.rootDir, 'string');
  assert.equal(typeof result.report.generatedAt, 'string');
  assert.match(result.markdown, /^# Harness Verification Report/m);
  assert.equal(result.proofSurface, 'repo-verification');
  assert.equal(Array.isArray(result.commands), true);
});
```

- [ ] **Step 2: Add replay proof readme**

Create `tests/evals/repo-workflow-replays/release-proof-surface/README.md`:

```md
# Release Proof Surface

Authoritative proof for release/gate review should answer:

1. which replay or acceptance pack was run
2. where the verification output landed
3. whether release closure is blocked by open lifecycle drift
```

- [ ] **Step 3: Extend `verify` output contract without breaking current callers**

Keep the current `rootDir`, `report`, and `markdown` fields. Add the new proof-surface metadata additively:

```js
return {
  rootDir: resolved.rootDir,
  report,
  markdown: sanitizeText(renderMarkdown(report), input),
  outputPath,
  proofSurface: 'repo-verification',
  commands: [
    'npm run verify:all',
    './scripts/harness verify --output=.harness/verification'
  ]
};
```

- [ ] **Step 4: Update docs so operators know where to look**

Add this sentence to `docs/workflows.md` and `docs/maintenance.md`:

```md
The authoritative acceptance/release proof surface is the verification output under `.harness/verification` plus the replay/eval pack that produced it.
```

- [ ] **Step 5: Run focused proof**

Run:

```bash
node --test tests/runtime/doctor-verify-services.test.mjs tests/automation/repo-verify-workflow.test.mjs
./scripts/harness verify --output=.harness/verification
```

Expected:

```text
PASS verify/repo-verify tests
.harness/verification contains a current report
```

### Task 6: Land The Post-Implementation Reconcile Lane (`REC-001`)

**Files:**
- Modify: `docs/reconciliation.md`
- Modify: `docs/workflows.md`
- Modify: `docs/maintenance.md`
- Modify: `planning/active/reconcile-lane-implementation/progress.md`
- Modify: `planning/active/reconcile-lane-implementation/reconciliation.md` if it does not already exist
- Test: `tests/installer/policy-render.test.mjs`

**Interfaces:**
- Consumes: current workflow lane docs and planning lifecycle language
- Produces:
  - explicit reconcile lane instructions
  - explicit “when required / when not required” guidance
  - one tracked coding-task dry run from plan through archive-readiness evidence

- [ ] **Step 1: Add a failing docs/policy assertion**

Append to `tests/installer/policy-render.test.mjs`:

```js
test('workflow docs describe reconcile as verify-to-finish gate', async () => {
  const workflowsDoc = await readFile(path.join(process.cwd(), 'docs/workflows.md'), 'utf8');
  assert.match(workflowsDoc, /verify-to-finish gate/i);
});
```

- [ ] **Step 2: Normalize the required sentence across docs**

Add this exact paragraph to `docs/reconciliation.md` and align matching phrasing in `docs/workflows.md`:

```md
Reconciliation is the verify-to-finish gate for tracked work that changes behavior, policy, lifecycle state, or source-of-truth expectations. It is not a substitute for implementation or verification, and it is not required for trivial copy-only work.
```

- [ ] **Step 3: Prove the lane on one tracked coding-task dry run**

Use `planning/active/reconcile-lane-implementation/` as the mandatory dry-run task. Append a reconciliation block there with:

```md
## Archive Readiness
- Not Ready

## Planned Intent vs Actual Change
- Planned: implement `REC-001` and `REC-002`
- Actual: dry-run reconciliation lane proof only; no archive claim yet

## Proof
- Primary: `./scripts/harness active-summary --json`
- Backstop: focused policy-render tests

## Drift And Follow-Up
- Open: archive readiness remains open until implementation and verification finish
- Deferred: none
```

- [ ] **Step 4: Preserve report-only default for roadmap/backlog rewrites**

Add this exact sentence to `docs/reconciliation.md` and align matching wording in `docs/workflows.md`:

```md
Reconciliation is report-only by default for roadmap, backlog, and spec rewrites. Those artifacts change only after explicit owner approval is recorded in the task's reconciliation evidence.
```

- [ ] **Step 5: Run focused proof**

Run:

```bash
node --test tests/installer/policy-render.test.mjs
./scripts/harness active-summary
./scripts/harness active-summary --json
```

Expected:

```text
PASS reconcile wording tests
active-summary output still lists reconciliation counts
the dry-run task now exposes reconciliation evidence without claiming archive readiness
```

### Task 7: Persist Reconciliation Artifacts And Expose SOT Drift Signals (`REC-002` + `REC-003`)

**Files:**
- Modify: `harness/core/upstream-overlays/planning-with-files/scripts/task_lifecycle.py`
- Modify: `harness/core/upstream-overlays/planning-with-files/scripts/archive-task.sh`
- Modify: `harness/core/upstream-overlays/planning-with-files/scripts/companion_sync.py`
- Modify: `harness/runtime/summary-service.mjs`
- Modify: `harness/installer/commands/active-summary.mjs`
- Modify: `docs/reconciliation.md`
- Modify: `docs/maintenance.md`
- Test: `tests/installer/active-summary-command.test.mjs`
- Test: `tests/installer/summary-service.test.mjs`
- Test: `tests/installer/policy-render.test.mjs`

**Interfaces:**
- Consumes: current reconciliation detection logic, archive flow, companion sync metadata
- Produces:
  - durable `reconciliation.md` persistence
  - active-summary signals for reconciliation readiness and open drift
  - explicit SOT map wording

- [ ] **Step 1: Add a failing summary-service fixture test for reconciliation-open anomalies**

Append to `tests/installer/summary-service.test.mjs`:

```js
test('getActiveTaskSummary reports reconciliation_open when an archive-ready task has no accepted reconciliation signal', async () => {
  const root = await createFixture('summary-service-reconciliation-open');
  try {
    await writeTask(root, 'task-reconciliation-open', {
      taskPlan: [
        '# Task Reconciliation Open',
        '',
        '## Current State',
        'Status: closed',
        'Archive Eligible: yes',
        'Close Reason: implementation complete',
        '',
        '### Phase 1: Closeout',
        '- **Status:** complete'
      ].join('\\n'),
      findings: '# Findings\\n',
      progress: '# Progress\\n'
    });

    const { report } = await getActiveTaskSummary({ root });
    assert.equal(
      report.anomalies.some(
        (entry) => entry.taskId === 'task-reconciliation-open' && entry.kind === 'reconciliation_open'
      ),
      true
    );
  } finally {
    await removeFixture(root);
  }
});
```

- [ ] **Step 2: Preserve current reconciliation field names**

Do not rename these keys when editing `task_lifecycle.py`:

```py
"reconciliation_status"
"reconciliation_ready"
"reconciliation_reason"
"reconciliation_artifact"
"reconciliation_evidence"
```

- [ ] **Step 3: Ensure archive preserves reconciliation artifact**

Update archive logic so archived task directories retain `reconciliation.md` when present. If the shell script already moves the whole directory, only add an explicit regression check and a comment; do not rewrite the archive mechanism unnecessarily.

Required shell-comment style:

```sh
# Preserve reconciliation.md alongside the core planning trio during archive moves.
```

- [ ] **Step 4: Add SOT map wording to docs**

Add this bullet list to `docs/reconciliation.md`:

```md
- code and tests are authoritative for implemented behavior
- `.harness/verification` and replay packs are authoritative for acceptance/release proof
- `planning/active/roadmap-backlog-implementation-plan-20260628/` is authoritative for task intent and durable progress
- `reconciliation.md` is authoritative only for lifecycle reconciliation when it exists
- roadmap/backlog stay product-direction artifacts and require explicit reconcile review before rewrites
```

- [ ] **Step 5: Run focused proof**

Run:

```bash
node --test tests/installer/active-summary-command.test.mjs tests/installer/summary-service.test.mjs tests/installer/policy-render.test.mjs
./scripts/harness active-summary --json
```

Expected:

```text
PASS reconciliation summary tests
JSON output includes reconciliation_status, reconciliation_ready, and anomalies when relevant
```

### Task 8: Tighten Weekly Governance And Release Closure Surfaces (`GOV-002` continuation)

**Files:**
- Modify: `docs/maintenance.md`
- Modify: `docs/workflows.md`
- Modify: `harness/runtime/summary-service.mjs`
- Test: `tests/installer/summary-service.test.mjs`
- Test: `tests/automation/repo-verify-workflow.test.mjs`

**Interfaces:**
- Consumes: active-summary report, verify output, release workflow language
- Produces:
  - smaller operator answer surface for weekly review
  - cleaner release-closure proof wording

- [ ] **Step 1: Add a failing summary-service assertion for needs-attention counts**

In `tests/installer/summary-service.test.mjs`, extend the existing import from `../../harness/runtime/summary-service.mjs` so it includes `buildActiveSummaryTextReport`, then append this failing test:

```js
test('active summary counts tasks needing attention from reconciliation or execution anomalies', async () => {
  const text = buildActiveSummaryTextReport({
    counts: {
      total: 1,
      archiveReady: 0,
      needsAttention: 1,
      byStatus: { active: 1 },
      byReconciliationStatus: { open: 1 }
    },
    tasks: [
      {
        task_id: 'demo-task',
        status: 'active',
        archive_ready: false,
        reconciliationStatus: 'open',
        phase_complete: 1,
        phase_total: 3,
        reason: 'reconciliation open',
        warnings: ['archive-eligible task has no reconciliation readiness signal'],
        executionSignals: {
          receiptCount: 1,
          blockedUnits: 0,
          failedUnits: 0,
          openFollowups: 1,
          resolvedFollowups: 0,
          waivedFollowups: 0
        }
      }
    ]
  });

  assert.match(text, /needs_attention=1/);
  assert.match(text, /reconciliation=open/);
  assert.match(text, /open_followups=1/);
  assert.match(text, /release proof=\\.harness\\/verification/);
});
```

- [ ] **Step 2: Add the matching summary-service line**

In `harness/runtime/summary-service.mjs`, add this line to the top-level text report block right after the reconciliation counts line:

```js
lines.push('[planning-with-files] Proof surfaces: queue=active-summary release proof=.harness/verification');
```

- [ ] **Step 3: Add concise weekly/release operator wording**

Insert in `docs/maintenance.md`:

```md
Use `active-summary` for queue-level weekly governance and `.harness/verification` for release proof. Do not force operators to reconstruct these surfaces from scattered planning archaeology.
```

- [ ] **Step 4: Run focused proof**

Run:

```bash
node --test tests/installer/summary-service.test.mjs tests/automation/repo-verify-workflow.test.mjs
./scripts/harness active-summary
./scripts/harness verify --output=.harness/verification
```

Expected:

```text
PASS summary/release workflow tests
operator outputs now clearly point to queue proof and release proof
```

### Release 1.0.12 Exit Gate

Run:

```bash
node --test tests/runtime/doctor-verify-services.test.mjs tests/automation/repo-verify-workflow.test.mjs tests/installer/policy-render.test.mjs tests/installer/summary-command.test.mjs tests/installer/active-summary-command.test.mjs tests/installer/summary-service.test.mjs
./scripts/harness verify --output=.harness/verification
./scripts/harness active-summary --json
./scripts/harness doctor --check-only
```

Expected:

```text
acceptance/release/reconcile proof surfaces are visible and green
```

If lifecycle or release proof is still scattered, do not start `1.0.13`.

---

## Release 1.0.13: Selective Breadth Reopen

### Task 9: Run The Entry Gate And Freeze The Selected Breadth Lane

**Files:**
- Create: `docs/selective-breadth-entry-gate.md`
- Modify: `planning/active/roadmap-backlog-implementation-plan-20260628/reconciliation.md` or `progress.md`
- Modify: `docs/roadmap.md` only if explicit owner approval is already recorded in reconciliation evidence
- Modify: `docs/backlog.md` only if explicit owner approval is already recorded in reconciliation evidence

**Interfaces:**
- Consumes: `1.0.11` and `1.0.12` proof outputs
- Produces:
  - one explicit breadth-lane decision
  - explicit hold/disposition for unchosen lanes

- [ ] **Step 1: Create the entry-gate document**

Create `docs/selective-breadth-entry-gate.md`:

```md
# Selective Breadth Entry Gate

The executor may select exactly one lane when all of the following are true:

1. `1.0.11` focused kernel proof is green.
2. `1.0.12` acceptance/reconcile/release proof is green.
3. Weekly governance output is mostly incremental rather than cleanup-heavy.
4. The chosen lane has one narrow proof target and does not reopen multiple unsettled semantics.
```

- [ ] **Step 2: Score the candidates**

Use this deterministic rubric in the same file:

```md
| Lane | Narrow proof target (0-3) | New semantics risk (0-3, lower is better) | Operator value now (0-3) | Weekly-review burden (0-3, lower is better) | Total score |
| --- | --- | --- | --- | --- | --- |
| ADOPT-001 | 3 | 1 | 3 | 1 | 8 |
| MCP-001 | 2 | 1 | 2 | 1 | 6 |
| CDX family | 1 | 3 | 2 | 3 | 3 |
```

Selection rule:

```md
Choose the highest total score. If a tie somehow appears after future edits, break ties in this fixed order: `ADOPT-001` -> `MCP-001` -> `CDX family`.
```

- [ ] **Step 3: Freeze the default choice**

Unless explicit owner approval says otherwise, `ADOPT-001` is the default recommendation for `1.0.13` because it has the highest fixed score and the narrowest operator-value path.

- [ ] **Step 4: Record the unchosen-lane disposition**

Add this exact wording for unchosen lanes:

```md
Not selected for `1.0.13`; remains explicitly backlogged pending a future narrow proof target.
```

- [ ] **Step 5: Respect report-only default for roadmap/backlog**

If owner approval is not yet recorded, write the proposed roadmap/backlog updates into `planning/active/roadmap-backlog-implementation-plan-20260628/reconciliation.md` instead of editing `docs/roadmap.md` or `docs/backlog.md`.

- [ ] **Step 6: Run proof**

Run:

```bash
./scripts/harness active-summary
./scripts/harness verify --output=.harness/verification
```

Expected:

```text
recent proof surfaces are available and the selected lane is documented explicitly
```

### Task 10: Finish The Upstream Update Compatibility Contract (`UPD-001`)

**Files:**
- Modify: `scripts/ci/lib/upstream-refresh.mjs`
- Modify: `scripts/ci/verify-upstream-refresh.mjs`
- Modify: `docs/upstream-update-compatibility.md`
- Modify: `docs/maintenance.md`
- Test: `tests/automation/upstream-refresh-lib.test.mjs`
- Test: `tests/automation/upstream-refresh-workflow.test.mjs`
- Test: `tests/automation/upstream-base-health.test.mjs`
- Test: `tests/adapters/skill-projection.test.mjs`
- Test: `tests/adapters/sync-skills.test.mjs`
- Test: `tests/adapters/sync-hooks.test.mjs`
- Test: `tests/installer/policy-render.test.mjs`

**Interfaces:**
- Consumes: refresh runner, update report, focused verification lane
- Produces:
  - reviewable update report before projection acceptance
  - explicit changed-files / affected-projection / resync / risk output
  - explicit focused adapter/projection checks whenever update scope touches skills, hooks, or planning policy

- [ ] **Step 1: Add a failing report-shape test**

Append to `tests/automation/upstream-refresh-lib.test.mjs`:

```js
test('upstream refresh report includes changed files, affected projections, resync need, and risk', async () => {
  const result = buildUpdateCompatibilityReport({
    changedFiles: ['harness/installer/lib/hook-projection.mjs'],
    affectedProjections: ['codex'],
    requiresResync: true,
    riskLevel: 'medium',
    patchDriftWarnings: ['planning patch drift detected']
  });

  assert.equal(Array.isArray(result.changedFiles), true);
  assert.equal(Array.isArray(result.affectedProjections), true);
  assert.equal(typeof result.requiresResync, 'boolean');
  assert.equal(typeof result.riskLevel, 'string');
  assert.equal(Array.isArray(result.focusedChecks), true);
  assert.match(result.focusedChecks.join(' '), /skill-projection|sync-hooks|policy-render/i);
});
```

- [ ] **Step 2: Standardize the update report object**

Add a helper inside `scripts/ci/lib/upstream-refresh.mjs` and use it in the refresh/update surface:

```js
export function buildUpdateCompatibilityReport({
  changedFiles = [],
  affectedProjections = [],
  requiresResync = false,
  riskLevel = 'low',
  patchDriftWarnings = []
} = {}) {
  const touchesProjectionOrPolicy = changedFiles.some((file) =>
    file.includes('hook-projection')
    || file.includes('skill-projection')
    || file.includes('/skills/')
    || file.endsWith('AGENTS.md')
    || file.endsWith('docs/workflows.md')
  );

  return {
    changedFiles,
    affectedProjections,
    requiresResync,
    riskLevel,
    patchDriftWarnings,
    focusedChecks: touchesProjectionOrPolicy
      ? [
          'node --test tests/adapters/skill-projection.test.mjs tests/adapters/sync-skills.test.mjs tests/adapters/sync-hooks.test.mjs tests/installer/policy-render.test.mjs'
        ]
      : []
  };
}
```

- [ ] **Step 3: Align docs**

Add this line to `docs/upstream-update-compatibility.md`:

```md
Every accepted update report must list changed upstream files, affected projections, required re-sync, risk level, and patch-drift warnings before local projection changes are trusted.
```

Add this line directly below it:

```md
If the update touches skills, hooks, or planning policy, the report must also list the focused adapter/projection checks required before the update is accepted.
```

- [ ] **Step 4: Run focused proof**

Run:

```bash
node --test tests/automation/upstream-base-health.test.mjs tests/automation/upstream-refresh-lib.test.mjs tests/automation/upstream-refresh-workflow.test.mjs
node --test tests/adapters/skill-projection.test.mjs tests/adapters/sync-skills.test.mjs tests/adapters/sync-hooks.test.mjs tests/installer/policy-render.test.mjs
npm run verify:upstream-refresh
```

Expected:

```text
PASS upstream refresh tests
verify:upstream-refresh passes with the narrowed contract
```

### Task 11A: Selected Lane Bundle For `MCP-001` (execute only if MCP is chosen)

**Files:**
- Modify: `docs/mcp-read-only-compatibility.md`
- Test: `tests/mcp/receipt-ledger.test.mjs`

**Interfaces:**
- Produces:
  - documentation for native adapter vs MCP read-only vs docs-only tiers
  - explicit reuse of existing read-only inspection surfaces with no repo writes

- [ ] **Step 1: Add a failing tier-definition test or fixture assertion**

Use this expectation in the relevant MCP test or doc assertion:

```js
assert.match(doc, /native adapter, MCP read-only, and docs-only adoption tiers/i);
```

- [ ] **Step 2: Update the doc with the three-tier wording**

Required sentence:

```md
MCP read-only is the minimum compatibility tier for non-native agents. It may inspect Harness state, but it must not modify repository files.
```

- [ ] **Step 3: Enumerate the reused read-only surfaces explicitly**

Add this bullet list to the same doc:

```md
- status and health via existing verification and doctor outputs
- active-task queue visibility via `active-summary`
- single-task visibility via `summary`
- safe dry-run inspection via the existing sync dry-run surface
```

- [ ] **Step 4: Run proof**

Run:

```bash
node --test tests/mcp/receipt-ledger.test.mjs
./scripts/harness active-summary --json
```

Expected:

```text
PASS MCP compatibility proof
```

### Task 11B: Selected Lane Bundle For `ADOPT-001` (execute only if adoption is chosen)

**Files:**
- Modify: `docs/install/adoption-starter-kit.md`
- Modify: `docs/maintenance.md`
- Test: `tests/installer/adoption.test.mjs`

**Interfaces:**
- Produces:
  - small adoption package with rollback, doctor, sync dry-run, verify, smoke-check steps

- [ ] **Step 1: Add failing adoption-guide assertions**

```js
assert.match(doc, /minimal-global, full-local, and cloud-dev profiles/i);
assert.match(doc, /rollback, doctor, sync dry-run, verify, and smoke-check/i);
```

- [ ] **Step 2: Align the guide and runtime wording**

Required sentence:

```md
The starter kit must explain what upstream update can overwrite, what it cannot overwrite, and how to recover safely.
```

- [ ] **Step 3: Add the matching maintenance sentence**

Insert in `docs/maintenance.md`:

```md
When using the adoption starter kit, verify rollback, doctor, sync dry-run, verify, and smoke-check steps before treating the profile as reusable team guidance.
```

- [ ] **Step 4: Run proof**

Run:

```bash
node --test tests/installer/adoption.test.mjs
./scripts/harness adoption-status
./scripts/harness doctor --check-only
```

Expected:

```text
PASS adoption proof
```

### Task 11C: Selected Lane Bundle For `CDX-001` to `CDX-011` (execute only if cloud-dev is chosen)

**Files:**
- Modify: `docs/cloud-dev-harness.md`
- Modify: `docs/workflows.md`
- Modify: `docs/backlog.md`
- Test: `tests/automation/repo-verify-workflow.test.mjs`

**Interfaces:**
- Produces:
  - parity matrix
  - explicit agent-neutral contract
  - bounded cloud-dev operator polish

- [ ] **Step 1: Do not attempt all `CDX-*` tasks at once**

Create a sub-plan section in the execution task’s planning files that sequences the cloud-dev family in this exact order:

```md
CDX-001 -> CDX-002 -> CDX-003 -> CDX-004 -> CDX-006
CDX-005 / CDX-007 / CDX-008 and later research tasks remain optional follow-ons unless the first five prove stable.
```

- [ ] **Step 2: Add the parity-matrix heading**

Required heading for `docs/cloud-dev-harness.md`:

```md
## Local vs Cloud-Dev Parity Matrix
```

- [ ] **Step 3: Add the matching workflow and backlog wording**

Add this line to `docs/workflows.md`:

```md
If the cloud-dev breadth lane is selected in `1.0.13`, execute the bounded `CDX-001 -> CDX-002 -> CDX-003 -> CDX-004 -> CDX-006` sequence before reopening optional cloud research tasks.
```

Add this line to `docs/backlog.md` under the cloud-dev section:

```md
If cloud-dev is the selected `1.0.13` lane, execute the bounded parity-and-contract subset first and keep later cloud research items explicitly deferred.
```

- [ ] **Step 4: Run proof**

Run:

```bash
node --test tests/automation/repo-verify-workflow.test.mjs
./scripts/harness doctor --check-only
```

Expected:

```text
PASS cloud-dev operator proof
```

### Task 12: Explicitly Park `OFFICE-001` Unless Owner Promotes It

**Files:**
- Modify: `docs/backlog.md`

- [ ] **Step 1: Keep it explicit, not implied**

If `OFFICE-001` is not selected, leave this exact wording in `docs/backlog.md`:

```md
`OFFICE-001` remains deferred. It should not displace coding-first kernel or governance work unless an explicit owner decision promotes it.
```

- [ ] **Step 2: Do not touch office-template docs in this plan**

This is a hard stop. A low-intelligence executor must not “helpfully” broaden scope by editing `docs/office-templates.md` inside the three-release mainline program.

### Release 1.0.13 Exit Gate

Run:

```bash
npm run verify:upstream-refresh
./scripts/harness verify --output=.harness/verification
./scripts/harness doctor --check-only
./scripts/harness active-summary --json
```

Plus exactly one of:

```bash
node --test tests/mcp/receipt-ledger.test.mjs
```

or

```bash
node --test tests/installer/adoption.test.mjs
```

or

```bash
node --test tests/automation/repo-verify-workflow.test.mjs
```

Expected:

```text
UPD-001 proof passes
the chosen breadth lane proof passes
unchosen lanes remain explicitly backlogged
```

---

## Cross-Wave Execution Rules

### Rule 1: Planning Sync-Back After Every Task

After each completed task, append a short block to `planning/active/roadmap-backlog-implementation-plan-20260628/progress.md`:

```md
### Sync boundary split
- Files changed:
- Focused proof:
- Live proof:
- Remaining drift:
```

### Rule 2: Reconcile At The End Of Each Release Wave

At the end of `1.0.11`, `1.0.12`, and `1.0.13`, create or append `planning/active/roadmap-backlog-implementation-plan-20260628/reconciliation.md` with:

```md
## Archive Readiness
- Not Ready

## Planned Intent vs Actual Change
- Planned:
- Actual:

## Proof
- Primary:
- Backstop:

## Drift And Follow-Up
- Open:
- Deferred:
```

Do not mark `Ready` until the whole program is actually complete.

### Rule 3: Frequent Commits

Recommended commit boundaries:

- `refactor: split sync planning apply report boundaries`
- `test: add execution kernel real-task proof`
- `docs: align lightweight-default governance wording`
- `feat: expose acceptance and reconcile proof surfaces`
- `feat: preserve reconciliation artifact and SOT signals`
- `feat: harden upstream update compatibility contract`
- `docs: freeze selective breadth lane decision`

### Rule 4: Full-Gate Timing

Run `npm run verify:all`:

- after all `1.0.11` tasks
- after all `1.0.12` tasks
- after `UPD-001` plus the chosen `1.0.13` lane

Do not run it after every small subtask unless the focused proof suggests a cross-repo regression.

---

## Reviewer Checklist For This Plan

Any reviewer or controller validating this plan must answer `yes` to all items below:

1. Does every mandatory backlog item have a release-wave home?
2. Does every release wave have an exit gate?
3. Does every code-facing task name exact files and at least one exact function or output shape?
4. Does every task have at least one focused proof command?
5. Does the plan forbid silent breadth expansion?
6. Is `1.0.13` constrained to exactly one outward-facing lane?
7. Can a mini/cheap model execute the steps without inventing new architecture?

If any answer is `no`, the controller must revise the plan before execution.

## Native `/goal` Prompt For Execution

```text
/goal
Objective
Execute the reviewed companion plan at `docs/superpowers/plans/2026-06-28-roadmap-backlog-implementation-plan-20260628.md` and deliver the three-wave Harness mainline program through `1.0.11`, `1.0.12`, and `1.0.13`, while keeping `planning/active/roadmap-backlog-implementation-plan-20260628/` authoritative and reopening exactly one breadth lane in `1.0.13`.

Context
Authoritative planning lives in `planning/active/roadmap-backlog-implementation-plan-20260628/task_plan.md`, `findings.md`, and `progress.md`. The companion plan contains the detailed task order, file map, proof commands, release gates, and selected-lane rules. Mainline items are `KER-001`, `KER-002`, `GOV-001`, `GOV-002`, `REC-001`, `REC-002`, `REC-003`, `UPD-001`, plus exactly one chosen breadth lane among `MCP-001`, `ADOPT-001`, or the `CDX-*` family.

Constraints
Keep roadmap/backlog intent kernel-first. Do not widen more than one outward-facing lane in `1.0.13`. Do not let the companion plan replace `planning/active/roadmap-backlog-implementation-plan-20260628/` as durable memory. Require one read-only reviewer subagent for any materially revised companion plan. Cap plan-polishing at 3 rounds.

Work Discipline
At the start of each round, restore `planning/active/roadmap-backlog-implementation-plan-20260628/task_plan.md`, `findings.md`, and `progress.md`, then reclassify the round as quick, tracked, or deep-reasoning. Keep quick rounds lightweight. Keep tracked rounds synced back into planning files after meaningful progress. For deep-reasoning rounds, update the companion plan under `docs/superpowers/plans/` and require 1 read-only reviewer subagent before further execution. Execute tasks in the order defined by the companion plan. Reconcile after each release wave.

Validation
Use the focused proof commands named in the companion plan for each task. At release gates, run `npm run verify:all`, `./scripts/harness verify --output=.harness/verification`, `./scripts/harness sync --dry-run`, `./scripts/harness doctor --check-only`, and `./scripts/harness active-summary --json` when the companion plan calls for them.

Done Criteria
Inferred acceptance metric: finish 3 release waves, complete 8 mandatory mainline backlog items, complete 1 upstream compatibility contract, and complete exactly 1 selected breadth lane, with 3 release exit gates all green and all results synced back into `planning/active/roadmap-backlog-implementation-plan-20260628/`.

Stop/Escalate
Stop if a task requires architecture not declared in the companion plan, if focused proof contradicts the proposed boundary split, if `1.0.13` would reopen multiple unsettled semantics at once, or if the third review round still says the plan or execution is not low-intelligence-executable.

Next Step
Restore planning files under `planning/active/roadmap-backlog-implementation-plan-20260628/`, then start Release `1.0.11` Task 1 from the companion plan without re-planning the program from scratch.
```

## Final Controller Note

This plan is intentionally explicit because the target executor is allowed to be weak. When a step still feels “obvious,” do not compress it further unless you can prove the cheaper wording still preserves file scope, proof scope, and stop conditions.
