import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('operating docs retire legacy adoption and plugin routes', async () => {
  for (const retiredDoc of [
    'docs/install/adoption-starter-kit.md',
    'docs/install/plugin-migration.md'
  ]) {
    await assert.rejects(readFile(retiredDoc, 'utf8'), { code: 'ENOENT' });
  }

  const docs = await Promise.all([
    'README.md',
    'docs/maintenance.md',
    'docs/workflows.md',
    'docs/skill-profiles.md',
    'docs/install/platform-support.md',
    'docs/install/copilot.md',
    'docs/install/plugin-packages.md',
    'tests/evals/repo-workflow-acceptance-matrix.md',
    'tests/evals/repo-workflow-replays/acceptance-scenarios.md'
  ].map((file) => readFile(file, 'utf8')));

  for (const doc of docs) {
    assert.doesNotMatch(
      doc,
      /\bharness plugin (?:doctor|migrate)\b|\badopt-global\b|\badoption-status\b|(?:adoption-starter-kit|plugin-migration)\.md/
    );
  }
});

test('release artifact docs list all packed plugin assets and verification gates', async () => {
  const docs = await readFile('docs/release-plugin-artifacts.md', 'utf8');
  for (const target of ['codex', 'claude-code', 'cursor', 'copilot']) {
    assert.match(docs, new RegExp(`harness-${target}-plugin-<version>\\.tgz`));
  }
  assert.match(docs, /harness-runtime-<version>\.tgz/);
  assert.match(docs, /SHA256SUMS/);
  assert.match(docs, /npm run plugin:smoke/);
});

test('packed plugin install docs cover all supported IDE targets and README links to them', async () => {
  const [docs, readme] = await Promise.all([
    readFile('docs/install/plugin-packages.md', 'utf8'),
    readFile('README.md', 'utf8')
  ]);

  assert.match(readme, /\[Harness packed plugin installation\]\(docs\/install\/plugin-packages\.md\)/);
  assert.match(docs, /github\.com\/ilderaj\/superpowering-with-files\/releases\/latest/);
  assert.match(docs, /harness-codex-plugin-<version>\.tgz/);
  assert.match(docs, /harness-claude-code-plugin-<version>\.tgz/);
  assert.match(docs, /harness-cursor-plugin-<version>\.tgz/);
  assert.match(docs, /harness-copilot-plugin-<version>\.tgz/);
  assert.match(docs, /codex plugin marketplace add/);
  assert.match(docs, /claude-code --plugin-dir/);
  assert.match(docs, /Cursor Agent supports loading a local plugin directory with `--plugin-dir`/);
  assert.match(docs, /copilot --plugin-dir/);
});
