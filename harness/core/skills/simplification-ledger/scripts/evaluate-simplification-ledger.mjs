#!/usr/bin/env node
import {
  evaluateSimplificationLedgerFixtures,
  formatSimplificationLedgerReport
} from '../lib/evaluate-simplification-ledger.mjs';

const args = new Set(process.argv.slice(2));
const report = await evaluateSimplificationLedgerFixtures();

if (args.has('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(formatSimplificationLedgerReport(report));
}

if (report.summary.failed > 0) {
  process.exitCode = 1;
}
