import { checkpointPush } from '../lib/checkpoint-push.mjs';
import { discoverAuthorityRoot } from '../../runtime/authority-root.mjs';

export async function checkpointPushCommand(args = []) {
  const { rootDir } = await discoverAuthorityRoot(process.cwd());
  const { result, stdout } = await checkpointPush(rootDir, args);
  if (stdout) process.stdout.write(stdout);
  if (!['success', 'no_changes'].includes(result.status)) {
    process.exitCode = 1;
  }
}
