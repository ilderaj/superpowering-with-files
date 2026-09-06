---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled — the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round, then wait for the user's answers before the next round.

When the frontier fits the plan-mode question cards (`request_user_input`), use them: up to 3 questions per call, each with a short title, a single-sentence prompt, and 2-3 mutually exclusive options. Put your recommended option first and suffix its label with `(Recommended)`; the client adds a free-form "Other" option, so openness is preserved. Do not start a new card round until the previous one is answered.

Fall back to plain-text questions when the whole frontier does not fit the cards — more than 3 questions, a long-form or multi-paragraph question, or an option set that cannot be squeezed into 3 choices — or when `request_user_input` is not available. Format each fallback question like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Each round the user answers reshapes the tree — settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), look it up directly, or use bounded parallel delegation when beneficial and permitted by the Host and user. Do not ask the user for facts you can verify yourself. A running exploration is an unsettled prerequisite: only downstream questions wait for its result. Preserve any selected strict topology and exact frozen scopes. Honor decisions and existing authorization already given; ask only the material unresolved choices within this interview.

The interview is done when material decisions are settled and the user has the resulting plan and explicit assumptions. For an interview-only request, stop at that result. When implementation is already authorized, proceed within that scope; do not require a repeated confirmation of settled decisions. Host security controls and any unresolved human gates remain binding.
