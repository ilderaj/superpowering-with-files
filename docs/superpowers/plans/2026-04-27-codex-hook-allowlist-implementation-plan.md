# Codex Hook Allowlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Codex hook projection with the verified-event allowlist by removing the unsupported planning `Stop` hook, preserving the retained Codex events, and updating tests plus docs so Harness advertises only the Codex hook events it actually verifies.

**Architecture:** Keep the fix in Harness-owned projection, regression-test, and documentation layers. Update the Codex planning event list in the installer projection and generated Codex hook config, rewrite tests so they encode the new allowlist rather than the old blanket support model, and then update the Codex-facing compatibility docs to describe retained, disabled, and conditional events. Do not change upstream vendored sources.

**Tech Stack:** Node.js ESM, JSON hook configs, shell hook scripts, Node test runner, Markdown documentation.

---

### Task 1: Encode the New Codex Contract in Tests

**Files:**
- Modify: `tests/adapters/sync-hooks.test.mjs`
- Modify: `tests/installer/health.test.mjs`
- Modify: `tests/hooks/task-scoped-hook.test.mjs`
- Test: `tests/adapters/sync-hooks.test.mjs`
- Test: `tests/installer/health.test.mjs`
- Test: `tests/hooks/task-scoped-hook.test.mjs`

- [ ] **Step 1: Rewrite the failing assertions to match the allowlist**

Update the Codex sync test so it requires only `SessionStart` and `UserPromptSubmit`, and explicitly rejects `Stop`:

```js
assert.ok(hooks.hooks.SessionStart);
assert.ok(hooks.hooks.UserPromptSubmit);
assert.equal(hooks.hooks.Stop, undefined);
```

Replace the existing Codex health failure that treats missing `Stop` as a problem. Make the negative case remove `UserPromptSubmit` instead, and add a positive case that accepts a Codex config with only `SessionStart` and `UserPromptSubmit` for `planning-with-files`:

```js
hooks: {
	SessionStart: [
		{
			description: 'Harness-managed planning-with-files hook',
			hooks: [{ type: 'command', command: 'echo ok' }]
		}
	]
}
```

Delete the Codex `stop` contract tests from `tests/hooks/task-scoped-hook.test.mjs` so that file only covers the retained Codex context-injection events. Do not replace them with another Codex `Stop` expectation; summary rendering is already covered by `tests/hooks/session-summary.test.mjs`.

- [ ] **Step 2: Run the targeted tests and verify they fail before the implementation change**

Run:

```bash
node --test tests/adapters/sync-hooks.test.mjs tests/installer/health.test.mjs tests/hooks/task-scoped-hook.test.mjs
```

Expected: FAIL because the current Codex projection still includes `Stop`, and the generated Codex hook config still materializes the unsupported `Stop` entry.

- [ ] **Step 3: Commit the failing-test rewrite once it is staged with the implementation changes below**

Do not commit the broken tree by itself. Stage these test changes together with Task 2 after the code is green.

### Task 2: Remove `Stop` from the Codex Planning Projection

**Files:**
- Modify: `harness/installer/lib/hook-projection.mjs`
- Modify: `harness/core/hooks/planning-with-files/codex-hooks.json`
- Test: `tests/adapters/sync-hooks.test.mjs`
- Test: `tests/installer/health.test.mjs`
- Test: `tests/hooks/task-scoped-hook.test.mjs`

- [ ] **Step 1: Narrow the Codex planning event allowlist in the projection layer**

Change the Codex event list in `harness/installer/lib/hook-projection.mjs` from this:

```js
codex: ['SessionStart', 'UserPromptSubmit', 'Stop'],
```

to this:

```js
codex: ['SessionStart', 'UserPromptSubmit'],
```

Do not change the other targets in `PLANNING_EVENTS_BY_TARGET`.

- [ ] **Step 2: Remove the generated Codex `Stop` entry from the hook config template**

Delete the `Stop` block from `harness/core/hooks/planning-with-files/codex-hooks.json` so the file contains only the retained Codex planning handlers:

```json
{
	"hooks": {
		"SessionStart": [
			{
				"hooks": [
					{
						"type": "command",
						"command": "sh -c '[ -f .codex/hooks/task-scoped-hook.sh ] && bash .codex/hooks/task-scoped-hook.sh codex session-start || bash \"$HOME/.codex/hooks/task-scoped-hook.sh\" codex session-start'"
					}
				],
				"description": "Harness-managed planning-with-files hook"
			}
		],
		"UserPromptSubmit": [
			{
				"hooks": [
					{
						"type": "command",
						"command": "sh -c '[ -f .codex/hooks/task-scoped-hook.sh ] && bash .codex/hooks/task-scoped-hook.sh codex user-prompt-submit || bash \"$HOME/.codex/hooks/task-scoped-hook.sh\" codex user-prompt-submit'"
					}
				],
				"description": "Harness-managed planning-with-files hook"
			}
		]
	}
}
```

Do not modify the runtime shell script in this task. The design calls for fixing the projection and compatibility contract first.

- [ ] **Step 3: Re-run the focused regression suite**

Run:

```bash
node --test tests/adapters/sync-hooks.test.mjs tests/installer/health.test.mjs tests/hooks/task-scoped-hook.test.mjs tests/hooks/session-summary.test.mjs
```

Expected: PASS. The retained Codex events should still sync correctly, health should no longer require `Stop`, and session summary coverage should continue to live in `tests/hooks/session-summary.test.mjs`.

- [ ] **Step 4: Commit the allowlist implementation**

```bash
git add \
	harness/installer/lib/hook-projection.mjs \
	harness/core/hooks/planning-with-files/codex-hooks.json \
	tests/adapters/sync-hooks.test.mjs \
	tests/installer/health.test.mjs \
	tests/hooks/task-scoped-hook.test.mjs
git commit -m "fix: limit codex planning hooks to verified events"
```

### Task 3: Update Codex Documentation to Match the Allowlist

**Files:**
- Modify: `docs/install/codex.md`
- Modify: `docs/compatibility/hooks.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Update the Codex install guide so it no longer reads like blanket support**

In `docs/install/codex.md`, add an explicit note near the hook installation section that Codex hook projection is event-scoped. Use wording in this shape:

```md
Harness projects only the currently verified Codex hook events. Today that means the superpowers `SessionStart` wrapper plus the planning-with-files `SessionStart` and `UserPromptSubmit` events; the planning `Stop` event is intentionally omitted until a schema-safe adapter exists.
```

Also add a one-line migration note telling existing users to re-run `./scripts/harness sync` so stale `Stop` entries are removed from existing Codex hook configs.

- [ ] **Step 2: Rewrite the compatibility matrix and Codex facts to be event-level**

In `docs/compatibility/hooks.md`, replace the Codex row that currently says blanket support with wording like:

```md
| `planning-with-files` task-scoped hook | Supported via verified-event allowlist (`codex_hooks = true`; retains `SessionStart` and `UserPromptSubmit`, omits planning `Stop`) | Supported | Supported | Supported |
```

Update the nearby explanatory paragraph so it distinguishes platform hook support from event-level verified support.

In `docs/architecture.md`, update the Codex row in the hook-facts table so the “official doc-backed facts” column can still mention Codex event names, while the Harness-owned facts column says Harness currently retains only the verified subset for Codex planning projection.

- [ ] **Step 3: Verify the docs show the new contract and no longer imply blanket Codex planning-hook support**

Run:

```bash
rg -n "verified-event allowlist|UserPromptSubmit|SessionStart|Stop|stale `Stop`" docs/install/codex.md docs/compatibility/hooks.md docs/architecture.md
```

Expected: matches for the new allowlist language, explicit retained/omitted Codex events, and the sync migration note.

- [ ] **Step 4: Commit the documentation update**

```bash
git add docs/install/codex.md docs/compatibility/hooks.md docs/architecture.md
git commit -m "docs: describe codex hook allowlist"
```

### Task 4: Final Verification and Task-Memory Sync

**Files:**
- Modify: `planning/active/codex-stop-hook-json-analysis/task_plan.md`
- Modify: `planning/active/codex-stop-hook-json-analysis/findings.md`
- Modify: `planning/active/codex-stop-hook-json-analysis/progress.md`

- [ ] **Step 1: Run the final focused verification commands**

Run:

```bash
node --test tests/adapters/sync-hooks.test.mjs tests/installer/health.test.mjs tests/hooks/task-scoped-hook.test.mjs tests/hooks/session-summary.test.mjs
./scripts/harness sync --dry-run
```

Expected:

- the targeted test suite passes,
- `./scripts/harness sync --dry-run` exits successfully without projection errors.

- [ ] **Step 2: Record the final implementation result in the active task files**

Update `planning/active/codex-stop-hook-json-analysis/findings.md` with the implemented allowlist decision and the exact files changed. Add a verification section to `progress.md` with the commands above and their pass/fail result. Move `task_plan.md` to either `waiting_review` or `closed` depending on whether you want a human review gate before archival.

Use wording in this shape:

```md
## Current State
Status: waiting_review
Archive Eligible: no
Close Reason: Codex planning hooks now follow the verified-event allowlist; awaiting review.
```

- [ ] **Step 3: Commit the task-memory sync**

```bash
git add \
	planning/active/codex-stop-hook-json-analysis/task_plan.md \
	planning/active/codex-stop-hook-json-analysis/findings.md \
	planning/active/codex-stop-hook-json-analysis/progress.md
git commit -m "chore: record codex hook allowlist rollout"
```
