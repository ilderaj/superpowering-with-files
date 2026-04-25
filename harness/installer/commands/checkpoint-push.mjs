import { checkpointPush } from '../lib/checkpoint-push.mjs';

export async function checkpointPushCommand(args = []) {
  const { result, stdout } = await checkpointPush(process.cwd(), args);
  if (stdout) process.stdout.write(stdout);
  if (!['success', 'no_changes'].includes(result.status)) {
    process.exitCode = 1;
  }
}
