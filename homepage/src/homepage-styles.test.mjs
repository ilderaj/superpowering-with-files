import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

test('keeps the warm editorial palette and dark proof surface from the design contract', () => {
  assert.ok(css.includes('color-scheme: light'));
  assert.ok(css.includes('--accent: #cc785c'));
  assert.ok(css.includes('--paper: #faf9f5'));
  assert.ok(css.includes('--surface-dark: #181715'));
  assert.ok(css.includes('--line: #e6dfd8'));
  assert.ok(css.includes("font-family: StyreneB, Inter, 'Helvetica Neue', Arial, sans-serif"));
  assert.ok(css.includes("font-family: Copernicus, 'Tiempos Headline', Georgia, serif"));
});

test('defines the key layout hooks used by the simplified homepage', () => {
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
  assert.ok(css.includes('font-size: clamp(42px, 15vw, 60px);'));
});
