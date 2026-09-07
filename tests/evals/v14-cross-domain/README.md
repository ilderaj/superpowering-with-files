# V1.4 cross-domain behavior cases

These synthetic cases separate deterministic contract checks, semantic model replay, and live Host delivery. They are not business records and do not prove a real workflow was delivered.

For O1, O2, and D1, start a fresh bounded context with only the referenced fixture and the projected Office capability. Do not put `expected` or `forbidden` fields in the model prompt. O3 reuses the existing Office fixtures and native verifier. O4 has no synthetic success path: a fixture must not pass or prove delivery.

Each executed attempt is retained as one result object with these fields:

```json
{
  "schemaVersion": "v1.4",
  "runId": "unique-executor-id",
  "hostRunRef": "unknown",
  "hostEvidenceRef": "unknown",
  "caseId": "O1",
  "workflowIds": ["W1"],
  "variant": "semantic-replay",
  "attempt": 1,
  "retries": 0,
  "requestedModel": "main/gpt-5.6-luna",
  "requestedEffort": "high",
  "actualModelEvidence": "unknown",
  "sourceRefs": [{"ref": "fixtures/o1-conflicting-product-sources.md", "range": "2026-01-01/2026-01-03"}],
  "artifactRefs": [{"pathOrHostRef": "evidence/output.md", "state": "generated"}],
  "result": "pass",
  "limitations": ["No live delivery was attempted."],
  "usage": {"freshTokens": null, "cachedTokens": null, "billing": null},
  "delivery": {"authorized": "unknown", "recipientVisible": "unknown"},
  "liveGateEvidence": null
}
```

Validate every record with `validateResultRecord` from `result-contract.mjs`. All listed fields are required. The validator enforces the enums and nested shapes and requires `retries === attempt - 1`. Non-O4 records use `liveGateEvidence: null`; O4 records provide separate `source`, `schedule`, `recipient`, `authorization`, `executionEvent`, and `recipientVisible` state/ref pairs. An O4 pass requires all six pairs to be `yes` with a non-unknown evidence ref, plus real Host execution evidence and a `delivered` artifact state.

`runId` is unique across the evidence set; `hostRunRef` records the Host identifier separately and remains `unknown` when absent. Attempts for the same case start at 1 and do not overwrite failures. Requested model and effort are intent. `actualModelEvidence` stays `unknown` unless the Host returns authenticated evidence.

Artifact states are recorded independently and in order: `generated`, `opened`, `rendered`, `accepted`, `delivered`. A later state requires evidence for that event and does not follow from a file path or queued request. O4 passes only when `authorized=yes` and `recipientVisible=yes`, with a real execution event, bound source, schedule, and recipient. Deterministic or semantic fixtures cannot pass O4 and cannot establish delivery.

Results are `pass`, `fail`, `blocked`, `unknown`, `not_run`, or `unavailable`. Missing evidence uses `unknown` or `null` plus a limitation; it is never zero or success. The independent reviewer checks source fidelity, scope, usability, limitations, and every failed or retried attempt before Chief acceptance.
