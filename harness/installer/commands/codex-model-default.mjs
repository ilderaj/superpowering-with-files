import os from 'node:os';
import path from 'node:path';
import {
  assessCodexModelDefault,
  readCodexModelDefault,
  replaceCodexModelDefault
} from '../lib/codex-model-config.mjs';

function option(args, name) {
  const inline = args.find((arg) => arg.startsWith('--' + name + '='));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf('--' + name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error('Missing value for --' + name + '.');
  return value;
}

function codexHome(args) {
  return option(args, 'codex-home') ?? path.join(os.homedir(), '.codex');
}

export async function codexModelDefault(args = []) {
  const command = args[0] ?? 'inspect';
  const home = codexHome(args);
  const expectedModel = option(args, 'expected-model');
  const expectedReasoning = option(args, 'expected-reasoning');
  if (Boolean(expectedModel) !== Boolean(expectedReasoning)) {
    throw new Error('expected-model and expected-reasoning must be supplied together.');
  }

  let result;
  if (command === 'inspect') {
    result = await readCodexModelDefault({ codexHome: home });
  } else if (command === 'assess') {
    result = await assessCodexModelDefault({ codexHome: home, expectedModel, expectedReasoning });
  } else if (command === 'migrate') {
    const model = option(args, 'model');
    const reasoning = option(args, 'reasoning');
    if (!model || !reasoning || !expectedModel || !expectedReasoning) {
      throw new Error('migrate requires expected-model, expected-reasoning, model, and reasoning.');
    }
    result = await replaceCodexModelDefault({
      codexHome: home,
      expectedBefore: { model: expectedModel, reasoningEffort: expectedReasoning },
      expectedAfter: { model, reasoningEffort: reasoning }
    });
  } else {
    throw new Error('Unknown codex-model-default command: ' + command);
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
