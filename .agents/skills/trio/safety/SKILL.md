---
name: safety
description: Safety decision contract for Trio v2 destructive, security-sensitive, and external operations.
---

# Safety Capability

This capability makes recommendations only: `deny`, `ask`, or `allow`. It owns no executor, approval lifecycle, Host lifecycle, runtime state, receipt, registry, profile, companion, or reconciliation.

## Decision Precedence

Credentials, secrets, certificates, payment data, and production configuration are always deny.

Any invalid or ambiguous target, any path outside authority, any cross-workspace write or delete, and any credentials, secrets, certificates, payment data, or production configuration is deny.

External write, send, merge, release, deploy, or publish is ask with an explicit Host capability observation and a human gate.

Local destructive, delete, cleanup, reset, chmod, chown, or broad rewrite is ask.

Only an authority-contained fixture-local verification with mutates=false and externalEffect=none can be allow.

The first applicable decision wins. Evidence cannot make a denied target allowable, and an allow recommendation never covers a mutation or an external effect.

## Evidence and Human Gates

A destructive ask requires risk assessment, checkpoint reference, rollback steps, and human confirmation as evidence.

Never convert an ask to allow because the evidence exists. Evidence explains risk and recovery; it is not permission.

External write, send, merge, release, deploy, publish, or deploy remains gated. A Host observation can show capability, but it cannot replace the applicable human gate.

## Isolation and Worktree

Worktree and isolation evidence must be truthful and Host-aware.

Absent or unverified isolation keeps risk gated. A path check is not proof of ownership, and a worker claim is not proof of Host control.

Never clean a Host-owned worktree by inference. Cleanup requires authenticated ownership and an explicit applicable gate.

## Authority and Recovery

The Trio is the sole durable task authority.

A checkpoint is recovery evidence only; it is never approval, permission, a receipt, or a second authority.

Checkpoint and rollback references describe how to recover or stop safely. They do not authorize a destructive operation, change task lifecycle, or report completion.

Do not absorb safe-bypass-flow remote push, merge, or cleanup automation. External and lifecycle actions remain Host-owned and human-gated.

## Non-Goals

No executor, approval lifecycle, Host lifecycle, receipt, registry, profile, companion, reconciliation, second authority, checkpoint tool, worktree command, credential reader, or external connector is owned here.

This capability does not read or log credentials, create state, issue approvals, mutate the Trio, run commands, or infer permission from a fixture, checkpoint, risk record, or rollback plan.

## Return Contract

Return one bounded recommendation with the decision, target scope, reason, required evidence, blocker, and resume condition. Deny and ask never expose executed, approved, released, or sent states.

An allow recommendation is limited to authority-contained fixture-local verification with no mutation and `externalEffect=none`. A missing, ambiguous, stale, or unauthenticated fact remains gated.
