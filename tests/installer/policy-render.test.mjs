import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderEntry } from '../../harness/installer/lib/adapters.mjs';
import { renderPolicyProfile } from '../../harness/installer/lib/policy-render.mjs';
import { measureText } from '../../harness/installer/lib/context-budget.mjs';

test('each declared policy profile renders independently', async () => {
  const rootDir = process.cwd();

  const alwaysOnCore = await renderPolicyProfile(rootDir, 'always-on-core');
  const trackedTaskExtended = await renderPolicyProfile(rootDir, 'tracked-task-extended');
  const deepReasoningReference = await renderPolicyProfile(rootDir, 'deep-reasoning-reference');

  assert.match(alwaysOnCore, /Rule Precedence/);
  assert.match(alwaysOnCore, /Goal Round Start Protocol/);
  assert.match(trackedTaskExtended, /Planning-With-Files Lifecycle Rule/);
  assert.match(deepReasoningReference, /Companion Plan Model/);
});

test('renderEntry accepts a policy profile override', async () => {
  const rendered = await renderEntry(process.cwd(), 'codex', ['tracked-task-extended']);

  assert.match(rendered, /Complex Task Orchestration/);
  assert.doesNotMatch(rendered, /Task Classification/);
});

test('renderEntry uses a thinner always-on profile for Copilot by default', async () => {
  const [copilotRendered, codexRendered] = await Promise.all([
    renderEntry(process.cwd(), 'copilot', 'always-on-core'),
    renderEntry(process.cwd(), 'codex', 'always-on-core')
  ]);

  assert.match(copilotRendered, /Task Classification/);
  assert.match(copilotRendered, /Communication Guidelines/);
  assert.doesNotMatch(copilotRendered, /Goal Round Start Protocol/);
  assert.doesNotMatch(copilotRendered, /When Superpowers Is Allowed/);
  assert.doesNotMatch(copilotRendered, /When Superpowers Is Not Allowed/);
  assert.doesNotMatch(copilotRendered, /Tool Preferences/);
  assert.match(codexRendered, /Goal Round Start Protocol/);
  assert.match(codexRendered, /When Superpowers Is Allowed/);
  assert.match(codexRendered, /Tool Preferences/);
  assert.ok(measureText(copilotRendered).approxTokens < measureText(codexRendered).approxTokens);
});

test('codex rendered policy documents soft model tiering while copilot stays thin', async () => {
  const [codexRendered, copilotRendered] = await Promise.all([
    renderEntry(process.cwd(), 'codex', 'always-on-core'),
    renderEntry(process.cwd(), 'copilot', 'always-on-core')
  ]);

  assert.match(codexRendered, /Soft Model Tiering/);
  assert.match(codexRendered, /cheap model only for approved-plan mechanical work/);
  assert.doesNotMatch(copilotRendered, /Soft Model Tiering/);
});

test('rendered always-on entries keep the simplicity ladder and deliberate simplification marker', async () => {
  const [codexRendered, copilotRendered] = await Promise.all([
    renderEntry(process.cwd(), 'codex', 'always-on-core'),
    renderEntry(process.cwd(), 'copilot', 'always-on-core')
  ]);

  for (const rendered of [codexRendered, copilotRendered]) {
    assert.match(rendered, /Question whether the work needs to exist at all\./);
    assert.match(rendered, /Prefer the smallest working diff and the fewest files\./);
    assert.match(rendered, /Never simplify away trust-boundary validation, data-loss prevention, security, accessibility, or explicit user asks\./);
    assert.match(rendered, /`swf-simplify:`/);
    assert.match(rendered, /required fields: `ceiling` and `upgrade trigger`/);
  }
});

test('default always-on entries keep tracked and deep reasoning details opt-in', async () => {
  const targets = ['codex', 'copilot', 'cursor', 'claude-code'];

  for (const target of targets) {
    const rendered = await renderEntry(process.cwd(), target, 'always-on-core');
    assert.doesNotMatch(rendered, /Planning-With-Files Lifecycle Rule/);
    assert.doesNotMatch(rendered, /Companion Plan Model/);
    assert.doesNotMatch(rendered, /Mandatory Sync-Back Rule/);
  }
});

test('codex rendered guidance keeps quick rounds lightweight while documenting bounded replan loops', async () => {
  const rendered = await renderEntry(process.cwd(), 'codex', 'always-on-core');

  assert.match(rendered, /distinguish a `plan issue` from an `execution issue`\./);
  assert.match(
    rendered,
    /a bounded mini review\/revise\/verify loop may run inside normal Superpowers execution discipline\./
  );
  assert.match(
    rendered,
    /`quick`: stay lightweight\. Do not create a companion plan and do not add subagents just because a goal loop is running\./
  );
  assert.match(
    rendered,
    /`quick`: stay lightweight and resolve ordinary execution issues directly\. Do not trigger a replan loop just because a goal loop is active\./
  );
});

test('renderPolicyProfile supports include-based safety profiles', async () => {
  const rendered = await renderPolicyProfile(process.cwd(), 'safety');

  assert.match(rendered, /Hybrid Workflow Policy/);
  assert.match(rendered, /# Safety Policy/);
  assert.match(rendered, /Never run agents from HOME/);
  assert.match(rendered, /Companion Plan Model/);
});

test('renderPolicyProfile does not split on code fences that contain section-like headings', async () => {
  const rendered = await renderPolicyProfile(process.cwd(), 'tracked-task-extended');
  const currentStateMatches = rendered.match(/## Current State/g) ?? [];

  assert.match(rendered, /```md[\s\S]*## Current State[\s\S]*```/);
  assert.equal(currentStateMatches.length, 1);
  assert.match(rendered, /Planning-With-Files Lifecycle Rule/);
  assert.match(rendered, /Complex Task Orchestration/);
});

test('renderPolicyProfile fails clearly when a profile references a missing section', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'policy-render-'));
  await mkdir(path.join(rootDir, 'harness/core/policy'), { recursive: true });
  await writeFile(
    path.join(rootDir, 'harness/core/policy/base.md'),
    await readFile(path.join(process.cwd(), 'harness/core/policy/base.md'), 'utf8')
  );

  const entryProfiles = JSON.parse(
    await readFile(path.join(process.cwd(), 'harness/core/policy/entry-profiles.json'), 'utf8')
  );
  entryProfiles.profiles['broken-profile'] = ['Missing Heading'];

  await writeFile(
    path.join(rootDir, 'harness/core/policy/entry-profiles.json'),
    `${JSON.stringify(entryProfiles, null, 2)}\n`
  );

  await assert.rejects(
    () => renderPolicyProfile(rootDir, 'broken-profile'),
    /references missing sections: Missing Heading/
  );
});

test('project docs keep shared defaults while documenting the optional Copilot github-cloud skill root', async () => {
  const [readme, architecture, copilotInstall, codexInstall] = await Promise.all([
    readFile(path.join(process.cwd(), 'README.md'), 'utf8'),
    readFile(path.join(process.cwd(), 'docs/architecture.md'), 'utf8'),
    readFile(path.join(process.cwd(), 'docs/install/copilot.md'), 'utf8'),
    readFile(path.join(process.cwd(), 'docs/install/codex.md'), 'utf8')
  ]);

  assert.match(readme, /GitHub Copilot \| `\.agents\/skills` \| `~\/\.agents\/skills` \| materialized/);
  assert.match(readme, /Claude Code \| `\.claude\/skills` \| `~\/\.claude\/skills` \| materialized/);
  assert.match(readme, /Cursor \| `\.agents\/skills` \| `~\/\.agents\/skills` \| materialized/);
  assert.doesNotMatch(readme, /GitHub Copilot \| `\.github\/skills` \| `~\/\.copilot\/skills` \| materialized/);
  assert.match(architecture, /Codex, GitHub Copilot, and Cursor share `\.agents\/skills`/i);
  assert.match(architecture, /`\.claude\/skills`/);
  assert.doesNotMatch(architecture, /Cursor stays on `\.cursor\/skills`/);
  assert.match(architecture, /Cursor keeps native `\.cursor\/rules` and `\.cursor` hook roots/i);
  assert.doesNotMatch(architecture, /GitHub Copilot \| `\.github\/skills` \| `~\/\.copilot\/skills`/);
  assert.match(copilotInstall, /`\.agents\/skills`/);
  assert.match(copilotInstall, /`~\/\.agents\/skills`/);
  assert.match(copilotInstall, /\.github\/skills/);
  assert.match(copilotInstall, /--deployment-profile=github-cloud/);
  assert.match(copilotInstall, /tracked-task/);
  assert.doesNotMatch(copilotInstall, /~\/\.copilot\/skills/);
  assert.match(codexInstall, /`\.agents\/skills`/);
  assert.match(codexInstall, /`~\/\.agents\/skills`/);
  assert.match(codexInstall, /Goal Round Start Protocol/);
  assert.match(codexInstall, /Codex `\/goal` stays native/);
  assert.match(codexInstall, /planning\/active\/<task-id>/);
  assert.match(codexInstall, /If `reconciliation\.md` exists and the current round depends on lifecycle evidence such as `verify`, `reconcile`, or `finish`, read that optional lifecycle artifact too/);
  assert.match(codexInstall, /minimal declared contract shape is seven fields/);
  assert.match(codexInstall, /Proof Target/);
  assert.match(codexInstall, /Escalation Trigger/);
  assert.match(codexInstall, /Reconcile Rule/);
  assert.match(codexInstall, /new or materially revised/);
  assert.match(codexInstall, /read-only reviewer subagent/);
  assert.match(codexInstall, /normal Superpowers execution discipline/);
  assert.match(readme, /repo-owned borrowings inspired by the `ponytail` analysis/);
  assert.match(readme, /`overengineering-review` is an optional review lens/);
  assert.match(readme, /`simplification-ledger` is an optional read-only helper/);
  assert.match(readme, /`swf-simplify:` is the canonical V1 marker/);
  assert.match(codexInstall, /optional repo-owned helpers inspired by the `ponytail` fit analysis/);
  assert.match(codexInstall, /`overengineering-review` narrows a pass to over-built surfaces only/);
  assert.match(codexInstall, /`simplification-ledger` scans the canonical `swf-simplify:` marker/);
  assert.match(codexInstall, /`swf-simplify:` is the V1 comment marker for deliberate simplifications/);
});

test('shared policy and docs keep planning authority rooted in planning active with optional reconciliation lifecycle artifact', async () => {
  const [basePolicy, agentsDoc, claudeDoc, readme, reconciliationDoc, workflowsDoc] = await Promise.all([
    readFile(path.join(process.cwd(), 'harness/core/policy/base.md'), 'utf8'),
    readFile(path.join(process.cwd(), 'AGENTS.md'), 'utf8'),
    readFile(path.join(process.cwd(), 'CLAUDE.md'), 'utf8'),
    readFile(path.join(process.cwd(), 'README.md'), 'utf8'),
    readFile(path.join(process.cwd(), 'docs/reconciliation.md'), 'utf8'),
    readFile(path.join(process.cwd(), 'docs/workflows.md'), 'utf8')
  ]);

  for (const doc of [basePolicy, agentsDoc, claudeDoc]) {
    assert.match(doc, /Persistent task state must live only under `planning\/active\/<task-id>\/`/);
    assert.match(doc, /required core planning trio: `task_plan\.md`, `findings\.md`, `progress\.md`/);
    assert.match(doc, /optional lifecycle artifact: `reconciliation\.md`/);
    assert.doesNotMatch(doc, /Persistent task state must live only in:/);
    assert.doesNotMatch(doc, /active task's three markdown files updated/);
  }

  assert.match(
    agentsDoc,
    /If `reconciliation\.md` exists and the current round depends on lifecycle evidence, read that optional lifecycle artifact too/
  );
  assert.match(readme, /`reconciliation\.md` is an optional lifecycle artifact inside that same canonical task directory/);
  assert.match(reconciliationDoc, /`planning\/active\/<task-id>\/` remains the authoritative task-memory root/);
  assert.match(workflowsDoc, /optional lifecycle artifact/);
});


test('renderEntry can include concise copilot output guidance without affecting other targets', async () => {
  const copilotEntry = await renderEntry(process.cwd(), 'copilot', ['always-on-core','copilot-concise-output']);
  assert.match(copilotEntry, /Prefer terse progress updates and concise finals unless the user asks for depth/);

  const codexEntry = await renderEntry(process.cwd(), 'codex', ['copilot-concise-output']);
  assert.doesNotMatch(codexEntry, /Prefer terse progress updates and concise finals unless the user asks for depth/);
});

test('renderEntry with standalone copilot-concise-output includes thin baseline and concise guidance only', async () => {
  const copilotEntry = await renderEntry(process.cwd(), 'copilot', ['copilot-concise-output']);
  assert.match(copilotEntry, /Task Classification/); // thin baseline present
  assert.match(copilotEntry, /Prefer terse progress updates and concise finals unless the user asks for depth/); // concise guidance present
  assert.doesNotMatch(copilotEntry, /When Superpowers Is Allowed/); // does not broaden into full baseline
});

test('codex render includes concise output guidance without weakening planning authority', async () => {
  const [codexRendered, copilotRendered, cursorRendered, claudeRendered] = await Promise.all([
    renderEntry(process.cwd(), 'codex', 'always-on-core'),
    renderEntry(process.cwd(), 'copilot', 'always-on-core'),
    renderEntry(process.cwd(), 'cursor', 'always-on-core'),
    renderEntry(process.cwd(), 'claude-code', 'always-on-core')
  ]);

  assert.match(codexRendered, /Codex Concise Output Guidance/);
  assert.match(codexRendered, /Planning writeback is primary; chat narration is optional\./);
  assert.match(codexRendered, /Never skip `task_plan\.md`, `findings\.md`, or `progress\.md` writeback after meaningful progress\./);

  for (const rendered of [copilotRendered, cursorRendered, claudeRendered]) {
    assert.doesNotMatch(rendered, /Codex Concise Output Guidance/);
  }
});

test('codex concise guidance section stays bounded', async () => {
  const codexRendered = await renderEntry(process.cwd(), 'codex', 'always-on-core');
  const match = codexRendered.match(/## Codex Concise Output Guidance[\s\S]*?(?=\n## |\s*$)/);

  assert.ok(match, 'codex concise guidance section should be present as a bounded section');

  const measurement = measureText(match[0]);

  assert.ok(
    measurement.approxTokens < 200,
    `codex concise guidance section should stay under 200 approx tokens, got ${measurement.approxTokens}`
  );
});
