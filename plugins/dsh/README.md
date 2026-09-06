# swf-dsh — SWF as a DeepSeek Harness plugin

SWF Trio v2 strategy and execution skeleton packaged as a DeepSeek Harness
(dsh) cordis plugin. The planning trio stays the sole durable task authority;
a dsh session is only evidence/execution log. Plugin code lives in this
directory only — nothing outside plugins/dsh/ is written.

## Provenance

- Baseline: harness/trio/core/routing.mjs (HEAD 275345d), plus the pure
  read-side decisions from harness/trio/core/read.mjs / store.mjs.
- Semantic authority: reports/audit/2026-08-15-dsh-plugin-feasibility.md
  (commit 890b43c, accepted 2026-08-15; the 14-decision tree in section 1 and
  the four rule rewrites in section 4).
- dsh pin: @deepseek-ai/dsh@0.1.0-rc.6 (exact, lockfile-committed; published
  2026-08-13T12:35:03Z; upstream source commit
  47f943859bef60e4160492346772ded9b24f765a).

## Layout

- src/core/ — frozen decision core ported from the SWF harness: constants,
  binding (sha256 + comparison), routing (8-field Assignment Packet,
  fail-closed manual_pending), evidence (three-state), passthrough
  (non-SWF detection), storeRead (status parse, exact trio file set),
  dispatch (provider routing, tier, budget, gate registry).
- src/context.ts — injected host service surface (sessions, commands, skills,
  tokenMeter, approval) and the defensive ctx.subagents seam.
- src/detect.ts — auto-detect trigger (session lifecycle + planning trio or
  .swf-task marker); non-SWF sessions pass through transparently.
- src/commands.ts — /swf command surface (route/bind/dispatch/status/accept/audit).
- src/packet.ts — packet/evidence persistence under planning/active/<task-id>/,
  three-state invariant enforced at the write boundary.
- src/budget.ts — BudgetTracker (≤2 parallel workers, ~100k token cap) plus
  budget evidence.
- src/dispatch.ts — dispatch orchestration with the mandatory visible-worker
  record and fail-closed manual_pending on every blocker.
- src/evidenceAudit.ts — runnable evidence directory audit (Slice 3).
- assets/ — vendored trio skills (SKILL/dev/office/safety), chiefops, and
  trio templates (byte-identical to the repository sources), plus
  dsh-host-adaptation.md (the authoritative rule-rewrite preface).
- scripts/ — version-lock guard and hostless evidence audit CLI.
- test/ — vitest suite incl. parity vs the harness baseline, fail-closed
  regression matrix, evidence audit, and version-lock guard.

## Host adaptation rules (feasibility report section 4)

These four rewrites are the premise of the plugin, not hidden behavior; the
full Chinese preface lives in assets/dsh-host-adaptation.md and the same
rules are enforced in code:

1. **Visible worker redefinition** — under the dsh host, a visible worker is
   a subagent dispatched through ctx.subagents with a recorded {SessionId,
   provider, declared model} evidence record. Dispatching without a record is
   silent fallback and is prohibited; an unformable record fails closed to
   manual_pending (dispatch_record_unavailable) and the run is disposed.
2. **Three-state evidence** — model/effort/worker identity is exactly one of
   authenticated / host-claimed / unknown. host-claimed is never written as
   authenticated (enforced by src/core/evidence.ts and re-checked by the
   evidence audit).
3. **approval_policy mapping** — the Codex-specific field is not replicated:
   the dsh approval preset is the interactive channel, and gated categories
   (destructive / external / credential / security / send /
   merge-push-release) without an explicit grant stop (gate_approval_required).
4. **No silent worker substitution** — "never substitute a native subagent for
   the execution worker" is restated under dsh as "never substitute an
   unrecorded subagent for the visible worker"; the intent (no silent
   degradation) is preserved.

## Installation

- Node >= 20, pnpm. Local plugin only: no npm publish (rc-period version
  lock; feasibility report decision 11).
- pnpm install --frozen-lockfile  (installs @deepseek-ai/dsh@0.1.0-rc.6 exact)
- pnpm build                      (tsc -> dist/)
- Install into the dsh host via a local cordis patch/loader pointing at this
  directory (host-specific; the plugin exports a cordis apply(ctx) entry).
  The host must mount sessions, commands, skills, tokenMeter, approval; the
  ctx.subagents seam is resolved defensively and unmounted hosts fail closed
  instead of crashing the plugin.

## Command surface

/swf route <key=value ...>      — pure routing/model-effort decision
/swf bind <task-id> <packet-json> — validate 8-field packet, verify Trio
                                    hashes (binding_mismatch stops, no write),
                                    persist swf-packet.json + worker evidence
/swf dispatch <task-id> <authorityRoot> [--deep-confirmed] [--max-tokens N]
                                — visible worker dispatch through ctx.subagents
/swf status <task-id> <authorityRoot> [--session <id>]
                                — packet digest, binding observation, evidence
                                  kinds, budget, session state
/swf accept <task-id> <authorityRoot>
                                — candidate -> human accept: Trio hash verify,
                                  evidence check, dsh approval, durable
                                  acceptance evidence
/swf audit <task-id> <authorityRoot>
                                — runnable evidence audit (Slice 3; see below)

## Model selection and effort contract

Use `capability.requestedModel` and `capability.requestedEffort` to select a
model independently of the Chief/execution role or Corleone persona. The
legacy `model` / `effort` aliases are accepted when they agree with the
requested fields; conflicting or empty explicit values fail closed. Execution
packets still declare `complexity` for the work classification and identity.
An explicit effort takes precedence over complexity.

Recommended starting selections for **new explicit packets** are:

| Workload | Model | Initial effort |
| --- | --- | --- |
| Most demanding reasoning | `gpt-6-astra` | `high` |
| Complex implementation or reasoning | `gpt-5.6-sol` | `high` |
| Balanced everyday work | `gpt-5.6-terra` | `medium` |
| Fast bounded work | `gpt-5.6-luna` | `medium` |

These selections are available to both Chief and executor roles. They are
routing recommendations, not measured quality, cost, or latency guarantees.
New Chief packets must declare the recommended effort explicitly before
freezing. Omitted Chief effort always retains legacy `max`, including existing
Sol/Terra packets with an explicit model. Execution packets selecting a modern
model while omitting effort use its initial effort above. Explicit OpenAI efforts are `low`, `medium`, `high`, `xhigh`, and `max`.
The adapter never substitutes `none`, `minimal`, or API `ultra` for Astra.

Model-unspecified execution packets retain
`opencode-go/deepseek-v4-flash` with effort from complexity; the DSH legacy
worker provider/model remains `dsh-sdk` / `deepseek-v4-flash`. A model-unspecified
Chief decision retains `gpt-5.6-sol` / `max`; an explicit Chief model without
effort also retains `max`. Resolving old packets never edits
their fields or migrates frozen packet digests. A new recommendation or persona
change cannot silently replace an existing model selection.

Bare OpenAI models resolve to model provider `openai`. `main/` and `p646e20/`
are Host routing prefixes: a Codex handoff retains the full identifier, while
an OpenAI API request receives only the bare model, such as `gpt-6-astra`.
DSH maps `openai` to its `subagent-dsh-sdk` worker transport; transport identity
and model provider are different fields. Explicit `codex` / `claude-code`
worker transports still require a model, and OpenAI models cannot use the
Claude transport.

Legacy explicit Chief `ultra` is a Host-only compatibility case. The routing
core requires separate authenticated Host evidence with an `evidenceRef` and
`supportedModelEfforts` containing `ultra` for the exact requested identifier;
packet-backed Host routing also requires the matching `packetDigest`. Astra
requires a Host-prefixed identifier for this case. A packet's own evidence,
a generic model-control flag, or a human override is insufficient. Unsupported
requests fail with guidance to use `max` or another supported effort. Child
requests and OpenAI API dispatch reject `ultra`.

### Host execution and fallback

The generic decision core prefers a supported native subagent for default
execution work, and a supported visible worker for Chief work. Chief routing
can admit a native route only when child delegation, a proper-subset envelope,
and the Host's requested model/effort controls permit it. An unavailable default
execution native route returns `manual_pending`; it does not silently change
the chosen topology. `visible_worker_required` always needs an authenticated
visible-worker capability and bound permissions/paths; no native or inline
substitute is allowed. Unavailable model control never triggers a cheaper-model
or higher-effort retry. A caller can explicitly choose and bind another
supported selection after assessing the workload.

The pinned DSH one-shot `SubagentStartRequest` does **not** expose effort or
child setup. For effort-bearing dispatch, the Host must implement the optional
`ctx.subagents.startWithModelSelection(provider, request, selection)` adapter
contract in `src/context.ts`, binding `{ provider, model, reasoningEffort }`
before the child's first request. A Host can use the SDK's
`installModelSelection` during child creation to implement this contract.
This plugin does not claim that the stock Host already implements it. Without
that adapter, dispatch stops with `model_effort_controls_unavailable` before
starting or reserving a worker; it never drops effort into an ignored option.
Legacy dispatch without a declared selection keeps its existing start path.

Bounded children retain a proper-subset permission/path envelope. Supply
`parentModel` and `parentEffort` for a child budget check. Effort ordering is
meaningful only within the same API model (Host aliases are equivalent).
Changing models requires an explicit `childModelAllowance` with `model`,
`maxEffort`, `reason`, and `provenance`; the child must stay within that effort
ceiling. A Luna `max` parent does not automatically authorize Astra `low`.
Codex non-spawn operations also require the frozen worker identity from the
original spawn, so continuation cannot select a new callsign.

### Evidence limits

- **Declared/requested:** packet model and effort, translated API model, and
  adapter arguments express intent. They are not actual execution evidence.
- **Host-claimed:** a DSH `{SessionId, provider, declared model}` dispatch record
  proves the Host reported a worker. Requested model/effort extras remain
  requested fields; the adapter seam does not authenticate actual execution.
- **Authenticated:** actual model and effort require authenticated Host evidence
  for the relevant operation and packet. A successful route decision, passing
  mock test, CLI exit code, or model's own statement cannot supply that proof.

The model matrix is covered by policy, Host-routing, handoff, and mock dispatch
tests. Live CLI smoke for all four models is a separate integration activity;
no all-model actual-execution result is asserted here. Older CLI configurations
may require `--ignore-user-config` and an explicit local proxy provider; those
invocation details alone do not authenticate which model ran. Vendored markdown
under `assets/` is regenerated separately from the stabilized source policies.

## Budget defaults (report decision 14)

- ≤ 2 parallel workers per host; ~100k tokens per task cap
  (TASK_TOKEN_BUDGET_DEFAULT); per-dispatch maxTokens defaults to 32k.
- deep tier (complexity max or explicit tier) requires an explicit
  confirmation (--deep-confirmed); without it the dispatch stops.
- Over-limit meter or over-cap reserve -> manual_pending (budget_exceeded /
  parallel_worker_cap_exceeded), with budget evidence recorded.

## Stop conditions

- Any planning-file hash mismatch -> stop (binding_mismatch); bind refuses to
  write, dispatch never starts, accept refuses before any human grant.
- Worker identity without a record -> manual_pending (dispatch_record_unavailable).
- Budget over limit -> manual_pending (budget_exceeded).
- Gated category without approval -> stop (gate_approval_required).

## Version lock (Slice 3)

The dsh anchor is pinned EXACTLY (package.json specifier + pnpm-lock.yaml
importers specifier/resolved version, checked together):

- pnpm check:version-lock   — guard script, exits non-zero on any mismatch.
- Regression tests in test/version-lock.test.ts cover a bumped pin, a range
  specifier, a bumped lockfile, and a foreign lockfile version.

Upgrade flow (rc-period weekly breaking risk, report section 6): change the
pin -> the guard FAILS (expected; do not bypass) -> run pnpm test (full suite)
+ pnpm build -> manual acceptance. The guard is the release gate: an upgrade
cannot land silently.

## Evidence audit (Slice 3)

Runnable check over planning/active/<task-id>/evidence/:

- three-state completeness (authenticated needs evidenceRef + flag; host-claimed
  needs a full {SessionId, provider, declared model});
- host-claimed is never written as authenticated (hard invariant);
- unknown is never marked authenticated;
- an unrecorded dispatch is rejected: a worker-kind record with state unknown
  must carry extra.failure or extra.note (a bare unknown worker record would
  hide a silent dispatch).

Run it as /swf audit <task-id> <authorityRoot>, or hostless after a build:

- pnpm build
- node scripts/audit-evidence.mjs <task-id> <authorityRoot>
  (exit 0 = clean, exit 1 = violations, fail-closed)

## Rollout verification checklist (上线验证清单)

This Codex environment has no real dsh host, so the flow below is proven
against mock ctx.subagents / ctx.approval; the real-host items are the
rollout gate before durable adoption.

1. **First real human accept on a real dsh session** — dispatch a bounded task
   in a real dsh host, complete it, and record one real human acceptance via
   the dsh approval channel (Trio hash verify -> evidence check -> approval ->
   durable acceptance evidence).
2. Real host smoke: plugin loads, /swf route/bind/status work on a real
   session; non-SWF sessions pass through with no interception and no writes.
3. Real dispatch evidence: ctx.subagents start records a {SessionId, provider,
   declared model} worker record (host-claimed) for dsh-sdk and, on explicit
   packet request, codex/claude-code providers.
4. Real budget behavior: tokenMeter reconciliation, parallel cap, deep-tier
   confirmation, and budget_exceeded -> manual_pending on the real host.
5. Evidence audit on real host data: /swf audit returns ok for a real task's
   evidence directory.

## Slice history

### Slice 0 — decision core port (no dsh dependency)

- src/core/constants.ts, binding.ts, routing.ts, evidence.ts, passthrough.ts,
  storeRead.ts — golden parity with harness/trio/core/routing.mjs.
- test/parity.test.ts compares the port against the harness baseline
  read-only; harness/trio remains byte-identical (verified by git diff).

### Slice 1 — plugin skeleton and trigger

- src/index.ts — cordis plugin entry (name + inject + apply(ctx)).
  conversationEvents/inputTriggers are client/UI-side services in dsh
  (packages/client/**); the plugin injects the host-side surface instead:
  sessions, commands, skills, tokenMeter, approval (seam note in
  src/context.ts and assets/dsh-host-adaptation.md).
- src/detect.ts — auto-detect trigger; non-SWF sessions pass through.
- src/commands.ts — /swf route|bind|status|accept.
- src/packet.ts — packet + evidence persistence.
- assets/ — vendored skills/templates byte-identical + adaptation preface.

### Slice 2 — worker dispatch and gates

- src/core/dispatch.ts — provider routing (default dsh-sdk + deepseek-v4-flash;
  codex/claude-code explicit-only), dispatch tier, budget cap decision,
  deep-tier confirmation, Trio gate registry classification.
- src/budget.ts + src/dispatch.ts — orchestration: packet -> Trio binding ->
  provider -> tier -> gate registry + dsh approval -> subagents availability ->
  budget cap -> ctx.subagents.start with mandatory {SessionId, provider,
  declared model} evidence (host-claimed); unformable records fail closed.
- /swf dispatch, /swf accept with Trio hash verification, /swf status with
  budget readout.

### Slice 3 — hardening and rollout

- Host adaptation rules (report section 4) documented in
  assets/dsh-host-adaptation.md and synced into this README.
- Version-lock guard: scripts/guard-version-lock.mjs + regression tests;
  upgrades fail closed.
- Evidence audit: src/evidenceAudit.ts + /swf audit + hostless CLI + tests.
- Fail-closed regression matrix: test/fail-closed-regression.test.ts covers
  every blocker path from Slices 0-3.
- Honest note: the first real human accept on a real dsh session is a rollout
  verification item (item 1 above), not provable in this environment.

