import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const compactHtml = html.replace(/\s+/g, ' ')

const expectedUrl = 'https://ilderaj.github.io/superpowering-with-files/'
const expectedImage = 'https://ilderaj.github.io/superpowering-with-files/og-image.png'
const expectedDescription = 'A Claude Code workflow kit that turns deep reasoning into durable planning files for local coding agents.'

test('defines search-ready title, description, canonical, robots, and theme color', () => {
  assert.match(compactHtml, /<title>Superpowering with Files \| Claude Code workflow kit<\/title>/)
  assert.match(compactHtml, new RegExp(`<meta name="description" content="${expectedDescription}" \/>`))
  assert.match(compactHtml, new RegExp(`<link rel="canonical" href="${expectedUrl}" \/>`))
  assert.match(compactHtml, /<meta name="robots" content="index, follow, max-image-preview:large" \/>/)
  assert.match(compactHtml, /<meta name="theme-color" content="#faf9f5" \/>/)
})

test('defines Open Graph and Twitter metadata for repository sharing', () => {
  for (const tag of [
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Superpowering with Files" />',
    `<meta property="og:url" content="${expectedUrl}" />`,
    '<meta property="og:title" content="Superpowering with Files | Claude Code workflow kit" />',
    `<meta property="og:description" content="${expectedDescription}" />`,
    `<meta property="og:image" content="${expectedImage}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="Superpowering with Files | Claude Code workflow kit" />',
    `<meta name="twitter:description" content="${expectedDescription}" />`,
    `<meta name="twitter:image" content="${expectedImage}" />`
  ]) {
    assert.ok(compactHtml.includes(tag), `Missing SEO tag: ${tag}`)
  }
})

test('points social sharing metadata at a published image asset', () => {
  const publicImagePath = new URL('../public/og-image.png', import.meta.url)

  assert.equal(existsSync(publicImagePath), true)
})

