import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const runtimePackageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

export const runtimeHarnessRoot = path.join(runtimePackageRoot, 'harness');
