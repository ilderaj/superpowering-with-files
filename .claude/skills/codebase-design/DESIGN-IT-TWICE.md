# Design It Twice

## Harness Matt design-it-twice dispatch patch

When the user wants alternative interfaces for a chosen deepening candidate, first select the declared dispatch mode: `prohibited`, `worker_discretion`, or `encouraged`. Use main-agent alternatives when dispatch is prohibited; child agents are optional and mechanically narrower than the parent authority. Based on "Design It Twice" (Ousterhout) — your first idea is unlikely to be the best.

Uses the vocabulary in [SKILL.md](SKILL.md) — **module**, **interface**, **seam**, **adapter**, **leverage**.

## Process

### 1. Frame the problem space

Before spawning sub-agents, write a user-facing explanation of the problem space for the chosen candidate:

- The constraints any new interface would need to satisfy
- The dependencies it would rely on, and which category they fall into (see [DEEPENING.md](DEEPENING.md))
- A rough illustrative code sketch to ground the constraints — not a proposal, just a way to make the constraints concrete

Show this to the user, then immediately proceed to Step 2. The user reads and thinks while the sub-agents work in parallel.

### 2. Produce distinct alternatives

Produce at least two radically different interfaces. If child dispatch is authorized, every child receives a bounded brief plus explicit model and thinking values; otherwise generate the alternatives sequentially in the main session. Do not forward parent chat history.

For each alternative, report the interface, usage, hidden implementation, dependency strategy, and trade-offs.

### 3. Present and compare

Present designs sequentially so the user can absorb each one, then compare them in prose. Contrast by **depth** (leverage at the interface), **locality** (where change concentrates), and **seam placement**.

After comparing, give your own recommendation: which design you think is strongest and why. If elements from different designs would combine well, propose a hybrid. Be opinionated — the user wants a strong read, not a menu.
