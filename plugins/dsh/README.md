# swf-dsh — SWF as a DeepSeek Harness plugin

Slice 0 scaffold: the decision core, ported from the SWF harness to pure
TypeScript, with zero dsh runtime imports.

## Provenance

- Baseline: harness/trio/core/routing.mjs (HEAD 275345d), plus the pure
  read-side decisions from harness/trio/core/read.mjs / store.mjs.
- Semantic authority: reports/audit/2026-08-15-dsh-plugin-feasibility.md
  (commit 890b43c, accepted 2026-08-15).
- dsh pin: @deepseek-ai/dsh@0.1.0-rc.6 (exact, lockfile-committed).

## Layout

- src/core/constants.ts — frozen baseline constants (routing + read) and the
  report additions (evidence states, session modes).
- src/core/binding.ts — binding validation, sha256 bindings, comparison
  (assertAuthorityBinding / assertTrioBinding / compareTrioBindings).
- src/core/routing.ts — decision core: routing selection, 8-field Assignment
  Packet, model/effort policy, fail-closed manual_pending, permission
  adjudication. Error messages are verbatim ports.
- src/core/evidence.ts — three-state evidence (authenticated / host-claimed /
  unknown); host-claimed is never written as authenticated.
- src/core/passthrough.ts — non-SWF session detection (planning trio or
  .swf-task marker).
- src/core/storeRead.ts — pure read-side decisions (status parse, exact trio
  file set).
- test/ — vitest suite including parity.test.ts, which compares the port
  against the harness baseline read-only.

## Commands

- pnpm test — vitest run (golden suite).
- pnpm build — tsc compile to dist/ (gitignored).

## Slice boundaries

No dsh runtime import yet (that is Slice 1). No writes outside plugins/dsh/.
The planning trio stays the sole durable task authority; this module only
decides over in-memory inputs.
