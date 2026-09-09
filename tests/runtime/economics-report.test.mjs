import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateExperiment, buildReport, renderMarkdown } from '../evals/v20-economics/lib/report.mjs';
const fixture = JSON.parse(readFileSync(new URL('../evals/v20-economics/fixtures/complete.json', import.meta.url)));
const fresh = () => structuredClone(fixture);
const vector = (input, cachedInput=0, output=0, reasoningOutput=0) => ({input,cachedInput,output,reasoningOutput});
const scope = (id,delta) => ({scopeId:id,parentScopeId:null,accounting:'exclusive',mode:'delta',start:null,end:null,delta,evidenceRef:'fixture'});
const first = x => buildReport(x).runs[0];
const reject = fn => {const x=fresh();fn(x);assert.throws(()=>buildReport(x),{code:'ERR_ECONOMICS_INPUT'});};
const cli = fileURLToPath(new URL('../evals/v20-economics/report.mjs',import.meta.url));
test('T01 cumulative windows count reasoning only once',()=>{
 const x=fresh(),s=x.runs[0].usageScopes[0];Object.assign(s,{mode:'cumulative',delta:null,start:vector(100,20,10,2),end:vector(160,40,30,8)});
 assert.equal(first(x).metrics.totalTokens,80);assert.equal(first(x).metrics.freshTokens,60);
});
test('T02 exclusive sum and inclusive overlap',()=>{
 const x=fresh(),r=x.runs[0];r.usageScopes=[scope('p',vector(100,20,10)),{...scope('c',vector(40,10,5)),parentScopeId:'p'}];
 assert.equal(first(x).metrics.totalTokens,155);assert.equal(first(x).metrics.freshTokens,125);
 r.usageScopes[0].accounting='inclusive';assert.equal(first(x).metrics.totalTokens,null);assert.ok(first(x).reasons.includes('overlapping_usage'));
});
test('T03 reset, missing start components, cache and reasoning propagate independently',()=>{
 const x=fresh(),s=x.runs[0].usageScopes[0];Object.assign(s,{mode:'cumulative',delta:null,start:vector(100),end:vector(90)});
 assert.equal(first(x).metrics.totalTokens,null);assert.ok(first(x).reasons.includes('counter_reset'));
 s.start=vector(null,null,null,null);x.runs[0].reasons=['input','cachedInput','output','reasoningOutput'].map(k=>`usageScopes.start.${k} unavailable`);assert.equal(first(x).metrics.totalTokens,null);
 Object.assign(s,{mode:'delta',start:null,end:null,delta:vector(100,null,10,null)});x.runs[0].reasons=['usageScopes.delta.cachedInput missing','usageScopes.delta.reasoningOutput missing'];
 assert.equal(first(x).metrics.totalTokens,110);assert.equal(first(x).metrics.freshTokens,null);
 s.delta.cachedInput=20;assert.equal(first(x).metrics.freshTokens,90);
});
test('T04 malformed schema, tokens and scope graphs fail closed',()=>{
 for(const mutate of [x=>x.schemaVersion=2,x=>x.runs[1].runId=x.runs[0].runId,x=>x.runs[1].usageScopes[0].scopeId=x.runs[0].usageScopes[0].scopeId,x=>x.runs[0].usageScopes[0].delta.input=-1,x=>x.runs[0].usageScopes[0].delta.input=Infinity,x=>x.runs[0].usageScopes[0].delta.cachedInput=101,x=>x.runs[0].usageScopes[0].delta.reasoningOutput=1,x=>x.runs[0].round=3,x=>x.runs[0].caseId='unregistered',x=>x.runs[0].usageScopes[0].parentScopeId='absent',x=>x.runs[0].usageScopes[0].parentScopeId=x.runs[1].usageScopes[0].scopeId,x=>x.runs[0].usageScopes[0].parentScopeId=x.runs[0].usageScopes[0].scopeId,x=>x.runs[0].endedAt='2026-09-07T01:00:00Z',x=>x.runs[0].topology='unknown']) reject(mutate);
});
test('T05 retries include failure resources and cannot erase quality failure',()=>{
 const x=fresh(),r=x.runs[0];r.status='failed';r.usageScopes[0].delta.input=50;r.actions.humanInterventions=1;
 const retry=structuredClone(r);Object.assign(retry,{runId:'retry',attempt:2,status:'completed',endedAt:'2026-09-08T01:00:03Z'});retry.actions.humanInterventions=0;retry.usageScopes=[scope('retry',vector(40))];x.runs.push(retry);
 const out=buildReport(x),arm=out.pairs[0].baseline;assert.equal(arm.metrics.freshTokens,90);assert.equal(arm.metrics.elapsedMs,5000);assert.equal(arm.metrics.humanInterventions,1);assert.equal(out.qualityGate,'fail');assert.equal(out.economicVerdict,'not_supported');assert.equal(out.coverage.executedAttempts,17);
});
test('T06 complete fixture computes both rounds and renders all pairs',()=>{
 const r=buildReport(fresh());assert.equal(r.economicVerdict,'supported');assert.equal(r.qualityGate,'pass');assert.equal(r.pairs.length,8);
 for(const round of r.rounds){assert.equal(round.baseline,400);assert.equal(round.swf,320);assert.equal(round.delta,-80);assert.ok(Math.abs(round.improvementRatio-.2)<1e-10);}
 const md=renderMarkdown(r);for(const c of ['E1','E2','E3','E4'])assert.ok(md.includes(c));assert.ok(md.includes('20.00%'));
});
test('T07 second round regression or equality is not supported',()=>{
 for(const value of [105,100]){const x=fresh();for(const r of x.runs)if(r.round===2&&r.arm==='swf')r.usageScopes[0].delta.input=value;assert.equal(buildReport(x).economicVerdict,'not_supported');}
});
test('T08 missing runs and measurements or authenticated configurations remain unproven',()=>{
 const x=fresh();x.runs.pop();const r=buildReport(x);assert.equal(r.coverage.missingSlots.length,1);assert.equal(r.economicVerdict,'unproven');assert.equal(r.rounds[1].baseline,null);
 for(const mutate of [x=>{x.runs[0].actualModel=null;x.runs[0].reasons=['actualModel missing'];},x=>x.runs[0].actualModel='other',x=>{x.runs[0].usageScopes=[];x.runs[0].reasons=['missing_usage'];},x=>x.runs[0].status='not_run',x=>x.runs[0].status='unavailable']){const y=fresh();mutate(y);assert.equal(buildReport(y).economicVerdict,'unproven');}
});
test('T09 quality failure, mismatched inputs/tools/instructions and unreviewed quality',()=>{
 const x=fresh();x.runs[0].quality.scope='fail';assert.equal(buildReport(x).economicVerdict,'not_supported');
 for(const field of ['inputHash','instructionHash','toolScopeHash']){const y=fresh();y.runs[0][field]='f'.repeat(64);assert.equal(buildReport(y).economicVerdict,'unproven');}
 const y=fresh();y.runs[0].quality.factual='not_assessed';assert.equal(buildReport(y).qualityGate,'incomplete');
});
test('T10 zero denominator and cost transfer need explicit review',()=>{
 const x=fresh();for(const r of x.runs)r.usageScopes[0].delta.input=0;assert.equal(buildReport(x).rounds[0].improvementRatio,null);assert.equal(buildReport(x).economicVerdict,'not_supported');
 const y=fresh();y.runs[1].actions.humanInterventions=1;assert.equal(buildReport(y).economicVerdict,'unproven');y.cohort.tradeoffReview={reviewer:'reviewer',evidenceRef:'fixture',accepted:true,reason:'human effort accepted'};assert.equal(buildReport(y).economicVerdict,'supported');assert.match(renderMarkdown(buildReport(y)),/human/);
});
test('T11 CLI help, errors and unproven success semantics',()=>{
 assert.equal(spawnSync(process.execPath,[cli,'--help']).status,0);
 for(const args of [[],['--wat'],['--input','missing'],['--input','missing','--format','bad']])assert.equal(spawnSync(process.execPath,[cli,...args]).status,2);
 const dir=mkdtempSync(path.join(tmpdir(),'v20-cli-'));try{const file=path.join(dir,'input.json');writeFileSync(file,'PRIVATE_SECRET invalid json');const bad=spawnSync(process.execPath,[cli,'--input',file],{encoding:'utf8'});assert.equal(bad.status,2);assert.ok(!bad.stderr.includes('PRIVATE_SECRET'));
 const x=fresh();x.runs=[];writeFileSync(file,JSON.stringify(x));const good=spawnSync(process.execPath,[cli,'--input',file],{encoding:'utf8'});assert.equal(good.status,0);assert.equal(JSON.parse(good.stdout).economicVerdict,'unproven');}finally{rmSync(dir,{recursive:true});}
});
test('T12 immutable deterministic pure functions and CLI isolation',()=>{
 const x=fresh();x.runs[0].evidenceRefs=['/unreadable/private'];const before=structuredClone(x);const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}};freeze(x);assert.deepEqual(buildReport(x),buildReport(x));assert.deepEqual(x,before);assert.equal(validateExperiment(x),x);
 const dir=mkdtempSync(path.join(tmpdir(),'v20-isolation-'));try{writeFileSync(path.join(dir,'input.json'),JSON.stringify(x));const result=spawnSync(process.execPath,[cli,'--input','input.json'],{cwd:dir,env:{...process.env,HOME:dir},encoding:'utf8'});assert.equal(result.status,0);assert.equal(JSON.parse(result.stdout).pairs.length,8);assert.deepEqual(readdirSync(dir),['input.json']);}finally{rmSync(dir,{recursive:true});}
});
test('T13 strict missing/extra keys and explicit unknown reasons',()=>{
 reject(x=>delete x.runs[0].actualModel);reject(x=>x.runs[0].actualModel='unknown');reject(x=>x.extra=true);reject(x=>x.runs[0].actions.typo=0);reject(x=>x.runs[0].actualModel=null);
 const x=fresh();x.runs[0].actualModel=null;x.runs[0].reasons=['actualModel missing'];assert.equal(buildReport(x).pairs[0].comparable,false);
});
test('T14 attempt identity, sequence and placeholders',()=>{
 reject(x=>{const r=structuredClone(x.runs[0]);r.runId='duplicate';r.usageScopes=[scope('duplicate',vector(10))];x.runs.push(r);});
 reject(x=>x.runs[0].attempt=3);
 reject(x=>{const r=structuredClone(x.runs[0]);r.runId='retry';r.attempt=2;r.usageScopes=[scope('retry',vector(10))];x.runs[0].status='not_run';x.runs.push(r);});
});
test('T15 partial resources and shared overhead never become complete totals',()=>{
 const x=fresh();x.runs[0].usageScopes=[scope('known',vector(60)),scope('partial',vector(20,null))];x.runs[0].reasons=['usageScopes.delta.cachedInput missing'];x.cohort.overheadAssessment.attribution='incomplete';const r=buildReport(x);assert.equal(r.runs[0].metrics.freshTokens,null);assert.equal(r.runs[0].knownPartial.freshTokens,60);assert.equal(r.sharedOverhead.metrics.freshTokens,10);assert.equal(r.economicVerdict,'unproven');
 reject(x=>x.cohort.sharedOverhead.scopes[0].scopeId=x.runs[0].usageScopes[0].scopeId);reject(x=>x.cohort.sharedOverhead.reason='');
});
test('T16 quality priority remains separate from comparability/resources',()=>{
 const x=fresh();x.runs[0].quality.scope='fail';x.runs[1].status='not_run';assert.equal(buildReport(x).qualityGate,'fail');assert.equal(buildReport(x).economicVerdict,'not_supported');
 const y=fresh();y.runs[0].quality.factual='not_assessed';assert.equal(buildReport(y).qualityGate,'incomplete');
 const z=fresh();z.runs[0].usageScopes=[];z.runs[0].reasons=['missing_usage'];assert.equal(buildReport(z).qualityGate,'pass');assert.equal(buildReport(z).economicVerdict,'unproven');
});
test('strategy cohort permits only its preregistered configuration',()=>{
 const x=fresh();x.cohort.kind='strategy';x.cohort.strategies={baseline:{model:'fixture-model',effort:'high',topology:'direct'},swf:{model:'other-model',effort:'medium',topology:'native'}};
 for(const r of x.runs)if(r.arm==='swf'){r.actualModel='other-model';r.actualEffort='medium';r.topology='native';}
 assert.equal(buildReport(x).economicVerdict,'supported');x.runs[1].actualEffort='high';assert.equal(buildReport(x).economicVerdict,'unproven');
 reject(x=>x.cohort.strategies={});
});
test('method comparisons reject across-round drift even when each pair matches',()=>{
 const x=fresh();for(const r of x.runs)if(r.caseId==='E1'&&r.round===2)r.actualModel='different';const result=buildReport(x);assert.equal(result.pairs[0].comparable,false);assert.equal(result.pairs[1].comparable,false);assert.equal(result.economicVerdict,'unproven');
});
test('unknown accounting, zero cache and isolated inclusive scopes',()=>{
 const x=fresh();x.runs[0].usageScopes[0].accounting='unknown';assert.equal(first(x).metrics.totalTokens,null);assert.ok(first(x).reasons.includes('unknown_accounting'));
 x.runs[0].usageScopes[0].accounting='inclusive';assert.equal(first(x).metrics.freshTokens,100);
});
test('counter delta inconsistencies and arithmetic overflow fail closed',()=>{
 const x=fresh(),s=x.runs[0].usageScopes[0];Object.assign(s,{mode:'cumulative',delta:null,start:vector(100,0),end:vector(110,30)});assert.equal(first(x).metrics.freshTokens,null);assert.equal(first(x).metrics.totalTokens,10);
 reject(x=>x.runs[0].usageScopes[0].delta=vector(Number.MAX_SAFE_INTEGER,0,1));
});
test('missing secondary action evidence cannot prove no cost transfer',()=>{
 const x=fresh();x.runs[0].actions.resumeTurns=null;x.runs[0].actions.reasons.resumeTurns='No event IDs';assert.equal(buildReport(x).economicVerdict,'unproven');
 x.cohort.tradeoffReview={reviewer:'reviewer',evidenceRef:'fixture',accepted:true,reason:'Cannot fill missing observations'};assert.equal(buildReport(x).economicVerdict,'unproven');
});
test('ISO timestamps reject impossible dates rather than silently normalize them',()=>{
 reject(x=>x.cohort.preregisteredAt='2026-02-30T00:00:00Z');
 reject(x=>x.runs[0].startedAt='2026-09-08T24:00:00Z');
});
test('review regression: each missing usage component requires its corresponding reason',()=>{
 reject(x=>{x.runs[0].usageScopes[0].delta.cachedInput=null;x.runs[0].reasons=['unrelated'];});
 reject(x=>{x.runs[0].usageScopes[0].delta.cachedInput=null;x.runs[0].reasons=['usageScopes.delta.input missing'];});
 const x=fresh();x.runs[0].usageScopes[0].delta.cachedInput=null;x.runs[0].reasons=['usageScopes.delta.cachedInput not observed'];assert.equal(first(x).metrics.freshTokens,null);
});
test('review regression: Markdown preserves all quality dimensions and reviewer pointers',()=>{
 const x=fresh();Object.assign(x.runs[0].quality,{limitations:'fail',reviewer:'quality-only-reviewer',evidenceRef:'quality-only-evidence'});
 const md=renderMarkdown(buildReport(x));for(const text of ['factual','scope','usable','limitations','quality-only-reviewer','quality-only-evidence'])assert.ok(md.includes(text));assert.match(md,/"limitations":"fail"/);
});
test('shared cost exclusion exposes missing data and still requires attribution review',()=>{
 const x=fresh();x.cohort.sharedOverhead.scopes=[];
 const reviewed=buildReport(x);assert.equal(reviewed.sharedOverhead.metrics.freshTokens,null);assert.ok(reviewed.reasons.includes('shared_overhead_missing_usage'));assert.equal(reviewed.economicVerdict,'supported');
 x.cohort.overheadAssessment.reviewer=null;assert.equal(buildReport(x).economicVerdict,'unproven');
 x.cohort.overheadAssessment.reviewer='reviewer';x.cohort.overheadAssessment.symmetricExclusion='unknown';assert.equal(buildReport(x).economicVerdict,'unproven');
});
test('totalTokens primary reports token totals independent of cache discount',()=>{
 const x=fresh();x.cohort.primaryMetric='totalTokens';const r=buildReport(x);
 for(const round of r.rounds){const runs=r.runs.filter(v=>v.round===round.round);assert.equal(round.baseline,runs.filter(v=>v.arm==='baseline').reduce((s,v)=>s+v.metrics.totalTokens,0));assert.equal(round.primaryMetric,'totalTokens');}
 assert.match(renderMarkdown(r),/totalTokens/);
});
test('unknown shared accounting cannot be overridden by an attribution assertion',()=>{
 const x=fresh();x.cohort.sharedOverhead.scopes[0].accounting='unknown';
 const r=buildReport(x);assert.equal(r.sharedOverhead.metrics.totalTokens,null);assert.ok(r.reasons.includes('shared_overhead_unknown_accounting'));assert.equal(r.economicVerdict,'unproven');
});
test('unknown shared attribution precedes non-improvement without hiding observed regression',()=>{
 for(const mode of ['accounting','assessment']){
  const x=fresh();for(const run of x.runs)if(run.arm==='swf')run.usageScopes[0].delta.input=110;
  if(mode==='accounting')x.cohort.sharedOverhead.scopes[0].accounting='unknown';
  else x.cohort.overheadAssessment.attribution='unknown';
  const r=buildReport(x);assert.equal(r.qualityGate,'pass');assert.equal(r.economicVerdict,'unproven');
  assert.ok(r.rounds.every(v=>v.delta===40));assert.ok(r.reasons.includes('no_repeatable_improvement'));assert.ok(r.reasons.includes('unattributed_overhead'));
  x.runs[0].quality.scope='fail';assert.equal(buildReport(x).economicVerdict,'not_supported');
 }
});
test('Markdown exposes primary totalTokens and secondary freshTokens for every pair',()=>{
 const x=fresh();x.cohort.primaryMetric='totalTokens';
 for(const run of x.runs){run.usageScopes[0].delta.cachedInput=20;run.usageScopes[0].delta.output=10;}
 const md=renderMarkdown(buildReport(x));assert.ok(md.includes('Primary metric: totalTokens'));
 assert.ok(md.includes('Baseline totalTokens | SWF totalTokens | Baseline freshTokens | SWF freshTokens'));
 for(const c of x.cohort.caseIds)for(const round of x.cohort.rounds)assert.ok(md.includes(`| ${c} | ${round} | pass | true | 110 | 90 | 90 | 70 |`));
});
