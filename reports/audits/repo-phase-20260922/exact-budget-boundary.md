# dsh exact remaining budget regression

Date: 2026-09-22
Scope: `plugins/dsh/src/core/dispatch.ts` and `plugins/dsh/test/dispatch-core.test.ts`

The source contract was read before editing. `plugins/dsh/README.md` states a per-task token cap and says an over-cap reserve fails closed with `budget_exceeded`. The existing implementation uses a strict `spentTokens + requestedTokens > budget` comparison. This regression pins that existing boundary: a request whose tokens exactly consume the remaining budget is allowed; only a sum above the cap is over limit.

Added test:

```text
test/dispatch-core.test.ts > budget decision (plan item 3) > allows a dispatch exactly up to the remaining budget
```

## RED mutation

In an isolated complete-copy source, the comparison was temporarily changed from `>` to `>=`.

Command (waited for completion):

```sh
pnpm exec vitest run test/dispatch-core.test.ts
```

Result: exit 1; 36 passed, 1 failed. The new exact-boundary test observed `{ allowed: false, reason: "budget_exceeded" }` instead of `{ allowed: true, reason: null }`.

## GREEN baseline

The mutation was restored. The same command completed with exit 0: 37 passed, 0 failed.

## Full repository verification

A separate complete repository copy retained the repo-root `.agents`, `harness`, and parity sources. Its installed dependency directory was an existing-version dependency surface; no lockfile was changed.

Command (waited for completion):

```sh
CI=true pnpm --dir plugins/dsh verify
```

Observed phases:

- version-lock: passed
- TypeScript build: passed
- Vitest completed with no module-loading failure
- 18 test files and 293 tests passed
- 3 parity tests and 3 asset-byte tests failed because the current source and vendored/retired comparison surfaces differ

Those nine existing semantic/parity failures remain explicitly unresolved. They are outside this exact-budget test slice and were not changed.

No external provider, model execution, deployment, lockfile edit, or root repository edit occurred.
