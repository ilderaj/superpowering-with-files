import test from 'node:test';
import assert from 'node:assert/strict';
import { homepageContent, homepageSectionOrder } from './homepage-content.mjs';

test('defines the approved five-section homepage flow with matching content keys', () => {
  const sectionKeys = ['hero', 'problem', 'system', 'workflow', 'start'];

  assert.deepEqual(homepageSectionOrder, sectionKeys);

  for (const sectionKey of sectionKeys) {
    assert.ok(sectionKey in homepageContent, `Expected homepageContent.${sectionKey} to exist`);
  }
});

test('locks the governance-first hero messaging and CTA hierarchy', () => {
  const githubUrl = 'https://github.com/ilderaj/superpowering-with-files';
  const workflowUrl = `${githubUrl}/blob/main/docs/workflows.md`;
  const quickStartUrl = `${githubUrl}/blob/main/README.md#quick-start`;

  assert.equal(homepageContent.topbar.brandLabel, 'Superpowering With Files');
  assert.deepEqual(homepageContent.topbar.links.map(({ label }) => label), ['Why', 'System', 'Proof', 'Start']);
  assert.deepEqual(homepageContent.topbar.links.map(({ href }) => href), ['#problem', '#system', '#workflow', '#start']);
  assert.equal(homepageContent.topbar.cta.label, 'View source');
  assert.equal(homepageContent.topbar.cta.href, githubUrl);
  assert.equal(homepageContent.topbar.github.label, 'Read workflow');
  assert.equal(homepageContent.topbar.github.href, workflowUrl);

  assert.equal(homepageContent.hero.eyebrow, 'Governance harness for coding-agent workflows');
  assert.equal(homepageContent.hero.headline, 'Keep every coding agent on the same rails.');
  assert.equal(
    homepageContent.hero.lede,
    'One shared workflow policy becomes native entry files, projected skills, durable task state, and optional deeper reasoning across Codex, GitHub Copilot, Cursor, and Claude Code.'
  );
  assert.deepEqual(homepageContent.hero.actions.map(({ label }) => label), ['View source', 'Read workflow']);
  assert.deepEqual(homepageContent.hero.actions.map(({ href }) => href), [githubUrl, workflowUrl]);
  assert.deepEqual(homepageContent.hero.proofPoints.map(({ value }) => value), ['4', '3', '1', '0']);

  assert.equal(homepageContent.start.cta.action.label, 'Start with the CLI');
  assert.equal(homepageContent.start.cta.action.href, quickStartUrl);
  assert.equal(homepageContent.start.cta.secondaryAction.label, 'Open GitHub and star the repo');
  assert.equal(homepageContent.start.cta.secondaryAction.href, githubUrl);
});

test('captures the simplified repo-native story from governance risk to CLI start', () => {
  assert.equal(homepageContent.problem.title, 'Strong agents still drift when each tool carries its own memory.');
  assert.equal(homepageContent.system.title, 'Shared policy stays in files. Deeper reasoning stays optional.');
  assert.equal(homepageContent.workflow.title, 'Inspect the workflow from intake to finish.');
  assert.equal(homepageContent.start.title, 'Read the repo first. Use the CLI when the workflow fits.');
  assert.equal(homepageContent.start.cta.title, 'Use the CLI once the repo proof is enough.');
  assert.equal(homepageContent.footer.github.label, 'View source');
  assert.deepEqual(homepageContent.system.lanes, ['quick', 'tracked', 'deep-reasoning', 'reconcile']);
  assert.deepEqual(homepageContent.start.commands, [
    './scripts/harness install --scope=workspace --targets=all --projection=link',
    './scripts/harness sync',
    './scripts/harness doctor',
    'npm run verify:all'
  ]);
});
