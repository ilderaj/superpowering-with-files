# Findings

## Release findings

- The first PR check found five author-specific absolute paths in the acceptance instructions. They were replaced with repository-relative paths and the private-path test passed.
- The executable O4 result contract originally allowed a non-pilot variant to claim a live pass. The contract now requires `variant=pilot` for every O4 pass, with a regression case covering the false-pass shape.
- The acceptance manifest was refreshed after the path changes and now records `accepted` status plus current README and prompt hashes.
- The controlled acceptance authority had been local-only because `planning/active` and `planning/archive` are ignored. A portable evidence snapshot and this closed archive trio are now committed so the release claim is reviewable from the repository.

## Accepted evidence

O1 and O2 passed on the first attempt. O3 passed after one bounded repair while preserving the first failure. D1 passed after Chief browser evidence supplemented the executor's file-URL block while preserving the original block. O4 passed only with real authorized automation, six live gate records and recipient-visible task readback. The evidence snapshot records all seven result records and the three workflow records.

## Boundaries

The change does not add a worker bridge, restore the retired visible-worker contract, modify DSH, implement V2.0, or claim production business adoption. The requested Luna/Sol settings remain separate from authenticated runtime evidence.
