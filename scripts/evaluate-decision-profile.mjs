#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const PROFILE_SCHEMA_VERSION = 1;
export const PROFILE_MARGIN = 0.05;
const ARMS = ['baseline', 'swf'];
const METRICS = ['roundsToResolution', 'repairLoops', 'outputTokens', 'decisionAccuracy'];
const finite = value => Number.isFinite(value) && value >= 0;
const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
const median = xs => { const a=[...xs].sort((a,b)=>a-b); return a.length ? (a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2 : null; };
const ratio = (a,b) => a === null || b === null || b === 0 ? null : a/b;
function invalid(message) { throw new Error(`Decision profile: ${message}`); }
function usage(run) {
  const u=run.usage;
  if (!u || !Number.isSafeInteger(u.input) || !Number.isSafeInteger(u.output) || u.input<0 || u.output<0) return null;
  const valid=Number.isSafeInteger(u.cachedInput) && u.cachedInput>=0 && u.cachedInput<=u.input;
  return {totalTokens:u.input+u.output,outputTokens:u.output,freshTokens:valid?u.input-u.cachedInput+u.output:null};
}
const sum = xs => xs.length && xs.every(finite) ? xs.reduce((a,b)=>a+b,0) : null;
export function aggregateArm(runs, arm) {
  const v=runs.filter(r=>r.arm===arm).map(usage);
  return {totalTokens:sum(v.map(x=>x?.totalTokens)),outputTokens:sum(v.map(x=>x?.outputTokens)),freshTokens:sum(v.map(x=>x?.freshTokens)),missingUsage:!v.length||v.some(x=>x===null)};
}
// Seeded paired bootstrap: descriptive pilot uncertainty, not a power guarantee.
function interval(xs) {
  if(xs.length<6) return null;
  let seed=271828; const samples=[];
  for(let i=0;i<2000;i++) {
    let total=0;
    for(let j=0;j<xs.length;j++) { seed=(Math.imul(1664525,seed)+1013904223)>>>0; total+=xs[seed%xs.length]; }
    samples.push(total/xs.length);
  }
  samples.sort((a,b)=>a-b); return [samples[50],samples[1949]];
}
function effect(rows, metric, runs) {
  const independentTasks=new Set(rows.map(row=>row.taskId)).size;
  let pairs=rows.map(row=>metric==='outputTokens'
    ? ARMS.map(arm=>aggregateArm(runs.filter(r=>r.caseId===row.caseId),arm).outputTokens)
    : ARMS.map(arm=>row[arm]?.[metric]));
  if(!pairs.length || pairs.some(p=>p.some(v=>!finite(v)))) return {n:pairs.length,met:false,reason:'missing_metric'};
  if(metric==='decisionAccuracy' && pairs.some(p=>p.some(v=>v>1))) invalid('decisionAccuracy outside 0..1');
  const clusters=new Map();
  rows.forEach((row,index)=> { const group=clusters.get(row.taskId)??[]; group.push(pairs[index]); clusters.set(row.taskId,group); });
  pairs=[...clusters.values()].map(group=>[mean(group.map(p=>p[0])),mean(group.map(p=>p[1]))]);
  const diffs=pairs.map(([b,s])=>(metric==='decisionAccuracy'?-1:1)*(b-s));
  const baseline=mean(pairs.map(p=>p[0])),swf=mean(pairs.map(p=>p[1])),delta=mean(diffs),ci=interval(diffs);
  const threshold=metric==='decisionAccuracy'?delta>=0.05-1e-12:metric==='repairLoops'?delta>=1
    :metric==='roundsToResolution'?(baseline>0&&delta/baseline>=0.15-1e-12)||median(diffs)>=1
    :baseline>0&&delta/baseline>=0.15-1e-12;
  return {n:pairs.length,baseline,swf,improvement:delta,pairedInterval95:ci,independentTasks,met:threshold&&ci!==null&&ci[0]>0&&independentTasks>=6};
}
export function evaluateDecisionProfile(input) {
  if(!input || !Array.isArray(input.runs)) invalid('runs must be an array');
  const reasons=[],seen=new Set(),usageRefs=new Set();
  for(const run of input.runs) {
    if(!run || !ARMS.includes(run.arm)) invalid('unknown arm');
    if(typeof run.eventId!=='string'||!run.eventId||typeof run.caseId!=='string'||!run.caseId) { reasons.push('missing_event_identity'); continue; }
    if(seen.has(run.eventId)) invalid('duplicate eventId'); seen.add(run.eventId);
    if(typeof run.usageEvidenceRef!=='string'||!run.usageEvidenceRef.trim()) reasons.push('usage_source_unknown');
    else { if(usageRefs.has(run.usageEvidenceRef)) invalid('duplicate usage evidence'); usageRefs.add(run.usageEvidenceRef); }
  }
  const grouped=Object.fromEntries(ARMS.map(arm=>[arm,aggregateArm(input.runs,arm)])),b=grouped.baseline,s=grouped.swf;
  if(b.missingUsage||s.missingUsage) reasons.push('missing_usage');
  const totalRatio=ratio(s.totalTokens,b.totalTokens);
  if(totalRatio===null) reasons.push('zero_or_missing_baseline_total');
  if(input.sharedOverhead?.attribution!=='complete') reasons.push('unattributed_overhead');
  if(input.sharedOverhead?.symmetricExclusion!==false) reasons.push('overhead_must_be_included');
  if(input.coverage?.allEventsIncluded!==true||!input.coverage?.evidenceRef) reasons.push('event_coverage_unknown');
  const cases=Array.isArray(input.cases)?input.cases:[],ids=new Set(),partitions=new Map();
  for(const row of cases) {
    if(!row||typeof row.caseId!=='string'||ids.has(row.caseId)) invalid('invalid or duplicate caseId'); ids.add(row.caseId);
    if(typeof row.taskId!=='string'||!row.taskId||!['development','holdout'].includes(row.partition)||![1,2].includes(row.round)) invalid('case grouping required');
    if(partitions.has(row.taskId)&&partitions.get(row.taskId)!==row.partition) invalid('task group leaked into holdout'); partitions.set(row.taskId,row.partition);
    for(const arm of ARMS) {
      if(!input.runs.some(r=>r.caseId===row.caseId&&r.arm===arm)) reasons.push('unpaired_cases');
      if(row[arm]?.qualityPass!==true) reasons.push('quality_unproven_or_regressed');
    }
  }
  if(!cases.length||input.runs.some(r=>!ids.has(r.caseId))) reasons.push('unpaired_cases');
  const reg=input.registration,primary=reg?.primaryMetric;
  const registered=METRICS.includes(primary)&&['baselineHash','swfHash','rubricHash','evidenceRef'].every(k=>typeof reg[k]==='string'&&reg[k].trim());
  const registeredAt=Date.parse(reg?.registeredAt);
  if(!registered||!Number.isFinite(registeredAt)||input.runs.some(r=>!Number.isFinite(Date.parse(r.startedAt))||Date.parse(r.startedAt)<=registeredAt)) reasons.push('preregistration_unproven');
  if(input.runs.some(r=>typeof r.modelEvidenceRef!=='string'||!r.modelEvidenceRef.trim())||input.coverage?.matchedExecutionBudget!==true) reasons.push('model_comparability_unknown');
  const effects={};
  if(registered) {
    effects.all=effect(cases,primary,input.runs);
    effects.round1=effect(cases.filter(r=>r.partition==='development'&&r.round===1),primary,input.runs);
    effects.round2=effect(cases.filter(r=>r.partition==='development'&&r.round===2),primary,input.runs);
    effects.holdout=effect(cases.filter(r=>r.partition==='holdout'),primary,input.runs);
  }
  const otherMetrics={};
  if(registered) for(const metric of METRICS.filter(m=>m!==primary)) {
    otherMetrics[metric]=effect(cases,metric,input.runs);
    if(otherMetrics[metric].improvement===undefined) reasons.push('other_metric_unknown');
    else if(otherMetrics[metric].improvement<0) reasons.push('other_metric_regressed');
  }
  const improved=registered&&Object.values(effects).length===4&&Object.values(effects).every(e=>e.met);
  if(!improved) reasons.push('efficiency_unproven');
  if(input.evidenceKind!=='live') reasons.push('synthetic_or_unknown_evidence');
  const unique=[...new Set(reasons)],complete=unique.length===0;
  const costVerdict=totalRatio===null?'unproven':totalRatio>1+PROFILE_MARGIN?'exceeded':totalRatio<=1?'within':complete?'covered_band':'unproven';
  return {schemaVersion:PROFILE_SCHEMA_VERSION,margin:PROFILE_MARGIN,arms:grouped,ratios:{totalTokens:totalRatio,freshTokens:ratio(s.freshTokens,b.freshTokens),outputTokens:ratio(s.outputTokens,b.outputTokens)},effects,otherMetrics,efficiencyVerdict:improved?'measured_improvement':'unproven',costVerdict,verdict:!complete?'unproven':costVerdict==='exceeded'?'not_supported':'supported',reasons:unique,disclaimer:'Offline arithmetic over supplied evidence; references and completeness need independent verification. Synthetic fixtures never prove live benefit. Paired bootstrap intervals are pilot estimates.'};
}
export async function readProfile(file) { return evaluateDecisionProfile(JSON.parse(await readFile(file,'utf8'))); }
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(!process.argv[2]) throw new Error('usage: node scripts/evaluate-decision-profile.mjs <profile.json>');
  console.log(JSON.stringify(await readProfile(process.argv[2]),null,2));
}
