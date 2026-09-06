# Deepening

How to deepen a cluster of shallow modules safely, given its dependencies. Uses the vocabulary in [DESIGN-PRINCIPLES.md](DESIGN-PRINCIPLES.md) — **module**, **interface**, **seam**, **adapter**.

## Dependency categories

When assessing a candidate for deepening, classify its dependencies. The category determines how the deepened module is tested across its seam.

### 1. In-process

Pure computation, in-memory state, no I/O. Can often be consolidated and tested through the interface without an adapter, if ownership and public compatibility permit the change.

### 2. Local-substitutable

Dependencies that have local test stand-ins (PGLite for Postgres, in-memory filesystem). Consider consolidation if a stand-in faithfully exercises the relevant dependency behavior; retain real integration coverage for semantics it cannot represent. The deepened module is tested with the stand-in running in the test suite. The seam is internal; no port at the module's external interface.

### 3. Remote but owned (Ports & Adapters)

Your own services across a network boundary (microservices, internal APIs). Define a **port** (interface) at the seam. The deep module owns the logic; the transport is injected as an **adapter**. Tests use an in-memory adapter. Production uses an HTTP/gRPC/queue adapter.

Recommendation shape: *"Define a port at the seam, implement an HTTP adapter for production and an in-memory adapter for testing, so the logic sits in one deep module even though it's deployed across a network."*

### 4. True external (Mock)

Third-party services (Stripe, Twilio, etc.) you don't control. The deepened module takes the external dependency as an injected port; tests provide a mock adapter.

## Seam discipline

- **Justify each port.** Existing callers, real dependency variation, or a realistic test adapter can justify it; do not add speculative adapters to meet an arbitrary count.
- **Internal seams vs external seams.** A deep module can have internal seams (private to its implementation, used by its own tests) as well as the external seam at its interface. Don't expose internal seams through the interface just because tests use them.

## Testing strategy: preserve behavior and coverage

- Map existing tests to behaviors, edge cases, regressions, and failure modes before replacing any. Remove a test only when equivalent or stronger public-interface coverage is demonstrated and removal is within scope. Keep unique coverage; passing new happy-path tests alone does not justify deletion.
- Add the replacement coverage first, prove its sensitivity to the relevant failure, then consolidate while green. Preserve public compatibility or follow the explicitly approved migration contract.
- Write new tests at the deepened module's interface. The **interface is the test surface**.
- Tests assert on observable outcomes through the interface, not internal state.
- Tests should survive internal refactors — they describe behaviour, not implementation. If a test has to change when the implementation changes, it's testing past the interface.
