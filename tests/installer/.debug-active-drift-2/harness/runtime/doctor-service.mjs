import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { readHarnessHealth } from '../installer/lib/health.mjs';
import { resolveHarnessRoot } from './root-policy.mjs';
import { sanitizeText } from './redaction.mjs';

const HOME_PATH_PATTERNS = [
  /(?:^|[^A-Za-z0-9])\/Users\/[^/\n\r]+\/(?:[^ \n\r\t"'`<>]|$)/,
  /(?:^|[^A-Za-z0-9])\/home\/[^/\n\r]+\/(?:[^ \n\r\t"'`<>]|$)/,
  /(?:^|[^A-Za-z0-9])C:\\Users\\[^\\\n\r]+\\(?:[^ \n\r\t"'`<>]|$)/i
];

function containsHomePath(text) {
  return HOME_PATH_PATTERNS.some((pattern) => pattern.test(text));
}

function renderSection(title, lines) {
  return `${title}\n${lines.map((line) => `- ${line}`).join('\n')}`;
}

export async function runHarnessDoctor(input = {}) {
  const resolved = await resolveHarnessRoot(input.root, input);
  const health = await readHarnessHealth(resolved.rootDir, input.homeDir ?? os.homedir());
  const problems = [...health.problems];
  const warnings = [...health.warnings, ...(health.context?.warnings ?? [])];

  for (const [target, targetHealth] of Object.entries(health.targets)) {
    for (const entry of targetHealth.entries) {
      const text = await readFile(entry.path, 'utf8').catch(() => '');
      if (containsHomePath(text)) {
        problems.push(`${target}: personal path found in ${entry.path}`);
      }
    }
  }

  const uniqueProblems = [...new Set(problems)];
  const uniqueWarnings = [...new Set(warnings)].filter((warning) => !uniqueProblems.includes(warning));
  const lines = [
    renderSection('Hook payload', [
      `verdict=${health.context?.summary?.hooks?.verdict ?? 'unknown'}`,
      `target=${health.context?.summary?.hooks?.target ?? 'none'}`
    ]),
    renderSection('Budget ledger', [
      `scope=${health.context?.ledger?.scope ?? 'unknown'}`,
      `projection=${health.context?.ledger?.projectionMode ?? 'unknown'}`,
      `hooks=${health.context?.ledger?.hookMode ?? 'unknown'}`
    ])
  ];

  return {
    ok: uniqueProblems.length === 0,
    rootDir: resolved.rootDir,
    health,
    problems: uniqueProblems,
    warnings: uniqueWarnings,
    markdown: sanitizeText(
      [`# Harness Doctor`, '', ...lines, '', renderSection('Warnings', uniqueWarnings), '', renderSection('Problems', uniqueProblems)].join('\n'),
      input
    )
  };
}
