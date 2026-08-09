import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const compactHtml = html.replace(/\s+/g, ' ');

const expectedUrl = 'https://ilderaj.github.io/superpowering-with-files/';
const expectedImage = 'https://ilderaj.github.io/superpowering-with-files/og-image.png';
const expectedTitle = 'Superpowering with Files | Trio v2 for Codex';
const expectedDescription =
  'Trio v2 for Codex: managed native host, planning trio, dev/office/safety, manual fallback, native Goal/continuation, and no second runner.';
const expectedKeywords = [
  'Codex',
  'Trio v2',
  'managed native host',
  'planning trio',
  'dev',
  'office',
  'safety',
  'manual fallback',
  'native Goal',
  'continuation',
  'no second runner'
];

test('defines search-ready title, description, canonical, robots, and theme color', () => {
  assert.match(compactHtml, new RegExp(`<title>${expectedTitle}<\\/title>`));
  assert.match(compactHtml, new RegExp(`<meta name="description" content="${expectedDescription}" \\/>`));
  assert.match(compactHtml, new RegExp(`<link rel="canonical" href="${expectedUrl}" \\/>`));
  assert.match(compactHtml, /<meta name="robots" content="index, follow, max-image-preview:large" \/>/);
  assert.match(compactHtml, /<meta name="theme-color" content="#f7f7f4" \/>/);
});

test('defines Open Graph and Twitter metadata for repository sharing', () => {
  for (const tag of [
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Superpowering with Files" />',
    `<meta property="og:url" content="${expectedUrl}" />`,
    `<meta property="og:title" content="${expectedTitle}" />`,
    `<meta property="og:description" content="${expectedDescription}" />`,
    `<meta property="og:image" content="${expectedImage}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${expectedTitle}" />`,
    `<meta name="twitter:description" content="${expectedDescription}" />`,
    `<meta name="twitter:image" content="${expectedImage}" />`
  ]) {
    assert.ok(compactHtml.includes(tag), `Missing SEO tag: ${tag}`);
  }
});

test('links a local favicon asset from the homepage shell', () => {
  assert.match(compactHtml, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/);
});

test('points social sharing metadata at a published image asset and favicon files', () => {
  const publicImagePath = new URL('../public/og-image.png', import.meta.url);
  const faviconPath = new URL('../public/favicon.svg', import.meta.url);
  const faviconCornerSparkPath = new URL('../public/favicon-corner-spark.svg', import.meta.url);
  const faviconFoldedFilePath = new URL('../public/favicon-folded-file.svg', import.meta.url);
  const faviconStackedFilesPath = new URL('../public/favicon-stacked-files.svg', import.meta.url);
  const faviconStackedFilesCompactPath = new URL('../public/favicon-stacked-files-compact.svg', import.meta.url);
  const faviconStackedFilesFoldedPath = new URL('../public/favicon-stacked-files-folded.svg', import.meta.url);
  const faviconStackedFilesLayeredPath = new URL('../public/favicon-stacked-files-layered.svg', import.meta.url);

  assert.equal(existsSync(publicImagePath), true);
  assert.equal(existsSync(faviconPath), true);
  assert.equal(existsSync(faviconCornerSparkPath), true);
  assert.equal(existsSync(faviconFoldedFilePath), true);
  assert.equal(existsSync(faviconStackedFilesPath), true);
  assert.equal(existsSync(faviconStackedFilesCompactPath), true);
  assert.equal(existsSync(faviconStackedFilesFoldedPath), true);
  assert.equal(existsSync(faviconStackedFilesLayeredPath), true);
});

test('keeps V2 host, planning, fallback, and runtime facts aligned across metadata and JSON-LD', () => {
  const keywords = expectedKeywords.join(', ');
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);

  assert.ok(jsonLdMatch, 'Missing JSON-LD script');
  assert.match(compactHtml, new RegExp(`<meta name="keywords" content="${keywords}" \\/>`));

  const jsonLd = JSON.parse(jsonLdMatch[1]);
  assert.equal(jsonLd.name, 'Superpowering with Files');
  assert.equal(jsonLd.description, expectedDescription);
  assert.deepEqual(jsonLd.keywords, expectedKeywords);

  for (const requiredFact of ['managed native host', 'planning trio', 'manual fallback']) {
    assert.match(expectedDescription, new RegExp(requiredFact, 'i'));
    assert.ok(expectedKeywords.includes(requiredFact), `Missing required keyword: ${requiredFact}`);
  }

  for (const retiredClaim of ['Cursor', 'GitHub Copilot', 'Claude Code', 'governance', 'multi-host']) {
    assert.doesNotMatch(html, new RegExp(retiredClaim, 'i'));
  }
});
