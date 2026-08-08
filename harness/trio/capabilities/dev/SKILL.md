---
name: dev
description: Development quality contract for Trio v2 implementation work.
---

# Development Capability

This capability applies after the Trio entry policy selects development work. It governs quality behavior only. The Trio remains the durable task authority, while the Host owns worker and subtask lifecycle, continuation, requested and actual model evidence, permissions, and external or human gates.

## Quality Loop

Inspect the current code or artifact first, along with constraints, ownership, and the baseline, before changing anything. State the goal, constraints, success criteria, and relevant risks. Clarify or design only when material uncertainty, unclear architecture, a non-obvious root cause, or high-risk judgment makes it necessary. When judgment is material, compare bounded alternatives and record the selected trade-off.

Use the highest feasible public seam. Keep the rule red before green: write one behavior at a time, observe a real RED before production text or code, write the smallest GREEN change, and refactor only while GREEN. Keep one vertical slice in flight; it must be independently verifiable. Reject implementation-coupled assertions, tautological expectations, bulk horizontal test batches, and mock-only proof.

## Planning Contract

Plan the smallest independently verifiable slice with exact files, dependencies, non-goals, proof command, evidence sink, stop conditions, and return contract. Every step must have a concrete outcome; use no placeholders. Keep durable task state in the Trio and do not create another authority or task-state surface.

Quick work stays lightweight and does not acquire mandatory fan-out, worktree, design, or review ceremony. Tracked work restores or creates only the three planning files under the bound active task. Deep reasoning is a current-round decision for material uncertainty or high-risk judgment; it is not a durable task type and does not create another authority.

## Debugging Contract

Start with a fast, deterministic, red-capable feedback loop. Reproduce exactly, minimize the case, and gather evidence across the relevant public seams. Trace the bad value backward to its root cause. State one falsifiable hypothesis, change one variable at a time, and test it. Fix the source and keep a regression test. After three failed attempts, stop and question the plan or architecture instead of adding another patch.

## Review Contract

Review a fixed work product on independent Standards and Spec axes. Check the implementation against repository reality and the bound requirements before changing it. Verify every finding technically; important findings block acceptance until addressed. A review report is evidence to evaluate, not an automatic implementation command.

## Verification Contract

Before completion, commit, or phase advance, run fresh verification completely. Read command exits, test counts, and failure details; preserve the evidence before making a claim. A worker report, previous run, partial run, or adjacent green test is not proof. Requested model and effort express intent; without authenticated Host evidence, actual model and effort remain unknown.

## Isolation and Closure

Detect existing isolation and ownership before creating a workspace. Prefer native Host isolation, avoid concurrent writes to shared mutable paths, and verify a clean baseline. Clean only a workspace whose provenance authorizes cleanup. Branch closure verifies first, preserves human gates, never auto-merges, pushes, discards, releases, deploys, publishes, or sends, and never removes a Host-owned workspace.

## Return Contract

Return the changed paths, exact commands and exits, test counts, evidence, requested and actual model or effort observations, unresolved risks, limitations, and an explicit `candidate_done` or `blocked` status. Worker completion is only a candidate; Chief performs acceptance and durable Trio writeback.
