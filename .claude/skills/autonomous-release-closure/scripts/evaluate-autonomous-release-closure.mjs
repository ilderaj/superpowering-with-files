#!/usr/bin/env node
import {
  evaluateAutonomousReleaseClosureFixtures,
  formatAutonomousReleaseClosureReport,
  reportHasAutonomousReleaseClosureFailures
} from '../lib/evaluate-autonomous-release-closure.mjs';

const args = new Set(process.argv.slice(2));
const skillRoot = process.env.HARNESS_AUTONOMOUS_RELEASE_CLOSURE_SKILL_ROOT;
const report = await evaluateAutonomousReleaseClosureFixtures(skillRoot);

if (args.has('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(formatAutonomousReleaseClosureReport(report));
}

if (reportHasAutonomousReleaseClosureFailures(report)) {
  process.exitCode = 1;
}
