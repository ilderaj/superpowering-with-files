# ChiefOps Rubric

## Hard Checks

- Keeps `planning/active/<task-id>/` as the only durable task memory.
- Treats `.harness/execution/receipts/<taskId>/*.json` as execution truth when receipts exist.
- Reuses the existing Mode-Aware Verification Contract vocabulary instead of inventing a parallel gate model.
- Produces one bounded next slice rather than a broad orchestration plan.
- Does not introduce a new runner, scheduler, daemon, or second planning directory.
- Does not invent a ChiefOps-specific receipt dialect, board file, or task database.

## Quality Checks

- The readout clearly states the current proof target or highest-risk claim.
- The recommended next slice names compact files or surfaces.
- The sync-back requirement points back to `planning/active/<task-id>/`.
- Examples stay variation-oriented and do not bloat the template.
