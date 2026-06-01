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

test('locks the governance-first hero messaging and navigation routes', () => {
  const githubUrl = 'https://github.com/ilderaj/superpowering-with-files';

  assert.equal(homepageContent.topbar.brandLabel, 'Superpowering With Files');
  assert.deepEqual(homepageContent.topbar.links.map(({ label }) => label), ['Problem', 'System', 'Workflow', 'Start']);
  assert.deepEqual(homepageContent.topbar.links.map(({ href }) => href), ['#problem', '#system', '#workflow', '#start']);
  assert.equal(homepageContent.topbar.cta.label, 'Install harness');
  assert.equal(homepageContent.topbar.cta.href, '#start');
  assert.equal(homepageContent.topbar.github.label, 'GitHub');
  assert.equal(homepageContent.topbar.github.href, githubUrl);

  assert.equal(homepageContent.hero.eyebrow, 'Governance harness for local coding agents');
  assert.equal(homepageContent.hero.headline, 'One control layer for every coding agent you actually use.');
  assert.equal(
    homepageContent.hero.lede,
    'Superpowering With Files turns a shared workflow policy into native instructions, projected skills, optional hooks, and durable task state across Codex, GitHub Copilot, Cursor, and Claude Code.'
  );
  assert.deepEqual(homepageContent.hero.actions.map(({ label }) => label), ['Start with the CLI', 'See how it works', 'Star on GitHub']);
  assert.deepEqual(homepageContent.hero.actions.map(({ href }) => href), ['#start', '#system', githubUrl]);
  assert.deepEqual(homepageContent.hero.proofPoints.map(({ value }) => value), ['4', '3', '0', '1']);
});

test('captures the modern product-page story from problem to start', () => {
  const githubUrl = 'https://github.com/ilderaj/superpowering-with-files';

  assert.equal(homepageContent.problem.title, 'Agent workflows break when every tool invents its own memory.');
  assert.equal(homepageContent.system.title, 'A small operating system for agentic coding work.');
  assert.equal(homepageContent.workflow.title, 'Light when work is simple. Durable when work gets real.');
  assert.equal(homepageContent.start.title, 'Install once. Keep every local agent on the same rails.');
  assert.equal(homepageContent.start.cta.title, 'Bring governance to the agents already in your editor.');
  assert.equal(homepageContent.start.cta.secondaryAction.label, 'Open GitHub and star the repo');
  assert.equal(homepageContent.start.cta.secondaryAction.href, githubUrl);
  assert.equal(homepageContent.footer.github.label, 'Star on GitHub');
  assert.equal(homepageContent.footer.github.href, githubUrl);
  assert.deepEqual(homepageContent.start.commands, [
    './scripts/harness install --scope=workspace --targets=all --projection=link',
    './scripts/harness sync',
    './scripts/harness doctor',
    'npm run verify'
  ]);
});
