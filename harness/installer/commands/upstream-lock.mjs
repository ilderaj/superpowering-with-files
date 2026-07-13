import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';
import { loadSourceLock, loadUpstreamSourceConfig, writeSourceLock } from '../lib/upstream-config.mjs';
import { buildSourceLockRecord, resolveConfiguredSources } from '../lib/upstream.mjs';

export async function upstreamLockCommand(args = []) {
  const { rootDir } = await discoverAuthorityRoot(process.cwd());
  const sources = await loadUpstreamSourceConfig(rootDir);
  const resolved = await resolveConfiguredSources({ rootDir, sources, args });
  const existingLock = await loadSourceLock({ rootDir });
  const resolvedLock = buildSourceLockRecord(resolved);
  await writeSourceLock(
    {
      ...resolvedLock,
      sources: {
        ...existingLock.sources,
        ...resolvedLock.sources
      }
    },
    { rootDir }
  );
  console.log(`Resolved ${resolved.length} upstream source(s) into harness/upstream/.source-lock.json`);
}
