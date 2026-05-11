# Homepage Cloudflare Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and automatically deploy a production homepage for `superpowering-with-files` at `https://vibing.paymond.me/superpowering-with-files`.

**Architecture:** Add an isolated `homepage/` Vite + React app inside the monorepo, style it from the generated BMW M `DESIGN.md`, and serve the static build through a Cloudflare Worker with Static Assets. GitHub Actions deploys the Worker whenever homepage-relevant changes reach `origin/main`.

**Tech Stack:** Vite, React, TypeScript, CSS, getdesign BMW M `DESIGN.md`, Cloudflare Workers Static Assets, Wrangler, GitHub Actions, Node test runner.

**Active task path:** `planning/active/homepage-cloudflare-worker/`

**Lifecycle state:** waiting_review

**Sync-back status:** Companion plan created; active planning files must stay authoritative for lifecycle and progress.

---

## Scope

Build the homepage and deployment pipeline only. Do not modify the existing cloud-dev triage task files except through unrelated user-approved work. Do not alter the Harness runtime, adapter behavior, MCP server, or existing cloud-dev workflows beyond adding a new homepage workflow and tests.

## Required External Configuration

Before production deployment can succeed, the repository or organization must have these GitHub Actions secrets configured:

- `CLOUDFLARE_API_TOKEN`: API token with permission to deploy Workers for the `paymond.me` zone.
- `CLOUDFLARE_ACCOUNT_ID`: account ID used by Wrangler when the local Cloudflare profile is not present.

The Cloudflare zone must allow a Worker route for `vibing.paymond.me/superpowering-with-files*`.

## File Structure

Create or modify these files:

- Create: `homepage/package.json` - frontend app scripts and dependencies.
- Create: `homepage/index.html` - Vite document shell.
- Create: `homepage/tsconfig.json` - TypeScript config for the homepage app and Worker entry.
- Create: `homepage/vite.config.ts` - base path `/superpowering-with-files/` and React plugin config.
- Create: `homepage/wrangler.jsonc` - Cloudflare Worker Static Assets deployment config.
- Create: `homepage/src/main.tsx` - React entry.
- Create: `homepage/src/App.tsx` - homepage content and interactive UI.
- Create: `homepage/src/styles.css` - BMW M inspired visual system based on generated `DESIGN.md`.
- Create: `homepage/src/route-utils.mjs` - prefix normalization for Worker asset requests.
- Create: `homepage/src/route-utils.test.mjs` - Node tests for Worker path handling.
- Create: `homepage/src/worker.ts` - Cloudflare Worker entry.
- Create: `homepage/public/harness-console.svg` - temporary code-native visual asset for the first implementation pass if no generated bitmap asset is available yet.
- Create: `docs/install/homepage-cloudflare-worker.md` - operator documentation for local preview, secrets, and deployment.
- Create: `.github/workflows/homepage-deploy.yml` - production deploy workflow on `main`.
- Create: `tests/automation/homepage-deploy-workflow.test.mjs` - repository-level workflow contract tests.
- Modify: `package.json` - include `tests/automation/homepage-deploy-workflow.test.mjs` automatically through the existing `tests/automation/*.test.mjs` glob; no script change should be needed unless verification reveals the glob misses it.

---

### Task 1: Guard the Existing Worktree

**Files:**
- Read-only: `planning/active/cloud-dev-harness-feasibility/task_plan.md`
- Read-only: `planning/active/homepage-cloudflare-worker/task_plan.md`

- [ ] **Step 1: Check current dirty files**

Run:

```bash
git status --short --branch
```

Expected: Any existing dirty files outside `planning/active/homepage-cloudflare-worker/` are understood and left untouched. If cloud-dev files are dirty, continue without editing them.

- [ ] **Step 2: Re-read the active task plan**

Run:

```bash
sed -n '1,220p' planning/active/homepage-cloudflare-worker/task_plan.md
```

Expected: The goal still targets `vibing.paymond.me/superpowering-with-files`, and the plan still says execution follows user approval.

- [ ] **Step 3: Confirm no destructive action is needed**

Do not run `git reset`, `git checkout --`, `git clean`, or branch-changing commands. If a required file already exists, inspect it and patch it instead of deleting it.

- [ ] **Step 4: Record the execution start**

Run:

```bash
python3 .agents/skills/planning-with-files/scripts/planning_record.py timestamp
```

Append a dated execution-start note to `planning/active/homepage-cloudflare-worker/progress.md` before implementation begins.

---

### Task 2: Scaffold the Isolated Homepage App

**Files:**
- Create: `homepage/package.json`
- Create: `homepage/index.html`
- Create: `homepage/tsconfig.json`
- Create: `homepage/vite.config.ts`

- [ ] **Step 1: Create the homepage directory**

Run:

```bash
mkdir -p homepage/src homepage/public
```

Expected: `homepage/`, `homepage/src/`, and `homepage/public/` exist.

- [ ] **Step 2: Create `homepage/package.json`**

Write this complete file:

```json
{
  "name": "superpowering-with-files-homepage",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1",
    "typecheck": "tsc --noEmit",
    "test": "node --test src/*.test.mjs",
    "deploy": "wrangler deploy --config wrangler.jsonc"
  },
  "dependencies": {
    "@vitejs/plugin-react": "latest",
    "vite": "latest",
    "typescript": "latest",
    "react": "latest",
    "react-dom": "latest",
    "wrangler": "latest",
    "@cloudflare/workers-types": "latest"
  },
  "devDependencies": {}
}
```

- [ ] **Step 3: Install homepage dependencies**

Run:

```bash
npm install --prefix homepage
```

Expected: `homepage/package-lock.json` is created and dependencies install without modifying the root `package-lock.json` unless npm reports a workspace relationship. If root lock changes unexpectedly, inspect the diff before continuing.

- [ ] **Step 4: Install the BMW M design package**

Run from the homepage project root:

```bash
cd homepage && npx getdesign@latest add bmw-m
```

Expected: The command adds a `DESIGN.md` or equivalent design instruction artifact under `homepage/`. Read the generated file before finalizing CSS in Task 5.

- [ ] **Step 5: Create `homepage/index.html`**

Write this complete file:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="Superpowering with Files is a governance harness for agentic coding workflows across Copilot, Codex, Cursor, and Claude Code."
    />
    <title>Superpowering with Files</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `homepage/tsconfig.json`**

Write this complete file:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022", "WebWorker"],
    "allowJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 7: Create `homepage/vite.config.ts`**

Write this complete file:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/superpowering-with-files/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
```

- [ ] **Step 8: Verify the scaffold scripts resolve**

Run:

```bash
npm run typecheck --prefix homepage
```

Expected: This may fail because source files are not created yet. The failure should mention missing inputs or React source, not package installation failure. Continue to Task 3.

---

### Task 3: Add Worker Route Utilities with Tests First

**Files:**
- Create: `homepage/src/route-utils.mjs`
- Create: `homepage/src/route-utils.test.mjs`

- [ ] **Step 1: Write failing route utility tests**

Create `homepage/src/route-utils.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHomepageRequestUrl } from './route-utils.mjs';

test('redirects the bare homepage prefix to the slash form', () => {
  const result = normalizeHomepageRequestUrl('https://vibing.paymond.me/superpowering-with-files');

  assert.equal(result.action, 'redirect');
  assert.equal(result.status, 308);
  assert.equal(result.url, 'https://vibing.paymond.me/superpowering-with-files/');
});

test('rewrites the homepage shell path to the asset root', () => {
  const result = normalizeHomepageRequestUrl('https://vibing.paymond.me/superpowering-with-files/');

  assert.equal(result.action, 'asset');
  assert.equal(result.url, 'https://vibing.paymond.me/');
});

test('strips the homepage prefix from built asset requests', () => {
  const result = normalizeHomepageRequestUrl(
    'https://vibing.paymond.me/superpowering-with-files/assets/index.js'
  );

  assert.equal(result.action, 'asset');
  assert.equal(result.url, 'https://vibing.paymond.me/assets/index.js');
});

test('preserves query strings when rewriting asset requests', () => {
  const result = normalizeHomepageRequestUrl(
    'https://vibing.paymond.me/superpowering-with-files/?utm_source=github'
  );

  assert.equal(result.action, 'asset');
  assert.equal(result.url, 'https://vibing.paymond.me/?utm_source=github');
});

test('rejects paths outside the homepage prefix', () => {
  const result = normalizeHomepageRequestUrl('https://vibing.paymond.me/other');

  assert.equal(result.action, 'not_found');
  assert.equal(result.url, 'https://vibing.paymond.me/other');
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npm test --prefix homepage
```

Expected: FAIL with module not found for `homepage/src/route-utils.mjs`.

- [ ] **Step 3: Implement `homepage/src/route-utils.mjs`**

Write this complete file:

```js
export const HOMEPAGE_PREFIX = '/superpowering-with-files';

export function normalizeHomepageRequestUrl(urlLike) {
  const url = new URL(urlLike);

  if (url.pathname === HOMEPAGE_PREFIX) {
    url.pathname = `${HOMEPAGE_PREFIX}/`;
    return { action: 'redirect', status: 308, url: url.toString() };
  }

  if (url.pathname === `${HOMEPAGE_PREFIX}/`) {
    url.pathname = '/';
    return { action: 'asset', url: url.toString() };
  }

  if (url.pathname.startsWith(`${HOMEPAGE_PREFIX}/`)) {
    url.pathname = url.pathname.slice(HOMEPAGE_PREFIX.length) || '/';
    return { action: 'asset', url: url.toString() };
  }

  return { action: 'not_found', url: url.toString() };
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run:

```bash
npm test --prefix homepage
```

Expected: PASS for all five route utility tests.

---

### Task 4: Add the Cloudflare Worker and Wrangler Config

**Files:**
- Create: `homepage/src/worker.ts`
- Create: `homepage/wrangler.jsonc`

- [ ] **Step 1: Create `homepage/src/worker.ts`**

Write this complete file:

```ts
import { normalizeHomepageRequestUrl } from './route-utils.mjs';

export interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const normalized = normalizeHomepageRequestUrl(request.url);

    if (normalized.action === 'redirect') {
      return Response.redirect(normalized.url, normalized.status);
    }

    if (normalized.action === 'not_found') {
      return new Response('Not found', { status: 404 });
    }

    return env.ASSETS.fetch(new Request(normalized.url, request));
  }
};
```

- [ ] **Step 2: Create `homepage/wrangler.jsonc`**

Write this complete file:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "superpowering-with-files-homepage",
  "main": "./src/worker.ts",
  "compatibility_date": "2026-05-11",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": true
  },
  "routes": [
    {
      "pattern": "vibing.paymond.me/superpowering-with-files*",
      "zone_name": "paymond.me"
    }
  ]
}
```

- [ ] **Step 3: Run typecheck and fix only homepage issues**

Run:

```bash
npm run typecheck --prefix homepage
```

Expected: TypeScript may still fail until React app files are added in Task 5. Worker-specific errors should be fixed now.

- [ ] **Step 4: Run Wrangler validation after a build exists**

Defer this command until Task 6 creates `homepage/dist`:

```bash
npm run build --prefix homepage
npx --prefix homepage wrangler deploy --config homepage/wrangler.jsonc --dry-run
```

Expected after Task 6: Wrangler validates the Worker and assets without deploying.

---

### Task 5: Build the BMW M Inspired Homepage UI

**Files:**
- Create: `homepage/src/main.tsx`
- Create: `homepage/src/App.tsx`
- Create: `homepage/src/styles.css`
- Create: `homepage/public/harness-console.svg`

- [ ] **Step 1: Read generated design guidance**

Run:

```bash
sed -n '1,240p' homepage/DESIGN.md
```

Expected: The BMW M guidance confirms dark canvas, white uppercase display type, M tricolor stripe accents, sharp rectangular controls, full-bleed imagery, and responsive grid rules. Apply those decisions to the CSS below.

- [ ] **Step 2: Create a first-pass visual asset**

Create `homepage/public/harness-console.svg` as a code-native product visual. If image generation is available during execution, replace this SVG with a generated bitmap asset named `homepage/public/harness-console.webp` and update the image references in `App.tsx`. If image generation is not available, keep the SVG and record that limitation in progress.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 760" role="img" aria-labelledby="title desc">
  <title id="title">Harness projection console</title>
  <desc id="desc">A dark technical interface showing planning, policy, adapters, and verification lanes.</desc>
  <rect width="1200" height="760" fill="#050505"/>
  <rect x="48" y="48" width="1104" height="664" fill="#0d0d0d" stroke="#3c3c3c"/>
  <rect x="48" y="48" width="368" height="6" fill="#0066b1"/>
  <rect x="416" y="48" width="368" height="6" fill="#1c69d4"/>
  <rect x="784" y="48" width="368" height="6" fill="#e22718"/>
  <g fill="#ffffff" font-family="Arial, Helvetica, sans-serif">
    <text x="84" y="126" font-size="40" font-weight="700">AGENT WORKFLOW GOVERNANCE</text>
    <text x="84" y="166" font-size="18" fill="#bbbbbb">Planning with Files · Superpowers · Adapter Projection · Verification</text>
  </g>
  <g stroke="#3c3c3c" fill="#1a1a1a">
    <rect x="84" y="220" width="260" height="132"/>
    <rect x="376" y="220" width="260" height="132"/>
    <rect x="668" y="220" width="260" height="132"/>
    <rect x="84" y="390" width="844" height="192"/>
    <rect x="960" y="220" width="108" height="362"/>
  </g>
  <g fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-weight="700">
    <text x="110" y="268" font-size="24">PLAN</text>
    <text x="402" y="268" font-size="24">PROJECT</text>
    <text x="694" y="268" font-size="24">VERIFY</text>
    <text x="110" y="438" font-size="24">RUNTIME FACADE</text>
  </g>
  <g fill="#bbbbbb" font-family="Arial, Helvetica, sans-serif" font-size="16">
    <text x="110" y="304">Durable task state</text>
    <text x="402" y="304">IDE-native instructions</text>
    <text x="694" y="304">Doctor and tests</text>
    <text x="110" y="478">MCP tools, CLI services, audit receipts, summaries</text>
  </g>
  <g stroke="#ffffff" stroke-width="2">
    <path d="M344 286 H376"/>
    <path d="M636 286 H668"/>
    <path d="M928 286 H960"/>
    <path d="M506 352 V390"/>
  </g>
  <g fill="#0066b1"><rect x="1000" y="260" width="28" height="170"/></g>
  <g fill="#1c69d4"><rect x="1030" y="260" width="28" height="170"/></g>
  <g fill="#e22718"><rect x="1060" y="260" width="28" height="170"/></g>
</svg>
```

- [ ] **Step 3: Create `homepage/src/main.tsx`**

Write this complete file:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 4: Create `homepage/src/App.tsx`**

Write this complete file, then refine copy and spacing only if browser verification shows a real issue:

```tsx
const lanes = [
  { label: 'PLAN', value: 'tracked tasks', detail: 'Durable state in planning/active with findings and progress.' },
  { label: 'PROJECT', value: '4 IDEs', detail: 'Copilot, Codex, Cursor, and Claude Code get native instructions.' },
  { label: 'VERIFY', value: 'one gate', detail: 'Node tests, harness verify, doctor, and sync dry-runs stay visible.' },
  { label: 'RELEASE', value: 'main ready', detail: 'Human-reviewed promotion keeps cloud work out of local checkouts.' }
];

const features = [
  ['Planning with Files', 'A task-scoped memory layer that survives context resets and keeps decisions reviewable.'],
  ['Superpowers, Temporarily', 'Use deep workflow skills when they add value, then sync durable decisions back to files.'],
  ['Adapter Projection', 'Render one policy into each agent surface without letting the surfaces drift apart.'],
  ['Safety Overlay', 'Optional worktree-first guardrails for bypass, autopilot, and long-running sessions.']
];

const workflow = ['plan', 'review', 'verify', 'finish', 'release', 'archive'];

export default function App() {
  return (
    <main className="page-shell">
      <header className="topbar" aria-label="Primary navigation">
        <a className="brand" href="/superpowering-with-files/" aria-label="Superpowering with Files home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>SWF</span>
        </a>
        <nav className="nav-links" aria-label="Documentation links">
          <a href="https://github.com/ilderaj/superpowering-with-files">GitHub</a>
          <a href="https://github.com/ilderaj/superpowering-with-files/blob/main/README.md">README</a>
          <a href="https://github.com/ilderaj/superpowering-with-files/tree/main/docs">Docs</a>
        </nav>
      </header>

      <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Agent workflow governance harness</p>
          <h1 id="hero-title">SUPERPOWERING WITH FILES</h1>
          <p className="hero-lede">
            A file-backed control plane for local and cloud coding agents: persistent plans,
            projected skills, optional safety, and verifiable release lanes.
          </p>
          <div className="hero-actions" aria-label="Primary actions">
            <a className="button button-primary" href="https://github.com/ilderaj/superpowering-with-files">
              View repository
            </a>
            <a className="button button-secondary" href="https://github.com/ilderaj/superpowering-with-files/blob/main/docs/workflows.md">
              Read workflows
            </a>
          </div>
        </div>
        <figure className="hero-visual">
          <img src="/superpowering-with-files/harness-console.svg" alt="Dark harness projection console" />
          <figcaption>Policy, planning, projection, and verification in one operator surface.</figcaption>
        </figure>
      </section>

      <section className="metrics-grid" aria-label="Harness lanes">
        {lanes.map((lane) => (
          <article className="metric-cell" key={lane.label}>
            <p>{lane.label}</p>
            <strong>{lane.value}</strong>
            <span>{lane.detail}</span>
          </article>
        ))}
      </section>

      <section className="split-section" aria-labelledby="system-title">
        <div>
          <p className="eyebrow">One policy, native surfaces</p>
          <h2 id="system-title">BUILT FOR AGENTIC WORK THAT HAS TO BE RESUMABLE</h2>
        </div>
        <div className="feature-grid">
          {features.map(([title, detail]) => (
            <article className="feature-card" key={title}>
              <h3>{title}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="workflow-band" aria-labelledby="workflow-title">
        <p className="eyebrow">Operator workflow</p>
        <h2 id="workflow-title">FROM REQUEST TO VERIFIED RELEASE</h2>
        <ol>
          {workflow.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="cta-band" aria-labelledby="cta-title">
        <div className="m-stripe" aria-hidden="true"><span /><span /><span /></div>
        <h2 id="cta-title">KEEP THE WORK REVIEWABLE</h2>
        <p>
          Harness keeps task memory, projection rules, and verification evidence close to the code.
        </p>
        <a className="text-link" href="https://github.com/ilderaj/superpowering-with-files/blob/main/docs/architecture.md">
          Explore architecture
        </a>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Create `homepage/src/styles.css`**

Write a complete CSS file using the BMW M tokens from `homepage/DESIGN.md`. At minimum include these rules and then tune values after browser review:

```css
:root {
  color-scheme: dark;
  --canvas: #000000;
  --surface-soft: #0d0d0d;
  --surface-card: #1a1a1a;
  --hairline: #3c3c3c;
  --ink: #ffffff;
  --body-strong: #e6e6e6;
  --body: #bbbbbb;
  --muted: #7e7e7e;
  --m-blue-light: #0066b1;
  --m-blue-dark: #1c69d4;
  --m-red: #e22718;
  font-family: Inter, Arial, Helvetica, sans-serif;
  background: var(--canvas);
  color: var(--ink);
}

* { box-sizing: border-box; }
html { background: var(--canvas); scroll-behavior: smooth; }
body { margin: 0; min-width: 320px; background: var(--canvas); }
a { color: inherit; text-decoration: none; }
img { display: block; max-width: 100%; }

.page-shell {
  min-height: 100vh;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(0, 102, 177, 0.2), transparent 18%),
    linear-gradient(180deg, #050505 0%, #000 34%);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 72px;
  padding: 0 40px;
  border-bottom: 1px solid var(--hairline);
  background: rgba(0, 0, 0, 0.86);
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: blur(16px);
}

.brand, .nav-links, .hero-actions, .brand-mark, .m-stripe {
  display: flex;
  align-items: center;
}

.brand { gap: 12px; font-size: 14px; font-weight: 700; letter-spacing: 1.5px; }
.brand-mark span, .m-stripe span { display: block; }
.brand-mark span { width: 18px; height: 22px; }
.brand-mark span:nth-child(1), .m-stripe span:nth-child(1) { background: var(--m-blue-light); }
.brand-mark span:nth-child(2), .m-stripe span:nth-child(2) { background: var(--m-blue-dark); }
.brand-mark span:nth-child(3), .m-stripe span:nth-child(3) { background: var(--m-red); }

.nav-links { gap: 28px; font-size: 14px; color: var(--body); letter-spacing: 0.5px; }
.nav-links a:hover, .text-link:hover { color: var(--ink); }

.hero-section {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(420px, 1.08fr);
  gap: 48px;
  align-items: center;
  min-height: calc(100vh - 72px);
  padding: 72px 40px 96px;
  max-width: 1440px;
  margin: 0 auto;
}

.eyebrow {
  margin: 0 0 18px;
  color: var(--body);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}

h1, h2, h3, p { margin-top: 0; }
h1, h2 {
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0;
  text-transform: uppercase;
}
h1 { max-width: 760px; margin-bottom: 24px; font-size: clamp(48px, 8vw, 112px); }
h2 { margin-bottom: 24px; font-size: clamp(36px, 5vw, 72px); }
h3 { margin-bottom: 12px; font-size: 24px; line-height: 1.3; }

.hero-lede {
  max-width: 660px;
  color: var(--body-strong);
  font-size: 20px;
  font-weight: 300;
  line-height: 1.5;
}

.hero-actions { gap: 14px; flex-wrap: wrap; margin-top: 32px; }
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 22px;
  border: 1px solid var(--ink);
  border-radius: 0;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}
.button-primary { background: var(--ink); color: var(--canvas); }
.button-secondary { background: transparent; color: var(--ink); }
.button:hover { transform: translateY(-1px); }

.hero-visual {
  margin: 0;
  border: 1px solid var(--hairline);
  background: var(--surface-soft);
}
.hero-visual img { width: 100%; aspect-ratio: 1200 / 760; object-fit: cover; }
.hero-visual figcaption {
  padding: 14px 16px;
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.5px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 40px 96px;
}
.metric-cell {
  min-height: 188px;
  padding: 28px;
  border: 1px solid var(--hairline);
  border-left: 0;
  background: var(--surface-soft);
}
.metric-cell:first-child { border-left: 1px solid var(--hairline); }
.metric-cell p { color: var(--muted); font-size: 13px; font-weight: 700; letter-spacing: 1.5px; }
.metric-cell strong { display: block; margin-bottom: 16px; font-size: 32px; text-transform: uppercase; }
.metric-cell span { color: var(--body); line-height: 1.5; }

.split-section {
  display: grid;
  grid-template-columns: minmax(280px, 0.8fr) minmax(0, 1.2fr);
  gap: 48px;
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 40px 96px;
}
.feature-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.feature-card { padding: 28px; border: 1px solid var(--hairline); background: var(--surface-card); }
.feature-card p, .cta-band p { color: var(--body); line-height: 1.5; }

.workflow-band, .cta-band {
  max-width: 1440px;
  margin: 0 auto;
  padding: 96px 40px;
  border-top: 1px solid var(--hairline);
}
.workflow-band ol {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 1px;
  padding: 0;
  list-style: none;
  background: var(--hairline);
}
.workflow-band li {
  min-height: 92px;
  padding: 22px;
  background: var(--surface-soft);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}

.cta-band { padding-bottom: 120px; }
.m-stripe { width: 180px; height: 4px; margin-bottom: 32px; }
.m-stripe span { flex: 1; height: 4px; }
.text-link { color: var(--ink); font-size: 14px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; }

@media (max-width: 900px) {
  .topbar { padding: 0 20px; }
  .nav-links { gap: 16px; }
  .hero-section, .split-section { grid-template-columns: 1fr; padding-left: 20px; padding-right: 20px; }
  .metrics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); padding-left: 20px; padding-right: 20px; }
  .feature-grid, .workflow-band ol { grid-template-columns: 1fr; }
  .workflow-band, .cta-band { padding-left: 20px; padding-right: 20px; }
}

@media (max-width: 560px) {
  .topbar { align-items: flex-start; flex-direction: column; gap: 16px; height: auto; padding-top: 18px; padding-bottom: 18px; }
  .nav-links { flex-wrap: wrap; }
  .hero-section { min-height: auto; padding-top: 48px; }
  .metrics-grid { grid-template-columns: 1fr; }
  .metric-cell, .metric-cell:first-child { border-left: 1px solid var(--hairline); }
}
```

- [ ] **Step 6: Run typecheck**

Run:

```bash
npm run typecheck --prefix homepage
```

Expected: PASS. If it fails, fix only homepage files.

---

### Task 6: Build and Preview the Homepage

**Files:**
- Modify only homepage files if verification finds UI or build defects.

- [ ] **Step 1: Build homepage**

Run:

```bash
npm run build --prefix homepage
```

Expected: PASS and `homepage/dist/` exists.

- [ ] **Step 2: Run homepage tests**

Run:

```bash
npm test --prefix homepage
```

Expected: PASS for route utility tests.

- [ ] **Step 3: Start local preview**

Run in async mode if using an agent tool, or manually in a terminal:

```bash
npm run preview --prefix homepage -- --port 4173
```

Expected: Vite serves the built app locally.

- [ ] **Step 4: Browser-check desktop**

Open:

```text
http://127.0.0.1:4173/superpowering-with-files/
```

Expected desktop checks:

- Hero headline is visible above the fold.
- The M stripe accent is visible but not used as a button fill.
- The visual asset loads and does not overlap text.
- Metrics grid appears below the first viewport or with a clear hint of continuation.
- Text fits without clipping at 1280px wide.

- [ ] **Step 5: Browser-check mobile**

Open the same URL at a mobile-sized viewport around 390px wide.

Expected mobile checks:

- Navigation wraps without overlap.
- Hero title fits the viewport.
- Feature and metric grids collapse to one column.
- Buttons remain at least 48px tall.
- No text overlaps the visual asset.

- [ ] **Step 6: Stop the preview server**

Stop the preview process after screenshots and interaction checks are complete.

---

### Task 7: Validate Worker Static Assets Deployment Locally

**Files:**
- Modify: `homepage/wrangler.jsonc` only if Wrangler validation requires schema fixes.
- Modify: `homepage/src/worker.ts` or `homepage/src/route-utils.mjs` only if path handling fails.

- [ ] **Step 1: Run Wrangler dry-run**

Run:

```bash
npx --prefix homepage wrangler deploy --config homepage/wrangler.jsonc --dry-run
```

Expected: PASS without deploying. If Wrangler reports an unsupported `routes` or `assets` field, update `homepage/wrangler.jsonc` according to the installed `homepage/node_modules/wrangler/config-schema.json` and record the schema adjustment in findings.

- [ ] **Step 2: Test Worker route utility again**

Run:

```bash
npm test --prefix homepage
```

Expected: PASS. This catches accidental regressions while tuning Worker config.

- [ ] **Step 3: Record deployment prerequisites**

Update `docs/install/homepage-cloudflare-worker.md` in Task 8 with the exact secrets and route assumptions from the final `wrangler.jsonc`.

---

### Task 8: Add Operator Documentation

**Files:**
- Create: `docs/install/homepage-cloudflare-worker.md`

- [ ] **Step 1: Create deployment documentation**

Write this complete file in English:

````markdown
# Homepage Cloudflare Worker

The homepage lives in `homepage/` and is deployed to:

```text
https://vibing.paymond.me/superpowering-with-files
```

## Local Development

```bash
npm install --prefix homepage
npm run dev --prefix homepage
```

Open:

```text
http://127.0.0.1:5173/superpowering-with-files/
```

## Local Verification

```bash
npm run typecheck --prefix homepage
npm test --prefix homepage
npm run build --prefix homepage
npx --prefix homepage wrangler deploy --config homepage/wrangler.jsonc --dry-run
```

## Production Deployment

GitHub Actions deploys the homepage when changes reach `origin/main` and match the paths in `.github/workflows/homepage-deploy.yml`.

Required GitHub Actions secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The Worker route is:

```text
vibing.paymond.me/superpowering-with-files*
```

## Manual Deployment

```bash
npm run build --prefix homepage
CLOUDFLARE_ACCOUNT_ID=<account-id> CLOUDFLARE_API_TOKEN=<token> \
  npx --prefix homepage wrangler deploy --config homepage/wrangler.jsonc
```

## Rollback

Use the Cloudflare Workers deployment history for `superpowering-with-files-homepage` to roll back to the previous deployment. If a broken deployment came from `main`, revert the commit in GitHub and let the deploy workflow publish the corrected build.
````

- [ ] **Step 2: Verify documentation paths match config**

Run:

```bash
grep -R "superpowering-with-files-homepage\|vibing.paymond.me/superpowering-with-files" homepage/wrangler.jsonc docs/install/homepage-cloudflare-worker.md
```

Expected: The Worker name and route are consistent.

---

### Task 9: Add GitHub Actions Deployment Workflow

**Files:**
- Create: `.github/workflows/homepage-deploy.yml`

- [ ] **Step 1: Create `.github/workflows/homepage-deploy.yml`**

Write this complete file:

```yaml
name: Deploy Homepage

on:
  push:
    branches:
      - main
    paths:
      - 'homepage/**'
      - '.github/workflows/homepage-deploy.yml'
      - 'docs/install/homepage-cloudflare-worker.md'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: homepage-deploy-${{ github.ref }}
  cancel-in-progress: false

jobs:
  deploy-homepage:
    if: ${{ github.repository == 'ilderaj/superpowering-with-files' }}
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v6

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: homepage/package-lock.json

      - name: Install homepage dependencies
        run: npm ci --prefix homepage

      - name: Typecheck homepage
        run: npm run typecheck --prefix homepage

      - name: Test homepage
        run: npm test --prefix homepage

      - name: Build homepage
        run: npm run build --prefix homepage

      - name: Deploy homepage Worker
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: npx --prefix homepage wrangler deploy --config homepage/wrangler.jsonc
```

- [ ] **Step 2: Do not add auto-merge behavior**

Search the new workflow:

```bash
grep -n "gh pr merge\|--auto\|--force" .github/workflows/homepage-deploy.yml || true
```

Expected: No unsafe merge or force-push commands appear.

---

### Task 10: Add Repository-Level Workflow Tests

**Files:**
- Create: `tests/automation/homepage-deploy-workflow.test.mjs`

- [ ] **Step 1: Write failing workflow tests**

Create `tests/automation/homepage-deploy-workflow.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const workflowPath = path.join(process.cwd(), '.github/workflows/homepage-deploy.yml');

function extractTopLevelBlock(documentText, blockName) {
  const lines = documentText.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => {
    const match = line.match(/^(['"]?)([A-Za-z0-9_-]+)\1:\s*(?:#.*)?$/);
    return match?.[2] === blockName;
  });

  assert.notEqual(startIndex, -1, `Expected top-level ${blockName} block`);

  const blockLines = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^\S[^:]*:\s*(?:#.*)?$/.test(lines[index])) break;
    blockLines.push(lines[index]);
  }

  return blockLines.join('\n');
}

function extractJobBlock(documentText, jobName) {
  const lines = documentText.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line === `  ${jobName}:`);

  assert.notEqual(startIndex, -1, `Expected ${jobName} job block`);

  const blockLines = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[index])) break;
    blockLines.push(lines[index]);
  }

  return blockLines.join('\n');
}

function extractStepBlock(documentText, stepName) {
  const lines = documentText.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line === `      - name: ${stepName}`);

  assert.notEqual(startIndex, -1, `Expected ${stepName} step block`);

  const blockLines = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    if (index !== startIndex && /^\s{6}- name:\s+/.test(lines[index])) break;
    blockLines.push(lines[index]);
  }

  return blockLines.join('\n');
}

test('homepage deploy workflow runs only on main homepage changes and manual dispatch', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const onBlock = extractTopLevelBlock(workflow, 'on');

  assert.match(onBlock, /^\s+push:\s*$/m);
  assert.match(onBlock, /^\s{4}branches:\s*$/m);
  assert.match(onBlock, /^\s{6}-\s*main\s*$/m);
  assert.match(onBlock, /^\s{4}paths:\s*$/m);
  assert.match(onBlock, /^\s{6}-\s*'homepage\/\*\*'\s*$/m);
  assert.match(onBlock, /^\s{6}-\s*'\.github\/workflows\/homepage-deploy\.yml'\s*$/m);
  assert.match(onBlock, /^\s{6}-\s*'docs\/install\/homepage-cloudflare-worker\.md'\s*$/m);
  assert.match(onBlock, /^\s+workflow_dispatch:\s*$/m);
});

test('homepage deploy workflow grants read-only repository permissions', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const permissionsBlock = extractTopLevelBlock(workflow, 'permissions');

  assert.match(permissionsBlock, /^\s+contents:\s*read\s*$/m);
  assert.doesNotMatch(permissionsBlock, /write/);
});

test('homepage deploy workflow builds, tests, and deploys the homepage Worker', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const jobBlock = extractJobBlock(workflow, 'deploy-homepage');
  const setupNodeBlock = extractStepBlock(workflow, 'Set up Node.js');
  const installBlock = extractStepBlock(workflow, 'Install homepage dependencies');
  const typecheckBlock = extractStepBlock(workflow, 'Typecheck homepage');
  const testBlock = extractStepBlock(workflow, 'Test homepage');
  const buildBlock = extractStepBlock(workflow, 'Build homepage');
  const deployBlock = extractStepBlock(workflow, 'Deploy homepage Worker');

  assert.match(jobBlock, /^\s{4}if:\s*\$\{\{\s*github\.repository\s*==\s*'ilderaj\/superpowering-with-files'\s*\}\}\s*$/m);
  assert.match(jobBlock, /^\s{4}runs-on:\s*ubuntu-latest\s*$/m);
  assert.match(setupNodeBlock, /^\s{8}uses:\s*actions\/setup-node@v6\s*$/m);
  assert.match(setupNodeBlock, /^\s{10}node-version:\s*'22'\s*$/m);
  assert.match(setupNodeBlock, /^\s{10}cache-dependency-path:\s*homepage\/package-lock\.json\s*$/m);
  assert.match(installBlock, /^\s{8}run:\s*npm ci --prefix homepage\s*$/m);
  assert.match(typecheckBlock, /^\s{8}run:\s*npm run typecheck --prefix homepage\s*$/m);
  assert.match(testBlock, /^\s{8}run:\s*npm test --prefix homepage\s*$/m);
  assert.match(buildBlock, /^\s{8}run:\s*npm run build --prefix homepage\s*$/m);
  assert.match(deployBlock, /^\s{10}CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}\s*$/m);
  assert.match(deployBlock, /^\s{10}CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{\s*secrets\.CLOUDFLARE_ACCOUNT_ID\s*\}\}\s*$/m);
  assert.match(deployBlock, /^\s{8}run:\s*npx --prefix homepage wrangler deploy --config homepage\/wrangler\.jsonc\s*$/m);
});

test('homepage deploy workflow avoids auto-merge and unsafe force pushes', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.doesNotMatch(workflow, /\bgh\s+pr\s+merge\b/);
  assert.doesNotMatch(workflow, /--auto\b/);
  assert.doesNotMatch(workflow, /--force(?!-with-lease)\b/);
});
```

- [ ] **Step 2: Run tests and verify they fail before the workflow exists**

Run:

```bash
node --test tests/automation/homepage-deploy-workflow.test.mjs
```

Expected before Task 9: FAIL with missing workflow. Expected after Task 9: PASS.

- [ ] **Step 3: Run automation tests after workflow creation**

Run:

```bash
node --test tests/automation/homepage-deploy-workflow.test.mjs
```

Expected: PASS.

---

### Task 11: Full Verification

**Files:**
- Modify only files directly related to failures.

- [ ] **Step 1: Run homepage verification**

Run:

```bash
npm run typecheck --prefix homepage
npm test --prefix homepage
npm run build --prefix homepage
npx --prefix homepage wrangler deploy --config homepage/wrangler.jsonc --dry-run
```

Expected: All commands pass.

- [ ] **Step 2: Run repository verification**

Run:

```bash
npm run verify
```

Expected: PASS. If unrelated existing cloud-dev task changes cause failure, record the exact failure and do not edit unrelated files without user approval.

- [ ] **Step 3: Run diff hygiene check**

Run:

```bash
git diff --check
```

Expected: PASS.

- [ ] **Step 4: Inspect final changed files**

Run:

```bash
git status --short
```

Expected homepage task files only, plus any pre-existing unrelated dirty files that were present before execution.

- [ ] **Step 5: Update active planning files**

Update these files with verification results and final changed files:

- `planning/active/homepage-cloudflare-worker/task_plan.md`
- `planning/active/homepage-cloudflare-worker/findings.md`
- `planning/active/homepage-cloudflare-worker/progress.md`

Expected: Active planning files remain the lifecycle source of truth, while this companion plan remains the detailed execution checklist.

---

## Self-Review

- Spec coverage: The plan covers homepage creation, BMW M design installation, Cloudflare Worker deployment, `origin/main` automation, custom route, local verification, docs, and repository tests.
- Placeholder scan: No open-ended implementation placeholders remain. External credentials are explicitly named as required secrets.
- Type consistency: Route utility names, Worker imports, workflow path, Worker name, route pattern, and docs paths are consistent across tasks.
- Risk check: The plan isolates homepage work under `homepage/`, adds only one workflow and one automation test, and avoids destructive git commands.
