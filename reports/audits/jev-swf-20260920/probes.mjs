import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DECISION_BUNDLES, evaluateDecision, resolveNextState } from '../../../harness/trio/core/decision.mjs';
import { devEvidence, officeEvidence } from '../../../harness/trio/core/evidence.mjs';
import { recordCheckpointShadow } from '../../../harness/trio/core/shadow.mjs';
import { evaluateDecisionAccuracy } from '../../../scripts/evaluate-decision-accuracy.mjs';
import { evaluateDecisionShadow } from '../../../scripts/evaluate-decision-shadow.mjs';
const answers = { goal_satisfied: true, requirements_covered: true, semantic_correctness: true, scope_preserved: true, verification_sufficient: true, regression_risk: 1, more_work_required: false };
const request = bundle => ({ schemaVersion: 1, bundle, bundleVersion: 1, subject: { taskId: 'audit-probe', phase: bundle, capability: 'dev' }, requirement: { mode: 'think', intensity: 'high' }, evidence: { deterministic: {}, semanticContext: null }, questions: DECISION_BUNDLES[bundle].questions.map(({id,kind,options,scale}) => ({id,kind,...(options?{options}:{}),...(scale?{scale}:{})})) });
const directory = await mkdtemp(path.join(tmpdir(), 'jev-audit-'));
const planAnswers = { requirements_covered: true, solution_coherent: true, dependencies_resolved: true, implementation_specific: true, acceptance_defined: true, verification_defined: true, blocking_unknowns_remain: false };
const observation = { questionId: 'plan_ready', request: request('plan'), operator: planAnswers };
const unknown = await recordCheckpointShadow({ checkpoint: { taskId: 'audit-probe', state: 'not-a-state' }, observations: [observation], directory });
let malformed;
try { await recordCheckpointShadow({ checkpoint: {taskId:'audit-probe',state:'ready'}, observations: [null], directory }); malformed = 'returned'; } catch(e) { malformed = 'throws: '+e.message; }
const report = {
  adapter: {
    onlyTests: resolveNextState(answers,{deterministic:devEvidence({results:{tests:{exitCode:0}}})}),
    failedTests: resolveNextState(answers,{deterministic:devEvidence({results:{tests:{exitCode:1}}})}),
    onlyDocument: resolveNextState(answers,{deterministic:officeEvidence({results:{document_structure:{exitCode:0}}})})
  },
  releaseFromOperator: evaluateDecision(request('release'),{operator:{readiness:'ready',authorization:'allowed'}}).composites,
  unknownComparison: { agreement: unknown.results[0].agreement, summary: unknown.summary },
  malformedObservation: malformed,
  t1: (await evaluateDecisionAccuracy()).headline,
  shadow: (await evaluateDecisionShadow()).summary
};
console.log(JSON.stringify(report,null,2));
