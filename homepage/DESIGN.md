# Superpowering with Files — Homepage Design Contract (v2, "Paper & Ink")

Status: **active** (2026-08-09, v2). The v1 warm-editorial contract (serif
display, cream/coral fills, large radii, floating pill topbar) is fully
removed. Exact values live in [UX-TOKENS.md](UX-TOKENS.md) and
`src/theme.css`; this file is the directional contract only.

## Overview

This homepage should feel useful, calm, and inspectable: a near-neutral paper
canvas, ink type, hairlines instead of shadows, and one coral accent used
sparingly. The visual language is drawn from the restraint of
[opencodex.me/zh-cn](https://opencodex.me/zh-cn/) and
[cursor.com](https://cursor.com/), with interaction components aligned to the
[shadcn/ui](https://github.com/shadcn-ui/ui) semantic contract (ink primary
buttons, hairline cards, pills on CTAs/badges, crisp ink focus rings).

The page exists to make a governance harness tangible: dark terminal proof
surfaces show the workflow, and GitHub source stays the primary exit path —
not marketing chrome.

## Voice

- Lead with the concrete value: one shared workflow keeps agents on the same
  rails.
- Keep sentences short and specific.
- Prefer verbs such as govern, record, route, inspect, verify, and hand off.
- Make GitHub source the primary first-screen exit path. Workflow
  documentation is the secondary first-screen path.
- Avoid hype language, inflated claims, and vague productivity promises.

## Page Structure

1. **Topbar:** full-width 60px hairline bar with brand mark, section anchors,
   workflow link, and a primary `View source` CTA.
2. **Hero:** governance-harness kicker, direct sans headline, short lede,
   `View source` primary action, `Read workflow` secondary action.
3. **Proof surface:** one adjacent cluster combining proof points, a dark
   repo-native command terminal, and routing-by-complexity explanation.
4. **Why governance:** a compressed diagnosis of drift, invisible state, and
   risky finishes.
5. **How the system works:** shared policy, planning files, optional
   superpowers, and reconcile as one connected model.
6. **Repo proof:** durable files, workflow lanes, supported targets, and
   verification surfaces remain inspectable.
7. **Closing CTA:** install comes after source and workflow proof, not before
   it.

## Color Guidance

Use the near-neutral paper `#f7f7f4` as the page floor and ink `#1f1e1a` for
type and primary actions. Hairlines `#e3e2dd` separate surfaces; white cards
`#ffffff` carry raised content. Coral `#cc785c` is reserved for tiny accents —
the hero status dot, route badge, and hover emphasis — never for fills.
Dark `#171614` appears only on terminal/proof surfaces and the brand mark. Do
not introduce cool blue, purple, neon green, pure black canvases, or gradient
washes.

## Typography Guidance

All type is sans-first (v2 removed the serif display). Headlines use the sans
stack at 680 weight, tight `-0.03em` tracking, and `text-wrap: balance`. Body
copy stays 16-18px with generous line height. Labels and kickers may be
uppercase 12px with `0.08em` tracking, in muted ink — they are markers, not
accents. Mono is reserved for code and terminal surfaces.

## Layout Guidance

The page uses a compact tool rhythm rather than an editorial one: a sticky
full-width hairline topbar, hero split (copy left, proof mock right), sections
separated by 1px hairlines with 52px vertical padding, and a centered shell
`min(1180px, calc(100% - 40px))`. Cards are used where they carry real
content; nested card walls are avoided — inner groups are hairline rows or
`--background` cells.

## Components

### Topbar

A thin, full-width hairline band, not a floating pill. Brand mark is a dark
28px square with an 8px radius. It orients the user and keeps source and docs
one click away.

### Hero Buttons

Hero primary action is always `View source` (ink fill, pill). Hero secondary
action is `Read workflow` (white fill + hairline, pill). Install belongs later
on the page after the repo proof has earned it. Hover is a 150ms surface
shift — never a transform.

### Product Surface

The proof cluster is the visual anchor: a white bento card holding proof
points plus a dark terminal mock with flat coral/paper dots (no glow). The
routing strip below explains one shared policy, durable planning files, and
optional deeper reasoning.

### Repo Proof

The repo-native proof section stays inspectable and specific: task plans,
findings, progress, workflow lanes, verification surfaces, and supported
targets — the real artifacts and behaviors the project provides.

## SEO Guidance

Search metadata describes the project as a governance harness for local
coding-agent workflows, not a generic AI productivity site. Use stable
canonical URLs under `https://ilderaj.github.io/superpowering-with-files/`.
Social metadata points to a real `og-image.png` in `homepage/public/`.
`theme-color` is the paper token `#f7f7f4`.

## Do

- Use paper, ink, hairline, white cards, and coral only as a tiny accent.
- Keep source and workflow inspection ahead of installation.
- Explain the workflow in concrete file-based terms.
- Preserve responsive single-column collapse for narrow screens.
- Keep SEO metadata aligned with the visible page promise.

## Don't

- Do not reintroduce the v1 warm-editorial layer: serif display, cream/coral
  fills, 18-20px radii, floating pill topbar, or BMW M colors.
- Do not use gradient text, glass effects, glow, side-stripe borders, or
  icon-card grids.
- Do not add extra product claims that are not visible in the repository
  workflow.
- Do not make the page feel like a generic AI platform landing page.
