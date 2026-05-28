import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

test('uses the Claude DesignMD warm canvas with a restrained coral accent', () => {
  assert.ok(css.includes('color-scheme: light'))
  assert.ok(css.includes('--canvas: oklch(0.985 0.008 90)'))
  assert.ok(css.includes('--surface-card: oklch(0.94 0.018 82)'))
  assert.ok(css.includes('--surface-dark: oklch(0.18 0.012 76)'))
  assert.ok(css.includes('--accent: oklch(0.62 0.12 35)'))
})

test('defines the key Claude product-surface layout hooks used by App.tsx', () => {
  assert.ok(css.includes('.hero-equation'))
  assert.ok(css.includes('.routing-grid'))
  assert.ok(css.includes('.repo-proof-list'))
  assert.ok(css.includes('.hero-button--primary'))
  assert.ok(css.includes('.section-heading'))
  assert.ok(css.includes('.topbar-links'))
  assert.ok(css.includes('.product-surface'))
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

test('removes BMW M and pure black or white color remnants', () => {
  assert.equal(css.includes('--m-blue'), false)
  assert.equal(css.includes('--m-red'), false)
  assert.equal(css.includes('#000000'), false)
  assert.equal(css.includes('#ffffff'), false)
  assert.equal(css.includes('color-scheme: dark'), false)
})
