#!/usr/bin/env node
// CLI surface for the linear-work-control deterministic helpers.
//
// Credential-free helpers validate bindings and explicitly write local v2 metadata,
// decides the wrong-workspace guard, maps states, and renders the human-facing
// Markdown that a session then publishes through the authenticated Linear MCP.
//
// Usage:
//   node scripts/linear-work-control.mjs validate-binding <file|-> [--json]
//   node scripts/linear-work-control.mjs guard --binding <file> --observed-workspace <ref> [--json]
//   node scripts/linear-work-control.mjs map-state <state> [--json]
//   node scripts/linear-work-control.mjs render <checkpoint|blocker|completion|summary> --input <file|-> 
//   node scripts/linear-work-control.mjs completion-gate --input <file|-> [--json]
//   node scripts/linear-work-control.mjs resume-brief --dir <task dir> [--observed-workspace <ref>]
//       (always prints the brief; exits 1 when the binding is invalid or the guard denies)
//   node scripts/linear-work-control.mjs parse-human-input --file <file|-> [--json]
//   node scripts/linear-work-control.mjs validate-product-config <file|-> [--json]
//   node scripts/linear-work-control.mjs validate-task-binding <file|-> [--json]
//   node scripts/linear-work-control.mjs resolve-product-binding --repo-root <dir> [--task-id <id>] [--json]
//   node scripts/linear-work-control.mjs write-product-config --file <file> --input <file|-> [--json]
//   node scripts/linear-work-control.mjs write-task-binding --file <file> --input <file|-> [--json]
//   node scripts/linear-work-control.mjs migrate-binding --input <v1> --product-config <file> --root-registration <file> --task-id <id> --dry-run [--json]
//   node scripts/linear-work-control.mjs labels
//   node scripts/linear-work-control.mjs sync-order
//
// Exit code 1 means "do not proceed": an invalid binding, a denied guard, an
// unknown state, or a closed completion gate. Exit code 2 means the command
// itself was called wrong; a wrapper may treat it as a bug in its own call.

import { readFileSync } from 'node:fs';
import { lstat, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  CHECKPOINT_SYNC_ORDER,
  REQUIRED_LABELS,
  checkCompletionGate,
  checkWorkspaceGuard,
  extractPlanningSections,
  mapState,
  openBlockersFromLedger,
  parseHumanCommands,
  renderAttentionSummary,
  renderBlocker,
  renderCheckpoint,
  renderCompletion,
  renderResumeBrief,
  summarizeHumanInput,
  validateBinding
} from '../lib/linear-work-control.mjs';
import {
  planV1Migration,
  resolveProductBinding,
  validateProductConfig,
  validateRootRegistration,
  validateTaskBinding,
  writeProductConfigAtomic,
  writeTaskBindingAtomic
} from '../lib/linear-product-binding.mjs';

function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = flags[key] === undefined ? true : (Array.isArray(flags[key]) ? [...flags[key], true] : [flags[key], true]);
      } else {
        flags[key] = flags[key] === undefined ? next : (Array.isArray(flags[key]) ? [...flags[key], next] : [flags[key], next]);
        index += 1;
      }
    } else {
      rest.push(arg);
    }
  }
  return { flags, rest };
}

async function readInput(source) {
  const label = source === '-' || source === undefined ? 'stdin' : source;
  let text;
  try {
    text = source === '-' || source === undefined ? await readStdin() : await readFile(source, 'utf8');
  } catch (error) {
    // A missing or unreadable input must read as a one-line diagnostic, not a
    // stack trace, so a wrapper can report why it stopped.
    process.stderr.write('error: cannot read ' + label + ' (' + (error.code || error.message) + ')\n');
    process.exit(1);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    process.stderr.write('error: cannot parse ' + label + ' as JSON (' + error.message + ')\n');
    process.exit(1);
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

// The preferred binding lives in external metadata so a task directory keeps
// exactly its three planning files. The in-directory file stays readable as a
// legacy fallback, and only true absence of the preferred path falls back.
function preferredMetadataBinding(taskDir) {
  const absolute = path.resolve(taskDir);
  const location = path.basename(path.dirname(absolute));
  const planningDir = path.dirname(path.dirname(absolute));
  if (!['active', 'archive'].includes(location) || path.basename(planningDir) !== 'planning') {
    return null;
  }
  let taskId;
  try {
    const plan = readFileSync(path.join(absolute, 'task_plan.md'), 'utf8');
    const fields=[...plan.matchAll(/^Task ID:[ \t]*([^\r\n]*)$/gm)];
    if(fields.length>1) return {error:'duplicate stable Task ID'};
    taskId=fields[0]?.[1]?.trim();
    if(taskId && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(taskId)) return {error:'invalid stable Task ID'};
  } catch {}
  if (!taskId) {
    if (location === 'active') taskId = path.basename(absolute);
    else return { error: 'archived task has no explicit stable Task ID; refusing to create a new identity' };
  }
  if(location==='active' && taskId!==path.basename(absolute)) return {error:'active path/stable identity mismatch'};
  const relative = path.join('reports', 'linear', taskId, 'linear.json');
  return { file: path.join(path.dirname(planningDir), relative), label: relative };
}

// A dangling symlink and a directory both "exist" without being readable, so
// existence is decided by lstat: anything but a true ENOENT has to fail closed
// instead of quietly dropping to the legacy fallback.
async function pathState(file) {
  try {
    await lstat(file);
    return 'present';
  } catch (error) {
    if (error.code === 'ENOENT') {
      return 'absent';
    }
    throw error;
  }
}

// Returns null when no candidate exists at all ("local-only"), otherwise the
// first candidate that exists, with either its text or the read failure.
async function resolveBindingSource(candidates) {
  for (const candidate of candidates) {
    if ((await pathState(candidate.file)) === 'absent') {
      continue;
    }
    let text;
    try {
      text = await readFile(candidate.file, 'utf8');
    } catch (error) {
      return {
        label: candidate.label,
        text: null,
        error: candidate.label + ' could not be read (' + (error.code || error.message) + ')'
      };
    }
    return { label: candidate.label, text, error: null };
  }
  return null;
}

async function readIfExists(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    // The brief must print on every restart, so an optional planning file that
    // cannot be read (absent, a directory, permission denied) reads as "not
    // recorded" instead of ending the command with a stack trace.
    if (['ENOENT', 'ENOTDIR', 'EISDIR', 'EACCES', 'EPERM', 'ELOOP'].includes(error.code)) {
      return null;
    }
    throw error;
  }
}

function emit(flags, payload, text) {
  if (flags.json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else {
    process.stdout.write(text + '\n');
  }
}

// A usage mistake is one stderr line plus the usage string, never a stack
// trace: exit 2 marks "the command was called wrong" apart from exit 1, which
// marks "the command ran and said no".
function usageError(message, usage) {
  process.stderr.write('error: ' + message + '\nusage: ' + usage + '\n');
  process.exitCode = 2;
}

const { flags, rest } = parseArgs(process.argv.slice(2));
const [command, subject] = rest;

switch (command) {
  case 'validate-binding': {
    const binding = await readInput(subject || flags.file);
    const result = validateBinding(binding);
    emit(
      flags,
      result,
      result.ok
        ? 'binding valid'
        : ['binding invalid:', ...result.errors.map((error) => '  - ' + error)].join('\n')
    );
    if (!result.ok) {
      process.exitCode = 1;
    }
    break;
  }

  case 'guard': {
    // The guard owns its stdout contract: a wrapper decides on the DENY <code>
    // line alone, so an unreadable, directory, or corrupt binding must produce
    // that line (or its --json equivalent) instead of an empty stdout.
    const flagWithoutValue = flags.binding === true;
    const bindingSource = flagWithoutValue ? undefined : flags.binding || subject;
    const fromStdin = bindingSource === undefined || bindingSource === '-';
    const label = fromStdin ? 'stdin' : 'the binding file ' + bindingSource;
    let binding = null;
    let readError = flagWithoutValue
      ? 'the --binding flag needs a binding file path (pass --binding <file> or --binding -)'
      : null;
    if (readError === null) {
      try {
        const text = fromStdin ? await readStdin() : await readFile(bindingSource, 'utf8');
        try {
          binding = JSON.parse(text);
        } catch (error) {
          readError = 'cannot parse ' + label + ' as JSON (' + error.message + ')';
        }
      } catch (error) {
        readError = 'cannot read ' + label + ' (' + (error.code || error.message) + ')';
      }
    }
    const result =
      readError === null
        ? checkWorkspaceGuard({ binding, observedWorkspace: flags['observed-workspace'] })
        : {
            allowed: false,
            code: 'binding-invalid',
            expected: '',
            observed: flags['observed-workspace'] === undefined ? '' : String(flags['observed-workspace']),
            reason: readError
          };
    emit(
      flags,
      result,
      (result.allowed ? 'ALLOW ' : 'DENY ') + result.code + ': ' + result.reason
    );
    if (!result.allowed) {
      process.exitCode = 1;
    }
    break;
  }

  case 'map-state': {
    const result = mapState(subject);
    emit(flags, result, JSON.stringify(result));
    if (!result.ok) {
      process.exitCode = 1;
    }
    break;
  }

  case 'render': {
    const renderers = {
      checkpoint: renderCheckpoint,
      blocker: renderBlocker,
      completion: renderCompletion,
      summary: renderAttentionSummary
    };
    const renderer = renderers[flags.kind || subject];
    if (!renderer) {
      usageError('render needs --kind checkpoint|blocker|completion|summary', 'render <checkpoint|blocker|completion|summary> --input <file|->');
      break;
    }
    const input = await readInput(flags.input || '-');
    process.stdout.write(renderer(input) + '\n');
    break;
  }

  case 'completion-gate': {
    const input = await readInput(flags.input || '-');
    const result = checkCompletionGate(input);
    emit(flags, result, (result.canMarkDone ? 'DONE ALLOWED' : 'DONE BLOCKED') + ': ' + result.reason);
    if (!result.canMarkDone) {
      process.exitCode = 1;
    }
    break;
  }

  case 'resume-brief': {
    const dir = flags.dir || subject;
    const usage = 'resume-brief --dir <task dir> [--binding <file>] [--observed-workspace <ref>] [--timestamp <t>]';
    if (!dir) {
      usageError('resume-brief needs --dir <task dir>', usage);
      break;
    }
    // A mistyped --dir must fail loudly: an empty "local-only" brief would look
    // like a real task that simply has no binding.
    try {
      const target = await stat(dir);
      if (!target.isDirectory()) {
        usageError('the task dir is not a directory: ' + dir, usage);
        break;
      }
    } catch (error) {
      usageError('the task dir does not exist or cannot be read: ' + dir + ' (' + (error.code || error.message) + ')', usage);
      break;
    }
    if (flags.binding === true) {
      usageError('resume-brief needs a file path after --binding', usage);
      break;
    }
    let bindingValidation = null;
    let guard = null;
    let taskMap = {};
    let exitCode = 0;

    // An explicit --binding is used as given; otherwise the external metadata
    // path wins and the in-directory file is only a legacy fallback. A path
    // that exists but cannot be read is never treated as "no binding".
    const preferred = preferredMetadataBinding(dir);
    const candidates = flags.binding
      ? [{ file: flags.binding, label: flags.binding }]
      : [
          ...(preferred?.file ? [preferred] : []),
          { file: path.join(dir, 'linear.json'), label: 'linear.json' }
        ];
    if (!flags.binding && preferred?.error) {
      bindingValidation = { ok: false, errors: [preferred.error] };
      exitCode = 1;
    }
    const source = await resolveBindingSource(candidates);
    if (source === null && flags.binding) {
      // An explicitly named binding that is not there is a mistake to surface,
      // never a quiet "local-only" task.
      bindingValidation = { ok: false, errors: [flags.binding + ' could not be read (ENOENT)'] };
      exitCode = 1;
    }
    if (source && source.error) {
      bindingValidation = { ok: false, errors: [source.error] };
      exitCode = 1;
    } else if (source) {
      // A corrupt binding must degrade to "binding invalid" in the brief, not a
      // stack trace: the whole point of the brief is to be readable on a restart.
      let binding = null;
      let parseError = null;
      try {
        binding = JSON.parse(source.text);
      } catch (error) {
        parseError = error.message;
      }
      bindingValidation = parseError === null
        ? validateBinding(binding)
        : { ok: false, errors: [source.label + ' is not valid JSON (' + parseError + ')'] };
      if (bindingValidation.ok) {
        taskMap = binding.taskMap || {};
        if (flags['observed-workspace'] !== undefined) {
          guard = checkWorkspaceGuard({ binding, observedWorkspace: flags['observed-workspace'] });
        }
      } else {
        exitCode = 1;
      }
    }
    if (guard && !guard.allowed) {
      exitCode = 1;
    }

    const plan = (await readIfExists(path.join(dir, 'task_plan.md'))) || '';
    // progress.md is the authoritative blocker ledger; blockers.md is read for
    // bindings written before the migration and stays counted while present.
    const progress = await readIfExists(path.join(dir, 'progress.md'));
    const progressBlockers = openBlockersFromLedger(progress);
    const legacyBlockers = openBlockersFromLedger(await readIfExists(path.join(dir, 'blockers.md')));
    const brief = renderResumeBrief({
      taskDirLabel: dir,
      bindingValidation,
      guard,
      sections: extractPlanningSections(plan),
      taskMap,
      pendingCheckpoint: (await readIfExists(path.join(dir, 'linear-pending-checkpoint.md'))) !== null,
      pendingBlocker: (await readIfExists(path.join(dir, 'linear-pending-blocker.md'))) !== null,
      openBlockerCount: progressBlockers.length + legacyBlockers.length,
      blockerSource: progressBlockers.length > 0 ? 'progress.md' : 'blockers.md',
      findingsText: await readIfExists(path.join(dir, 'findings.md')),
      progressText: progress,
      timestamp: flags.timestamp
    });
    process.stdout.write(brief + '\n');
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
    break;
  }

  case 'parse-human-input': {
    const source = flags.file || subject;
    let text;
    try {
      text = source === undefined || source === '-' ? await readStdin() : await readFile(source, 'utf8');
    } catch (error) {
      // A comment file that cannot be read is a one-line diagnostic, never a
      // stack trace: the caller has to know why nothing was parsed.
      process.stderr.write('error: cannot read ' + (source === '-' ? 'stdin' : source) + ' (' + (error.code || error.message) + ')\n');
      process.exitCode = 1;
      break;
    }
    const parsed = parseHumanCommands(text);
    const summary = summarizeHumanInput(parsed);
    emit(flags, { parsed, summary }, (summary.actionable ? 'ACTIONABLE: ' : 'NOT ACTIONABLE: ') + summary.message);
    if (!summary.actionable) {
      process.exitCode = 1;
    }
    break;
  }

  case 'validate-product-config': {
    const input = await readInput(subject || flags.file);
    const result = validateProductConfig(input);
    emit(flags, result, result.ok ? 'product config valid' : ['product config invalid:', ...result.errors.map((error) => '  - ' + error)].join('\n'));
    if (!result.ok) process.exitCode = 1;
    break;
  }

  case 'validate-task-binding': {
    const input = await readInput(subject || flags.file);
    const result = validateTaskBinding(input);
    emit(flags, result, result.ok ? 'task binding valid' : ['task binding invalid:', ...result.errors.map((error) => '  - ' + error)].join('\n'));
    if (!result.ok) process.exitCode = 1;
    break;
  }

  case 'validate-root-registration': {
    const input = await readInput(subject || flags.file);
    const result = validateRootRegistration(input);
    emit(flags, result, result.ok ? 'root registration valid' : ['root registration invalid:', ...result.errors.map((error) => '  - ' + error)].join('\n'));
    if (!result.ok) process.exitCode = 1;
    break;
  }

  case 'resolve-product-binding':
  case 'resolve-binding': {
    const repoRoot = flags['repo-root'] || process.cwd();
    const registry = flags.registry === undefined ? [] : (Array.isArray(flags.registry) ? flags.registry : [flags.registry]);
    let result;
    try {
      result = await resolveProductBinding({
        repoRoot,
        taskId: flags['task-id'],
        taskDir: flags['task-dir'],
        productConfig: flags['product-config'],
        taskBinding: flags['task-binding'],
        rootRegistration: flags['root-registration'],
        registry
      });
    } catch (error) {
      result = { ok: false, error: error.message || String(error), code: 'binding-invalid' };
    }
    if (flags.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else if (result.ok) {
      process.stdout.write('resolved ' + result.mode + ' product ' + (result.product ? result.product.productKey : 'legacy') + ' task ' + result.task.taskId + ' from ' + result.source + '\n');
    } else {
      process.stdout.write('DENY ' + (result.code || 'binding-invalid') + ': ' + result.error + '\n');
    }
    if (!result.ok) process.exitCode = 1;
    break;
  }

  case 'write-product-config':
  case 'write-task-binding': {
    const file = flags.file;
    if (!file) {
      usageError(command + ' needs --file <file> --input <file|->', command + ' --file <file> --input <file|-> [--json]');
      break;
    }
    const input = await readInput(flags.input || '-');
    try {
      const result = command === 'write-product-config'
        ? await writeProductConfigAtomic(file, input)
        : await writeTaskBindingAtomic(file, input);
      emit(flags, result, 'wrote validated ' + (command === 'write-product-config' ? 'product config' : 'task binding') + ' atomically: ' + file);
    } catch (error) {
      const result = { ok: false, code: error.code || 'write-failed', error: error.message || String(error), errors: error.errors || [] };
      emit(flags, result, result.error);
      process.exitCode = 1;
    }
    break;
  }

  case 'migrate-binding':
  case 'migrate': {
    const usage = 'migrate-binding --input <v1> --product-config <file> --root-registration <file> --task-id <id> --dry-run [--json]';
    if (flags['dry-run'] !== true) {
      usageError('automatic migration is disabled; pass --dry-run', usage);
      break;
    }
    if (!flags.input || !flags['product-config'] || !flags['root-registration'] || !flags['task-id']) {
      usageError('migration dry-run needs --input, --product-config, --root-registration, and --task-id', usage);
      break;
    }
    const legacy = await readInput(flags.input);
    const product = await readInput(flags['product-config']);
    const root = await readInput(flags['root-registration']);
    const result = planV1Migration({ legacyBinding: legacy, productConfig: product, rootRegistration: root, taskId: flags['task-id'] });
    emit(flags, result, result.ok ? 'migration dry-run only; no file was written\n' + JSON.stringify(result.proposal, null, 2) : ['migration dry-run blocked:', ...result.errors.map((error) => '  - ' + error)].join('\n'));
    if (!result.ok) process.exitCode = 1;
    break;
  }

  case 'labels': {
    process.stdout.write(REQUIRED_LABELS.join('\n') + '\n');
    break;
  }

  case 'sync-order': {
    CHECKPOINT_SYNC_ORDER.forEach((step, index) => {
      process.stdout.write(index + 1 + '. ' + step + '\n');
    });
    break;
  }

  default: {
    process.stderr.write('unknown command: ' + (command || '(none)') + '\n');
    process.exitCode = 2;
  }
}
