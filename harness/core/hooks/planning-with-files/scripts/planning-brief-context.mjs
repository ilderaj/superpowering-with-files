import { buildPlanningContextModel, planningFingerprint } from './planning-hot-context.mjs';

export async function buildPlanningBriefContext({ taskPlanPath, findingsPath, progressPath }) {
  const context = await buildPlanningContextModel({ taskPlanPath, findingsPath, progressPath });

  return [
    '[planning-with-files] BRIEF CONTEXT',
    `Task: ${context.taskName}`,
    `Phase: ${context.currentPhase}`,
    `Next: ${context.nextStep}`,
    `Last failure: ${context.lastFailure}`,
    'Recovery cue: No planning changes since last hot context emission. Reuse the last hot context unless you need to reopen the planning files.'
  ].join('\n');
}

export async function buildPlanningFingerprint({ taskPlanPath, findingsPath, progressPath }) {
  const context = await buildPlanningContextModel({ taskPlanPath, findingsPath, progressPath });
  return planningFingerprint(context.sourceText);
}
