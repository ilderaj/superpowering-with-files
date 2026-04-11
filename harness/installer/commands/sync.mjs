import os from 'node:os';
import { entriesForScope, loadAdapter, renderEntry } from '../lib/adapters.mjs';
import { writeRenderedFile } from '../lib/fs-ops.mjs';
import { readState } from '../lib/state.mjs';

export async function sync() {
  const rootDir = process.cwd();
  const homeDir = os.homedir();
  const state = await readState(rootDir);
  const targets = Object.keys(state.targets).filter((target) => state.targets[target].enabled);

  for (const target of targets) {
    const adapter = await loadAdapter(rootDir, target);
    const content = await renderEntry(rootDir, target);
    const entries = entriesForScope(rootDir, homeDir, adapter, state.scope);

    for (const entry of entries) {
      await writeRenderedFile(entry, content);
    }
  }

  console.log(`Synced ${targets.length} target(s): ${targets.join(', ')}`);
}
