import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { renderCheckpoint } from '../../harness/core/skills/linear-work-control/lib/linear-work-control.mjs';
import { shadowRequestFor } from '../../harness/trio/core/shadow.mjs';
import { runCheckpoint, parseInput } from '../../scripts/render-decision-checkpoint.mjs';

const checkpoint = {
  taskId: 'wp07-test', title: 'WP07', state: 'running', phase: 'verify',
  progress: { percent: 50 }, completed: [], now: ['testing'], next: ['review'],
  humanAction: { required: false }, validation: { summary: 'pass' }, timestamp: 'now'
};
const request = shadowRequestFor('plan_ready', {
  subject: {taskId:checkpoint.taskId,phase:checkpoint.phase,capability:'dev'},
  requirement: {mode:'think',intensity:'high'}
});
const operator={requirements_covered:true,solution_coherent:true,dependencies_resolved:true,implementation_specific:true,acceptance_defined:true,verification_defined:true,blocking_unknowns_remain:false};

test('runCheckpoint returns the existing renderer byte-for-byte and records a shadow', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wp07-caller-'));
  try {
    const result = await runCheckpoint({ checkpoint, observations: [{ questionId: 'plan_ready', request, operator }], directory });
    assert.equal(result.stdout, renderCheckpoint(checkpoint) + '\n');
    assert.equal(result.shadow.results.length, 1);
    assert.equal(result.shadow.results[0].agreement, true);
    assert.equal(result.shadow.results[0].persisted, true);
    assert.ok(Array.isArray(result.diagnostics));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('invalid checkpoint keeps renderer validation semantics', async () => {
  await assert.rejects(() => runCheckpoint({ checkpoint: { ...checkpoint, state: 'bad-state' } }), /unknown runtime state/i);
});

test('phase mismatch is preflighted as unevaluable without changing runtime', async () => {
  const result = await runCheckpoint({
    checkpoint,
    observations: [{ questionId: 'plan_ready', phase: 'plan', request }]
  });
  assert.equal(result.shadow.results[0].status, 'unevaluable');
  assert.equal(result.shadow.results[0].reason, 'phase-mismatch');
  assert.match(result.diagnostics.join('\n'), /phase-mismatch/);
});

test('task and bundle mismatches remain isolated unevaluable observations', async () => {
  const result = await runCheckpoint({ checkpoint, observations: [
    { questionId: 'plan_ready', request: { ...request, subject: { ...request.subject, taskId: 'other' } } },
    { questionId: 'plan_ready', request: { ...request, bundle: 'verify' } }
  ] });
  assert.deepEqual(result.shadow.results.map((item) => item.reason), ['task-mismatch', 'bundle-mismatch']);
  assert.equal(result.shadow.summary.total, 2);
});

test('parseInput accepts JSON text and the CLI input envelope', () => {
  assert.deepEqual(parseInput('{"checkpoint":{"taskId":"x"},"observations":[]}'), {
    checkpoint: { taskId: 'x' }, observations: []
  });
});

test('real trace write failure does not change valid stdout', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'wp07-unwritable-'));
  try {
    const file=path.join(dir,'not-a-directory');await writeFile(file,'x');
    const result=await runCheckpoint({checkpoint,observations:[{questionId:'plan_ready',request,operator}],directory:file});
    assert.equal(result.stdout,renderCheckpoint(checkpoint)+'\n');
    assert.equal(result.shadow.summary.traceFailures,1);
    assert.match(result.diagnostics.join(' '),/trace failures/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('a valid disagreement still renders and persists the observation',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'wp07-disagree-'));
 try {
  const result=await runCheckpoint({checkpoint,observations:[{questionId:'plan_ready',request,operator:{...operator,dependencies_resolved:false}}],directory:dir});
  assert.equal(result.stdout,renderCheckpoint(checkpoint)+'\n');
  assert.equal(result.shadow.results[0].agreement,false);
  assert.equal(result.shadow.results[0].persisted,true);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('an observation phase alias cannot hide a mismatched request phase', async()=>{
 const result=await runCheckpoint({checkpoint,observations:[{questionId:'plan_ready',phase:'verify',request:{...request,subject:{...request.subject,phase:'plan'}}}]});
 assert.equal(result.shadow.results[0].reason,'phase-mismatch');
});
