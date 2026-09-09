// Pure explicit-input calculation. Evidence references are assertions, not authentication.
const TOKEN_KEYS = ['input', 'cachedInput', 'output', 'reasoningOutput'];
const ACTION_KEYS = ['repeatConfirmations', 'resumeTurns', 'unnecessarySteps', 'humanInterventions'];
const QUALITY_KEYS = ['factual', 'scope', 'usable', 'limitations'];
const METRICS = ['totalTokens', 'freshTokens', 'elapsedMs', 'humanInterventions'];
const ARMS = ['baseline', 'swf'];
const EXECUTED = ['completed', 'failed', 'timeout'];
const unique = xs => [...new Set(xs)].sort();
function invalid(where) { const e = new Error(`Invalid economics input at ${where}`); e.code = 'ERR_ECONOMICS_INPUT'; throw e; }
function object(x, keys, where) {
  if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).length !== keys.length || keys.some(k => !Object.hasOwn(x,k))) invalid(where);
}
function string(x,w) { if(typeof x!=='string'||!x.trim()||x==='unknown') invalid(w); }
function nullableString(x,w) { if(x!==null) string(x,w); }
function enumeration(x,values,w) { if(!values.includes(x)) invalid(w); }
function integer(x,w) { if(!Number.isSafeInteger(x)||x<0) invalid(w); }
function array(x,w) { if(!Array.isArray(x)) invalid(w); }
function strings(x,w) { array(x,w);x.forEach(v=>string(v,w)); }
function hash(x,w) { if(typeof x!=='string'||!/^[a-f0-9]{64}$/.test(x)) invalid(w); }
function date(x,w) {
  const match = typeof x === 'string' && /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.exec(x);
  if (!match || !Number.isFinite(Date.parse(x))) invalid(w);
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) invalid(w);
}
function vector(x,w) {
  object(x,TOKEN_KEYS,w);for(const k of TOKEN_KEYS)if(x[k]!==null)integer(x[k],`${w}.${k}`);
  if(x.input!==null&&x.cachedInput!==null&&x.cachedInput>x.input)invalid(w);
  if(x.output!==null&&x.reasoningOutput!==null&&x.reasoningOutput>x.output)invalid(w);
}
function scopeArray(scopes,ids,w) {
  array(scopes,w);const local=new Map();
  for(const s of scopes){
    object(s,['scopeId','parentScopeId','accounting','mode','start','end','delta','evidenceRef'],w);
    string(s.scopeId,w);nullableString(s.parentScopeId,w);string(s.evidenceRef,w);
    if(ids.has(s.scopeId))invalid(`${w}.duplicateScope`);ids.add(s.scopeId);local.set(s.scopeId,s);
    enumeration(s.accounting,['exclusive','inclusive','unknown'],w);enumeration(s.mode,['delta','cumulative'],w);
    if(s.mode==='delta'){if(s.start!==null||s.end!==null)invalid(w);vector(s.delta,w);}
    else {if(s.delta!==null)invalid(w);vector(s.start,w);vector(s.end,w);}
  }
  for(const s of scopes){const seen=new Set([s.scopeId]);let p=s.parentScopeId;while(p!==null){if(!local.has(p)||seen.has(p))invalid(`${w}.parent`);seen.add(p);p=local.get(p).parentScopeId;}}
}
function reasonFor(reasons,field,w) { if(!reasons.some(r=>r.includes(field))) invalid(`${w}.${field}.reason`); }
export function validateExperiment(input) {
  object(input,['schemaVersion','cohort','runs'],'input');if(input.schemaVersion!==1)invalid('schemaVersion');
  const c=input.cohort;
  const keys=['id','kind','caseIds','holdoutIds','rounds','primaryMetric','inputHashes','rubricHash','methodHash','toolScopeHash','preregisteredAt','timeoutSeconds','sharedOverhead','overheadAssessment','tradeoffReview'];
  if(c?.kind==='strategy')keys.push('strategies');object(c,keys,'cohort');string(c.id,'cohort.id');enumeration(c.kind,['method','strategy'],'kind');
  strings(c.caseIds,'caseIds');strings(c.holdoutIds,'holdoutIds');
  if(c.caseIds.length!==4||new Set(c.caseIds).size!==4||c.holdoutIds.length!==2||new Set(c.holdoutIds).size!==2||c.holdoutIds.some(k=>!c.caseIds.includes(k)))invalid('caseIds');
  if(JSON.stringify(c.rounds)!=='[1,2]')invalid('rounds');enumeration(c.primaryMetric,['totalTokens','freshTokens','elapsedMs'],'primaryMetric');
  object(c.inputHashes,c.caseIds,'inputHashes');Object.values(c.inputHashes).forEach(x=>hash(x,'inputHashes'));
  object(c.methodHash,ARMS,'methodHash');Object.values(c.methodHash).forEach(x=>hash(x,'methodHash'));hash(c.rubricHash,'rubricHash');hash(c.toolScopeHash,'toolScopeHash');date(c.preregisteredAt,'preregisteredAt');integer(c.timeoutSeconds,'timeoutSeconds');if(!c.timeoutSeconds)invalid('timeoutSeconds');
  if(c.kind==='strategy'){object(c.strategies,ARMS,'strategies');for(const arm of ARMS){const s=c.strategies[arm];object(s,['model','effort','topology'],'strategy');string(s.model,'strategy.model');string(s.effort,'strategy.effort');enumeration(s.topology,['direct','native'],'strategy.topology');}}
  object(c.sharedOverhead,['scopes','reason'],'sharedOverhead');string(c.sharedOverhead.reason,'sharedOverhead.reason');
  const o=c.overheadAssessment;object(o,['attribution','symmetricExclusion','reason','reviewer','evidenceRef'],'overheadAssessment');enumeration(o.attribution,['complete','incomplete','unknown'],'attribution');enumeration(o.symmetricExclusion,['yes','no','unknown'],'symmetricExclusion');string(o.reason,'overheadAssessment.reason');nullableString(o.reviewer,'overheadAssessment.reviewer');nullableString(o.evidenceRef,'overheadAssessment.evidenceRef');
  if(c.tradeoffReview!==null){const t=c.tradeoffReview;object(t,['reviewer','evidenceRef','accepted','reason'],'tradeoffReview');for(const k of ['reviewer','evidenceRef','reason'])string(t[k],k);if(typeof t.accepted!=='boolean')invalid('accepted');}
  array(input.runs,'runs');const ids=new Set(),runIds=new Set(),slots=new Map();scopeArray(c.sharedOverhead.scopes,ids,'sharedOverhead.scopes');
  for(const r of input.runs){
    object(r,['runId','caseId','round','arm','attempt','inputHash','instructionHash','toolScopeHash','requestedModel','requestedEffort','actualModel','actualEffort','actualEvidenceRef','topology','startedAt','endedAt','status','quality','actions','usageScopes','evidenceRefs','reasons'],'run');
    for(const k of ['runId','requestedModel','requestedEffort'])string(r[k],k);
    if(runIds.has(r.runId))invalid('duplicateRunId');runIds.add(r.runId);
    enumeration(r.caseId,c.caseIds,'caseId');enumeration(r.round,[1,2],'round');enumeration(r.arm,ARMS,'arm');integer(r.attempt,'attempt');if(r.attempt<1)invalid('attempt');
    for(const k of ['inputHash','instructionHash','toolScopeHash'])hash(r[k],k);
    strings(r.reasons,'reasons');strings(r.evidenceRefs,'evidenceRefs');
    for(const k of ['actualModel','actualEffort','actualEvidenceRef']){nullableString(r[k],k);if(r[k]===null)reasonFor(r.reasons,k,'run');}
    enumeration(r.topology,['direct','native'],'topology');enumeration(r.status,[...EXECUTED,'not_run','unavailable'],'status');
    for(const k of ['startedAt','endedAt'])if(r[k]!==null)date(r[k],k);else reasonFor(r.reasons,k,'run');
    if(r.startedAt!==null&&r.endedAt!==null&&Date.parse(r.endedAt)<Date.parse(r.startedAt))invalid('elapsedMs');
    object(r.quality,[...QUALITY_KEYS,'reviewer','evidenceRef'],'quality');for(const k of QUALITY_KEYS)enumeration(r.quality[k],['pass','fail','not_assessed'],'quality');
    for(const k of ['reviewer','evidenceRef']){nullableString(r.quality[k],`quality.${k}`);if(QUALITY_KEYS.some(q=>r.quality[q]!=='not_assessed')&&r.quality[k]===null)invalid(`quality.${k}`);if(r.quality[k]===null)reasonFor(r.reasons,'quality','run');}
    object(r.actions,[...ACTION_KEYS,'reasons'],'actions');const missing=ACTION_KEYS.filter(k=>r.actions[k]===null);object(r.actions.reasons,missing,'actions.reasons');for(const k of ACTION_KEYS)if(r.actions[k]!==null)integer(r.actions[k],`actions.${k}`);else string(r.actions.reasons[k],`actions.reasons.${k}`);
    scopeArray(r.usageScopes,ids,'usageScopes');if(!r.usageScopes.length&&!r.reasons.length)invalid('missing_usage.reason');
    // Tie missing counters to their component, rather than any non-empty reason.
    for (const scope of r.usageScopes) {
      for (const mode of scope.mode === 'delta' ? ['delta'] : ['start', 'end']) {
        for (const component of TOKEN_KEYS) {
          if (scope[mode][component] === null) {
            reasonFor(r.reasons, `usageScopes.${mode}.${component}`, 'run');
          }
        }
      }
    }
    const key=JSON.stringify([r.caseId,r.round,r.arm]);if(!slots.has(key))slots.set(key,[]);slots.get(key).push(r);
  }
  for(const rs of slots.values()){
    const sorted=[...rs].sort((a,b)=>a.attempt-b.attempt);
    if(sorted.some((r,i)=>r.attempt!==i+1))invalid('attemptSequence');
    if(sorted.some(r=>!EXECUTED.includes(r.status))&&sorted.length!==1)invalid('placeholderAttempt');
  }
  return input;
}
const sum = xs => xs.length && xs.every(x=>x!==null) ? safeSum(xs) : null;
function safeSum(xs) {const n=xs.reduce((a,b)=>a+b,0);if(!Number.isSafeInteger(n))invalid('aggregateOverflow');return n;}
const partial = xs => xs.some(x=>x!==null) ? safeSum(xs.filter(x=>x!==null)) : null;
function usage(scopes) {
  const reasons=[];const rows=[];const parents=new Set(scopes.map(s=>s.parentScopeId).filter(x=>x!==null));
  const overlap=scopes.some(s=>s.accounting==='inclusive'&&parents.has(s.scopeId));
  for(const s of scopes){
    if(s.accounting==='unknown'){reasons.push('unknown_accounting');rows.push({totalTokens:null,freshTokens:null});continue;}
    let v=s.delta;
    if(s.mode==='cumulative'){
      v={};for(const k of TOKEN_KEYS){const a=s.start[k],b=s.end[k];v[k]=a===null||b===null||b<a?null:b-a;if(a!==null&&b!==null&&b<a)reasons.push('counter_reset');}
      // Valid endpoint vectors can still describe an inconsistent delta window.
      if(v.input!==null&&v.cachedInput!==null&&v.cachedInput>v.input){v.cachedInput=null;reasons.push('counter_reset');}
      if(v.output!==null&&v.reasoningOutput!==null&&v.reasoningOutput>v.output)reasons.push('counter_reset');
    }
    const totalTokens=sum([v.input,v.output]);const freshTokens=totalTokens===null||v.cachedInput===null?null:totalTokens-v.cachedInput;
    rows.push({totalTokens,freshTokens});if(totalTokens===null||freshTokens===null)reasons.push('missing_usage');
  }
  if(!scopes.length)reasons.push('missing_usage');if(overlap)reasons.push('overlapping_usage');
  const metrics={},knownPartial={};for(const k of ['totalTokens','freshTokens']){metrics[k]=overlap?null:sum(rows.map(r=>r[k]));knownPartial[k]=overlap?null:partial(rows.map(r=>r[k]));}
  return {metrics,knownPartial,reasons:unique(reasons)};
}
function gate(gates) {return gates.includes('fail')?'fail':!gates.length||gates.includes('incomplete')?'incomplete':'pass';}
function runGate(r){return ['failed','timeout'].includes(r.status)||QUALITY_KEYS.some(k=>r.quality[k]==='fail')?'fail':!EXECUTED.includes(r.status)||QUALITY_KEYS.some(k=>r.quality[k]==='not_assessed')?'incomplete':'pass';}
function measured(r,c){
  const u=usage(r.usageScopes),reasons=[...u.reasons,...r.reasons];const qualityGate=runGate(r);
  if(qualityGate==='fail')reasons.push('quality_failed');if(qualityGate==='incomplete')reasons.push('unreviewed_quality');
  if(!r.actualModel||!r.actualEffort||!r.actualEvidenceRef)reasons.push('missing_actual_evidence');
  if(r.inputHash!==c.inputHashes[r.caseId])reasons.push('input_mismatch');if(r.instructionHash!==c.methodHash[r.arm])reasons.push('configuration_mismatch');if(r.toolScopeHash!==c.toolScopeHash)reasons.push('tool_mismatch');
  if(c.kind==='strategy'){const s=c.strategies[r.arm];if(r.actualModel!==s.model||r.actualEffort!==s.effort||r.topology!==s.topology)reasons.push('configuration_mismatch');}
  const elapsedMs=!EXECUTED.includes(r.status)||r.startedAt===null||r.endedAt===null?null:Date.parse(r.endedAt)-Date.parse(r.startedAt);
  const metrics={...u.metrics,elapsedMs,humanInterventions:r.actions.humanInterventions};
  if(!EXECUTED.includes(r.status)){for(const k of METRICS)metrics[k]=null;reasons.push('incomplete_runs');}
  return {runId:r.runId,caseId:r.caseId,round:r.round,arm:r.arm,attempt:r.attempt,status:r.status,quality:{...r.quality},qualityGate,metrics,knownPartial:{...u.knownPartial,elapsedMs,humanInterventions:metrics.humanInterventions},actions:structuredClone(r.actions),evidenceRefs:[...r.evidenceRefs],reasons:unique(reasons)};
}
function aggregate(rs){
  const metrics={},knownPartial={},actions={};for(const k of METRICS){metrics[k]=sum(rs.map(r=>r.metrics[k]));knownPartial[k]=partial(rs.map(r=>r.knownPartial[k]));}for(const k of ACTION_KEYS)actions[k]=sum(rs.map(r=>r.actions[k]));
  return {runIds:rs.map(r=>r.runId),metrics,knownPartial,actions};
}
export function buildReport(input){
  validateExperiment(input);const c=input.cohort;
  const raw=[...input.runs].sort((a,b)=>c.caseIds.indexOf(a.caseId)-c.caseIds.indexOf(b.caseId)||a.round-b.round||ARMS.indexOf(a.arm)-ARMS.indexOf(b.arm)||a.attempt-b.attempt);
  const runs=raw.map(r=>measured(r,c)),missingSlots=[],pairs=[];
  for(const caseId of c.caseIds)for(const round of c.rounds){
    const group=runs.filter(r=>r.caseId===caseId&&r.round===round),reasons=group.flatMap(r=>r.reasons),arms={};
    for(const arm of ARMS){const rows=group.filter(r=>r.arm===arm);arms[arm]=aggregate(rows);if(!rows.some(r=>EXECUTED.includes(r.status))){missingSlots.push({caseId,round,arm});reasons.push('incomplete_runs');}}
    if(c.kind==='method'){
      const sameCase=raw.filter(r=>r.caseId===caseId&&EXECUTED.includes(r.status));
      if(new Set(sameCase.map(r=>JSON.stringify([r.actualModel,r.actualEffort,r.topology]))).size>1)reasons.push('configuration_mismatch');
    }
    const comparable=ARMS.every(a=>arms[a].runIds.length)&&!reasons.some(r=>['missing_actual_evidence','input_mismatch','tool_mismatch','configuration_mismatch','incomplete_runs'].includes(r));
    const qualityGate=gate([...group.map(r=>r.qualityGate),...(ARMS.some(a=>!arms[a].runIds.length)?['incomplete']:[])]);
    pairs.push({caseId,round,...arms,qualityGate,comparable,reasons:unique(reasons)});
  }
  const rounds=c.rounds.map(round=>{
    const ps=pairs.filter(p=>p.round===round),complete=ps.every(p=>p.comparable&&ARMS.every(a=>p[a].metrics[c.primaryMetric]!==null));
    const baseline=complete?sum(ps.map(p=>p.baseline.metrics[c.primaryMetric])):null,swf=complete?sum(ps.map(p=>p.swf.metrics[c.primaryMetric])):null;
    return {round,primaryMetric:c.primaryMetric,baseline,swf,delta:complete?swf-baseline:null,improvementRatio:complete&&baseline!==0?1-swf/baseline:null,complete,reasons:unique(ps.flatMap(p=>p.reasons))};
  });
  const qualityGate=gate(pairs.map(p=>p.qualityGate)),reasons=pairs.flatMap(p=>p.reasons);
  const o=c.overheadAssessment,attributed=o.attribution==='complete'&&o.symmetricExclusion==='yes'&&o.reviewer!==null&&o.evidenceRef!==null&&!c.sharedOverhead.scopes.some(s=>s.accounting==='unknown')&&!raw.some(r=>r.reasons.includes('unattributed_overhead'));
  if(!attributed)reasons.push('unattributed_overhead');
  const tradeoffs=[];let missingTradeoff=false;
  // Inspect each paired measurement, so improvements elsewhere cannot hide a transfer.
  for(const p of pairs)for(const k of [...METRICS,...ACTION_KEYS.filter(k=>k!=='humanInterventions')]){
    const source=METRICS.includes(k)?'metrics':'actions';const a=p.baseline[source][k],b=p.swf[source][k];
    if(a===null||b===null)missingTradeoff=true;
    else if(b>a)tradeoffs.push({caseId:p.caseId,round:p.round,metric:k,baseline:a,swf:b,delta:b-a});
  }
  const reviewed=c.tradeoffReview?.accepted===true;
  if(missingTradeoff||tradeoffs.length&&!reviewed)reasons.push('unreviewed_tradeoff');
  let economicVerdict;
  const noImprovement=rounds.every(r=>r.complete)&&rounds.some(r=>r.delta>=0);
  if(noImprovement)reasons.push('no_repeatable_improvement');
  if(qualityGate==='fail'){economicVerdict='not_supported';reasons.push('quality_failed');}
  else if(qualityGate!=='pass'||rounds.some(r=>!r.complete)||!attributed){economicVerdict='unproven';}
  else if(noImprovement){economicVerdict='not_supported';}
  else economicVerdict=attributed&&!missingTradeoff&&(!tradeoffs.length||reviewed)?'supported':'unproven';
  const shared=usage(c.sharedOverhead.scopes);
  reasons.push(...shared.reasons.map(reason => `shared_overhead_${reason}`));
  return {schemaVersion:1,cohortId:c.id,coverage:{plannedInitial:16,executedInitial:raw.filter(r=>r.attempt===1&&EXECUTED.includes(r.status)).length,executedAttempts:raw.filter(r=>EXECUTED.includes(r.status)).length,missingSlots},runs,pairs,rounds,qualityGate,economicVerdict,reasons:unique(reasons),sharedOverhead:{metrics:shared.metrics,knownPartial:shared.knownPartial,reason:c.sharedOverhead.reason,reasons:shared.reasons},overheadAssessment:{...o},tradeoffReview:c.tradeoffReview?{...c.tradeoffReview}:null,tradeoffs};
}
const display=x=>x===null?'unknown':String(x).replaceAll('|','\\|').replaceAll('\n',' ');
export function renderMarkdown(r){
  const lines=['# Economics report','',`Cohort: ${display(r.cohortId)}`,`Primary metric: ${display(r.rounds[0]?.primaryMetric ?? null)}`,`Quality: ${r.qualityGate}`,`Economic verdict: ${r.economicVerdict}`,'','References are supplied assertions; independent Host evidence review is required. No dollar costs or general model gains are inferred.','',`Coverage: ${r.coverage.executedInitial}/${r.coverage.plannedInitial} initial; ${r.coverage.executedAttempts} attempts.`,...r.coverage.missingSlots.map(s=>`Missing: ${display(s.caseId)} / ${s.round} / ${s.arm}`),'','| Case | Round | Quality | Comparable | Baseline totalTokens | SWF totalTokens | Baseline freshTokens | SWF freshTokens | Baseline ms | SWF ms | Baseline human | SWF human | Reasons |','| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  for(const p of r.pairs)lines.push(`| ${[p.caseId,p.round,p.qualityGate,p.comparable,p.baseline.metrics.totalTokens,p.swf.metrics.totalTokens,p.baseline.metrics.freshTokens,p.swf.metrics.freshTokens,p.baseline.metrics.elapsedMs,p.swf.metrics.elapsedMs,p.baseline.metrics.humanInterventions,p.swf.metrics.humanInterventions,p.reasons.join(', ')].map(display).join(' | ')} |`);
  lines.push('','| Round | Primary metric | Baseline | SWF | Delta | Improvement |','| --- | --- | --- | --- | --- | --- |');
  for(const x of r.rounds)lines.push(`| ${[x.round,x.primaryMetric,x.baseline,x.swf,x.delta,x.improvementRatio===null?'unknown':`${(x.improvementRatio*100).toFixed(2)}%`].map(display).join(' | ')} |`);
  lines.push('','## Attempts','');for(const x of r.runs)lines.push(`- ${display(x.runId)} attempt ${x.attempt}: ${x.status}; quality ${x.qualityGate} ${display(JSON.stringify(x.quality))}; metrics ${display(JSON.stringify(x.metrics))}; known partial ${display(JSON.stringify(x.knownPartial))}; actions ${display(JSON.stringify(x.actions))}; reasons ${display(x.reasons.join(', '))}`);
  lines.push('','## Shared overhead (excluded from arms)','',display(JSON.stringify(r.sharedOverhead)),display(JSON.stringify(r.overheadAssessment)),'','## Tradeoffs','',...r.tradeoffs.map(t=>display(JSON.stringify(t))),r.tradeoffReview?display(JSON.stringify(r.tradeoffReview)):'No independent tradeoff review supplied.','','Reasons: '+r.reasons.map(display).join(', '),'');return lines.join('\n');
}
