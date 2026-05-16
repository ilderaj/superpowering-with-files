import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

test('switches the homepage back to a dark manifesto-ready canvas', () => {
  assert.ok(css.includes('color-scheme: dark'))
  assert.ok(css.includes('--canvas: #000000'))
  assert.ok(css.includes('--surface: #0d0d0d'))
})

test('defines the key dark layout hooks used by App.tsx', () => {
  assert.ok(css.includes('.hero-equation'))
  assert.ok(css.includes('.routing-grid'))
  assert.ok(css.includes('.repo-proof-list'))
  assert.ok(css.includes('.hero-button--primary'))
  assert.ok(css.includes('.section-heading'))
  assert.ok(css.includes('.topbar-links'))
})

test('includes reduced-motion handling and responsive single-column collapse', () => {
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'))
  assert.ok(css.includes('scroll-behavior: auto'))
  assert.ok(css.includes('@media (max-width: 900px)'))
  assert.ok(css.includes('grid-template-columns: 1fr'))
  assert.ok(css.includes('.hero-equation'))
})

test('makes the narrow-screen topbar link behavior explicit', () => {
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.topbar-links \{[\s\S]*flex-wrap: wrap;[\s\S]*justify-content: flex-start;/)
})

test('removes the old light-surface theme flag', () => {
  assert.equal(css.includes('color-scheme: light'), false)
})
