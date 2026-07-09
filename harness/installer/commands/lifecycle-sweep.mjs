import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';
import {
  applyLifecycleSweepRecommendation,
  getLifecycleSweepReport
} from '../../runtime/lifecycle-sweep-service.mjs';

function hasFlag(args, ...names) {
  return names.some((name) => args.includes(name));
}

function readOption(args, name) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);

  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for --${name}.`);
  }
  return value;
}

function usage() {
  return [
    'Usage: ./scripts/harness lifecycle-sweep [--task <task-id>] [--json] [--output <path>] [--apply-safe]',
    '',
    'Options:',
    '  --task <task-id>  Limit the sweep to one active task',
    '  --json            Print the lifecycle sweep report as JSON',
    '  --output <path>   Write the JSON report to the given path',
    '  --apply-safe      Apply only allowed non-terminal status transitions',
    '  --help, -h        Show this help message'
  ].join('\n');
}

function filterTask(report, taskId) {
  if (!taskId) return report;
  return {
    ...report,
    recommendations: report.recommendations.filter((entry) => entry.taskId === taskId)
  };
}

function textReport(report, applied = []) {
  const lines = [
    '[planning-with-files] LIFECYCLE SWEEP',
    `[planning-with-files] recommendations=${report.recommendations.length} apply_eligible=${report.health.applyEligibleNonTerminal} terminal=${report.health.terminalRecommendations} archive_action=${report.archiveAction}`
  ];

  for (const recommendation of report.recommendations) {
    lines.push(
      `[planning-with-files] ${recommendation.taskId}: current=${recommendation.currentStatus}, action=${recommendation.action}, recommended=${recommendation.recommendedStatus}, apply_eligible=${recommendation.applyEligible ? 'yes' : 'no'}`
    );
    for (const blocker of recommendation.blockers || []) {
      lines.push(`[planning-with-files]   blocker: ${blocker}`);
    }
  }

  for (const entry of applied) {
    lines.push(
      `[planning-with-files] applied ${entry.taskId}: ${entry.beforeStatus} -> ${entry.afterStatus} (${entry.reason})`
    );
  }

  return `${lines.join('\n')}\n`;
}

export async function lifecycleSweep(args = []) {
  if (hasFlag(args, '--help', '-h')) {
    console.log(usage());
    return;
  }

  const { rootDir } = await discoverAuthorityRoot(process.cwd());
  const outputPath = readOption(args, 'output');
  const taskId = readOption(args, 'task');
  const applySafe = hasFlag(args, '--apply-safe');
  const report = filterTask(await getLifecycleSweepReport({ root: rootDir }), taskId);

  const applied = [];
  if (applySafe) {
    for (const recommendation of report.recommendations) {
      if (recommendation.applyEligible) {
        applied.push(await applyLifecycleSweepRecommendation(rootDir, recommendation));
      }
    }
  }

  const finalReport = { ...report, applied };
  if (outputPath) {
    const absoluteOutputPath = path.resolve(rootDir, outputPath);
    await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
    await writeFile(absoluteOutputPath, `${JSON.stringify(finalReport, null, 2)}\n`, 'utf8');
  }

  if (hasFlag(args, '--json')) {
    process.stdout.write(`${JSON.stringify(finalReport, null, 2)}\n`);
    return;
  }

  process.stdout.write(textReport(report, applied));
}
