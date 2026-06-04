import { readFile } from 'node:fs/promises';

import {
  deriveDecisionPlaneRoute,
  parseRoutingDecision
} from '../../../../runtime/decision-plane-router.mjs';

const [taskPlanPath] = process.argv.slice(2);

if (!taskPlanPath) {
  throw new Error('task_plan.md path is required');
}

const markdown = await readFile(taskPlanPath, 'utf8');
const recordedRoute = parseRoutingDecision(markdown);
const classification = recordedRoute?.selectedRoute === 'deep-rich' ? 'deep' : 'tracked';
const route = deriveDecisionPlaneRoute({
  classification,
  recordedRoute,
  signals: { hasPlanning: true }
});

process.stdout.write(`${JSON.stringify(route)}\n`);
