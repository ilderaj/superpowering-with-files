import test from 'node:test';
import assert from 'node:assert/strict';
import { homepageContent, homepageSectionOrder } from './homepage-content.mjs';

test('defines the approved five-section homepage flow with matching content keys', () => {
  const sectionKeys = ['hero', 'comparison', 'routing', 'repoProof', 'closing'];

  assert.deepEqual(homepageSectionOrder, sectionKeys);

  for (const sectionKey of sectionKeys) {
    assert.ok(sectionKey in homepageContent, `Expected homepageContent.${sectionKey} to exist`);
  }
});

test('locks the manifesto hero claim and keeps exit paths aligned', () => {
  const githubUrl = 'https://github.com/ilderaj/superpowering-with-files';
  const docsUrl = 'https://github.com/ilderaj/superpowering-with-files/blob/main/docs/workflows.md';

  assert.equal(homepageContent.hero.headline, 'Stop losing good judgment.');
  assert.deepEqual(
    homepageContent.hero.actions.map(({ label }) => label),
    ['View source', 'Read workflow']
  );
  assert.deepEqual(
    homepageContent.hero.actions.map(({ href }) => href),
    [githubUrl, docsUrl]
  );
  assert.deepEqual(homepageContent.topbar.links, [
    { label: 'Docs', href: docsUrl },
    { label: 'GitHub', href: githubUrl }
  ]);
  assert.deepEqual(homepageContent.closing.links, [
    { label: 'GitHub', href: githubUrl },
    { label: 'Docs', href: docsUrl }
  ]);
  assert.deepEqual(
    [...new Set(homepageContent.topbar.links.concat(homepageContent.hero.actions, homepageContent.closing.links).map(({ href }) => href))],
    [docsUrl, githubUrl]
  );
});

test('keeps the comparison strip focused on breadth, depth, and both', () => {
  assert.deepEqual(
    homepageContent.comparison.map(({ label }) => label),
    ['Only breadth', 'Only depth', 'Both']
  );
  assert.equal(homepageContent.proof.hybrid.title, 'One workflow. Routed by complexity.');
});
