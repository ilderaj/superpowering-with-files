# V2.0 economics evaluation

Offline, explicit-input report tool. The contract is in [contract.md](contract.md); the governing design and T01–T16 requirements are in [V2.0](../../../docs/plans/v2.0/README.md).

```sh
node --test tests/runtime/economics-report.test.mjs
node tests/evals/v20-economics/report.mjs --input tests/evals/v20-economics/fixtures/complete.json --format markdown
```

`complete.json` is synthetic arithmetic test data, never a Host run or evidence of savings. The CLI reads only its explicit input and writes stdout. Exit 0 includes unproven and not_supported; exit 2 means invalid input/arguments. Evidence references are opaque and are not opened.

Real experiment status: completed and Chief accepted locally on 2026-09-09. Two rounds / 16 actual Luna-high candidates passed quality review; economics remain unproven. Round 1 token volume increased 32.87%, round 2 decreased 2.25%; shared overhead is incompletely attributed. No default-method expansion or savings claim. See [acceptance summary](../../../docs/plans/v2.0/acceptance-summary.md).

Formal acceptance also requires independent review of artifacts and Host resource windows. A reference string in this report is an asserted input, not authenticated proof. Keep raw traces local; publish only sanitized evidence. Do not change default models, install skills, create a runner, or access global sessions as part of this tool.
