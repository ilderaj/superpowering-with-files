# Harness Token Output Compression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one low-risk, cross-IDE token-saving policy that nudges all supported Harness IDE projections to cap or summarize unknown/large shell output without reducing Harness planning/evaluation effectiveness.

**Architecture:** Implement this as shared policy text rendered through the existing entry projection pipeline, not as hook-level command rewriting. The policy lives in the core policy source, appears in Codex `AGENTS.md`, Claude Code `CLAUDE.md`, Copilot instructions, and Cursor `.mdc` rule projections, and is guarded by render/health tests that keep startup payloads within existing budgets.

**Tech Stack:** Node.js ESM, Handlebars-style `.hbs` templates, Node built-in test runner, existing Harness installer/policy rendering modules.

---

## Recommended Direction

Pick **shared prompt-level shell output compression guidance** as the first implementation.

Why this is the safest direction:
- It works across the current four supported targets: `codex`, `claude-code`, `copilot`, `cursor`.
- It builds on existing project projection files instead of adding new runtime behavior.
- It avoids high-risk hook command rewriting, which has different semantics and safety tradeoffs per IDE.
- It does not remove planning, findings, progress, evaluator, or decision context.
- It targets the largest token risk: accidental large shell/tool output.

What this plan intentionally does **not** do:
- No forced hook-level Bash interception.
- No automatic command mutation.
- No IDE-specific experimental output truncation setting unless already supported by current project targets.
- No removal of Harness planning/evaluation layers.

## Current Project Context

Current supported project targets observed in this repo:
- Codex: `harness/core/templates/AGENTS.md.hbs`, `harness/core/policy/platform-overrides/codex.md`
- Claude Code: `harness/core/templates/CLAUDE.md.hbs`, `harness/core/policy/platform-overrides/claude-code.md`
- Copilot: `harness/core/templates/copilot-instructions.md.hbs`, `harness/core/policy/platform-overrides/copilot.md`
- Cursor: `harness/core/templates/cursor-rule.mdc.hbs`, `harness/core/policy/platform-overrides/cursor.md`

Existing evidence:
- Root `AGENTS.md` / `CLAUDE.md` already contain a “Shell And Token-Saving Preferences” section.
- `tests/installer/policy-render.test.mjs` already checks rendered policy behavior and token budget shape.
- `tests/installer/context-budget.test.mjs` and related installer tests already exercise context budget measurement.

## File Map

**Likely modify:**
- `harness/core/policy/entry-profiles.json` — if the shared base policy is sourced here.
- Or the actual policy source loaded by the render pipeline if different; identify in Task 1.
- `harness/core/policy/platform-overrides/codex.md` — only if Codex needs a short platform-specific note.
- `harness/core/policy/platform-overrides/claude-code.md` — only if Claude needs a short platform-specific note.
- `harness/core/policy/platform-overrides/copilot.md` — likely keep especially concise due Copilot startup budget.
- `harness/core/policy/platform-overrides/cursor.md` — only if Cursor needs `.mdc`-specific wording.
- `tests/installer/policy-render.test.mjs` — assert rendered outputs contain the guidance and remain concise.
- `planning/active/harness-token-cost-analysis/*` — sync durable summary after implementation.

**Likely inspect, but avoid changing unless necessary:**
- `harness/core/templates/AGENTS.md.hbs`
- `harness/core/templates/CLAUDE.md.hbs`
- `harness/core/templates/copilot-instructions.md.hbs`
- `harness/core/templates/cursor-rule.mdc.hbs`
- `harness/installer/lib/context-budget.mjs`
- `harness/installer/lib/health.mjs`

---

### Task 1: Locate the canonical base-policy source

**Files:**
- Inspect: `harness/core/policy/entry-profiles.json`
- Inspect: `harness/installer/lib/*.mjs`
- Inspect: `tests/installer/policy-render.test.mjs`

- [ ] **Step 1: Find where `basePolicy` is assembled**

Run:

```bash
grep -R "basePolicy\|entry-profiles\|platformOverride" -n harness tests 2>/dev/null | head -120
```

Expected:
- Identify the exact function that renders `{{basePolicy}}` and `{{platformOverride}}` into target templates.
- Identify whether shared policy text belongs in `entry-profiles.json` or another source file.

- [ ] **Step 2: Read the policy rendering test**

Run:

```bash
sed -n '1,220p' tests/installer/policy-render.test.mjs
```

Expected:
- Understand existing assertions around Codex, Claude Code, Copilot, and Cursor rendering.
- Note any current Copilot concision expectations.

- [ ] **Step 3: Read the current policy source**

Run the exact file from Step 1, for example:

```bash
cat harness/core/policy/entry-profiles.json
```

Expected:
- Confirm whether the existing “Shell And Token-Saving Preferences” text already lives in canonical shared policy.
- If it already exists, this implementation should refine and test it, not duplicate it.

---

### Task 2: Add or refine one shared output-compression policy block

**Files:**
- Modify: canonical base-policy source identified in Task 1.
- Test: `tests/installer/policy-render.test.mjs`

- [ ] **Step 1: Write a failing test that requires the policy in all four rendered targets**

Add assertions similar to this in `tests/installer/policy-render.test.mjs`, adapted to existing helper names:

```js
assert.match(codexRendered, /Shell And Token-Saving Preferences/);
assert.match(claudeRendered, /Shell And Token-Saving Preferences/);
assert.match(copilotRendered, /Shell And Token-Saving Preferences/);
assert.match(cursorRendered, /Shell And Token-Saving Preferences/);

for (const rendered of [codexRendered, claudeRendered, copilotRendered, cursorRendered]) {
  assert.match(rendered, /unknown or potentially large output/i);
  assert.match(rendered, /head -c 4000|output-compressing command wrappers/i);
}
```

Expected first run:
- FAIL if the canonical policy is missing from any target.
- PASS if current generated policy already contains enough content; in that case proceed to Step 3 and tighten budget/wording tests instead.

- [ ] **Step 2: Run the focused test**

Run:

```bash
node --test tests/installer/policy-render.test.mjs
```

Expected:
- Either a focused assertion failure showing which target lacks the guidance, or a pass proving current coverage.

- [ ] **Step 3: Update the canonical policy block**

Use this exact target wording, unless existing style requires tiny edits:

```markdown
## Shell And Token-Saving Preferences

Protect context usage for commands with unknown or potentially large output.
Use output-compressing command wrappers for shell commands likely to produce medium or large output, especially Git operations, broad searches, large file or tree reads, diffs, tests, builds, linters, logs, GitHub CLI, Docker, Kubernetes, curl, and JSON or log formatting.

Default safety pattern for unknown large output:

```bash
COMMAND 2>&1 | head -c 4000
```

Prefer command-specific summaries when they preserve the useful signal better than a raw head cap:
- `git diff --stat` before full diffs.
- `git diff --name-only` before file-level diffs.
- targeted `rg` with limits before broad recursive searches.
- test/build summaries that keep failing file names, error messages, and exit status.
- JSON projection with `jq` before byte-capping.

Skip wrappers for trivial commands or tiny targeted reads where compression adds overhead without saving context.
```

Important:
- Keep the block shared, not duplicated per platform.
- Keep it short enough for Copilot.
- Do not say this is mandatory enforcement; it is behavior guidance.

- [ ] **Step 4: Run the focused render test again**

Run:

```bash
node --test tests/installer/policy-render.test.mjs
```

Expected:
- PASS.

---

### Task 3: Preserve Copilot concision and existing context budgets

**Files:**
- Modify: `tests/installer/policy-render.test.mjs`
- Inspect: `tests/installer/context-budget.test.mjs`
- Inspect: `harness/core/context-budgets.json` if present.

- [ ] **Step 1: Add budget guard for the added policy**

In `tests/installer/policy-render.test.mjs`, extend existing token/size assertions rather than adding a new budget system. Example shape:

```js
const copilotTokens = measureText(copilotRendered).approxTokens;
const codexTokens = measureText(codexRendered).approxTokens;

assert.ok(copilotTokens < codexTokens, 'Copilot render should remain more concise than Codex');
assert.ok(copilotTokens < 1200, `Copilot render should stay concise, got ${copilotTokens}`);
```

Adjust `1200` only if existing tests already define a stricter project budget.

- [ ] **Step 2: Run policy and budget tests**

Run:

```bash
node --test tests/installer/policy-render.test.mjs tests/installer/context-budget.test.mjs
```

Expected:
- PASS.
- If Copilot exceeds budget, shorten the shared block rather than creating a huge Copilot override.

---

### Task 4: Verify rendered dry-run projections include the policy

**Files:**
- No source changes expected.
- Use existing CLI/tests only.

- [ ] **Step 1: Run sync dry-run**

Run:

```bash
node scripts/harness sync --dry-run 2>&1 | head -c 12000
```

If `scripts/harness` is not the correct entrypoint, use the project’s documented equivalent from `README.md` or `package.json`.

Expected:
- Command succeeds or prints the same dry-run projection summary format already used by the project.
- It should not write user IDE files.

- [ ] **Step 2: Run doctor/verify read-only checks**

Run:

```bash
node scripts/harness doctor 2>&1 | head -c 12000
```

Expected:
- Doctor passes.
- If doctor reports context budget warnings, inspect the exact target and trim policy wording.

---

### Task 5: Add a small project note documenting the chosen approach

**Files:**
- Modify: `planning/active/harness-token-cost-analysis/findings.md`
- Modify: `planning/active/harness-token-cost-analysis/task_plan.md`
- Modify: `planning/active/harness-token-cost-analysis/progress.md`

- [ ] **Step 1: Append the implementation choice to findings**

Append:

```markdown
## Findings Record: 2026-05-20 22:50:45 UTC+8

Chosen safest implementation direction: shared prompt-level shell output compression guidance rendered into all four currently supported IDE targets: Codex, Claude Code, Copilot, and Cursor.

Rationale: this targets the largest token risk, shell/tool output, while avoiding hook-level command rewriting and preserving Harness planning/evaluation effectiveness.
```

- [ ] **Step 2: Add companion plan reference to task plan**

Add to `task_plan.md`:

```markdown
## Companion Plan
- Path: `docs/superpowers/plans/2026-05-20-harness-token-output-compression-plan.md`
- Summary: Implement shared cross-IDE shell output compression guidance through existing Harness policy projections, with render and budget tests.
- Sync-back status: implementation plan recorded; execution not started.
```

- [ ] **Step 3: Append progress record**

Append:

```markdown
## Session: 2026-05-20 22:50:45 UTC+8

- **Started:** 2026-05-20 22:50:45 UTC+8
- **Task:** Produce implementation plan for safest token compression direction across current four IDE targets.
- **Status:** plan written, execution pending user approval.

## Work Log
- Selected shared prompt-level shell output compression guidance as the lowest-risk direction.
- Avoided hook-level command rewriting in this plan.
- Saved companion implementation plan.
```

---

### Task 6: Final verification before commit

**Files:**
- All modified files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
node --test tests/installer/policy-render.test.mjs tests/installer/context-budget.test.mjs
```

Expected:
- PASS.

- [ ] **Step 2: Run core tests if focused tests pass**

Run:

```bash
npm run test:core
```

Expected:
- PASS.

- [ ] **Step 3: Review diff with capped output**

Run:

```bash
git diff --stat && git diff -- harness/core tests/installer planning/active/harness-token-cost-analysis docs/superpowers/plans/2026-05-20-harness-token-output-compression-plan.md 2>&1 | head -c 20000
```

Expected:
- Diff only includes the policy refinement, render/budget tests, and planning documentation.
- No hook scripts or IDE user config files are modified.

- [ ] **Step 4: Commit**

Run:

```bash
git add harness/core tests/installer planning/active/harness-token-cost-analysis docs/superpowers/plans/2026-05-20-harness-token-output-compression-plan.md
git commit -m "plan token output compression policy"
```

Expected:
- Commit succeeds.

---

## Self-Review

- Spec coverage: covers all four current project targets observed in repo: Codex, Claude Code, Copilot, Cursor.
- Risk control: avoids hook-level enforcement and command mutation.
- Effectiveness: targets large shell/tool output, the highest-risk token source identified in planning findings.
- Testability: render tests confirm policy presence; budget tests guard against bloated startup payloads; doctor/sync dry-run confirm projection health.
- Scope: one policy direction only; no unrelated refactor.
