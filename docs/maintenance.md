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

## Skill And Prompt Maintenance

Use this review when changing skill triggers, repository instructions, task templates, or upgrading a model. Keep it out of unrelated task prerequisites.

- Write descriptions around the specific task that benefits from the skill. Put the distinguishing trigger early; inspect the Host-visible catalog for ambiguity or truncation. Character counts alone do not establish correct selection.
- For each changed trigger, review one matching request and one adjacent request that should not load it. For example, a release-packaging skill applies to preparing an artifact release; editing a README link does not trigger packaging.
- Keep root skills as short routers. Link supporting methods at their decision point; retain exact sequences only for a documented dependency, safety invariant, or reproducible failure.
- Describe repository-specific facts and completion criteria. Reuse existing verification and authority rules instead of copying them into each skill. Remove stale instructions only after checking the failure they prevented and the models that consume them.
- For changed decision rules, check both the intended action and the retained stop boundary. Text checks establish contract coverage; representative runs on the intended models establish behavior. Record missing model evidence as unknown.

Maintain canonical source and the affected workspace projection together. Global adoption and plugin release have separate receipts. Compare actual catalog/context measurements before claiming savings; installed file counts and source bytes measure different things.

Background and scope: [Astra absorption notes](astra-harness-upgrade.md#2026-09-12-article-absorption).

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
