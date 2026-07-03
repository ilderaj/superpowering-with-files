import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';
import { loadUpstreamSourceConfig, writeSourceLock } from '../lib/upstream-config.mjs';
import { buildSourceLockRecord, resolveConfiguredSources } from '../lib/upstream.mjs';

export async function upstreamLockCommand(args = []) {
  const { rootDir } = await discoverAuthorityRoot(process.cwd());
  const sources = await loadUpstreamSourceConfig(rootDir);
  const resolved = await resolveConfiguredSources({ rootDir, sources, args });
  await writeSourceLock(buildSourceLockRecord(resolved), { rootDir });
  console.log(`Resolved ${resolved.length} upstream source(s) into harness/upstream/.source-lock.json`);
}
