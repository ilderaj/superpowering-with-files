# Alma Goal A MCP Read-Only Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Alma to understand and usually follow the harness workflow globally through a minimal MCP read-only integration, without turning Alma into an installer-managed harness target and without polluting the current supported-target architecture.

**Architecture:** Keep the repo code untouched or nearly untouched. Use harness MCP read-only as a global observability layer so Alma can inspect status, doctor output, task summaries, and verification state. Pair that with a very small Alma-side workflow rule: prefer `planning/active/<task-id>/` for tracked work and reserve superpowers for deep-reasoning tasks. This is guidance and workflow awareness, not hard enforcement.

**Tech Stack:** Node.js ESM, harness MCP stdio runtime, Alma global MCP configuration, existing planning-with-files / superpowers workflow

---

## File Structure

### Preferred zero-code path
- No repository code changes required

### Optional documentation-only files
- Create: `docs/install/alma-mcp-readonly.md`
- Modify: `docs/install/platform-support.md`

### Optional Alma-side config artifacts
- Alma global MCP config entry pointing at:
  - `node harness/mcp/stdio.mjs --root <workspace> --mode read-only`
- Optional Alma-side global thin policy describing:
  - tracked task → `planning/active/<task-id>/`
  - deep-reasoning task → superpowers only when needed

## Recommendation

### Short answer
For **Goal A**, you **do not need a full implementation plan if the only action is “wire up global MCP read-only and try it.”**

But if you want something stable enough for reuse, handoff, rollback, and verification, a **small operational plan is still worth having**.

So the right framing is:
- **No large engineering plan needed**
- **Yes, a tiny rollout/checklist plan is still useful**

## What Goal A Really Means

Goal A is not:
- guaranteed hard routing of all tracked tasks into planning-with-files
- guaranteed hard gating of superpowers to deep-reasoning only
- installer-managed Alma parity with Codex / Cursor / Claude Code

Goal A is:
- Alma can inspect harness state anywhere
- Alma can usually follow the harness workflow
- Alma can use planning-with-files as the default pattern for tracked work
- Alma can reserve superpowers for deeper tasks when the policy suggests it
- the whole integration stays easy to remove

## Scope Boundary

### In scope
- Global MCP read-only connection from Alma to harness
- Read-only tool availability:
  - `harness_status`
  - `harness_doctor`
  - `harness_active_summary`
  - `harness_task_summary`
  - `harness_sync_dry_run`
  - `harness_verify_read`
- Minimal Alma-side workflow guidance
- Validation in one or two representative repos
- Rollback instructions

### Out of scope
- New `alma` installer-managed target
- `harness/adapters/alma/**`
- hook projection
- write/apply MCP flows
- skill projection parity
- guaranteed hard enforcement of tracked/deep routing

## Tasks

### Task 1: Stand up harness MCP read-only for Alma

**Files:**
- Create: Alma global MCP config entry (outside repo)
- Optional Modify: `docs/install/platform-support.md`
- Optional Create: `docs/install/alma-mcp-readonly.md`

- [ ] **Step 1: Verify the stdio MCP entry command**

Run:
```bash
node harness/mcp/stdio.mjs --root /Users/jared/SuperpoweringWithFiles --mode read-only
```

Expected:
- MCP server starts successfully
- no write mode is enabled

- [ ] **Step 2: Register the MCP server in Alma global config**

Add a global Alma MCP entry that launches the read-only server for the active workspace or chosen repo root.

Expected result:
- Alma can see the harness MCP server as an available tool source

- [ ] **Step 3: Confirm the available read-only tools surface in Alma**

Verify these tools appear and respond:
- `harness_status`
- `harness_doctor`
- `harness_active_summary`
- `harness_task_summary`
- `harness_sync_dry_run`
- `harness_verify_read`

- [ ] **Step 4: Record rollback steps**

Document that disabling this integration only requires removing the Alma global MCP entry.

- [ ] **Step 5: Commit docs only (if docs were added)**

```bash
git add docs/install/platform-support.md docs/install/alma-mcp-readonly.md
git commit -m "docs: add alma mcp read-only adoption notes"
```

### Task 2: Add a tiny Alma-side workflow rule for Goal A

**Files:**
- No repo file required
- Optional Alma-side global rule/instruction artifact outside repo

- [ ] **Step 1: Add the Alma workflow note**

The note should say, in essence:
- simple task: do directly
- tracked task: create/use `planning/active/<task-id>/`
- deep-reasoning task: use superpowers only when ordinary planning is insufficient
- use harness MCP read-only to inspect current task state before deciding

- [ ] **Step 2: Keep the note intentionally weak, not absolute**

Do **not** word it as:
- “always mandatory hard gate”
- “override system rules”
- “replace Alma native policies”

It should be a workflow preference layer, not a platform takeover.

- [ ] **Step 3: Record the delete path**

Document that removal only requires deleting the Alma-side note and/or MCP registration.

### Task 3: Validate Goal A behavior in a tracked-task repo

**Files:**
- No repo code changes required
- Optional notes in `docs/install/alma-mcp-readonly.md`

- [ ] **Step 1: Open a repo with `planning/active/` state**

Use a representative harness repo that already has active task files.

- [ ] **Step 2: Ask Alma a tracked-task question**

Example prompts:
- “continue this tracked task”
- “what’s the current active task”
- “summarize the current plan before we change anything”

Expected behavior:
- Alma consults MCP read-only status/summary
- Alma references `planning/active/<task-id>/`
- Alma behaves as workflow-aware

- [ ] **Step 3: Ask Alma a deep-reasoning flavored question**

Example prompts:
- “this needs a deeper architecture tradeoff analysis”
- “should we use superpowers here or normal planning”

Expected behavior:
- Alma treats superpowers as a heavier path
- Alma does not invoke it casually for simple work

- [ ] **Step 4: Record what worked and what did not**

Capture:
- whether Alma consistently read the MCP status first
- whether Alma defaulted to planning-with-files for tracked work
- whether Alma overused or underused superpowers

### Task 4: Decide whether Goal A is “good enough” without repo changes

**Files:**
- Optional Modify: `docs/install/alma-mcp-readonly.md`

- [ ] **Step 1: Evaluate against the Goal A bar**

Success means:
- Alma can inspect harness state globally
- Alma usually follows tracked/deep workflow boundaries
- rollback is trivial
- existing harness architecture remains untouched

- [ ] **Step 2: Evaluate the failure cases**

Failure means:
- Alma ignores the workflow note too often
- Alma does not reliably consult MCP summaries
- tracked tasks are frequently handled without `planning/active/<task-id>/`
- superpowers routing remains noisy

- [ ] **Step 3: Choose one of two next moves**

If Goal A is good enough:
- stop here
- keep the integration as a removable Alma-side MCP layer

If Goal A is not good enough:
- move to the next-smallest upgrade:
  - Alma-aware thin adapter/policy layer
  - still no hooks
  - still no full write integration

## Verification Checklist

- [ ] Alma can reach harness MCP read-only globally
- [ ] Alma can call `harness_status`
- [ ] Alma can call `harness_active_summary`
- [ ] Alma can call `harness_verify_read`
- [ ] Alma usually routes tracked work toward `planning/active/<task-id>/`
- [ ] Alma usually treats superpowers as a heavier path for deeper work
- [ ] Disabling the integration only requires removing Alma-side MCP config and optional Alma-side note

## Conclusion

For Goal A, the cleanest approach is:
1. **Yes, you can start by globally wiring MCP read-only immediately**
2. **No, you do not need a heavy engineering plan for that**
3. **But yes, a tiny rollout/checklist plan is still useful** so you can verify behavior and back it out cleanly

This keeps the current harness architecture untouched while giving Alma enough visibility to act workflow-aware in practice.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-15-alma-goal-a-mcp-readonly-adoption-plan.md`.
