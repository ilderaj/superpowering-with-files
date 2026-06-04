import { buildSessionSummary } from './session-summary.mjs';

const [taskPlanPath, findingsPath, progressPath, sidecarEpoch] = process.argv.slice(2);
const sessionStartEpoch = sidecarEpoch?.trim() ? Number(sidecarEpoch) : Number.NaN;
const output = await buildSessionSummary({
  taskPlanPath,
  findingsPath,
  progressPath,
  sessionStartEpoch,
  now: Date.now()
});

process.stdout.write(output);
