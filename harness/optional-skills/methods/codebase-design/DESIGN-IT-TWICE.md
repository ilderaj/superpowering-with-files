# Design It Twice

Use when alternative interfaces materially improve the current decision or the user requests them. Develop alternatives directly; authorized subagents can help but are not required. This method grants no dispatch or implementation authority.

1. Frame the concrete problem: behavior to preserve, callers, scope, dependencies, and constraints. Use [DEEPENING.md](DEEPENING.md) if dependency categories affect test strategy.
2. Compare two meaningfully different interfaces for that problem. For each, describe usage, hidden complexity, dependency strategy, and tests at the public seam. Do not force alternatives for a trivial settled choice.
3. Evaluate depth, locality, compatibility, seam placement, and migration cost using [DESIGN-PRINCIPLES.md](DESIGN-PRINCIPLES.md) when vocabulary needs clarification.
4. Recommend a design with its trade-off. Resolve only material unanswered product or architecture decisions with the user; otherwise continue within the existing assignment.

For optional delegation, provide a bounded problem statement and the necessary source references. Model choice follows the available Host and task settings, not a skill-imposed model or effort. Do not make unsupported claims about actual model execution.
