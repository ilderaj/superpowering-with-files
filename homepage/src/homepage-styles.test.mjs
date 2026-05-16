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
