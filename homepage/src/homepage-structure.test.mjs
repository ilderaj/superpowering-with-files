import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homepageSectionOrder } from './homepage-content.mjs';

const source = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const normalizedSource = source.replace(/\s+/g, ' ');

test('derives rendered section order from homepageSectionOrder', () => {
  assert.match(
    normalizedSource,
    /homepageSectionOrder\.map\(\(sectionKey\) => sectionContent\[sectionKey as keyof typeof sectionContent\]\)/
  );
});

test('defines renderers for every approved homepage section in contract order', () => {
  const rendererPositions = homepageSectionOrder.map((sectionKey) => {
    const match = source.match(new RegExp(`${sectionKey}:\\s*\\(`));
    assert.ok(match, `missing renderer for section: ${sectionKey}`);
    return source.indexOf(match[0]);
  });

  const sortedPositions = [...rendererPositions].sort((a, b) => a - b);
  assert.deepEqual(rendererPositions, sortedPositions);
});

test('keeps one hero proof cluster and the simplified section modules', () => {
  assert.ok(source.includes("from './homepage-content.mjs'"));
  assert.ok(source.includes('homepageContent.topbar.cta'));
  assert.ok(source.includes('homepageContent.topbar.github'));
  assert.ok(source.includes('homepageContent.hero.proofPoints.map'));
  assert.ok(source.includes('homepageContent.hero.terminal.lines.map'));
  assert.ok(source.includes('homepageContent.hero.route.steps.map'));
  assert.ok(source.includes('homepageContent.problem.pains.map'));
  assert.ok(source.includes('homepageContent.system.modules.map'));
  assert.ok(source.includes('homepageContent.system.lanes.map'));
  assert.ok(source.includes('homepageContent.workflow.tracks.map'));
  assert.ok(source.includes('homepageContent.start.commands.map'));
  assert.ok(source.includes('homepageContent.start.cta.action'));
  assert.ok(source.includes('homepageContent.start.cta.secondaryAction'));
  assert.ok(source.includes('homepageContent.footer.github'));
  assert.doesNotMatch(normalizedSource, /aria-label="Project highlights"/);
});
