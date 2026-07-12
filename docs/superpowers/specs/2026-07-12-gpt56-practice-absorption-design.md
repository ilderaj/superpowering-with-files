# GPT-5.6 Practice Absorption Design

**Active task path:** `planning/active/chief-worker-operating-model-20260710/`

## Purpose

Absorb the transferable GPT-5.6 operating practices into SWF without treating
Responses API features as Codex-host controls or weakening the released
Chief/worker safety model.

## Scope and non-goals

This is a policy, packet-contract, operator-guidance, and evaluator change.
It changes no API client, runtime dispatch, stored cache, tool executor,
subagent runner, model default, user-global configuration, or lifecycle
authority.

The following remain out of scope until a trusted host adapter proves them:

- `reasoning.context`, prompt-cache controls, PTC, Responses API multi-agent,
  Pro mode, and `max` as Codex-native controls;
- an evaluation database, automatic tuner, runner, scheduler, registry, or
  any second task-memory surface;
- automatic model upgrades/downgrades based on token counts alone.

## Design

### 1. Stable policy, dynamic packet

The always-on policy keeps only durable rules: task classification, authority,
autonomy and approval boundaries, model-admission safety, and required proof.
It must not repeat those rules in multiple sections merely to emphasize them.

An Assignment Packet is explicitly split by semantics, not into a new data
structure:

- **stable governance prefix:** authority model, autonomy/approval policy,
  capability and child-envelope constraints, and required response contract;
- **dynamic execution delta:** exact trio paths and hashes, current slice,
  allowed surfaces, current proof target/evidence sink, deadline, and stop
  condition.

The packet remains derived and ephemeral. Trio state and tool results are
dynamic delta, never cacheable durable policy. This applies the prompt-caching
principle without claiming any control over the host cache.

### 2. Evidence-based model and effort adjustment

The existing capability-first model admission remains unchanged:

- always-on policy selects a capability profile, not a mutable SKU/effort
  mapping;
- Luna/high requires the existing mechanical-ready evidence;
- Sol still requires the recorded admission and is never ambient inheritance.

The new rule applies only when changing the baseline, lowering effort, or
claiming a different tier is better: compare the incumbent configuration with
one proposed configuration on a bounded representative task set. Record task
success, required-evidence completeness, rework/escalations, total tokens,
latency, and cost when a trustworthy cost source exists. Adopt the proposed
configuration only if it preserves the proof/quality bar and its trade-off is
explicitly preferable. `token-audit` stays an observability input, not a bill
or native-dispatch proof.

The current `gpt-5.6-terra/high` balanced configuration may be named only in
operator experiment guidance as an incumbent benchmark. It remains subject to
host availability and explicit dispatch evidence; it is not an always-on rule
or a claim that the host applied the requested SKU.

### 3. Compact autonomy and response contract

`Scope Autonomy And Human Gates` is the only canonical source for the three
action classes, authorization, human gates, and compact status priority. The
Codex override must refer to that shared rule rather than repeating it.

This canonical section is a small top-level policy section. The shared
always-on profile includes that section only, not the broader `Core Behavioral
Guidelines` or its unrelated completion advice. The change therefore applies
consistently to non-thin rendered targets; Copilot's thin profile remains
unchanged.

1. answer/explain/review/diagnose/plan: inspect and report, no implementation;
2. change/build/fix: perform in-scope local changes and non-destructive proof;
3. external, destructive, costly, security-sensitive, data-loss, or materially
   scope-expanding actions: stop for confirmation.

Short user-facing status should preserve conclusion, required evidence,
material caveat, and next action before trimming secondary detail. This is an
output priority rule, not an API `text.verbosity` control.

### 4. Proof and compatibility

The primary proof is evaluator coverage over the canonical policy, rendered
Codex entry, every edited ChiefOps packet surface, and absence of unsupported
native claims. The backstop is focused test execution, `git diff --check`, and
`doctor --check-only` render-budget health. Existing visible-worker, trio,
model-admission, approval, and child-return rules must remain present.

## Acceptance criteria

1. Canonical policy and rendered Codex entry state the capability-first
   evaluation gate without creating an always-on SKU/effort default or relaxing
   Luna/Sol controls.
2. ChiefOps packet guidance labels stable governance versus dynamic execution
   data without adding a schema, persistent object, or cache claim.
3. Operator documentation gives a manual representative-workload procedure and
   rejects token totals alone as a tier-selection decision.
4. Tests prove the canonical source matches the tracked rendered `AGENTS.md`,
   Cursor and Claude receive the compact shared section, Copilot's thin entry
   does not, existing controls remain, and no unsupported API/native-control
   wording is introduced.

## User authorization

The user accepted the minimal conservative approach and explicitly authorized
design and implementation on 2026-07-12. The reviewed implementation plan and
read-only reviewer gate still control execution detail.
