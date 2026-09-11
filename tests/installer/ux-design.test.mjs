import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INSTALLS } from '../../scripts/adopt-global-skills.mjs';

const root = fileURLToPath(new URL('../../harness/optional-skills/ux-design/', import.meta.url));
const repo = resolve(root, '../../..');
const rootPrefix = root.endsWith(sep) ? root : root + sep;
const read = (path) => readFile(join(root, path), 'utf8');
const readRepo = (path) => readFile(join(repo, path), 'utf8');

async function filesUnder(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    assert.equal(entry.isSymbolicLink(), false, `nonportable symlink: ${entry.name}`);
    assert.ok(!['.git', 'node_modules', '.cache', '__pycache__'].includes(entry.name), `unexpected copied directory: ${entry.name}`);
    if (entry.isDirectory()) files.push(...await filesUnder(join(dir, entry.name)));
    else files.push(join(dir, entry.name));
  }
  return files;
}

function withoutFences(markdown) {
  return markdown.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '');
}

async function assertUxDesignContract(markdown) {
  for (const [decision, pattern] of Object.entries({
    reader: /reader and the job/i,
    observable: /observable design decisions/i,
    antiPatterns: /anti-patterns this artifact must avoid/i,
    twoPasses: /two passes[\s\S]*second pass/i,
    renderedInspection: /render or export the artifact[\s\S]*inspect it/i,
    evidenceStates: /`rendered` is not `inspected`[\s\S]*`accepted`[\s\S]*`delivered`/,
    correctionPlacement: /encode the correction where it keeps working/i,
    rendererPairing: /`pen-design`[\s\S]*its own contract/i,
    notDelivery: /It is not implementation, deployment, or delivery\./,
    publishingBoundary: /authorizes no publishing, deployment, sharing, or asset purchase/i,
  })) assert.match(markdown, pattern, decision);
}

test('ux-design is self-contained, portable, and its referenced resources are reachable', async () => {
  assert.deepEqual((await readdir(root, { withFileTypes: true })).map((entry) => entry.name).sort(),
    ['CORRECTION-LOOP.md', 'DESIGN-CONTRACT.md', 'PROVENANCE.json', 'RENDERED-VERIFICATION.md', 'SKILL.md']);
  const files = await filesUnder(root);
  const visited = new Set();
  const pending = [join(root, 'SKILL.md')];
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    if (!file.endsWith('.md')) continue;
    const text = await readFile(file, 'utf8');
    assert.doesNotMatch(text, /(?:\/Users\/|\/home\/|~\/\.agents\/|~\/\.codex\/)/, `machine-local dependency: ${file}`);
    for (const [, link] of withoutFences(text).matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
      if (/^(?:https?:|mailto:|#)/.test(link)) continue;
      const target = resolve(dirname(file), decodeURIComponent(link.split('#')[0]));
      assert.ok(target.startsWith(rootPrefix), `dependency escapes individually adoptable skill: ${file} -> ${link}`);
      assert.ok((await stat(target)).isFile(), `missing file: ${file} -> ${link}`);
      pending.push(target);
    }
  }
  assert.deepEqual([...visited].sort(), files.filter((file) => file.endsWith('.md')).sort(), 'unreachable markdown resource');
});

test('ux-design keeps intent, observables, two passes, rendered inspection and evidence states', async () => {
  await assertUxDesignContract(await read('SKILL.md'));
});

test('removing a design safeguard clause fails the contract', async () => {
  const text = await read('SKILL.md');
  for (const clause of [
    /observable design decisions/i,
    /anti-patterns this artifact must avoid/i,
    /`rendered` is not `inspected`/,
    /encode the correction where it keeps working/i,
    /authorizes no publishing, deployment, sharing, or asset purchase/i,
  ]) {
    await assert.rejects(() => assertUxDesignContract(text.replace(clause, '')), `clause removable: ${clause}`);
  }
  await assert.rejects(() => assertUxDesignContract(text.replace(/two passes/g, 'two phases')),
    'the two-pass build is load-bearing');
  await assertUxDesignContract(text);
});

test('routing surfaces select ux-design for visual work and keep its boundaries', async () => {
  const [sop, methods, office] = await Promise.all([
    readRepo('docs/coding-harness-sop.md'),
    readRepo('harness/trio/capabilities/dev/references/methods.md'),
    readRepo('harness/trio/capabilities/office/references/artifact-and-delivery.md')
  ]);
  assert.match(sop, /screen, page, dashboard, prototype, demo, mockup, wireframe, or slide\/deck layout/);
  assert.match(sop, /`ux-design`[\s\S]*named anti-patterns[\s\S]*inspect the rendered output at real size/i);
  assert.match(sop, /Publish, deploy, share, or claim acceptance[\s\S]*not do automatically|Publish, deploy, share, or claim acceptance/);
  assert.match(methods, /`ux-design`[\s\S]*observable design decisions and named anti-patterns[\s\S]*rendered result at real size/i);
  assert.match(methods, /rendered image is inspection evidence, not acceptance or delivery/i);
  assert.match(office, /visual quality[\s\S]*`ux-design` method when the Host makes it available/i);
  assert.match(office, /exported preview is `rendered` or `inspected` at best, never `accepted` or `delivered`/i);
});

test('the adoption registration points at the real skill source and the receipt stays byte-owned', async () => {
  assert.deepEqual(INSTALLS.find(([name]) => name === 'ux-design'), ['ux-design', 'harness/optional-skills/ux-design']);
  assert.ok((await stat(join(repo, 'harness/optional-skills/ux-design/SKILL.md'))).isFile());
});

test('provenance records both sources, the adaptation scope, and no benefit claim', async () => {
  const provenance = JSON.parse(await read('PROVENANCE.json'));
  assert.equal(provenance.owner, 'SWF');
  assert.equal(provenance.kind, 'adaptation');
  assert.match(provenance.reviewedOn, /^\d{4}-\d{2}-\d{2}$/);
  const urls = provenance.sources.map((source) => source.url);
  assert.ok(urls.includes('https://vercel.com/blog/how-our-agents-build-on-brand-pages-with-design-md'));
  assert.ok(urls.includes('https://x.com/anshuc/status/2064828802824597584'));
  for (const source of provenance.sources) {
    assert.ok(source.license, 'each source declares a license state');
    assert.match(source.use, /no upstream text copied/i);
  }
  assert.ok(provenance.changes.length >= 4);
  assert.match(provenance.updates, /no measurable benefit claim/i);
  const files = (await filesUnder(root)).map((file) => relative(root, file)).sort();
  assert.deepEqual(files, ['CORRECTION-LOOP.md', 'DESIGN-CONTRACT.md', 'PROVENANCE.json', 'RENDERED-VERIFICATION.md', 'SKILL.md']);
});
