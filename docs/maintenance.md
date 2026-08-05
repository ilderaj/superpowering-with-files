# Maintenance

This page covers current Trio v2 upkeep without expanding the task authority or public command surface.

Start with [Workflows](workflows.md) to route the current round. For a tracked task, restore the three bound planning files before performing maintenance work.

## Routine Checks

Use the public commands and repository checks that match the scope:

```bash
./scripts/harness trio
./scripts/harness doctor --check-only
./scripts/harness sync --dry-run
./scripts/harness verify
./scripts/harness checkpoint <exact-target>
./scripts/harness token-audit
```

Use a focused test before broader verification. Preserve command exits, changed paths, and evidence in the bound Trio. A clean local check is not an acceptance decision; the main session performs acceptance and writes the result back to the Trio.

## Upstream Source Contract

`harness/upstream/sources.json` declares the desired source strategies. `harness/upstream/.source-lock.json` is the authoritative resolved source lock that CI and installer fetch consume.

Source-refresh behavior is maintained as a separately bounded repository change. Do not treat a documentation edit as authority to alter source inputs, locks, vendor content, CI, or external workflows.

## Checkpoint And Rollback

Before a destructive or high-risk local change, identify the exact target, create a repository checkpoint when the task authorizes it, and record the rollback command and evidence. Verify the checkpoint inventory before mutating the target. A checkpoint never grants permission for external actions.

## Verification

Run focused proof first, then the required broader checks for the risk level. Read the complete exit status and failure details before advancing. `npm run verify:trio` is the focused repository proof for the retained Trio surface; use `npm run verify:all` only when its broader baseline is relevant and interpretable for the bound task.

## User-Global Boundary

A user-global install or migration requires separately authorized scope and explicit Host or human confirmation. Local repository maintenance must not claim that a user-global change was applied or verified.

## Optional Contracts

Optional Host capabilities are described in [Workflows](workflows.md#optional-contracts). They remain outside the durable Trio authority and never bypass safety or human gates.
