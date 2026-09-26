import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const START = '<!-- swf-harness:start -->';
const END = '<!-- swf-harness:end -->';
export const projectPolicy = `${START}
## SWF Harness

This project opts in to the installed SWF Harness Codex plugin. For tracked work, use its Trio routing and exactly one capability (dev, office, or safety). Quick tasks remain direct. Use planning/active/<task-id>/task_plan.md, findings.md, and progress.md as the only durable task authority. Preserve existing task bindings and authorization. External integrations are optional until configured; their absence does not block independent local work. The Host owns permissions, execution lifecycle, and authenticated model evidence.
${END}`;

function managedSpan(text) {
  const starts = [...text.matchAll(/<!-- swf-harness:start -->/g)];
  const ends = [...text.matchAll(/<!-- swf-harness:end -->/g)];
  if (!starts.length && !ends.length) return null;
  if (starts.length !== 1 || ends.length !== 1 || ends[0].index < starts[0].index) throw new Error('Ambiguous SWF block; preserve the file and resolve manually');
  return [starts[0].index, ends[0].index + END.length];
}

export function editProjectPolicy(text, action) {
  if (!['enable', 'disable', 'status'].includes(action)) throw new Error('Expected enable, disable, or status');
  const span = managedSpan(text);
  if (action === 'status') return { enabled: Boolean(span), text };
  if (span && text.slice(...span) !== projectPolicy) throw new Error('SWF block has user changes; refusing to overwrite');
  if (action === 'enable') return { enabled: true, text: span ? text : text + projectPolicy + '\n' };
  return { enabled: false, text: span ? text.slice(0, span[0]) + text.slice(span[1]).replace(/^\n/, '') : text };
}

export async function setProjectPolicy(projectRoot, action) {
  const filename = path.join(projectRoot, 'AGENTS.md');
  const { lstat } = await import('node:fs/promises');
  let text = '';
  try {
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('AGENTS.md must be a regular file');
    if (info.nlink > 1) throw new Error('AGENTS.md is a hardlink; refusing to change shared policy');
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await readFile(filename));
    } catch (error) {
      if (error.code === 'ERR_ENCODING_INVALID_ENCODED_DATA') throw new Error('AGENTS.md must contain valid UTF-8; original bytes preserved');
      throw error;
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const result = editProjectPolicy(text, action);
  if (result.text !== text) await writeFile(filename, result.text, 'utf8');
  return { filename, enabled: result.enabled, changed: result.text !== text };
}
