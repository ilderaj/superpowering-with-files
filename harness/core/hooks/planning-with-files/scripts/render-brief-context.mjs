import { buildPlanningBriefContext, buildPlanningFingerprint } from './planning-brief-context.mjs';

const args = process.argv.slice(2);

if (args[0] === '--fingerprint') {
  const [, taskPlanPath, findingsPath, progressPath] = args;
  process.stdout.write(
    await buildPlanningFingerprint({
      taskPlanPath,
      findingsPath,
      progressPath
    })
  );
} else {
  const [taskPlanPath, findingsPath, progressPath] = args;
  process.stdout.write(
    await buildPlanningBriefContext({
      taskPlanPath,
      findingsPath,
      progressPath
    })
  );
}
