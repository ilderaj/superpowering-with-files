# Codex Hook Allowlist Design

> **Companion to** `planning/active/codex-stop-hook-json-analysis/` — the task-scoped planning files remain the authoritative record for lifecycle, findings, and verification status.

## Summary

Harness should stop treating Codex hook support as an all-or-nothing target-level capability and instead adopt an event-level verified allowlist. For Codex, Harness should keep only the hook events whose output schema and fallback branches have been validated against Codex, and it should refuse to project all others by default. Under the current evidence, that means keeping `SessionStart` and `UserPromptSubmit` context-injection hooks, disabling the `planning-with-files` `Stop` hook, and treating safety or future lifecycle hooks as opt-in only after event-specific verification.

## Problem

Today Harness models Codex hook support too broadly.

- `docs/install/codex.md` and `docs/compatibility/hooks.md` describe Codex hooks as supported when `codex_hooks = true`.
- `harness/installer/lib/hook-projection.mjs` projects `SessionStart`, `UserPromptSubmit`, and `Stop` for the `planning-with-files` Codex adapter.
- `harness/core/hooks/planning-with-files/codex-hooks.json` generates handlers for all three events.
- `harness/core/hooks/planning-with-files/scripts/task-scoped-hook.sh` emits the same `hookSpecificOutput.additionalContext` payload shape for every non-empty Codex context.

That model is too coarse. Codex does support hooks, but support is event-specific because each event has a different input and output contract. The current `Stop` adapter proves the gap:

- Codex `Stop` output does not accept `hookSpecificOutput.additionalContext`.
- Harness currently emits exactly that payload for Codex `stop`.
- Codex therefore reports `hook returned invalid stop hook JSON output`.

The result is a governance bug: Harness advertises Codex planning hooks as supported at the target level, while at least one projected event is known to be incompatible with the official Codex output schema.

## Goals

- Replace target-level Codex hook assumptions with event-level verification.
- Prevent Harness from projecting known-incompatible Codex hook events.
- Preserve working Codex hook functionality where compatibility is already demonstrated.
- Give future Codex hook additions a stricter admission rule than “Codex supports hooks.”
- Keep the change in Harness-owned projection and compatibility metadata rather than in upstream sources.

## Non-Goals

- Rewriting Codex hook semantics.
- Disabling every Harness hook for Codex regardless of compatibility.
- Changing other targets unless their own compatibility claims need the same tightening later.
- Designing the implementation patch in detail; this spec defines policy and expected outcomes.

## Evidence

### 1. Live user-global configuration is already projecting the incompatible event

The current user-global Codex config at `~/.codex/hooks.json` contains a Harness-managed `Stop` entry that calls `~/.codex/hooks/task-scoped-hook.sh codex stop`.

### 2. Harness deliberately projects `Stop` for Codex planning hooks

`harness/installer/lib/hook-projection.mjs` currently maps Codex planning hooks to:

```js
codex: ['SessionStart', 'UserPromptSubmit', 'Stop']
```

and `harness/core/hooks/planning-with-files/codex-hooks.json` contains all three handlers.

### 3. The live stop script emits the wrong shape for Codex `Stop`

The current `task-scoped-hook.sh` uses one Codex output form for all non-empty contexts:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": "..."
  }
}
```

That is valid for context-injecting events such as `SessionStart` and `UserPromptSubmit`, but not for Codex `Stop`.

### 4. Multi-active-task fallback is also not event-safe

When multiple active tasks exist, the script emits the raw incoming event string through the common helper. That can produce `stop` or `user-prompt-submit` rather than canonical Codex event names such as `Stop` or `UserPromptSubmit`. This means the current adapter is not only schema-incompatible for `Stop`; it also lacks a robust event-normalization rule in fallback paths.

## Options Considered

### Option A: Disable all Harness hooks for Codex

Pros:

- immediate safety,
- simplest policy to explain,
- no need for event-by-event compatibility tracking.

Cons:

- throws away known-useful context injection,
- over-corrects a specific adapter failure into a platform-wide ban,
- weakens Codex support more than the evidence requires.

### Option B: Keep target-level support, but remove only the known-broken `Stop` event

Pros:

- fixes the current incident,
- keeps most existing Codex behavior,
- small policy delta.

Cons:

- still leaves the governance model too loose,
- future incompatible Codex events can be reintroduced by mistake,
- does not explain how to admit `PreToolUse`, `PostToolUse`, `PermissionRequest`, or future events.

### Option C: Move Codex to an event-level verified allowlist

Pros:

- fixes the current `Stop` issue,
- establishes a durable policy for future Codex hook additions,
- preserves compatible events while blocking speculative ones,
- aligns support claims with actual schema validation.

Cons:

- requires compatibility docs and projection logic to become more explicit,
- requires a small amount of ongoing maintenance for the allowlist.

## Recommendation

Adopt Option C.

Harness should treat Codex hook support as an event-level allowlist, not a target-level blanket capability. The allowlist should be conservative by default: no Codex hook event should be projected unless that exact event has been validated against Codex input/output contracts, including fallback and error branches.

Under the current evidence, the Codex matrix should be:

- Keep: `superpowers` `SessionStart`
- Keep: `planning-with-files` `SessionStart`
- Keep: `planning-with-files` `UserPromptSubmit`
- Disable: `planning-with-files` `Stop`
- Conditional only after validation: safety `PreToolUse`
- Do not add by default: `PermissionRequest`, `PostToolUse`, or other Codex events without event-specific verification

## Detailed Design

### 1. Policy model

The governing rule should be:

> Codex hooks use a verified-event allowlist. Harness must not project a hook to Codex unless that event's output contract and fallback branches have been validated against Codex.

This policy is stricter than “Codex supports hooks,” because it recognizes that support differs by event schema.

### 2. Compatibility metadata

Compatibility docs should distinguish between:

- platform support for a hook system,
- verified support for a specific event/adapter pair.

For Codex, documentation should stop presenting the `planning-with-files` task-scoped hook as generically supported without qualification. Instead, it should describe which events are currently verified and which are disabled or conditional.

### 3. Projection behavior

Harness-owned projection logic should only materialize Codex hook entries for verified events.

For the current planning adapter, that means:

- retain `SessionStart`,
- retain `UserPromptSubmit`,
- omit `Stop` from the generated Codex hook config.

This omission should happen at the projection/config layer, not by keeping a broken runtime script and asking users not to trigger it.

### 4. Runtime adapter requirements

Any Codex event admitted to the allowlist must meet two requirements:

1. Its success-path payload matches the official Codex schema for that event.
2. Its fallback branches also preserve the same event naming and schema guarantees.

This second rule exists because the current adapter already demonstrates that a fallback path can drift from canonical event names.

### 5. Safety hooks and future events

Safety or lifecycle events beyond the current allowlist should remain conditional until they are validated individually.

This means a future Codex event is admitted only after:

- its official input/output contract is identified,
- Harness’s emitted JSON is verified against that contract,
- fallback, empty-output, and multi-task branches are checked,
- docs and tests are updated to reflect the verified state.

## Acceptance Criteria

- Harness policy describes Codex hooks as an event-level allowlist rather than a blanket target-level capability.
- Codex documentation clearly separates retained, disabled, and conditional hook events.
- The `planning-with-files` Codex projection no longer includes `Stop`.
- The retained Codex events remain `SessionStart` and `UserPromptSubmit` for planning, plus the superpowers `SessionStart` wrapper.
- Future Codex hook additions require event-specific schema verification before projection.

## Review Notes

- This design intentionally avoids a full Codex hook ban because the current evidence supports keeping some context-injection events.
- It also intentionally avoids a “remove `Stop` and move on” patch-only mindset, because the real governance issue is the lack of event-level admission control.
- If later validation proves a currently retained event is also incompatible in some branch, the allowlist should shrink again rather than trying to preserve a broader Codex hook surface by assumption.