#!/usr/bin/env node
import { evaluateGoal2PlanFixtures, formatGoal2PlanReport } from '../lib/evaluate-goal2plan.mjs';

const args = new Set(process.argv.slice(2));
const report = await evaluateGoal2PlanFixtures();

if (args.has('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(formatGoal2PlanReport(report));
}

if (report.summary.failed > 0) {
  process.exitCode = 1;
}
