import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const theme = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

test('keeps the Paper & Ink token contract and the dark proof surface', () => {
  assert.ok(theme.includes('color-scheme: light'));
  assert.ok(theme.includes('--background: #f7f7f4'));
  assert.ok(theme.includes('--accent: #cc785c'));
  assert.ok(theme.includes('--paper: #f7f7f4'));
  assert.ok(theme.includes('--surface-dark: #171614'));
  assert.ok(theme.includes('--line: #e3e2dd'));
  assert.ok(theme.includes("--font-sans: StyreneB, Inter, 'Helvetica Neue', Arial, sans-serif"));
  assert.ok(theme.includes("--font-mono: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace"));
});

test('v2 restraint: no serif display, no gradients, no glass', () => {
  const all = `${theme}\n${css}`;
  const rules = all.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(rules, /(?<!sans-)serif/);
  assert.doesNotMatch(rules, /gradient/);
  assert.doesNotMatch(rules, /backdrop-filter/);
  assert.doesNotMatch(rules, /translateY\(-2px\)/);
});

test('defines the key layout hooks used by the homepage', () => {
  assert.ok(css.includes('.nav'));
  assert.ok(css.includes('.hero-grid'));
  assert.ok(css.includes('.product-card'));
  assert.ok(css.includes('.proof-row'));
  assert.ok(css.includes('.terminal'));
  assert.ok(css.includes('.route-card'));
  assert.ok(css.includes('.problem-grid'));
  assert.ok(css.includes('.system-grid'));
  assert.ok(css.includes('.split'));
  assert.ok(css.includes('.install-card'));
  assert.ok(css.includes('.cta'));
  assert.ok(css.includes('.cta-actions'));
  assert.ok(css.includes('.footer-links'));
});

test('includes sticky navigation and responsive single-column collapse', () => {
  assert.ok(css.includes('position: sticky'));
  assert.ok(css.includes('overflow-x: hidden;'));
  assert.ok(css.includes('@media (max-width: 920px)'));
  assert.ok(css.includes('@media (max-width: 620px)'));
  assert.ok(css.includes('grid-template-columns: 1fr'));
  assert.ok(css.includes('.nav-links {'));
  assert.ok(css.includes('.nav > .button'));
  assert.ok(css.includes('justify-items: stretch;'));
  assert.ok(css.includes('overflow-wrap: anywhere;'));
  assert.ok(css.includes('width: min(1180px, calc(100% - 28px));'));
  assert.ok(css.includes('font-size: clamp(34px, 12vw, 48px);'));
});
