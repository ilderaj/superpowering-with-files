---
name: show-me
description: Explain code, architecture, changes, or unfamiliar concepts visually when the user asks to see how something works, compare shapes, or get a beginner-friendly explanation. Not a UI implementation or general artifact-authoring workflow.
---

# Show Me

Answer the current question with the smallest representation that clarifies it. Match the user's language, audience and requested medium. This is an optional explanation method: preserve the current task's authority and execution scope.

## Ground the explanation

For a repository question, inspect the relevant implementation before drawing its relationships; keep paths, identifiers, ownership and ordering accurate. For external or changeable claims, consult suitable primary sources. Label proposals, analogies, inferred relationships and missing evidence where they appear. Do not make a diagram look like verified runtime behavior when only source or configuration was inspected.

Infer the audience from context. For a beginner or an ELI5 request, introduce the central idea in familiar words, use a concrete example or analogy where helpful, and connect it back to the real terms. State where the analogy stops matching. Reduce jargon without dropping conditions that change the answer; avoid a childish tone unless requested.

## Choose the view

Honor an explicit format. Otherwise use the question to choose:

| Question | Useful representation |
| --- | --- |
| A simple fact or one-step explanation | A short sentence; no obligatory artifact |
| Logic, order or algorithm | Pseudocode or a small call tree |
| Ownership, modules or UI composition | A shallow file or component tree |
| Interaction, states or data movement | A compact Mermaid diagram when the host renders it |
| What changes | A focused diff against inspected context; mark a proposed diff as illustrative |
| Alternatives with common criteria | A comparison table |
| Spatial layout, a picture explainer, or a dense visual concept | One focused HTML artifact |
| Changing inputs helps explain consequences | An interactive visual through an available host visualization capability |

These are options, not a checklist. Keep only relationships needed for the question. Show enough surrounding context to preserve meaning; if most of a block is new, a complete block may explain it better than a diff. Place a brief explanation and evidence links alongside the view.

## Deliver and check

For an HTML explanation, use an available host artifact/visualization capability when suitable, or create a self-contained local file in the task's artifact location. Prefer HTML/CSS/inline SVG without a new renderer dependency. Use readable labels, responsive layout and keyboard-operable controls if interactive. Reuse known product styles for product-specific explanations; otherwise use a restrained readable presentation.

Open or display through a capability the current host actually exposes. Do not assume a shell `open` command, a browser, slash-command argument expansion, or a particular plugin exists. If the preferred rendering capability is unavailable, provide a readable text equivalent and a usable link to any created file. Honor an explicit HTML request by still delivering the file when writing is within the authorized scope and supported by the environment.

Check labels, arrows, ordering and examples against the sources. If browser inspection is available for an HTML artifact, inspect the rendered result and any interaction used in the explanation. Report a rendering limitation if it was not inspected; file creation alone is not visible-delivery proof. Avoid adding a build pipeline to a small explanation.

An explanation authorizes no source-code change, publishing, deployment or extra planning surface. A diagram of a candidate is not acceptance evidence. End with the answer and its material limits, not a mandatory quiz or follow-up question.

## Attribution

SWF adaptation of HumanLayer's show-me, retaining its representation-selection approach under the bundled [MIT license](LICENSE). The beginner-audience approach is independently written with conceptual inspiration from eli5; no eli5 instruction text is bundled. Exact upstream revisions and scope are recorded in [provenance](PROVENANCE.json).
