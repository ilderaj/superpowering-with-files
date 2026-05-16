import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { homepageSectionOrder } from './homepage-content.mjs'

const source = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const normalizedSource = source.replace(/\s+/g, ' ')

test('derives rendered section order from homepageSectionOrder', () => {
  assert.match(
    normalizedSource,
    /homepageSectionOrder\.map\(\(sectionKey\) => sectionContent\[sectionKey as keyof typeof sectionContent\]\)/
  )
})

test('defines renderers for every approved homepage section in contract order', () => {
  const rendererPositions = homepageSectionOrder.map((sectionKey) => {
    const match = source.match(new RegExp(`${sectionKey}:\\s*\\(`))
    assert.ok(match, `missing renderer for section: ${sectionKey}`)
    return source.indexOf(match[0])
  })

  const sortedPositions = [...rendererPositions].sort((a, b) => a - b)
  assert.deepEqual(rendererPositions, sortedPositions)
})

test('wires key hero and downstream content from homepageContent', () => {
  assert.ok(source.includes("from './homepage-content.mjs'"))
  assert.ok(source.includes('homepageContent.hero.headline'))
  assert.ok(source.includes('homepageContent.proof.hybrid.title'))
  assert.ok(source.includes('homepageContent.routing.bullets.map'))
  assert.ok(source.includes('homepageContent.repoProof.items.map'))
  assert.ok(source.includes('homepageContent.closing.links.map'))
})
