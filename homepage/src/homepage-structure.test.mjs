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
