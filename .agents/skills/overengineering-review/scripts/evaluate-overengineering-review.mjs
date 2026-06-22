#!/usr/bin/env node
import {
  evaluateOverengineeringReviewFixtures,
  formatOverengineeringReviewReport
} from '../lib/evaluate-overengineering-review.mjs';

const args = new Set(process.argv.slice(2));
const report = await evaluateOverengineeringReviewFixtures();

if (args.has('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(formatOverengineeringReviewReport(report));
}

if (report.summary.failed > 0) {
  process.exitCode = 1;
}
