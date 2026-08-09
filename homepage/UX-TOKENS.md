# WebApp UX Tokens & Component Standard

Status: **active standard** (2026-08-09) — the durable visual contract for the
Superpowering with Files homepage (`homepage/`). Consumed by `src/theme.css`
and `src/styles.css`; mirrored as Pencil design files under `designs/`.

## Design Direction

The page follows the restraint of [opencodex.me/zh-cn](https://opencodex.me/zh-cn/)
and [cursor.com](https://cursor.com/), applied on top of the existing brand
contract (`DESIGN.md`): warm cream canvas, coral accent, off-dark proof
surfaces, editorial serif display + sans body.

Shared restraint checklist (from the 2026-08 reference audit):

1. Flat surfaces; separation via 1px hairlines, not gradients or glow.
2. One accent (coral), used sparingly.
3. Small radii on controls (6-14px); pills only on CTAs, badges, chips.
4. Quiet hover states: surface/background shift only, 150ms, no transforms.
5. Crisp ink-grade focus-visible rings; never `:focus`-only styling.
6. Mono for code only; muted text via alpha/`--muted-foreground`, never a
   second color.
7. Shadows are a whisper (`--shadow-xs/sm`) or absent; depth comes from
   hairlines.

## Token Contract (shadcn/ui-aligned)

`src/theme.css` defines the shadcn/ui semantic token names so a future
`shadcn init` can reuse the variables unchanged:

| Token | Value | Brand alias |
|---|---|---|
| `--background` | `#faf9f5` | `--paper` |
| `--foreground` | `#141413` | `--ink` |
| `--card` | `#fffdf8` | — |
| `--card-foreground` | `#141413` | — |
| `--primary` | `#cc785c` | `--accent` |
| `--primary-foreground` | `#faf9f5` | `--paper` |
| `--secondary` | `#f5f0e7` | `--paper-warm` |
| `--secondary-foreground` | `#141413` | — |
| `--muted` | `#f8f4ed` | `--surface` |
| `--muted-foreground` | `#6c6a64` | `--muted` |
| `--accent` | `#f5f0e7` | hover surface |
| `--accent-foreground` | `#a9583e` | `--accent-strong` |
| `--destructive` | `#a9583e` | — |
| `--border` / `--input` | `#e6dfd8` | `--line` |
| `--ring` | `#a9583e` | focus ring |
| `--radius` | `0.625rem` | shadcn base (10px) |

Dark proof surfaces keep their own aliases (`--surface-dark`, `--on-dark`,
`--on-dark-muted`) per the brand contract; the page itself stays light-only.

## Scales

Radius (shadcn-derived multipliers of `--radius`):
`sm=0.375rem` (6px, inputs/inline code) · `md=0.5rem` (8px, controls/inner
cards) · `lg=0.625rem` (10px, nested surfaces) · `xl=0.875rem` (14px, large
surfaces) · `2xl=1.125rem` (18px, hero proof frame) · `pill=9999px`
(buttons/badges/lanes).

Spacing: 4px grid — `--space-1..16` (4/8/12/16/24/32/48/64px).

Type: display `Copernicus, 'Tiempos Headline', Georgia, serif` (400, tight
tracking); body `StyreneB, Inter, 'Helvetica Neue', Arial, sans-serif`; mono
`'JetBrains Mono', 'SFMono-Regular', Consolas, monospace` (code only). The
sans face is pinned by tests; Inter is a compared fallback, not a default.

## Component Standards

### Button (shadcn `button`)

- Base: inline-flex, 40px height, pill radius, `transition: background-color
  150ms`.
- Variants: `primary` (bg `--primary`, hover `--accent-strong`),
  `secondary` (bg `--secondary` + hairline, hover `--surface-card`).
- Focus-visible: ring pattern `0 0 0 2px --background, 0 0 0 4px --ring`
  (box-shadow equivalent of `ring-2 ring-offset-2`).
- Disabled: `opacity: 0.5; pointer-events: none`.
- Hover never animates transform/scale (anti-spring rule).

### Badge (`shadcn badge`)

- Pill, hairline border, `--card` bg, 11-12px/680. Variants: outline
  (eyebrow), accent (`--muted` bg + `--accent-foreground` text, route badge),
  lane chips (outline). Badges are real labels only — never decorative.

### Card (`shadcn card`)

- `--card` fill, hairline `--border`, radius by elevation (`xl` large,
  `2xl` hero frame, `lg` nested). `shadow-sm` only on the two raised anchor
  surfaces (product proof frame, system panel). No nested card walls: inner
  groups are hairline rows or `--muted` cells.

### Code / terminal

- Mono stack, `--surface-dark` fill, `md` radius. Terminal chrome keeps the
  brand dots (flat, no glow).

### Focus & accessibility

- `:focus-visible` only; global rule `outline: 2px solid var(--ring);
  outline-offset: 2px`; buttons use the ring pattern above.
- Interactive links keep `<a>` semantics (no div-buttons); disabled controls
  lose pointer events.

## Pencil Artifacts

- `designs/swf-ux-tokens.pen` — token/component sheet (palette, radius,
  typography, buttons, badges, surfaces, focus) with the full variable table.
- `designs/swf-hero-v1.pen` — hero composition in the new visual language.

Both are Pencil `.pen` v2.8 JSON authored to the exact token values in
`theme.css`; open them in the Pencil editor to iterate.

## Governance

Changing tokens or components requires: (1) keeping the test-pinned contract
(`src/homepage-styles.test.mjs` — palette hexes, font stacks, class hooks,
media queries), (2) updating this file and `DESIGN.md`, (3) re-running
`npm run verify:homepage` and the visual screenshot pass before release.
