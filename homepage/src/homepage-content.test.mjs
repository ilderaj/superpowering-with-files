import test from 'node:test';
import assert from 'node:assert/strict';
import { homepageContent, homepageSectionOrder } from './homepage-content.mjs';

test('defines the approved five-section homepage flow', () => {
  assert.deepEqual(homepageSectionOrder, [
    'hero',
    'comparison',
    'routing',
    'repo-proof',
    'closing'
  ]);
});

test('locks the manifesto hero claim and exit paths', () => {
  assert.equal(homepageContent.hero.headline, 'Stop losing good judgment.');
  assert.deepEqual(
    homepageContent.hero.actions.map(({ label }) => label),
    ['View source', 'Read workflow']
  );
  assert.equal(
    homepageContent.hero.actions[0].href,
    'https://github.com/ilderaj/superpowering-with-files'
  );
  assert.equal(
    homepageContent.hero.actions[1].href,
    'https://github.com/ilderaj/superpowering-with-files/blob/main/docs/workflows.md'
  );
});

test('keeps the comparison strip focused on breadth, depth, and both', () => {
  assert.deepEqual(
    homepageContent.comparison.map(({ label }) => label),
    ['Only breadth', 'Only depth', 'Both']
  );
  assert.equal(homepageContent.proof.hybrid.title, 'One workflow. Routed by complexity.');
});
