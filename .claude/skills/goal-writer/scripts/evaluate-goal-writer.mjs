#!/usr/bin/env node
import { evaluateGoalWriterFixtures, formatGoalWriterReport } from '../lib/evaluate-goal-writer.mjs';

const args = new Set(process.argv.slice(2));
const report = await evaluateGoalWriterFixtures();

if (args.has('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(formatGoalWriterReport(report));
}

if (report.summary.failed > 0) {
  process.exitCode = 1;
}
