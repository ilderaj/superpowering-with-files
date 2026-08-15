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

## Slice 1 — plugin skeleton and trigger

- src/index.ts — cordis plugin entry: name + inject + apply(ctx).
  Injected host-side services: sessions, commands, skills, tokenMeter,
  approval. The client/UI conversationEvents service is intentionally NOT
  injected — verified facts show it lives under dsh packages/client/** and
  the CLI host may not provide it (see src/context.ts seam note and
  assets/dsh-host-adaptation.md).
- src/detect.ts — auto-detect trigger: session/created lifecycle events +
  planning trio or .swf-task marker via src/core/passthrough. Non-SWF
  sessions pass through transparently (no interception, no writes). SWF
  sessions get a session-scoped session/event observer (state + approval
  policy fold), cleaned up on session/disposed.
- src/commands.ts — /swf command surface: route / bind / status / accept,
  thin adapters over the Slice 0 decision core. bind stops on
  binding_mismatch without writing.
- src/packet.ts — packet/evidence persistence:
  planning/active/<task-id>/swf-packet.json and
  planning/active/<task-id>/evidence/; the host-claimed-as-authenticated
  invariant is enforced at the write boundary.
- assets/ — vendored trio skills (SKILL/dev/office/safety), chiefops, and
  trio templates, byte-identical to the repository sources, plus
  dsh-host-adaptation.md (report section 4 rules + seam notes).
- test/ — 43 new Slice 1 cases (detect, packet, commands, entry, assets,
  smoke), all green with the Slice 0 golden suite (109 total).

Slice 1 keeps zero runtime import from dsh chain packages: all chain types are
type-only devDependencies pinned to the dsh 0.1.0-rc.6 dependency chain.
