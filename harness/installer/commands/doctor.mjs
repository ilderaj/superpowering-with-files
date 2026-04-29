import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { readHarnessHealth } from '../lib/health.mjs';

const HOME_PATH_PATTERNS = [
  /(?:^|[^A-Za-z0-9])\/Users\/[^/\n\r]+\/(?:[^ \n\r\t"'`<>]|$)/,
  /(?:^|[^A-Za-z0-9])\/home\/[^/\n\r]+\/(?:[^ \n\r\t"'`<>]|$)/,
  /(?:^|[^A-Za-z0-9])C:\\Users\\[^\\\n\r]+\\(?:[^ \n\r\t"'`<>]|$)/i
];

function containsHomePath(text) {
  return HOME_PATH_PATTERNS.some((pattern) => pattern.test(text));
}

function renderSafetySection(safety) {
  if (!safety?.enabled) {
    return '';
  }

  const lines = ['Safety checks:', `- profile: ${safety.profile}`];
  for (const check of safety.checks ?? []) {
    lines.push(`- ${check.name}: ${check.status}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderHookPayloadSection(health) {
  const hooks = health.context?.hooks ?? [];
  const lines = [
    `Hook payload verdict: ${health.context?.summary?.hooks?.verdict ?? 'unknown'}`,
    `Hook payload target: ${health.context?.summary?.hooks?.target ?? 'none'}`,
    'Hook payload detail:'
  ];

  if (hooks.length === 0) {
    lines.push('- none');
  } else {
    for (const hook of hooks) {
      lines.push(
        `- ${hook.target} / ${hook.category ?? 'other'} / ${hook.status ?? 'unknown'} / ${hook.measurement?.approxTokens ?? 0} tokens`
      );
    }
  }

  lines.push(`Scope overlap verdict: ${health.scopeOverlap?.verdict ?? 'ok'}`);
  lines.push(`Scope overlap detail: ${health.scopeOverlap?.details?.length ? health.scopeOverlap.details.join('; ') : 'None.'}`);
  if (health.scopeOverlap?.recommendedAction) {
    lines.push(`Recommended action: ${health.scopeOverlap.recommendedAction}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderedScopeOverlapWarnings(health) {
  return new Set(
    (health.scopeOverlap?.overlaps ?? []).map((overlap) => {
      const recommendedAction = overlap.recommendedAction ?? health.scopeOverlap?.recommendedAction;
      return recommendedAction
        ? `scope overlap ${overlap.target}: ${overlap.message} Recommended action: ${recommendedAction}`
        : `scope overlap ${overlap.target}: ${overlap.message}`;
    })
  );
}

export async function doctor(args = []) {
  const checkOnly = args.includes('--check-only');
  const health = await readHarnessHealth(process.cwd(), os.homedir());
  const problems = [];
  const warnings = [...health.warnings];

  problems.push(...health.problems);

  for (const [target, targetHealth] of Object.entries(health.targets)) {
    for (const entry of targetHealth.entries) {
      const text = await readFile(entry.path, 'utf8').catch(() => '');
      if (containsHomePath(text)) {
        problems.push(`${target}: personal path found in ${entry.path}`);
      }
    }
  }

  if (health.context?.warnings?.length) {
    warnings.push(...health.context.warnings);
  }

  const uniqueProblems = [...new Set(problems)];
  const uniqueWarnings = warnings.filter((warning, index) => {
    return !uniqueProblems.includes(warning) && warnings.indexOf(warning) === index;
  });
  const scopeOverlapWarnings = renderedScopeOverlapWarnings(health);
  const renderedWarnings = uniqueWarnings.filter((warning) => !scopeOverlapWarnings.has(warning));

  if (renderedWarnings.length) {
    console.error(renderedWarnings.join('\n'));
  }

  if (uniqueProblems.length) {
    const safetySection = renderSafetySection(health.safety);
    if (safetySection) {
      console.log(safetySection);
    }
    console.log(renderHookPayloadSection(health));
    console.error(uniqueProblems.join('\n'));
    process.exitCode = 1;
    return;
  }

  const safetySection = renderSafetySection(health.safety);
  if (safetySection) {
    console.log(safetySection);
  }
  console.log(renderHookPayloadSection(health));
  console.log(checkOnly ? 'Harness check passed.' : 'Harness installation is healthy.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await doctor(process.argv.slice(2));
}
