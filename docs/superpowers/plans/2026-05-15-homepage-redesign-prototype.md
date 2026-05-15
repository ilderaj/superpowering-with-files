# Homepage Manifesto Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved homepage redesign in `homepage/` so the page uses a manifesto-leaning hero, a visible `Breadth + Depth = Hybrid` proof block, a focused five-section flow, and the existing GitHub/docs exits.

**Architecture:** Keep the current Vite + React single-entry homepage, but move the homepage copy and section data into a plain ESM content module that the built-in Node test runner can validate without new tooling. Then rewrite `homepage/src/App.tsx` to render the five approved sections from that content contract and replace `homepage/src/styles.css` with a dark engineering-led visual system aligned with `homepage/DESIGN.md`.

**Tech Stack:** React, TypeScript JSX, plain CSS, Vite, Node built-in test runner

---

Primary task memory lives in `planning/active/homepage-redesign-prototype/`.
This companion plan must stay in sync with:
- `planning/active/homepage-redesign-prototype/task_plan.md`
- `planning/active/homepage-redesign-prototype/progress.md`
- `planning/active/homepage-redesign-prototype/findings.md`

## File Structure

- Create: `homepage/src/homepage-content.mjs`
  - Holds all approved homepage copy, section order, CTA targets, comparison cards, routing bullets, and repo-proof rows in a testable plain-data shape.
- Create: `homepage/src/homepage-content.test.mjs`
  - Locks the approved hero claim, section order, CTA targets, and comparison strip copy.
- Create: `homepage/src/homepage-structure.test.mjs`
  - Reads `homepage/src/App.tsx` as text and verifies the app renders the expected five-section skeleton wired to the content module.
- Create: `homepage/src/homepage-styles.test.mjs`
  - Reads `homepage/src/styles.css` as text and verifies the new dark design hooks are present while the old light-theme token is gone.
- Modify: `homepage/src/App.tsx`
  - Rebuild the page around the five approved sections: hero, comparison, routing, repo proof, closing.
- Modify: `homepage/src/styles.css`
  - Replace the light rounded system with a near-black, hard-edged, manifesto-capable layout aligned to the approved spec.

## Implementation Notes

- Keep the homepage as a single page. Do not introduce a router or new runtime dependencies.
- Prefer semantic HTML sections and visible headings over decorative wrappers.
- Keep the page understandable within the first screen at desktop widths.
- The hero must lead with a claim, then immediately prove the model.
- The lower sections must add new information instead of repeating the hero.

### Task 1: Lock the approved content contract

**Files:**
- Create: `homepage/src/homepage-content.mjs`
- Test: `homepage/src/homepage-content.test.mjs`

- [ ] **Step 1: Write the failing content-contract test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { homepageContent, homepageSectionOrder } from './homepage-content.mjs'

test('defines the approved five-section homepage flow', () => {
  assert.deepEqual(homepageSectionOrder, [
    'hero',
    'comparison',
    'routing',
    'repo-proof',
    'closing'
  ])
})

test('locks the manifesto hero claim and exit paths', () => {
  assert.equal(homepageContent.hero.headline, 'Stop losing good judgment.')
  assert.deepEqual(
    homepageContent.hero.actions.map(({ label }) => label),
    ['View source', 'Read workflow']
  )
  assert.equal(
    homepageContent.hero.actions[0].href,
    'https://github.com/ilderaj/superpowering-with-files'
  )
  assert.equal(
    homepageContent.hero.actions[1].href,
    'https://github.com/ilderaj/superpowering-with-files/blob/main/docs/workflows.md'
  )
})

test('keeps the comparison strip focused on breadth, depth, and both', () => {
  assert.deepEqual(
    homepageContent.comparison.map(({ label }) => label),
    ['Only breadth', 'Only depth', 'Both']
  )
  assert.equal(homepageContent.proof.hybrid.title, 'One workflow. Routed by complexity.')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd homepage && node --test src/homepage-content.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` because `src/homepage-content.mjs` does not exist yet.

- [ ] **Step 3: Write the minimal content module**

```js
export const homepageSectionOrder = [
  'hero',
  'comparison',
  'routing',
  'repo-proof',
  'closing'
]

export const homepageContent = {
  topbar: {
    brandLabel: 'Superpowering with Files',
    brandHref: '/superpowering-with-files/',
    links: [
      {
        label: 'Docs',
        href: 'https://github.com/ilderaj/superpowering-with-files/blob/main/docs/workflows.md'
      },
      {
        label: 'GitHub',
        href: 'https://github.com/ilderaj/superpowering-with-files'
      }
    ]
  },
  hero: {
    kicker: 'Planning with Files × Superpowers',
    headingId: 'hero-title',
    headline: 'Stop losing good judgment.',
    lede:
      'Hard work deserves stronger reasoning. Important decisions deserve a visible trail. This workflow does both, in the same repo-native system.',
    actions: [
      {
        label: 'View source',
        href: 'https://github.com/ilderaj/superpowering-with-files'
      },
      {
        label: 'Read workflow',
        href: 'https://github.com/ilderaj/superpowering-with-files/blob/main/docs/workflows.md'
      }
    ]
  },
  proof: {
    breadth: {
      label: 'Breadth',
      title: 'Files keep state.',
      detail: 'Plans, findings, and progress stay visible across agents and sessions.'
    },
    depth: {
      label: 'Depth',
      title: 'Superpowers sharpen hard calls.',
      detail: 'Deeper reasoning appears only when the task actually earns it.'
    },
    hybrid: {
      label: 'Hybrid',
      title: 'One workflow. Routed by complexity.',
      detail: 'Think → record → resume. Better calls without losing the trail.'
    }
  },
  comparison: [
    {
      label: 'Only breadth',
      title: 'State, no sharper thinking.',
      detail: 'The files survive, but every difficult decision still happens in the same flat lane.'
    },
    {
      label: 'Only depth',
      title: 'Sharper calls, no durable memory.',
      detail: 'The reasoning gets better for a moment, then fades and becomes hard to resume.'
    },
    {
      label: 'Both',
      title: 'Judgment lands as state.',
      detail: 'The hard part gets deeper thinking, then the result returns to visible planning files.'
    }
  ],
  routing: {
    headingId: 'routing-title',
    eyebrow: 'How routing works',
    title: 'The fast lane stays fast.',
    body:
      'Simple work stays lightweight. Difficult work earns deeper handling, then syncs back into files that any local agent surface can continue from.',
    bullets: [
      'Start in the normal lane for cheap, visible work.',
      'Escalate only when the task is complex enough to earn it.',
      'Write the outcome back into repo-native task state.'
    ]
  },
  repoProof: {
    headingId: 'repo-proof-title',
    eyebrow: 'What lives in files',
    title: 'The trail is part of the product.',
    body:
      'This system proves itself with visible artifacts in the repo, not with abstract claims.',
    items: [
      {
        label: 'Plans',
        detail: 'Task plans define the route before execution starts.'
      },
      {
        label: 'Findings',
        detail: 'Research, decisions, and constraints stay durable.'
      },
      {
        label: 'Progress',
        detail: 'Execution state stays resumable across sessions and tools.'
      }
    ]
  },
  closing: {
    headingId: 'closing-title',
    title: 'Route by complexity. Keep the trail.',
    links: [
      {
        label: 'GitHub',
        href: 'https://github.com/ilderaj/superpowering-with-files'
      },
      {
        label: 'Docs',
        href: 'https://github.com/ilderaj/superpowering-with-files/blob/main/docs/workflows.md'
      }
    ]
  }
}
```

- [ ] **Step 4: Run the content-contract test to verify it passes**

Run:

```bash
cd homepage && node --test src/homepage-content.test.mjs
```

Expected: PASS, 3 tests passed.

- [ ] **Step 5: Commit the content contract**

```bash
git add homepage/src/homepage-content.mjs homepage/src/homepage-content.test.mjs
git commit -m "test: lock homepage manifesto content contract"
```

### Task 2: Rebuild `App.tsx` around the five-section flow

**Files:**
- Modify: `homepage/src/App.tsx`
- Test: `homepage/src/homepage-structure.test.mjs`

- [ ] **Step 1: Write the failing structure test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')

test('renders the approved five section shells', () => {
  assert.ok(source.includes('className="hero"'))
  assert.ok(source.includes('className="comparison"'))
  assert.ok(source.includes('className="routing"'))
  assert.ok(source.includes('className="repo-proof"'))
  assert.ok(source.includes('className="closing"'))
})

test('reads homepage copy from homepageContent instead of inline strings', () => {
  assert.ok(source.includes("from './homepage-content.mjs'"))
  assert.ok(source.includes('homepageContent.hero.headline'))
  assert.ok(source.includes('homepageContent.proof.hybrid.title'))
  assert.ok(source.includes('homepageContent.repoProof.items.map'))
})
```

- [ ] **Step 2: Run the structure test to verify it fails**

Run:

```bash
cd homepage && node --test src/homepage-structure.test.mjs
```

Expected: FAIL because the current `App.tsx` does not import `homepageContent` and does not render the `routing` and `repo-proof` sections.

- [ ] **Step 3: Rewrite `homepage/src/App.tsx` to render the approved structure**

```tsx
import { homepageContent } from './homepage-content.mjs'

export default function App() {
  return (
    <main className="page-shell">
      <header className="topbar" aria-label="Primary navigation">
        <a className="brand" href={homepageContent.topbar.brandHref} aria-label="Superpowering with Files home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>{homepageContent.topbar.brandLabel}</span>
        </a>

        <nav className="topbar-links" aria-label="Topbar links">
          {homepageContent.topbar.links.map((link) => (
            <a key={link.label} href={link.href}>{link.label}</a>
          ))}
        </nav>
      </header>

      <section className="hero" aria-labelledby={homepageContent.hero.headingId}>
        <div className="hero-layout">
          <div className="hero-copy">
            <p className="kicker">{homepageContent.hero.kicker}</p>
            <h1 id={homepageContent.hero.headingId}>{homepageContent.hero.headline}</h1>
            <p className="lede">{homepageContent.hero.lede}</p>

            <div className="hero-actions" aria-label="Primary actions">
              {homepageContent.hero.actions.map((action, index) => (
                <a
                  key={action.label}
                  className={index === 0 ? 'hero-button hero-button--primary' : 'hero-button'}
                  href={action.href}
                >
                  {action.label}
                </a>
              ))}
            </div>
          </div>

          <aside className="hero-proof" aria-label="Hybrid workflow proof">
            <div className="hero-equation">
              <article className="equation-card">
                <span className="equation-label">{homepageContent.proof.breadth.label}</span>
                <h2>{homepageContent.proof.breadth.title}</h2>
                <p>{homepageContent.proof.breadth.detail}</p>
              </article>

              <span className="equation-operator" aria-hidden="true">+</span>

              <article className="equation-card">
                <span className="equation-label">{homepageContent.proof.depth.label}</span>
                <h2>{homepageContent.proof.depth.title}</h2>
                <p>{homepageContent.proof.depth.detail}</p>
              </article>
            </div>

            <article className="equation-result">
              <span className="equation-label equation-label--accent">{homepageContent.proof.hybrid.label}</span>
              <h2>{homepageContent.proof.hybrid.title}</h2>
              <p>{homepageContent.proof.hybrid.detail}</p>
            </article>
          </aside>
        </div>
      </section>

      <section className="comparison" aria-labelledby="comparison-title">
        <div className="section-shell">
          <h2 id="comparison-title" className="sr-only">Hybrid comparison</h2>
          <div className="comparison-strip">
            {homepageContent.comparison.map((item) => (
              <article className="comparison-item" key={item.label}>
                <span>{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="routing" aria-labelledby={homepageContent.routing.headingId}>
        <div className="section-shell routing-grid">
          <div className="section-heading">
            <p className="section-eyebrow">{homepageContent.routing.eyebrow}</p>
            <h2 id={homepageContent.routing.headingId}>{homepageContent.routing.title}</h2>
            <p className="section-body">{homepageContent.routing.body}</p>
          </div>

          <ul className="routing-list">
            {homepageContent.routing.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="repo-proof" aria-labelledby={homepageContent.repoProof.headingId}>
        <div className="section-shell repo-proof-grid">
          <div className="section-heading">
            <p className="section-eyebrow">{homepageContent.repoProof.eyebrow}</p>
            <h2 id={homepageContent.repoProof.headingId}>{homepageContent.repoProof.title}</h2>
            <p className="section-body">{homepageContent.repoProof.body}</p>
          </div>

          <div className="repo-proof-list">
            {homepageContent.repoProof.items.map((item) => (
              <article className="repo-proof-item" key={item.label}>
                <span>{item.label}</span>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="closing" aria-labelledby={homepageContent.closing.headingId}>
        <div className="section-shell closing-layout">
          <h2 id={homepageContent.closing.headingId}>{homepageContent.closing.title}</h2>
          <div className="link-row" aria-label="Project links">
            {homepageContent.closing.links.map((link) => (
              <a key={link.label} href={link.href}>{link.label}</a>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
```

- [ ] **Step 4: Run the structure test to verify it passes**

Run:

```bash
cd homepage && node --test src/homepage-structure.test.mjs
```

Expected: PASS, 2 tests passed.

- [ ] **Step 5: Commit the structural rewrite**

```bash
git add homepage/src/App.tsx homepage/src/homepage-structure.test.mjs
git commit -m "feat: rebuild homepage structure around manifesto flow"
```

### Task 3: Replace the light theme with the approved dark visual system

**Files:**
- Modify: `homepage/src/styles.css`
- Test: `homepage/src/homepage-styles.test.mjs`

- [ ] **Step 1: Write the failing stylesheet contract test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

test('switches the homepage back to a dark manifesto-ready canvas', () => {
  assert.ok(css.includes('color-scheme: dark'))
  assert.ok(css.includes('--canvas: #000000'))
  assert.ok(css.includes('--surface: #0d0d0d'))
})

test('defines the new section hooks used by App.tsx', () => {
  assert.ok(css.includes('.hero-equation'))
  assert.ok(css.includes('.routing-grid'))
  assert.ok(css.includes('.repo-proof-list'))
  assert.ok(css.includes('.hero-button--primary'))
})

test('removes the old light-surface theme flag', () => {
  assert.equal(css.includes('color-scheme: light'), false)
})
```

- [ ] **Step 2: Run the stylesheet test to verify it fails**

Run:

```bash
cd homepage && node --test src/homepage-styles.test.mjs
```

Expected: FAIL because `styles.css` still contains the light theme tokens and does not contain the new dark section hooks.

- [ ] **Step 3: Replace `homepage/src/styles.css` with the approved dark layout**

```css
:root {
  color-scheme: dark;
  --canvas: #000000;
  --surface: #0d0d0d;
  --surface-strong: #161616;
  --line: #313131;
  --line-strong: #4a4a4a;
  --text: #ffffff;
  --body: #c3c3c3;
  --muted: #808080;
  --m-blue-light: #0066b1;
  --m-blue-dark: #1c69d4;
  --m-red: #e22718;
  --sans: Inter, "Helvetica Neue", Arial, sans-serif;
}

* {
  box-sizing: border-box;
}

html {
  background: var(--canvas);
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-width: 320px;
  background: var(--canvas);
  color: var(--text);
  font-family: var(--sans);
}

a {
  color: inherit;
  text-decoration: none;
}

.page-shell {
  min-height: 100vh;
  background: var(--canvas);
}

.topbar,
.section-shell,
.hero-layout {
  width: min(1180px, calc(100% - 48px));
  margin: 0 auto;
}

.topbar {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  border-bottom: 1px solid var(--line);
}

.brand,
.topbar-links,
.hero-actions,
.link-row {
  display: flex;
  align-items: center;
}

.brand {
  gap: 10px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.brand-mark {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line-strong);
  background: var(--surface);
}

.topbar-links {
  gap: 10px;
}

.topbar-links a,
.hero-button,
.link-row a {
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--text);
  padding: 12px 16px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.hero {
  padding: 72px 0 36px;
}

.hero-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.14fr) minmax(320px, 0.86fr);
  gap: 28px;
  align-items: stretch;
}

.hero-copy {
  min-width: 0;
}

.kicker,
.section-eyebrow,
.equation-label,
.comparison-item span,
.repo-proof-item span {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h1,
h2,
h3,
p,
ul {
  margin-top: 0;
}

h1 {
  max-width: 8ch;
  margin-bottom: 16px;
  font-size: clamp(48px, 8vw, 84px);
  line-height: 0.9;
  letter-spacing: -0.04em;
  text-transform: uppercase;
}

.lede,
.section-body,
.equation-card p,
.equation-result p,
.comparison-item p,
.routing-list li,
.repo-proof-item p {
  color: var(--body);
  font-size: 16px;
  line-height: 1.65;
}

.hero-actions {
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 24px;
}

.hero-button--primary {
  background: var(--text);
  color: var(--canvas);
  border-color: var(--text);
}

.hero-proof {
  display: grid;
  gap: 14px;
}

.hero-equation {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 12px;
  align-items: stretch;
}

.equation-card,
.equation-result,
.comparison-item,
.routing-list,
.repo-proof-item {
  border: 1px solid var(--line);
  background: var(--surface);
}

.equation-card,
.equation-result,
.comparison-item,
.repo-proof-item {
  padding: 20px;
}

.equation-card h2,
.equation-result h2,
.routing h2,
.repo-proof h2,
.closing h2 {
  margin-bottom: 10px;
  font-size: 28px;
  line-height: 1.05;
  text-transform: uppercase;
}

.equation-operator {
  align-self: center;
  font-size: 28px;
  color: var(--text);
}

.equation-result {
  border-color: var(--line-strong);
  position: relative;
}

.equation-result::before {
  content: '';
  position: absolute;
  inset: 0 auto auto 0;
  width: 144px;
  height: 4px;
  background: linear-gradient(90deg, var(--m-blue-light), var(--m-blue-dark), var(--m-red));
}

.equation-label--accent {
  color: var(--text);
}

.comparison,
.routing,
.repo-proof,
.closing {
  padding: 18px 0 0;
}

.comparison-strip,
.repo-proof-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.comparison-item h3 {
  margin-bottom: 10px;
  font-size: 22px;
  line-height: 1.1;
  text-transform: uppercase;
}

.routing-grid,
.repo-proof-grid,
.closing-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 24px;
  align-items: start;
}

.routing-list {
  margin: 0;
  padding: 20px 20px 20px 38px;
}

.routing-list li + li {
  margin-top: 10px;
}

.link-row {
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}

@media (max-width: 900px) {
  .hero-layout,
  .routing-grid,
  .repo-proof-grid,
  .closing-layout,
  .comparison-strip,
  .repo-proof-list {
    grid-template-columns: 1fr;
  }

  .hero-equation {
    grid-template-columns: 1fr;
  }

  .equation-operator {
    justify-self: center;
  }
}

@media (max-width: 640px) {
  .topbar,
  .section-shell,
  .hero-layout {
    width: min(100% - 28px, 1180px);
  }

  .topbar {
    display: grid;
    justify-content: stretch;
    padding: 14px 0;
  }

  h1 {
    font-size: 40px;
  }
}
```

- [ ] **Step 4: Run the stylesheet test to verify it passes**

Run:

```bash
cd homepage && node --test src/homepage-styles.test.mjs
```

Expected: PASS, 3 tests passed.

- [ ] **Step 5: Commit the dark visual rewrite**

```bash
git add homepage/src/styles.css homepage/src/homepage-styles.test.mjs
git commit -m "feat: restyle homepage with manifesto dark system"
```

### Task 4: Run the full homepage validation and sync planning files

**Files:**
- Modify: `planning/active/homepage-redesign-prototype/task_plan.md`
- Modify: `planning/active/homepage-redesign-prototype/progress.md`
- Modify: `planning/active/homepage-redesign-prototype/findings.md`
- Modify: `docs/superpowers/plans/2026-05-15-homepage-redesign-prototype.md`

- [ ] **Step 1: Run the focused homepage test suite**

Run:

```bash
cd homepage && npm test
```

Expected: PASS, all `src/*.test.mjs` files pass.

- [ ] **Step 2: Run type-check and production build**

Run:

```bash
cd homepage && npm run typecheck && npm run build
```

Expected: PASS, no TypeScript errors and Vite emits the production bundle.

- [ ] **Step 3: Run a preview smoke check**

Run:

```bash
cd homepage
npm run preview -- --host 127.0.0.1 --port 4173 >/tmp/homepage-preview.log 2>&1 &
PREVIEW_PID=$!
sleep 2
curl -I http://127.0.0.1:4173/superpowering-with-files/ | head -n 1
kill $PREVIEW_PID
wait $PREVIEW_PID || true
```

Expected: `HTTP/1.1 200 OK`.

- [ ] **Step 4: Sync the durable task memory**

Append these updates:

```md
# planning/active/homepage-redesign-prototype/task_plan.md
- Current State: active
- Current Phase: implementation planning complete
- Companion plan: docs/superpowers/plans/2026-05-15-homepage-redesign-prototype.md
- Companion summary: Four-task implementation plan covering content contract, App.tsx rewrite, dark stylesheet rewrite, and validation.
- Sync-back status: companion plan written; execution not started
```

```md
# planning/active/homepage-redesign-prototype/progress.md
## Session: 2026-05-15 22:37:32 UTC+8
### Phase: Implementation Planning
- Status: complete
- Actions taken:
  - Wrote the approved implementation plan for the manifesto homepage redesign.
  - Mapped file ownership for content, structure, tests, and CSS.
  - Synced the companion plan path back into task-scoped planning files.
```

```md
# planning/active/homepage-redesign-prototype/findings.md
## Findings Record: 2026-05-15 22:37:32 UTC+8
- The cleanest way to add test coverage without new tooling is to move homepage copy and section metadata into a plain `.mjs` content module that `App.tsx` consumes.
- Text-based Node tests can safely verify `App.tsx` structure and `styles.css` contract in this repo because the existing test runner does not transpile `.tsx` directly.
```

- [ ] **Step 5: Commit the plan-sync checkpoint**

```bash
git add \
  planning/active/homepage-redesign-prototype/task_plan.md \
  planning/active/homepage-redesign-prototype/progress.md \
  planning/active/homepage-redesign-prototype/findings.md \
  docs/superpowers/plans/2026-05-15-homepage-redesign-prototype.md
git commit -m "docs: add homepage redesign implementation plan"
```

## Self-Review

### Spec coverage

- Hero redesign: Task 1 and Task 2 lock and render the manifesto hero.
- `Breadth + Depth = Hybrid` proof: Task 1 defines the proof copy; Task 2 renders the equation block.
- Five-section information architecture: Task 1 locks the order; Task 2 renders all five sections.
- Dark engineering-led visual direction: Task 3 replaces the light theme with the approved dark system.
- GitHub/docs exit paths: Task 1 locks CTA URLs; Task 2 renders them; Task 4 smoke-checks the build.
- Accessibility/responsiveness: Task 2 keeps semantic sections and labels; Task 3 includes responsive collapse and reduced-motion handling.

### Placeholder scan

- No `TBD`, `TODO`, or deferred implementation notes remain.
- Every code-changing step includes concrete code.
- Every validation step includes exact commands and expected outcomes.

### Type consistency

- `homepageContent` is the single source of truth for hero copy, comparison items, repo proof, and CTA links.
- `homepageSectionOrder` uses the same section IDs referenced in Task 1 and Task 2.
- CSS hooks referenced in Task 2 (`hero-equation`, `routing-grid`, `repo-proof-list`, `hero-button--primary`) are defined in Task 3.
