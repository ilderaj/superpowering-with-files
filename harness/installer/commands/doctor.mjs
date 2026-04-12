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

export async function doctor(args = []) {
  const checkOnly = args.includes('--check-only');
  const health = await readHarnessHealth(process.cwd(), os.homedir());
  const problems = [];

  problems.push(...health.problems);

  for (const [target, targetHealth] of Object.entries(health.targets)) {
    for (const entry of targetHealth.entries) {
      const text = await readFile(entry.path, 'utf8').catch(() => '');
      if (containsHomePath(text)) {
        problems.push(`${target}: personal path found in ${entry.path}`);
      }
    }
  }

  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
    return;
  }

  console.log(checkOnly ? 'Harness check passed.' : 'Harness installation is healthy.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await doctor(process.argv.slice(2));
}
