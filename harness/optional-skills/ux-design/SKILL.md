---
name: ux-design
description: "Design judgment and verification for user-facing visuals: screens, pages, dashboards, prototypes, demos, mockups, wireframes, and slide or document layout. Fixes the reader and task, requires observable design decisions and named anti-patterns, reuses bounded primitives, and verifies the rendered result; pairs with a renderer such as pen-design when the host exposes one. Not a renderer, a brand-asset source, an implementation approval, or a publishing step."
---

# UX Design

Apply this method when the work produces or changes something a person looks at: a screen, page, dashboard, prototype, demo, mockup, wireframe, or the visual layout of a deck or document. It supplies judgment and verification. It does not render, deploy, publish, or approve, and it keeps the current task's authority, scope, and human gates.

## Fix the intent before the artifact

Name the reader and the job before choosing a layout: who opens this, what they already know, what they must be able to do or conclude next. Reduce the artifact to one primary message and the content that supports it; a design serving two unrelated primary actions usually serves neither.

Use the user's own words for intent, audience, and content. Do not invent brand facts, product claims, prices, customer names, logos, or metrics to make a layout look complete. Mark placeholder copy as placeholder and keep it obviously provisional.

State the quality bar in the terms you will verify: "nothing is clipped or overlapping at any supported viewport", "every interactive state is reachable and visibly distinct", "the primary action is unmistakable on the first screen". A bar like "looks polished" cannot be checked and passes by default.

## Decide observably

Write design decisions as statements a reviewer could confirm or falsify by looking at the rendered result. "Image-first hero; body copy stays one column under about 65 characters" is checkable. "Clean and modern" is not.

Name the anti-patterns this artifact must avoid while the intent is fresh, drawn from real corrections rather than a generic taste list. Ones worth naming when they apply: equal-weight card grids that bury the primary action; body text stretched to the full window width; every section at the same height and rhythm; framework default styling left unmodified; gradients or shadows standing in for hierarchy; motion that delays the task instead of confirming it.

Prefer a small bounded primitive set - one spacing scale, one type scale, one accent, one card and button family - and reuse it. When the artifact repeats or the design is durable, keep its intent in [a design contract](DESIGN-CONTRACT.md) and the repeatable mechanics in the shared stylesheet or tokens.

## Build in two passes

First pass: make it work. Structure, real content, the required states (empty, loading, error), keyboard and readability basics, the data or copy the user actually provided.

Second pass: make it good. With the structure working, run a dedicated aesthetics pass and deliberately reopen constraints frozen in the first pass - default components, transitions, spacing rhythm, imagery, motion. Replacing a default component or transition with a custom one belongs here, as its own pass, not as spare minutes inside the first.

Each pass ends by looking at the rendered result ([rendered verification](RENDERED-VERIFICATION.md)), not by re-reading the source.

## Verify what was rendered

A design cannot be judged from source. Render or export the artifact at the size it will be seen, then inspect it: hierarchy, spacing and alignment, contrast, clipping, overflow, reachable states, and whether the primary action is obvious. For motion or interaction, inspect successive frames; a single end-state screenshot says nothing about a transition. Record which viewport, page, and state were inspected, and what stayed unverified.

`rendered` is not `inspected`, and neither is `accepted` or `delivered`. Keep the states separate and claim only what was observed.

## Place corrections where they hold

When the user or a review corrects the design, encode the correction where it keeps working: judgment in the design prose, repeatable mechanics in the shared primitives, a mechanical failure in a deterministic check. Do not fix a systemic problem by hand-tuning one output that the next generation will recreate. See [the correction loop](CORRECTION-LOOP.md).

## Pair with a renderer

Use the host's available capability for the visual artifact. When the host exposes `pen-design`, follow its own contract for invocation, export, and iteration: it owns prompt passing, the export step, and showing the result. Keep this method's decisions and anti-patterns as review and correction criteria; they do not override the renderer's own prompt contract. Otherwise use a self-contained HTML artifact for one-off pages, or the host's document and slide capability for those formats. This method governs intent, decisions, and verification; the renderer governs its mechanics.

A rendered image, a design file, or an exported PNG is a proposal until a user or authorized reviewer accepts it. It is not implementation, deployment, or delivery.

## Boundaries

Design work authorizes no publishing, deployment, sharing, or asset purchase, and no claim about customers, performance, or brand. Reuse the project's existing brand assets and tokens when they exist; when they do not, use restrained provisional styling instead of inventing a brand. Stop at the evidence you have: an unreviewed draft described as final is worse than an honest draft.
