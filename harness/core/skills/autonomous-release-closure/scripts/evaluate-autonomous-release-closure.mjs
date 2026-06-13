#!/usr/bin/env node
import {
  evaluateAutonomousReleaseClosureFixtures,
  formatAutonomousReleaseClosureReport
} from '../lib/evaluate-autonomous-release-closure.mjs';

const args = new Set(process.argv.slice(2));
const report = await evaluateAutonomousReleaseClosureFixtures();

if (args.has('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(formatAutonomousReleaseClosureReport(report));
}

if (report.summary.failed > 0) {
  process.exitCode = 1;
}
