import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { evaluateOutput } from '../../harness/core/skills/overengineering-review/lib/evaluate-overengineering-review.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const dev = 'harness/trio/capabilities/dev/SKILL.md';
const entry = 'harness/trio/skill/SKILL.md';
const chief = 'harness/trio/governance/chiefops/SKILL.md';

// Follow source-owned support documents: prose may move without losing the contract.
async function contract(file, seen = new Set()) {
  if (seen.has(file)) return '';
  seen.add(file);
  const text = await read(file);
  const links = [...text.matchAll(/\]\(([^)]+\.md)\)/g)].map((m) => m[1]);
  const support = [];
  for (const link of links) {
    assert.ok(!link.includes('://'), 'contract support must be local');
    const target = path.normalize(path.join(path.dirname(file), link));
    assert.ok(target.startsWith(path.dirname(file) + '/'), 'support stays under its skill');
    support.push(await contract(target, seen));
  }
  return [text, ...support].join('\n');
}

function has(text, clauses) {
  for (const [decision, pattern] of Object.entries(clauses)) assert.match(text, pattern, decision);
}

const proofRules = {
  behavior: /behavior[\s\S]*real RED[\s\S]*smallest GREEN/i,
  publicProof: /public seam/i,
  meaningful: /reject[^\n]*(implementation-coupled|tautological)[^\n]*mock-only/i,
  typo: /(?:typo|wording)[^\n]*(?:no|do not|skip)[^\n]*test/i,
  reuse: /unchanged[^\n]*evidence[^\n]*(?:reuse|valid)/i,
  invalidate: /(?:change|failure|uncertainty)[^\n]*(?:rerun|repeat|new verification)/i,
  review: /Standards[^\n]*Spec/,
  rootCause: /root.cause/i,
  ownership: /preserve[^\n]*(?:others|other people|unrelated)/i,
  fallback: /fallback[^\n]*contract/i,
};

test('five shared skill identities survive extraction and local support resolves', async () => {
  for (const [name, file] of Object.entries({ trio: entry, dev, chiefops: chief,
    office: 'harness/trio/capabilities/office/SKILL.md', safety: 'harness/trio/capabilities/safety/SKILL.md' })) {
    assert.match(await read(file), new RegExp(`^name: ${name}$`, 'm'));
    const text = await contract(file);
    assert.doesNotMatch(text, /deepseek|Flash|Sol\/Terra|Corleone|only.*(?:gpt-|opencode-)/i);
  }
});

test('dev routes risk-relevant proof and preserves existing evidence', async () => {
  has(await contract(dev), proofRules);
});

test('dev recovery and delivery terms preserve scope and evidence boundaries', async () => {
  const text = await contract(dev);
  has(text, {
    recovery: /tracked recovery[\s\S]*bound Trio[\s\S]*recorded goal[\s\S]*resume conditions/i,
    helper: /helper[\s\S]*edit the frozen Trio[\s\S]*candidate/i,
    terms: /generated[\s\S]*opened[\s\S]*rendered[\s\S]*accepted[\s\S]*delivered/i,
    queued: /queued Host action[\s\S]*does not prove/i,
  });
});

test('semantic proof safeguards cannot be removed while wording can change', async () => {
  const text = await contract(dev);
  for (const pattern of Object.values(proofRules)) {
    assert.throws(() => has(text.replace(new RegExp(pattern.source, pattern.flags + 'g'), ''), proofRules));
  }
  has(text.replace(/smallest GREEN/g, 'smallest GREEN implementation'), proofRules);
});

test('routing distinguishes direct completion from delegated acceptance', async () => {
  const text = await contract(entry);
  has(text, {
    route: /route[^\n]*before[^\n]*(?:effort|topology)/i,
    quick: /quick[^\n]*no Trio/i,
    tracked: /tracked[^\n]*three[^\n]*planning/i,
    deep: /deep[^\n]*current.round[^\n]*not[^\n]*durable/i,
    family: /exactly one[^\n]*dev[^\n]*office[^\n]*safety/i,
    direct: /direct[^\n]*(?:complete|completion)[^\n]*without[^\n]*Chief/i,
    delegated: /delegated[^\n]*candidate[^\n]*Chief[^\n]*acceptance/i,
    auth: /(?:reuse|honor)[^\n]*existing authorization|existing authorization[^\n]*applies/i,
    freeze: /freeze[^\n]*(?:exact|scope)/i,
    legacyVisible: /visible_worker_required[^\n]*legacy input/i,
    retired: /visible_worker_required[\s\S]*legacy_visible_worker_required_retired/i,
    noFallback: /do not restore a Host bridge or fall back to native/i,
    rebind: /primaryExecution=default[^\n]*rebind/i,
    pending: /manual_pending/,
    parallel: /parallel[^\n]*benefi[^\n]*Host[^\n]*user/i,
    actual: /actual[^\n]*unknown[^\n]*authenticated Host/i,
  });
});

test('entry template delegates detail and retains only routing and authority boundaries', async () => {
  const text = await read('harness/trio/templates/entry-policy.md');
  assert.match(text, /trio\/SKILL\.md/);
  assert.match(text, /task_plan\.md[\s\S]*findings\.md[\s\S]*progress\.md/);
  assert.match(text, /existing authorization/i);
  assert.match(text, /direct[\s\S]*delegated/i);
  assert.doesNotMatch(text, /Execution worker:|Corleone|worker_self_goal|sha256/i);
});

test('ChiefOps selected delegation preserves frozen scope and Host lifecycle safeguards', async () => {
  const text = await contract(chief);
  has(text, {
    router: /governance.only/i,
    digest: /sha256[^\n]*authority[^\n]*frozen/i,
    mismatch: /binding_mismatch/,
    subset: /child[^\n]*proper.subset/i,
    reservation: /task[^\n]*currentSlice[^\n]*reserv/i,
    policy: /Full Access[^\n]*approval_policy=never/,
    approval: /approval[^\n]*never expands[^\n]*scope/i,
    sameWorker: /awaiting_approval[^\n]*same worker/i,
    release: /release[^\n]*replacement/i,
    pendingSetup: /clientThreadId[^\n]*pending/,
    freeze: /(?:Trio|authority)[^\n]*frozen[^\n]*writeback/i,
    PR: /dev[^\n]*references\/pr-feedback\.md/,
  });
});

test('accepted PR feedback refinements retain all current-head and terminal gates', async () => {
  const text = await contract(dev);
  has(text, {
    binding: /requiredChecks[\s\S]*current_head_human_approved_required[\s\S]*current_head_mergeable_required/,
    disabledWrites: /repairPushPolicy: disabled[\s\S]*threadWritePolicy: read_only[\s\S]*followUpIssuePolicy: draft_only[\s\S]*autoMergePolicy: disabled/,
    actor: /reviewDecision[^\n]*APPROVED[^\n]*APPROVED[^\n]*current head[^\n]*author\.__typename[^\n]*User/,
    revoked: /CHANGES_REQUESTED[^\n]*REVIEW_REQUIRED[^\n]*invalidates/i,
    quiet: /complete normalized PR[^\n]*check[^\n]*review[^\n]*mergeability[^\n]*thread/i,
    pagination: /pagination[^\n]*independent[^\n]*monotonic/i,
    onlyPending: /continue only[^\n]*bounded[^\n]*pending machine check/i,
    stop: /repair_required[^\n]*deferred_follow_up_recording[^\n]*awaiting_human_gate[^\n]*landing_eligibility[^\n]*stale_binding[^\n]*rejected_binding[^\n]*terminal_pr[^\n]*unreadable/,
    draft: /deduplicat[^\n]*accepted nonblocking[^\n]*draft issues[^\n]*stopping/i,
    optIn: /explicit[^\n]*opt.in[^\n]*PR/i,
    observer: /observer never replies[^\n]*merges[^\n]*pushes/i,
    headChange: /changed head invalidates/i,
  });
});

test('PWF recovery is event driven and retains exactly three durable files', async () => {
  const text = await contract('harness/core/upstream-overlays/planning-with-files/SKILL.md');
  has(text, {
    state: /task_plan\.md[\s\S]*findings\.md[\s\S]*progress\.md/,
    recovery: /(?:resume|recovery|compaction)[^\n]*read[^\n]*three/i,
    events: /(?:milestone|decision)[^\n]*(?:write|update|record)/i,
    reorient: /(?:stale|scope change)[^\n]*(?:read|refresh)/i,
    helper: /session-catchup\.py/,
    companion: /companion[^\n]*optional/i,
    external: /external content[^\n]*untrusted/i,
  });
  assert.doesNotMatch(text, /2.Action Rule|3.Strike|AFTER 3 FAILURES|harness record|ONE tool call per turn|before (?:ANY|every) action/i);
});

test('overengineering review accepts evidence without fabricated line savings', () => {
  const fixture = { id: 'bounded', requiredTag: 'delete' };
  const output = '## Scenario\nUnused wrapper.\n## Findings\ntag: delete\nsurface: src/wrapper.js\nchange: remove unused wrapper\nwhy: all callers use the native API\n## Summary\nOne bounded cut; verify callers.';
  assert.equal(evaluateOutput(fixture, output).pass, true);
  assert.equal(evaluateOutput(fixture, output).netLines, null);
  assert.equal(evaluateOutput(fixture, output.replace('surface:', 'location:')).pass, false);
});


test('PWF templates initialize three files and resume without overwriting state or requiring a companion', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'swf-lean-pwf-'));
  const run = promisify(execFile);
  const scripts = path.join(root, 'harness/core/upstream-overlays/planning-with-files/scripts');
  const task = path.join(workspace, 'planning/active/lean-proof');
  try {
    await run('bash', [path.join(scripts, 'init-session.sh'), workspace, 'lean-proof']);
    assert.deepEqual((await readdir(task)).sort(), ['findings.md', 'progress.md', 'task_plan.md']);
    assert.match(await readFile(path.join(task, 'progress.md'), 'utf8'), /^## Session: \d{4}-\d\d-\d\d \d\d:\d\d:\d\d UTC\+8$/m);
    const plan = await readFile(path.join(task, 'task_plan.md'), 'utf8');
    assert.match(plan, /^Reconcile: open$/m);
    const preserved = plan + '\n## Decision\nPreserve verified state on resume.\n';
    await writeFile(path.join(task, 'task_plan.md'), preserved);
    await run('bash', [path.join(scripts, 'init-session.sh'), workspace, 'lean-proof']);
    assert.equal(await readFile(path.join(task, 'task_plan.md'), 'utf8'), preserved);
    const { stdout } = await run('python3', [path.join(scripts, 'task-status.py'), workspace, 'lean-proof', '--json', '--require-companion-synced']);
    const status = JSON.parse(stdout);
    assert.equal(status.status, 'active');
    assert.equal(status.safe_to_archive, false);
    assert.equal(status.companion.has_companion, false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
