import { readState } from '../lib/state.mjs';

export async function status() {
  const state = await readState(process.cwd());
  console.log(JSON.stringify(state, null, 2));
}
