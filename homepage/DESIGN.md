---
version: alpha
name: Superpowering with Files Homepage
basedOn: Claude
description: A restrained Claude-inspired landing page for a developer workflow kit. The page uses a warm cream canvas, coral GitHub CTAs, serif editorial display type, and a dark product-proof surface to explain how planning files make agent reasoning durable.

colors:
  primary: "#cc785c"
  primary-active: "#a9583e"
  ink: "#141413"
  body: "#3d3d3a"
  muted: "#6c6a64"
  hairline: "#e6dfd8"
  canvas: "#faf9f5"
  canvas-warm: "#f5f0e7"
  surface: "#f8f4ed"
  surface-card: "#efe9de"
  surface-dark: "#181715"
  surface-dark-soft: "#252320"
  on-dark: "#faf9f5"
  on-dark-muted: "#c7c0b5"

typography:
  display:
    fontFamily: "Copernicus, Tiempos Headline, Georgia, serif"
    fontWeight: 400
    lineHeight: 0.94
    letterSpacing: -0.055em
  heading:
    fontFamily: "Copernicus, Tiempos Headline, Georgia, serif"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: -0.035em
  body:
    fontFamily: "StyreneB, Inter, Helvetica Neue, Arial, sans-serif"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "StyreneB, Inter, Helvetica Neue, Arial, sans-serif"
    fontWeight: 720
    letterSpacing: 0.04em
  mono:
    fontFamily: "JetBrains Mono, SFMono-Regular, Consolas, monospace"

rounded:
  pill: 9999px
  card: 22px
  marquee: 28px

spacing:
  xs: 10px
  sm: 14px
  md: 20px
  lg: 34px
  xl: 56px
  hero: 84px

components:
  topbar:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    height: 76px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.pill}"
    padding: 11px 16px
  button-secondary:
    backgroundColor: "rgba(250,249,245,0.74)"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: 11px 16px
  product-surface:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-dark}"
    rounded: "{rounded.marquee}"
    borderColor: "#34312c"
  comparison-item:
    backgroundColor: "rgba(248,244,237,0.78)"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
  link-row:
    backgroundColor: transparent
    textColor: "{colors.ink}"
---

## Overview

This homepage adapts the Claude marketing language for an open-source developer workflow project. The page should feel useful, calm, and inspectable: warm editorial type explains the idea, a dark product surface makes the hybrid workflow tangible, and coral CTAs point directly to GitHub.

The goal is not to mimic Claude.com wholesale. The page borrows the Claude palette and typographic posture, then narrows it for a repo-native tool. Copy stays concise and friendly. Visual energy comes from contrast between cream content areas and the dark proof module, not from animation, gradients, or generic AI decorations.

## Voice

- Lead with the concrete value: agents keep state in files they can reopen.
- Keep sentences short and specific.
- Prefer verbs such as reason, record, resume, inspect, and hand off.
- Make GitHub the primary exit path. Documentation is secondary.
- Avoid hype language, inflated claims, and vague productivity promises.

## Page Structure

1. **Topbar:** brand mark, Workflow link, GitHub link.
2. **Hero:** kicker, direct headline, short lede, Star the repo CTA, Read the workflow secondary action.
3. **Proof surface:** Files plus Superpowers becomes durable state.
4. **Comparison strip:** Reason, Record, Resume.
5. **Routing model:** simple work stays simple, depth is reserved for tasks that need it.
6. **Repo-native proof:** task plan, findings, and progress remain inspectable.
7. **Closing CTA:** if agents lose context, give them files.

## Color Guidance

Use the warm cream canvas as the page floor. Coral is reserved for primary CTA emphasis and small brand highlights. Dark surfaces should appear only when demonstrating product proof or closing contrast. Do not introduce cool blue, purple, neon green, pure black, or pure white.

Current CSS uses OKLCH equivalents for the key tokens:

- Canvas: `oklch(0.985 0.008 90)`
- Surface card: `oklch(0.94 0.018 82)`
- Dark surface: `oklch(0.18 0.012 76)`
- Coral accent: `oklch(0.62 0.12 35)`
- Deep coral: `oklch(0.49 0.13 34)`

## Typography Guidance

Display headlines use the serif stack and should stay light in weight, large in scale, and tightly tracked. Body text uses the sans stack and should prioritize readability over density. Labels may be uppercase, but only as small navigation or section markers.

Do not use all-caps display headlines. Do not bold the serif headline. Do not switch the primary hero voice to a geometric sans.

## Layout Guidance

The page uses a compact editorial rhythm rather than a conventional SaaS feature grid. Keep the hero split, with copy on the left and the dark proof module on the right. Below the hero, let sections breathe with hairline dividers and restrained spacing.

Cards should be used sparingly. The comparison strip is the only repeated card-like row, and it stays text-forward without icons. Avoid nested cards.

## Components

### Topbar

A thin, calm navigation band with a circular brand mark and two pill links. The topbar should not become a large marketing nav. It exists to orient the user and keep GitHub one click away.

### Hero Buttons

Primary action is always a coral GitHub CTA. Secondary action is a cream pill link to the workflow documentation. Both should feel tactile but quiet.

### Product Surface

The dark proof module is the visual anchor. It should explain the idea at a glance: files plus deeper reasoning produces durable state. It uses warm off-dark tones, not pure black.

### Comparison Strip

Three short statements: Reason, Record, Resume. Each item should be readable as a standalone promise and should avoid icons or decorative charts.

### Repo Proof

The repo-native proof section should stay inspectable and specific. Mention task plans, findings, and progress because these are the durable artifacts the project actually provides.

## SEO Guidance

Search metadata should describe the project as a Claude Code workflow kit, not a generic AI productivity site. Use stable canonical URLs under `https://ilderaj.github.io/superpowering-with-files/`. Social metadata must point to a real `og-image.png` asset in `homepage/public/`.

## Do

- Use warm cream, coral, and off-dark surfaces.
- Keep GitHub starring as the primary conversion path.
- Explain the hybrid workflow in concrete file-based terms.
- Preserve responsive single-column collapse for narrow screens.
- Keep SEO metadata aligned with the visible page promise.

## Don't

- Do not reintroduce BMW M colors, black canvas, automotive language, or uppercase motorsport typography.
- Do not use gradient text, glass effects, side-stripe borders, hero metrics, or icon-card grids.
- Do not add extra product claims that are not visible in the repository workflow.
- Do not make the page feel like a general AI platform landing page.
