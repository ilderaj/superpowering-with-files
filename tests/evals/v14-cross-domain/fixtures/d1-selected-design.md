# Synthetic selected design

Business goal: let a user inspect existing records through a read-only list.

Frozen scope:

- States: loading, empty, error, normal.
- Selecting a row shows its existing detail.
- The backend and its current data contract remain unchanged.

Non-goals: export, login, payment, launch, backend changes, or invented API fields.

The handoff must include the selected design reference, state triggers and visible results, current interface fields, acceptance examples, and pending fields with an owner. A missing API field pauses only the dependent part; it does not invite the implementer to make a business decision.
