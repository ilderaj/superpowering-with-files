# dsh full verification repair

Date: 2026-09-22
Scope: `plugins/dsh/assets`, `plugins/dsh/test/parity.test.ts`, and the dsh verification contract.

## Failure aggregation and disposition

The prior complete-copy run had six failing tests:

- Three asset-byte failures: `assets/skills/trio/SKILL.md`, `assets/skills/trio/office/SKILL.md`, and `assets/skills/chiefops/SKILL.md` were stale vendored projections. They were regenerated from the current `.agents` and `harness/trio/governance` source files. No retired content was restored.
- Three parity failures: the tests compared current dsh routing byte-for-byte with a retired Corleone/harness routing baseline. The current dsh implementation intentionally has different fail-closed semantics: `visible_observation_unknown`, `visible_model_controls_unbound`, current visible-worker evidence, and strict outer model policy conflicts. The tests now assert those current outcomes directly, including immutable packet/digest evidence and the explicit model-conflict throw. No old interface or architecture was reintroduced.

No production implementation bug was found in these six failures. The defects were stale test/projection expectations.

## Verification

Command, waited to completion:

```sh
CI=true pnpm --dir plugins/dsh verify
```

Result:

- version-lock: passed
- TypeScript build: passed
- Vitest: 20 test files, 299 tests passed, 0 failed
- no module-loading failure

The exact remaining-budget regression is included in the 299 tests and separately has RED/GREEN evidence in `exact-budget-boundary.md`.

## Verify integration review

`package.json` currently defines `verify:all` with the root npm, Trio, homepage, and render surfaces. It does not invoke dsh. The existing GitHub repository workflow invokes `npm run verify:all` and has no dsh-specific job.

Keeping dsh independent is appropriate for this repository state because dsh has its own `pnpm-lock.yaml`, package-local build/test contract, and pinned dependency graph. The dsh package should have a separate CI job running `pnpm --dir plugins/dsh verify` with pnpm setup and its lockfile cache. This audit did not edit root `verify:all` or workflow configuration; that would be a separate CI policy change.
