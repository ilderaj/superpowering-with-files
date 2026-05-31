import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

test('keeps the draft-inspired warm product palette and elevated surfaces', () => {
  assert.ok(css.includes('color-scheme: light'))
  assert.ok(css.includes('--accent: #ff5f3d'))
  assert.ok(css.includes('--paper: #fffaf2'))
  assert.ok(css.includes('--card: rgba(255, 255, 255, 0.82)'))
  assert.ok(css.includes('--shadow: 0 24px 70px rgba(17, 24, 39, 0.12)'))
})

test('defines the key layout hooks used by the refactored homepage', () => {
  assert.ok(css.includes('.nav'))
  assert.ok(css.includes('.hero-grid'))
  assert.ok(css.includes('.proof-row'))
  assert.ok(css.includes('.product-card'))
  assert.ok(css.includes('.terminal'))
  assert.ok(css.includes('.route-card'))
  assert.ok(css.includes('.problem-grid'))
  assert.ok(css.includes('.system-grid'))
  assert.ok(css.includes('.split'))
  assert.ok(css.includes('.install-card'))
  assert.ok(css.includes('.cta'))
})

test('includes responsive collapse and sticky navigation behavior from the draft', () => {
  assert.ok(css.includes('position: sticky'))
  assert.ok(css.includes('@media (max-width: 920px)'))
  assert.ok(css.includes('@media (max-width: 620px)'))
  assert.ok(css.includes('grid-template-columns: 1fr'))
  assert.ok(css.includes('.nav-links { display: none; }'))
})
