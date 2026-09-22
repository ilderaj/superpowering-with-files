import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDecisionProfile} from '../../../scripts/evaluate-decision-profile.mjs';
function profile() {
  const p={evidenceKind:'live',runs:[],cases:[],sharedOverhead:{attribution:'complete',symmetricExclusion:false},coverage:{allEventsIncluded:true,matchedExecutionBudget:true,evidenceRef:'test:complete-log'},registration:{primaryMetric:'roundsToResolution',registeredAt:'2026-09-01T00:00:00Z',baselineHash:'b',swfHash:'s',rubricHash:'r',evidenceRef:'test:registration'}};
  for(let i=0;i<18;i++) {
    const caseId=`case-${i}`;
    p.cases.push({caseId,taskId:`task-${i}`,partition:i<12?'development':'holdout',round:i<6?1:2,baseline:{roundsToResolution:5,repairLoops:1,decisionAccuracy:1,qualityPass:true},swf:{roundsToResolution:3,repairLoops:0,decisionAccuracy:1,qualityPass:true}});
    for(const arm of ['baseline','swf']) p.runs.push({eventId:`${caseId}-${arm}`,usageEvidenceRef:`usage:${caseId}-${arm}`,caseId,arm,role:'executor',startedAt:'2026-09-02T00:00:00Z',modelEvidenceRef:'test:host',usage:{input:arm==='baseline'?90:95,output:10,cachedInput:20}});
  }
  return p;
}
test('all-in exact +5% is covered only by measured paired improvement across rounds and holdout',()=>{
  const r=evaluateDecisionProfile(profile());
  assert.equal(r.ratios.totalTokens,1.05);assert.equal(r.verdict,'supported');assert.equal(r.costVerdict,'covered_band');assert.equal(r.effects.holdout.n,6);
});
test('incomplete overhead cannot become supported even when metrics improve',()=>{
  const p=profile();p.sharedOverhead.attribution='unknown';
  assert.equal(evaluateDecisionProfile(p).verdict,'unproven');
  p.sharedOverhead.attribution='complete';p.sharedOverhead.symmetricExclusion=true;
  assert.equal(evaluateDecisionProfile(p).verdict,'unproven');
});
test('all events include retries/decision work, output is not fresh input',()=>{
  const p=profile();p.runs.push({...p.runs[1],eventId:'retry',usageEvidenceRef:'usage:retry',role:'review',usage:{input:10,output:0,cachedInput:5}});
  const r=evaluateDecisionProfile(p);assert.equal(r.arms.swf.outputTokens,180);assert.equal(r.arms.swf.totalTokens,1900);assert.equal(r.verdict,'not_supported');
});
test('missing/zero usage, missing pair and fixture evidence stay unproven',()=>{
  for(const mutate of [p=>delete p.runs[0].usage,p=>p.runs=p.runs.filter(r=>r.arm!=='baseline'),p=>p.evidenceKind='synthetic',p=>p.runs.filter(r=>r.arm==='baseline').forEach(r=>r.usage={input:0,output:0,cachedInput:0}),p=>delete p.registration]) {
    const p=profile();mutate(p);assert.equal(evaluateDecisionProfile(p).verdict,'unproven');
  }
});
test('event duplication and holdout task leakage are rejected',()=>{
  const p=profile();p.runs.push({...p.runs[0]});assert.throws(()=>evaluateDecisionProfile(p),/duplicate event/);
  const q=profile();q.cases[12].taskId=q.cases[0].taskId;assert.throws(()=>evaluateDecisionProfile(q),/leaked/);
});
test('boolean declarations cannot substitute for actual effects and holdout',()=>{
  const p=profile();p.efficiency={effectMet:true,reproduced:true,holdoutReproduced:true};
  p.cases.forEach(c=>c.swf.roundsToResolution=5);
  assert.equal(evaluateDecisionProfile(p).verdict,'unproven');
  const q=profile();q.cases[12].swf.qualityPass=false;assert.equal(evaluateDecisionProfile(q).verdict,'unproven');
});
test('unknown arm and insufficient per-round sample are not silently accepted',()=>{
  const p=profile();p.runs[0].arm='cheap';assert.throws(()=>evaluateDecisionProfile(p),/unknown arm/);
  const q=profile();q.cases=q.cases.filter(c=>c.caseId!=='case-0');q.runs=q.runs.filter(r=>r.caseId!=='case-0');assert.equal(evaluateDecisionProfile(q).verdict,'unproven');
});

test('other primary metrics cannot regress behind an improved rounds result',()=>{
 const p=profile();p.cases.forEach(c=>c.swf.decisionAccuracy=0);
 assert.equal(evaluateDecisionProfile(p).verdict,'unproven');
});


test('renaming an event cannot double count the same source usage receipt',()=>{
 const p=profile();p.runs.push({...p.runs[0],eventId:'renamed'});
 assert.throws(()=>evaluateDecisionProfile(p),/duplicate usage evidence/);
});

test('repeating one task does not satisfy independent sample minimum',()=>{
 const p=profile();p.cases.filter(c=>c.partition==='development'&&c.round===1).forEach(c=>c.taskId='one-task');
 assert.equal(evaluateDecisionProfile(p).verdict,'unproven');
});
