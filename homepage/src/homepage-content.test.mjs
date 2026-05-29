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

test('locks the Claude DesignMD hero claim and keeps exit paths aligned', () => {
  const githubUrl = 'https://github.com/ilderaj/superpowering-with-files';
  const docsUrl = 'https://github.com/ilderaj/superpowering-with-files/blob/main/docs/workflows.md';

  assert.equal(homepageContent.hero.kicker, 'Claude Code workflow kit');
  assert.equal(homepageContent.hero.headline, 'Give agents a memory they can open.');
  assert.equal(
    homepageContent.hero.lede,
    'Superpowering with Files turns deep reasoning into planning files, so local coding agents can pause, resume, and hand off without losing the trail.'
  );
  assert.deepEqual(
    homepageContent.hero.actions.map(({ label }) => label),
    ['Star the repo', 'Read the workflow']
  );
  assert.deepEqual(
    homepageContent.hero.actions.map(({ href }) => href),
    [githubUrl, docsUrl]
  );
  assert.deepEqual(homepageContent.topbar.links, [
    { label: 'Workflow', href: docsUrl },
    { label: 'GitHub', href: githubUrl }
  ]);
  assert.deepEqual(homepageContent.closing.links, [
    { label: 'Star on GitHub', href: githubUrl },
    { label: 'Study the workflow', href: docsUrl }
  ]);
  assert.deepEqual(
    [...new Set(homepageContent.topbar.links.concat(homepageContent.hero.actions, homepageContent.closing.links).map(({ href }) => href))],
    [docsUrl, githubUrl]
  );
});

test('keeps the product argument concise and specific to the hybrid workflow', () => {
  assert.deepEqual(
    homepageContent.comparison.map(({ label }) => label),
    ['Reason', 'Record', 'Resume']
  );
  assert.deepEqual(
    homepageContent.comparison.map(({ title }) => title),
    [
      'Use Superpowers when the task earns depth.',
      'Write decisions into files the repo can carry.',
      'Let any local agent pick up the thread.'
    ]
  );
  assert.equal(homepageContent.proof.hybrid.title, 'Depth becomes durable state.');
  assert.equal(homepageContent.closing.title, 'If your agents lose context, give them files.');
});
