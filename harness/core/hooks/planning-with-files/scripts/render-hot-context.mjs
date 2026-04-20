import { buildPlanningHotContext } from './planning-hot-context.mjs';

const [taskPlanPath, findingsPath, progressPath] = process.argv.slice(2);
const output = await buildPlanningHotContext({ taskPlanPath, findingsPath, progressPath });

process.stdout.write(output);
