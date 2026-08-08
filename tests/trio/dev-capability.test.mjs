import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const devSkillPath = path.join(repositoryRoot, 'harness', 'trio', 'capabilities', 'dev', 'SKILL.md');
const entrySkillPath = path.join(repositoryRoot, 'harness', 'trio', 'skill', 'SKILL.md');

function parseHeader(markdown) {
  const lines = markdown.split(/\r?\n/);
  assert.equal(lines[0], '---', 'The skill must begin with a YAML header.');
  const closingIndex = lines.indexOf('---', 1);
  assert.ok(closingIndex > 1, 'The skill must close its YAML header.');
  const fields = {};
  for (const line of lines.slice(1, closingIndex)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    assert.ok(match, `Invalid header line: ${line}`);
    const key = match[1];
    assert.equal(Object.prototype.hasOwnProperty.call(fields, key), false, `Duplicate header key: ${key}`);
    fields[key] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return { fields, body: lines.slice(closingIndex + 1).join('\n') };
}

function replaceExactlyOnce(source, before, after) {
  const occurrences = source.split(before).length - 1;
  assert.equal(occurrences, 1, `Expected one source occurrence for: ${before}`);
  return source.replace(before, after);
}

function sectionBody(body, heading) {
  const lines = body.split(/\r?\n/);
  const headingIndex = lines.indexOf(`## ${heading}`);
  assert.ok(headingIndex >= 0, `Missing section: ${heading}`);
  const nextHeadingOffset = lines.slice(headingIndex + 1).findIndex((line) => /^##\s+/.test(line));
  const endIndex = nextHeadingOffset < 0 ? lines.length : headingIndex + 1 + nextHeadingOffset;
  return lines.slice(headingIndex + 1, endIndex).join('\n');
}

function assertDevSkillContract(markdown) {
  const { fields, body } = parseHeader(markdown);
  const headings = new Set(
    [...body.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim())
  );

  assert.equal(fields.name, 'dev');
  assert.match(fields.description ?? '', /\S/);
  for (const heading of [
    'Quality Loop',
    'Planning Contract',
    'Debugging Contract',
    'Review Contract',
    'Verification Contract',
    'Isolation and Closure',
    'Return Contract'
  ]) {
    assert.ok(headings.has(heading), `Missing dev contract section: ${heading}`);
  }

  const qualityLoop = sectionBody(body, 'Quality Loop').toLowerCase();
  assert.match(qualityLoop, /clarify or design only when[\s\S]*material uncertainty/);
  assert.match(qualityLoop, /when judgment is material[\s\S]*compare bounded alternatives/);
  assert.match(qualityLoop, /write one behavior at a time[\s\S]*observe a real red[\s\S]*write the smallest green[\s\S]*refactor only while green/);
  const isolation = sectionBody(body, 'Isolation and Closure').toLowerCase();
  for (const safeguard of [
    'detect existing isolation and ownership before creating a workspace',
    'prefer native host isolation',
    'avoid concurrent writes to shared mutable paths',
    'verify a clean baseline',
    'provenance authorizes cleanup',
    'branch closure verifies first',
    'never auto-merges',
    'never removes a host-owned workspace'
  ]) {
    assert.ok(isolation.includes(safeguard), `Missing isolation safeguard: ${safeguard}`);
  }
  const debugging = sectionBody(body, 'Debugging Contract').toLowerCase();
  assert.match(debugging, /start with a fast, deterministic, red-capable feedback loop/);
  assert.match(debugging, /reproduce exactly[\s\S]*minimize the case[\s\S]*relevant public seams/);
  assert.match(debugging, /trace the bad value backward to its root cause/);
  assert.match(debugging, /one falsifiable hypothesis[\s\S]*one variable at a time/);
  assert.match(debugging, /fix the source[\s\S]*regression test/);
  assert.match(debugging, /after three failed attempts[\s\S]*stop and question the plan or architecture/);
  const review = sectionBody(body, 'Review Contract').toLowerCase();
  assert.match(review, /review a fixed work product on independent standards and spec axes/);
  assert.match(review, /repository reality[\s\S]*bound requirements/);
  assert.match(review, /verify every finding technically/);
  assert.match(review, /important findings block acceptance until addressed/);
  const verification = sectionBody(body, 'Verification Contract').toLowerCase();
  assert.match(verification, /before completion, commit, or phase advance, run fresh verification completely/);
  assert.match(verification, /read command exits, test counts, and failure details[\s\S]*preserve the evidence before making a claim/);
  assert.match(verification, /a worker report, previous run, partial run, or adjacent green test is not proof/);
  assert.match(verification, /without authenticated host evidence, actual model and effort remain unknown/);

  const normalized = body.toLowerCase();
  for (const phrase of [
    'public seam',
    'red before green',
    'one vertical slice',
    'root cause',
    'falsifiable hypothesis',
    'three failed attempts',
    'standards',
    'spec',
    'fresh verification',
    'actual',
    'unknown',
    'candidate'
  ]) {
    assert.ok(normalized.includes(phrase), `Missing normative behavior: ${phrase}`);
  }
}

function assertEntrySkillContract(markdown) {
  const { fields, body } = parseHeader(markdown);
  const headings = new Set(
    [...body.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim())
  );

  assert.equal(fields.name, 'trio');
  assert.match(fields.description ?? '', /\S/);
  for (const heading of [
    'Route First',
    'Task Classes',
    'Capability Selection',
    'Authority and Host Boundary',
    'Human Gates'
  ]) {
    assert.ok(headings.has(heading), `Missing entry contract section: ${heading}`);
  }

  const routeFirst = sectionBody(body, 'Route First').toLowerCase();
  assert.match(routeFirst, /route before choosing effort or execution topology/);
  assert.match(routeFirst, /only after the route is known[\s\S]*select an effort intent or execution topology/);
  const capabilitySelection = sectionBody(body, 'Capability Selection').toLowerCase();
  assert.match(capabilitySelection, /after routing, choose exactly one capability family/);
  const taskClasses = sectionBody(body, 'Task Classes').toLowerCase();
  assert.match(taskClasses, /quick work is direct and lightweight: no trio creation and no mandatory worker or fan-out/);
  assert.match(taskClasses, /tracked work creates or restores only the bound task's three planning files/);
  assert.match(taskClasses, /no fourth task-state file is introduced/);
  assert.match(taskClasses, /deep is a current-round reasoning decision/);
  assert.match(taskClasses, /it is not a durable task type and does not create another authority/);
  const humanGates = sectionBody(body, 'Human Gates').toLowerCase();
  assert.match(humanGates, /retain the applicable human gate/);
  assert.match(humanGates, /route or capability selection never grants permission/);
  const authorityBoundary = sectionBody(body, 'Authority and Host Boundary').toLowerCase();
  assert.match(authorityBoundary, /trio remains the sole durable task authority/);
  assert.match(authorityBoundary, /host owns worker and subtask lifecycle/);
  assert.match(authorityBoundary, /requested and actual model evidence/);
  assert.match(authorityBoundary, /permissions/);
  assert.match(authorityBoundary, /continuation/);
  assert.match(authorityBoundary, /external or human gates/);
  assert.match(authorityBoundary, /host-native goal and continuation are the long-task runtime/);
  assert.match(authorityBoundary, /not a scheduler, daemon, poller, or runner/);
  assert.match(authorityBoundary, /without authenticated host evidence, actual remains unknown/);
  assert.match(authorityBoundary, /worker done is only a candidate/);
  assert.match(authorityBoundary, /chief performs acceptance and trio writeback/);

  const normalized = body.toLowerCase();
  for (const phrase of [
    'route before choosing effort',
    'quick',
    'tracked',
    'deep',
    'dev',
    'office',
    'safety',
    'planning/active/<task-id>/task_plan.md',
    'findings.md',
    'progress.md',
    'host-native goal',
    'actual remains unknown',
    'worker done is only a candidate',
    'chief performs acceptance',
    'destructive',
    'external',
    'credential',
    'merge',
    'push',
    'publish',
    'release',
    'deploy',
    'send',
    'data-loss'
  ]) {
    assert.ok(normalized.includes(phrase), `Missing entry behavior: ${phrase}`);
  }
}

test('dev capability exposes an independent development-quality contract', async () => {
  assertDevSkillContract(await readFile(devSkillPath, 'utf8'));
});

test('dev validator rejects unconditional discovery design', async () => {
  const markdown = await readFile(devSkillPath, 'utf8');
  const mutated = replaceExactlyOnce(
    markdown,
    'Clarify or design only when material uncertainty, unclear architecture, a non-obvious root cause, or high-risk judgment makes it necessary.',
    'Clarify or design whenever work is present, including material uncertainty, unclear architecture, a non-obvious root cause, or high-risk judgment.'
  );

  assert.throws(() => assertDevSkillContract(mutated));
});

test('dev validator rejects unconditional alternative comparison', async () => {
  const markdown = await readFile(devSkillPath, 'utf8');
  const mutated = replaceExactlyOnce(
    markdown,
    'When judgment is material, compare bounded alternatives and record the selected trade-off.',
    'Compare bounded alternatives and record the selected trade-off whenever work is present, even when judgment is not material.'
  );

  assert.throws(() => assertDevSkillContract(mutated));
});

test('dev validator rejects GREEN-before-RED and early refactoring', async () => {
  const markdown = await readFile(devSkillPath, 'utf8');
  const mutated = replaceExactlyOnce(
    markdown,
    'Keep the rule red before green: write one behavior at a time, observe a real RED before production text or code, write the smallest GREEN change, and refactor only while GREEN.',
    'Keep the rule red before green: write one behavior at a time, write the smallest GREEN change, refactor before GREEN or while GREEN, and observe a real RED before production text or code.'
  );

  assert.throws(() => assertDevSkillContract(mutated));
});

test('dev validator rejects weakened isolation and closure safeguards', async () => {
  const markdown = await readFile(devSkillPath, 'utf8');
  const mutated = replaceExactlyOnce(
    markdown,
    'Detect existing isolation and ownership before creating a workspace. Prefer native Host isolation, avoid concurrent writes to shared mutable paths, and verify a clean baseline. Clean only a workspace whose provenance authorizes cleanup. Branch closure verifies first, preserves human gates, never auto-merges, pushes, discards, releases, deploys, publishes, or sends, and never removes a Host-owned workspace.',
    'Detect existing isolation and ownership before creating a workspace. Use any available workspace, allow concurrent writes to shared mutable paths, and skip baseline checks. Clean any workspace after the task. Branch closure may automatically merge, push, discard, release, deploy, publish, or send, and may remove any workspace.'
  );

  assert.throws(() => assertDevSkillContract(mutated));
});

test('dev validator rejects continued patching after repeated failures', async () => {
  const markdown = await readFile(devSkillPath, 'utf8');
  const mutated = replaceExactlyOnce(
    markdown,
    'After three failed attempts, stop and question the plan or architecture instead of adding another patch.',
    'After three failed attempts, add another patch and continue without questioning the plan or architecture.'
  );

  assert.throws(() => assertDevSkillContract(mutated));
});

test('dev validator rejects delayed review blocking', async () => {
  const markdown = await readFile(devSkillPath, 'utf8');
  const mutated = replaceExactlyOnce(
    markdown,
    'Verify every finding technically; important findings block acceptance until addressed.',
    'Verify every finding technically; important findings block acceptance only after acceptance is granted.'
  );

  assert.throws(() => assertDevSkillContract(mutated));
});

test('dev validator rejects verification after claiming completion', async () => {
  const markdown = await readFile(devSkillPath, 'utf8');
  const mutated = replaceExactlyOnce(
    markdown,
    'Read command exits, test counts, and failure details; preserve the evidence before making a claim.',
    'Read command exits, test counts, and failure details after making a claim; preserve the evidence later.'
  );

  assert.throws(() => assertDevSkillContract(mutated));
});

test('Trio entry skill routes tasks and selects one capability family', async () => {
  assertEntrySkillContract(await readFile(entrySkillPath, 'utf8'));
});

test('Trio entry validator rejects effort selection before routing', async () => {
  const markdown = await readFile(entrySkillPath, 'utf8');
  const mutated = replaceExactlyOnce(
    markdown,
    'Only after the route is known may the Host and caller select an effort intent or execution topology.',
    'Before the route is known, the Host and caller may select an effort intent or execution topology.'
  );

  assert.throws(() => assertEntrySkillContract(mutated));
});

test('Trio entry validator rejects multiple capability families', async () => {
  const markdown = await readFile(entrySkillPath, 'utf8');
  const mutated = replaceExactlyOnce(
    markdown,
    'After routing, choose exactly one capability family: `dev`, `office`, or `safety`.',
    'After routing, choose one or more capability families: `dev`, `office`, or `safety`.'
  );

  assert.throws(() => assertEntrySkillContract(mutated));
});

test('Trio entry validator rejects durable Deep authority', async () => {
  const markdown = await readFile(entrySkillPath, 'utf8');
  const mutated = replaceExactlyOnce(
    markdown,
    'It is not a durable task type and does not create another authority.',
    'It is a durable task type and creates another authority.'
  );

  assert.throws(() => assertEntrySkillContract(mutated));
});

test('Trio entry validator rejects automatic gated actions', async () => {
  const markdown = await readFile(entrySkillPath, 'utf8');
  const mutated = replaceExactlyOnce(
    markdown,
    'Destructive, external, credential or security-sensitive, merge, push, publish, release, deploy, send, and data-loss actions retain the applicable human gate. A route or capability selection never grants permission for those actions.',
    'Destructive, external, credential or security-sensitive, merge, push, publish, release, deploy, send, and data-loss actions are automatically allowed after routing. A route or capability selection never grants permission for those actions.'
  );

  assert.throws(() => assertEntrySkillContract(mutated));
});

test('Trio entry validator rejects durable or mandatory Quick execution', async () => {
  const markdown = await readFile(entrySkillPath, 'utf8');
  const mutated = replaceExactlyOnce(
    markdown,
    'Quick work is direct and lightweight: no Trio creation and no mandatory worker or fan-out.',
    'Quick work is direct and lightweight: Trio creation and a mandatory worker or fan-out are allowed.'
  );

  assert.throws(() => assertEntrySkillContract(mutated));
});

test('Trio entry validator rejects a fourth tracked state file', async () => {
  const markdown = await readFile(entrySkillPath, 'utf8');
  const mutated = replaceExactlyOnce(
    markdown,
    "The Trio is the only durable task authority; no fourth task-state file is introduced.",
    'The Trio is the only durable task authority; a fourth task-state file may be introduced.'
  );

  assert.throws(() => assertEntrySkillContract(mutated));
});

test('Trio entry validator rejects a second durable task authority', async () => {
  const markdown = await readFile(entrySkillPath, 'utf8');
  const mutated = replaceExactlyOnce(
    markdown,
    'The Trio remains the sole durable task authority.',
    'The Trio shares durable task authority with other task-state surfaces.'
  );

  assert.throws(() => assertEntrySkillContract(mutated));
});

test('skill header parser rejects duplicate keys', async () => {
  const markdown = await readFile(devSkillPath, 'utf8');
  const mutated = replaceExactlyOnce(markdown, 'name: dev', 'name: dev\nname: dev');

  assert.throws(() => assertDevSkillContract(mutated));
});

test('Trio entry keeps quick work lightweight without durable task creation', async () => {
  const markdown = await readFile(entrySkillPath, 'utf8');
  const { body } = parseHeader(markdown);
  const normalized = body.toLowerCase();

  assert.ok(normalized.includes('quick work is direct and lightweight'));
  assert.ok(normalized.includes('no trio creation'));
  assert.ok(normalized.includes('no mandatory worker or fan-out'));
});

test('dev planning names concrete slice evidence and boundaries', async () => {
  const markdown = await readFile(devSkillPath, 'utf8');
  const { body } = parseHeader(markdown);
  const normalized = body.toLowerCase();

  for (const phrase of [
    'exact files',
    'non-goals',
    'dependencies',
    'proof command',
    'evidence sink',
    'stop conditions',
    'return contract',
    'no placeholders'
  ]) {
    assert.ok(normalized.includes(phrase), `Missing planning boundary: ${phrase}`);
  }
});

test('dev inspects reality before scaling design to uncertainty', async () => {
  const markdown = await readFile(devSkillPath, 'utf8');
  const { body } = parseHeader(markdown);
  const normalized = body.toLowerCase();

  for (const phrase of [
    'inspect the current code or artifact first',
    'material uncertainty',
    'goal',
    'constraints',
    'success criteria',
    'bounded alternatives'
  ]) {
    assert.ok(normalized.includes(phrase), `Missing discovery behavior: ${phrase}`);
  }
});

test('dev proof rejects coupled tests and multi-variable debugging', async () => {
  const markdown = await readFile(devSkillPath, 'utf8');
  const { body } = parseHeader(markdown);
  const normalized = body.toLowerCase();

  for (const phrase of [
    'implementation-coupled',
    'tautological',
    'bulk horizontal',
    'mock-only proof',
    'one variable at a time'
  ]) {
    assert.ok(normalized.includes(phrase), `Missing proof safeguard: ${phrase}`);
  }
});

test('dev review and verification block incomplete evidence', async () => {
  const markdown = await readFile(devSkillPath, 'utf8');
  const { body } = parseHeader(markdown);
  const normalized = body.toLowerCase();

  for (const phrase of [
    'fixed work product',
    'independent standards and spec axes',
    'verify every finding',
    'important findings block acceptance',
    'fresh verification completely',
    'command exits',
    'test counts',
    'failure details',
    'previous run',
    'partial run',
    'not proof'
  ]) {
    assert.ok(normalized.includes(phrase), `Missing review safeguard: ${phrase}`);
  }
});
