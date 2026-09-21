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
    constraintOwnership: /fixed constraints[\s\S]*delegated discretion[\s\S]*proposals/i,
    observable: /observable design decisions/i,
    antiPatterns: /anti-patterns this artifact must avoid/i,
    dualRead: /decision-first[\s\S]*traceable evidence/i,
    twoPasses: /two passes[\s\S]*second pass/i,
    renderedInspection: /render or export the artifact[\s\S]*inspect it/i,
    motionInspection: /drive the real interaction[\s\S]*record[\s\S]*extract[\s\S]*rerun the same flow/i,
    evidenceStates: /`rendered` is not `inspected`[\s\S]*`accepted`[\s\S]*`delivered`/,
    correctionPlacement: /encode the correction where it keeps working/i,
    rendererPairing: /`pen-design`[\s\S]*user's request verbatim[\s\S]*accepted contract[\s\S]*`--in`/i,
    notDelivery: /It is not implementation, deployment, or delivery\./,
    publishingBoundary: /authorizes no publishing, deployment, sharing, or asset purchase/i,
  })) assert.match(markdown, pattern, decision);
}

function assertOrdered(text, parts, label) {
  let previous = -1;
  for (const part of parts) {
    const index = text.indexOf(part);
    assert.ok(index > previous, `${label}: expected ${JSON.stringify(part)} after prior step`);
    previous = index;
  }
}

async function assertMeasurementContract(markdown) {
  for (const [decision, pattern] of Object.entries({
    twoLayers: /perceptual layer[\s\S]*structural layer/i,
    invariantVocabulary: /invariant vocabulary/i,
    precisePredicates: /precisely stated predicates/i,
    probeExpectedValues: /never hardcode the palette/i,
    settleBeforeMeasuring: /settle before measuring/i,
    coverageAndLimits: /coverage and limits/i,
    failureNamesSelector: /selector[\s\S]*measured value/i,
    platformNeutral: /platform-neutral/i,
    limitedNotPassed: /missing capability is never a pass/i,
    singleLayerPredicate: /single-layer`\s*\|[^\n]*exactly one recorded owner[^\n]*ownership map/i,
    noClipPredicate: /no-clip`\s*\|[^\n]*scrollHeight\s*<=\s*clientHeight[^\n]*client rect/i,
    observer: /## measurement schema[\s\S]*observer is the rendered page[\s\S]*settled document/i,
    units: /all lengths are css pixels[\s\S]*unit[\s\S]*tolerance/i,
    toleranceRule: /abs\(measured - expected\)\s*<=\s*tolerance/i,
    noClipObservation: /for `no-clip`[\s\S]*range[\s\S]*unverified/i,
    failureContext: /unit[\s\S]*tolerance[\s\S]*observer[\s\S]*viewport/i,
  })) assert.match(markdown, pattern, decision);
}

test('ux-design is self-contained, portable, and its referenced resources are reachable', async () => {
  assert.deepEqual((await readdir(root, { withFileTypes: true })).map((entry) => entry.name).sort(),
    ['CORRECTION-LOOP.md', 'DESIGN-CONTRACT.md', 'MEASUREMENT-CONTRACT.md', 'PROVENANCE.json', 'RENDERED-VERIFICATION.md', 'SKILL.md']);
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

test('the design contract distinguishes authority and supports decision-first plus audit reading', async () => {
  const contract = await read('DESIGN-CONTRACT.md');
  assertOrdered(contract, ['Fixed constraints', 'Delegated discretion', 'Proposals'], 'constraint ownership');
  assert.match(contract, /do not promote a proposal into a fixed constraint/i);
  assert.match(contract, /decision-first summary[\s\S]*traceable evidence[\s\S]*honest caveats/i);
});

test('rendered verification defines a tool-neutral frame inspection loop', async () => {
  const verification = await read('RENDERED-VERIFICATION.md');
  assertOrdered(verification, [
    'Choose one representative flow',
    'Drive the real interface',
    'Record the flow',
    'Extract key frames',
    'Inspect the sequence',
    'Correct and rerun the same flow',
  ], 'motion verification');
  assert.match(verification, /pixel differences locate discontinuities[\s\S]*do not score aesthetics/i);
  assert.match(verification, /cannot drive or record[\s\S]*unverified/i);
});

test('the measurement contract separates perceptual and structural evidence with precise predicates', async () => {
  await assertMeasurementContract(await read('MEASUREMENT-CONTRACT.md'));
});

test('removing a measurement safeguard clause fails the contract', async () => {
  const text = await read('MEASUREMENT-CONTRACT.md');
  for (const clause of [
    /precisely stated predicates/i,
    /never hardcode the palette/i,
    /settle before measuring/i,
    /coverage and limits/i,
  ]) {
    await assert.rejects(() => assertMeasurementContract(text.replace(clause, '')), `clause removable: ${clause}`);
  }
  await assert.rejects(() => assertMeasurementContract(text.replace(/measured value/g, 'value')),
    'failure output must name the measured value');
  await assertMeasurementContract(text);
});

test('rendered verification runs the measurement layer before visual inspection', async () => {
  const verification = await read('RENDERED-VERIFICATION.md');
  assert.match(verification, /\[measurement contract\]\(MEASUREMENT-CONTRACT\.md\)/i);
  assert.match(verification, /measurement layer[\s\S]*inspect the rendered result visually/i);
  assert.match(verification, /A tool rendered or exported the artifact \| That anyone looked at it/);
});

test('the dev routing surface runs measurement before visual inspection when a browser is available', async () => {
  const methods = await readRepo('harness/trio/capabilities/dev/references/methods.md');
  assert.match(methods, /measurement-invariant layer first[\s\S]*inspect visually/i);
});

test('the correction loop preserves reproducible runs and guards against overfitting', async () => {
  const loop = await read('CORRECTION-LOOP.md');
  for (const field of [
    'scenario ID', 'prompt and input', 'model or renderer', 'skill or contract version',
    'viewport', 'first attempt', 'artifacts', 'review feedback',
  ]) assert.match(loop, new RegExp(field, 'i'), `missing run-record field: ${field}`);
  assert.match(loop, /should apply[\s\S]*should not apply/i);
  assert.match(loop, /holdout/i);
  assert.match(loop, /new eval scenario/i);
  assert.match(loop, /cadence[\s\S]*complaint/i);
});

test('routing surfaces select ux-design for visual work and keep its boundaries', async () => {
  const [sop, methods, office] = await Promise.all([
    readRepo('docs/coding-harness-sop.md'),
    readRepo('harness/trio/capabilities/dev/references/methods.md'),
    readRepo('harness/trio/capabilities/office/references/artifact-and-delivery.md')
  ]);
  assert.match(sop, /screen, page, dashboard, prototype, demo, mockup, wireframe, or slide\/deck layout/);
  assert.match(sop, /`ux-design`[\s\S]*fixed constraints[\s\S]*delegated discretion[\s\S]*named anti-patterns/i);
  assert.match(sop, /inspect the rendered output at real size[\s\S]*record and inspect successive frames/i);
  assert.match(sop, /Publish, deploy, share, or claim acceptance[\s\S]*not do automatically|Publish, deploy, share, or claim acceptance/);
  assert.match(methods, /`ux-design`[\s\S]*fixed constraints[\s\S]*delegated discretion[\s\S]*observable design decisions/i);
  assert.match(methods, /rendered result at real size[\s\S]*drive, record, and inspect the real flow/i);
  assert.match(methods, /rendered image is inspection evidence, not acceptance or delivery/i);
  assert.match(office, /visual quality[\s\S]*`ux-design` method when the Host makes it available/i);
  assert.match(office, /decision-first summary[\s\S]*traceable evidence[\s\S]*honest caveats/i);
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
  assert.deepEqual(files, ['CORRECTION-LOOP.md', 'DESIGN-CONTRACT.md', 'MEASUREMENT-CONTRACT.md', 'PROVENANCE.json', 'RENDERED-VERIFICATION.md', 'SKILL.md']);
});
