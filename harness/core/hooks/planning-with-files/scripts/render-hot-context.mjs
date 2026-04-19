import { access } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MODULE_RELATIVE_PATH = path.join('harness', 'installer', 'lib', 'planning-hot-context.mjs');

async function resolveRepositoryRoot() {
  const startPoints = [process.env.HARNESS_PROJECT_ROOT, process.cwd()].filter(Boolean);

  for (const startPoint of startPoints) {
    let current = path.resolve(startPoint);

    while (true) {
      const candidate = path.join(current, MODULE_RELATIVE_PATH);

      try {
        await access(candidate);
        return current;
      } catch {
        // Keep walking upward until we find the repository root that owns harness/.
      }

      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  throw new Error(
    'Unable to locate harness/installer/lib/planning-hot-context.mjs from HARNESS_PROJECT_ROOT or process.cwd().'
  );
}

const repositoryRoot = await resolveRepositoryRoot();
const { buildPlanningHotContext } = await import(
  pathToFileURL(path.join(repositoryRoot, MODULE_RELATIVE_PATH)).href
);

const [taskPlanPath, findingsPath, progressPath] = process.argv.slice(2);
const output = await buildPlanningHotContext({ taskPlanPath, findingsPath, progressPath });

process.stdout.write(output);
