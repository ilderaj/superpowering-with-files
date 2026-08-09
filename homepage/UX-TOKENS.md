# WebApp UX Tokens & Component Standard — "Paper & Ink" (v2)

Status: **active standard** (2026-08-09, v2) — the durable visual contract for
the Superpowering with Files homepage (`homepage/`). The single source of truth
for values is `src/theme.css`; this file mirrors it for review and pins the
component behavior. Consumed by `src/theme.css` + `src/styles.css`; mirrored as
Pencil design files under `designs/`.

## Design Direction

The page follows the restraint of [opencodex.me/zh-cn](https://opencodex.me/zh-cn/)
and [cursor.com](https://cursor.com/), with interaction components aligned to
[shadcn/ui](https://ui.shadcn.com/) semantics. The v1 warm-editorial contract
(serif display, cream/coral fills, large radii, pill topbar) is fully removed.

Shared restraint checklist (from the 2026-08-09 reference audit):

1. Flat surfaces; separation via 1px hairlines, never gradients or glow.
2. One accent (coral `#cc785c`), used sparingly — status dot, badge accents,
   hover emphasis. It never fills large surfaces.
3. Ink (`#1f1e1a`) is the primary button fill and focus ring, cursor-style.
4. Small radii on controls (6-12px); pills only on CTAs, badges, chips.
5. Quiet hover states: surface/background shift only, 150ms, no transforms.
6. Crisp ink-grade `:focus-visible` rings; never `:focus`-only styling.
7. Mono for code only; muted text via `--muted-foreground`, never a second
   color. Shadows are a whisper or absent; depth comes from hairlines.

## Token Contract (shadcn/ui-aligned)

`src/theme.css` defines shadcn/ui semantic token names so a future `shadcn
init` reuses the variables unchanged:

| Token | Value | Notes |
|---|---|---|
| `--background` | `#f7f7f4` | near-neutral warm paper (cursor canvas) |
| `--foreground` | `#1f1e1a` | ink |
| `--card` / `--popover` | `#ffffff` | white raised surfaces |
| `--card-foreground` | `#1f1e1a` | — |
| `--primary` | `#1f1e1a` | ink button (cursor primary) |
| `--primary-foreground` | `#f7f7f4` | paper on ink |
| `--secondary` / `--muted` | `#efeeea` | quiet surface |
| `--secondary-foreground` | `#1f1e1a` | — |
| `--muted-foreground` | `#6e6c65` | body/muted text |
| `--accent` | `#cc785c` | brand coral, accents only |
| `--accent-foreground` | `#a9583e` | coral-strong text |
| `--destructive` | `#a9583e` | — |
| `--border` | `#e3e2dd` | ink at ~12% hairline |
| `--input` | `#d8d7d1` | stronger hairline for inputs |
| `--ring` | `#1f1e1a` | ink focus ring |
| `--radius` | `0.5rem` | shadcn base (8px) |

Brand aliases (page surfaces): `--ink #1f1e1a`, `--paper #f7f7f4`,
`--surface #efeeea`, `--surface-card #e6e5e0`, `--surface-dark #171614`
(terminal/proof), `--surface-dark-soft #242320`, `--on-dark #f7f7f4`,
`--on-dark-muted #a8a69e`, `--line #e3e2dd`, `--accent-strong #a9583e`.

## Scales

Radius (shadcn-derived): `sm=0.375rem` (6px, inline code/chips) ·
`md=0.5rem` (8px, controls/inner cells) · `lg=0.625rem` (10px, terminal,
nested surfaces) · `xl=0.75rem` (12px, cards, hero mock) · `pill=9999px`
(buttons/badges/lanes).

Spacing: 4px grid — `--space-1..16` (4/8/12/16/24/32/48/64px).

Type (sans-first; serif removed in v2): body `StyreneB, Inter, 'Helvetica
Neue', Arial, sans-serif`; mono `'JetBrains Mono', 'SFMono-Regular', Consolas,
monospace` (code only). Scale: xs 0.75rem · sm 0.875rem · base 1rem · lg
1.125rem · xl 1.25rem. Headlines use the sans stack at 680 weight with
`-0.03em` tracking; the font stacks are pinned by tests.

Elevation: `--shadow-xs 0 1px 2px rgba(31,30,26,0.04)` (hover lift) ·
`--shadow-sm 0 1px 2px rgba(31,30,26,0.05), 0 8px 24px -12px rgba(31,30,26,0.08)`
(raised anchor surfaces only).

## Component Standards

### Button (shadcn `button`)

- Base: inline-flex, 40px min-height, pill radius, `transition:
  background-color 150ms ease, border-color 150ms ease, color 150ms ease`.
- Variants: `primary` (ink fill `--primary`, paper text, hover `#3a3832`,
  active `#000000`), `secondary` (`--card` fill + hairline, hover `--surface`).
- Focus-visible: `box-shadow: 0 0 0 2px var(--background), 0 0 0 4px
  var(--ring)` (ring-2 ring-offset-2 equivalent).
- Disabled: `opacity: 0.5; pointer-events: none`.
- Hover never animates transform/scale (anti-spring rule).

### Badge (shadcn `badge`)

- Pill, hairline border, `--card` bg, 0.75rem/650. Variants: outline
  (eyebrow, lanes), `badge--accent` (coral text on `rgba(204,120,92,0.08)`,
  route badge). Badges are real labels only — never decorative.

### Card (shadcn `card`)

- `--card` fill, hairline `--border`, radius by elevation (`md` inner cells,
  `lg` nested, `xl` cards/hero mock). `shadow-sm` only on the two raised
  anchor surfaces (product mock, system panel); `shadow-xs` on hover. No
  nested card walls: inner groups are hairline rows or `--background` cells.

### Code / terminal

- Mono stack, `--surface-dark` fill, `lg` radius. Terminal chrome keeps the
  brand dots (flat coral + paper alpha, no glow); `inset 0 0 0 1px
  rgba(255,255,255,0.06)` hairline. Command prefixes in coral-light
  `#f0b49e`, dims in `--on-dark-muted`.

### Topbar & section rhythm

- Topbar: full-width 60px hairline bar (`border-bottom: 1px solid --line`),
  sticky, not a floating pill. Brand mark is a dark 28px square with `md`
  radius.
- Sections: `border-top: 1px solid --line`, 52px vertical padding, `.shell`
  width `min(1180px, calc(100% - 40px))`.
- Kickers: muted 12px uppercase, `0.08em` tracking — labels, not accents.

### Focus & accessibility

- `:focus-visible` only; global rule `outline: 2px solid var(--ring);
  outline-offset: 2px`; buttons use the ring pattern above.
- Interactive links keep `<a>` semantics; disabled controls lose pointer
  events; hover states are color/surface shifts only.

## Pencil Artifacts

- `designs/swf-ux-tokens.pen` — rebuilt in Pen.app (Pencil) as the Paper & Ink
  standard: two top-level frames — the token/component sheet (palette,
  radius, typography, buttons, badges, surfaces, focus, rhythm) and the hero
  composition ("SWF Hero — Paper & Ink (v2)").

Open them in Pen.app (Pencil) to iterate; the editor documents are the live
objects, exported evidence PNGs land in `designs/shots/` (`ux-tokens-v2.png`,
`hero-v2.png`).

## Governance

Changing tokens or components requires: (1) keeping the test-pinned contract
(`src/homepage-styles.test.mjs` — palette hexes, font stacks, class hooks,
media queries), (2) updating this file and `DESIGN.md`, (3) re-running
`npm run verify:homepage` and the visual screenshot pass before release.
