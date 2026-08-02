#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_PROMPT_CHARS = 18_000;
export const SUPPORTED_MODES = new Set(['review-existing', 'explore-from-context']);
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

function usage() {
  return [
    'Usage: node build-package.mjs --prompt <file> --mode <mode> --output <directory> [options]',
    '',
    'Modes:',
    '  review-existing       Ask for a second opinion on an existing conclusion.',
    '  explore-from-context  Explore a question from the selected context.',
    '',
    'Options:',
    '  --attachment <file>       Repeatable attachment source.',
    '  --source-pointer <path=pointer>  Repeatable package source binding.',
    '  --excluded <value>        Repeatable excluded-context disclosure.',
    '  --redaction <value>       Repeatable redaction disclosure.',
    '  --verify-package <dir>    Verify an approved package before upload.',
    '  --expected-package-hash <hash>  Approved package hash for verification.',
    '  --help                    Show this message.'
  ].join('\n');
}

function argumentError(message) {
  return new TypeError(message);
}

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value === '' || value.startsWith('--')) {
    throw argumentError(`${option} requires a non-empty value.`);
  }
  return value;
}

export function parseArgs(argv) {
  const options = {
    attachments: [],
    excluded: [],
    redactions: [],
    sourcePointers: [],
    verifyPackage: null,
    expectedPackageHash: null
  };
  const singularOptions = new Set([
    '--prompt',
    '--mode',
    '--output',
    '--verify-package',
    '--expected-package-hash'
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--help') {
      return { help: true };
    }
    if (!option.startsWith('--')) {
      throw argumentError(`Unexpected argument: ${option}`);
    }

    const key = {
      '--verify-package': 'verifyPackage',
      '--expected-package-hash': 'expectedPackageHash'
    }[option] ?? option.slice(2);
    const value = requiredValue(argv, index, option);
    index += 1;
    if (singularOptions.has(option)) {
      if (options[key]) {
        throw argumentError(`${option} may only be provided once.`);
      }
      options[key] = value;
      continue;
    }
    if (option === '--attachment') {
      options.attachments.push(value);
      continue;
    }
    if (option === '--source-pointer') {
      options.sourcePointers.push(value);
      continue;
    }
    if (option === '--excluded') {
      options.excluded.push(value);
      continue;
    }
    if (option === '--redaction') {
      options.redactions.push(value);
      continue;
    }
    throw argumentError(`Unknown option: ${option}`);
  }

  if (options.verifyPackage || options.expectedPackageHash) {
    if (!options.verifyPackage || !options.expectedPackageHash) {
      throw argumentError('--verify-package and --expected-package-hash must be provided together.');
    }
    if (options.prompt || options.mode || options.output || options.attachments.length > 0
      || options.sourcePointers.length > 0 || options.excluded.length > 0 || options.redactions.length > 0) {
      throw argumentError('Verification mode cannot be combined with package build options.');
    }
    return options;
  }

  for (const option of ['prompt', 'mode', 'output']) {
    if (!options[option]) {
      throw argumentError(`Missing required option: --${option}.`);
    }
  }
  return options;
}

async function readRegularFile(filePath, label) {
  const resolvedPath = path.resolve(filePath);
  let stat;
  try {
    stat = await lstat(resolvedPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`${label} not found: ${filePath}`);
    }
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file: ${filePath}`);
  }
  return {
    path: resolvedPath,
    bytes: await readFile(resolvedPath)
  };
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function characterCount(text) {
  return Array.from(text).length;
}

function isSafePackageRelativePath(packagePath) {
  return packagePath.length > 0
    && !packagePath.startsWith('/')
    && !packagePath.includes('\\')
    && packagePath !== '.'
    && !packagePath.split('/').includes('..')
    && path.posix.normalize(packagePath) === packagePath;
}

function parseSourcePointerBinding(value) {
  if (typeof value !== 'string') {
    throw argumentError('Source pointer must be a string in the form <package-path>=<pointer>.');
  }
  const separator = value.indexOf('=');
  if (separator <= 0 || separator === value.length - 1) {
    throw argumentError('Source pointer must use <package-path>=<pointer> with non-empty package path and pointer.');
  }
  const packagePath = value.slice(0, separator);
  const pointer = value.slice(separator + 1);
  if (!isSafePackageRelativePath(packagePath)) {
    throw argumentError(`Source pointer package path must be a safe package-relative path: ${packagePath}`);
  }
  if (pointer.trim() === '') {
    throw argumentError(`Source pointer must be non-empty for package path: ${packagePath}`);
  }
  return { path: packagePath, pointer };
}

function validatePackageHash(value) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw argumentError('Expected package hash must use the form sha256:<64 lowercase hex characters>.');
  }
  return value;
}

function normalizeSourcePointerBinding(value) {
  if (typeof value === 'string') {
    return parseSourcePointerBinding(value);
  }
  if (value && typeof value.path === 'string' && typeof value.pointer === 'string') {
    return parseSourcePointerBinding(`${value.path}=${value.pointer}`);
  }
  throw argumentError('Source pointer must be a string in the form <package-path>=<pointer>.');
}

function compareCodePoints(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value) {
  return JSON.stringify(value);
}

function packageDigest(manifestWithoutHash, promptBytes, attachments) {
  const hash = createHash('sha256');
  hash.update('second-opinion-package-v1\0', 'utf8');
  hash.update(canonicalJson(manifestWithoutHash), 'utf8');
  hash.update('\0request.md\0', 'utf8');
  hash.update(promptBytes);
  for (const attachment of attachments) {
    hash.update(`\0${attachment.path}\0`, 'utf8');
    hash.update(attachment.bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

async function reserveOutputDirectory(outputDir) {
  try {
    await mkdir(path.dirname(outputDir), { recursive: true });
    await mkdir(outputDir, { mode: PRIVATE_DIRECTORY_MODE });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`Output directory already exists: ${outputDir}`);
    }
    throw error;
  }
}

async function listPackageEntries(packageDir) {
  const root = path.resolve(packageDir);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Package directory must be a real directory: ${packageDir}`);
  }

  const entries = [];
  async function visit(directory, relativeDirectory = '') {
    const childEntries = await readdir(directory, { withFileTypes: true });
    for (const entry of childEntries) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const fullPath = path.join(directory, entry.name);
      if (entry.isFile()) {
        entries.push(relativePath);
      } else if (entry.isDirectory()) {
        entries.push(`${relativePath}/`);
        await visit(fullPath, relativePath);
      } else {
        throw new Error(`Package contains an unsupported entry: ${relativePath}`);
      }
    }
  }

  await visit(root);
  return entries.sort(compareCodePoints);
}

async function assertExactPackageContents(packageDir, contentPaths) {
  const expected = ['attachments/', 'manifest.json', ...contentPaths].sort(compareCodePoints);
  if (new Set(expected).size !== expected.length) {
    throw new Error('Package manifest declares a reserved or duplicate file path.');
  }
  const actual = await listPackageEntries(packageDir);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Package contains an undeclared file or is missing an expected file.');
  }
}

function resolvePackageFile(packageDir, packagePath) {
  if (!isSafePackageRelativePath(packagePath)) {
    throw new Error(`Package file path must be a safe package-relative path: ${packagePath}`);
  }
  const root = path.resolve(packageDir);
  const resolvedPath = path.resolve(root, ...packagePath.split('/'));
  const relativePath = path.relative(root, resolvedPath);
  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error(`Package file path escapes the package directory: ${packagePath}`);
  }
  return resolvedPath;
}

async function readPackageFile(packageDir, packagePath) {
  const resolvedPath = resolvePackageFile(packageDir, packagePath);
  let stat;
  try {
    stat = await lstat(resolvedPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Package file not found: ${packagePath}`);
    }
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Package file must be a regular file: ${packagePath}`);
  }
  return readFile(resolvedPath);
}

function assertManifestArray(manifest, field) {
  if (!Array.isArray(manifest[field])) {
    throw new Error(`Package manifest field must be an array: ${field}`);
  }
}

export async function verifyPackage({ packageDir, expectedPackageHash }) {
  const expectedHash = validatePackageHash(expectedPackageHash);
  const manifestBytes = await readPackageFile(packageDir, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(ensureUtf8(manifestBytes, 'Package manifest'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Package manifest is not valid JSON: ${error.message}`);
    }
    throw error;
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Package manifest must be a JSON object.');
  }
  if (manifest.packageHash !== expectedHash) {
    throw new Error('Package manifest hash does not match the approved package hash.');
  }
  assertManifestArray(manifest, 'included');
  assertManifestArray(manifest, 'files');
  assertManifestArray(manifest, 'attachments');
  if (!manifest.prompt || manifest.prompt.path !== 'request.md') {
    throw new Error('Package manifest must identify request.md as the prompt.');
  }

  const filePaths = manifest.files.map((file) => file?.path);
  if (filePaths.some((filePath) => typeof filePath !== 'string')
    || new Set(filePaths).size !== filePaths.length
    || JSON.stringify(filePaths) !== JSON.stringify(manifest.included)) {
    throw new Error('Package manifest included paths do not match its file records.');
  }
  const promptRecords = manifest.files.filter((file) => file?.role === 'prompt');
  if (promptRecords.length !== 1 || promptRecords[0].path !== 'request.md') {
    throw new Error('Package manifest must contain exactly one request.md prompt record.');
  }

  const verifiedFiles = [];
  for (const file of manifest.files) {
    if (!file || typeof file.path !== 'string' || typeof file.role !== 'string') {
      throw new Error('Package manifest contains an invalid file record.');
    }
    const bytes = await readPackageFile(packageDir, file.path);
    if (file.sizeBytes !== bytes.byteLength || file.sha256 !== digest(bytes)) {
      throw new Error(`Package file integrity mismatch: ${file.path}`);
    }
    verifiedFiles.push({ ...file, bytes });
  }

  const attachmentRecords = verifiedFiles
    .filter((file) => file.role === 'attachment')
    .map((file) => ({
      path: file.path,
      bytes: file.bytes
    }));
  const attachmentPaths = manifest.attachments.map((attachment) => attachment?.path);
  if (JSON.stringify(attachmentPaths) !== JSON.stringify(attachmentRecords.map((file) => file.path))) {
    throw new Error('Package manifest attachment records do not match its file records.');
  }
  await assertExactPackageContents(packageDir, filePaths);

  const manifestWithoutHash = { ...manifest };
  delete manifestWithoutHash.packageHash;
  const promptBytes = verifiedFiles.find((file) => file.path === 'request.md').bytes;
  const recomputedHash = packageDigest(manifestWithoutHash, promptBytes, attachmentRecords);
  if (recomputedHash !== expectedHash) {
    throw new Error('Package manifest or content changed after approval; package hash mismatch.');
  }
  return recomputedHash;
}

function ensureUtf8(bytes, label) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) {
    throw new Error(`${label} must be valid UTF-8.`);
  }
  return text;
}

export async function buildPackage({
  prompt,
  mode,
  output,
  attachments = [],
  sourcePointers = [],
  excluded = [],
  redactions = []
}) {
  if (!SUPPORTED_MODES.has(mode)) {
    throw argumentError(`Invalid mode: ${mode}. Expected review-existing or explore-from-context.`);
  }

  const promptFile = await readRegularFile(prompt, 'Prompt file');
  const promptText = ensureUtf8(promptFile.bytes, 'Prompt file');
  const promptCharCount = characterCount(promptText);
  if (promptCharCount === 0) {
    throw new Error('Prompt file must not be empty.');
  }
  if (promptCharCount > MAX_PROMPT_CHARS) {
    throw new Error(`Prompt exceeds the ${MAX_PROMPT_CHARS.toLocaleString('en-US')} character limit; no truncation was performed.`);
  }

  const seenSources = new Set();
  const seenFilenames = new Set();
  const attachmentRecords = [];
  for (const attachment of attachments) {
    const resolvedPath = path.resolve(attachment);
    if (seenSources.has(resolvedPath)) {
      throw new Error(`Duplicate attachment: ${attachment}`);
    }
    seenSources.add(resolvedPath);
    const filename = path.basename(resolvedPath);
    if (!filename || filename === '.' || filename === '..') {
      throw new Error(`Attachment must have a safe filename: ${attachment}`);
    }
    const filenameKey = filename.normalize('NFC').toLocaleLowerCase('en-US');
    if (seenFilenames.has(filenameKey)) {
      throw new Error(`Duplicate attachment filename: ${filename}`);
    }
    seenFilenames.add(filenameKey);
    const file = await readRegularFile(attachment, 'Attachment');
    attachmentRecords.push({
      bytes: file.bytes,
      filename,
      path: `attachments/${filename}`,
      sourcePath: file.path
    });
  }
  attachmentRecords.sort((left, right) => left.filename < right.filename ? -1 : left.filename > right.filename ? 1 : 0);

  const files = [
    {
      path: 'request.md',
      role: 'prompt',
      sizeBytes: promptFile.bytes.byteLength,
      sha256: digest(promptFile.bytes)
    },
    ...attachmentRecords.map((attachment) => ({
      path: attachment.path,
      role: 'attachment',
      sizeBytes: attachment.bytes.byteLength,
      sha256: digest(attachment.bytes)
    }))
  ];
  const included = files.map((file) => file.path);
  const includedPaths = new Set(included);
  const sourcePointerBindings = sourcePointers.map(normalizeSourcePointerBinding);
  if (sourcePointerBindings.length === 0) {
    throw argumentError('At least one source pointer is required; provide --source-pointer <package-path>=<pointer> for every included package file.');
  }
  for (const binding of sourcePointerBindings) {
    if (!includedPaths.has(binding.path)) {
      throw argumentError(`Unknown package path in source pointer: ${binding.path}`);
    }
  }
  const coveredPaths = new Set(sourcePointerBindings.map((binding) => binding.path));
  for (const includedPath of included) {
    if (!coveredPaths.has(includedPath)) {
      throw argumentError(`Missing source pointer coverage for included package path: ${includedPath}`);
    }
  }
  const includedOrder = new Map(included.map((filePath, index) => [filePath, index]));
  const canonicalSourcePointers = [...sourcePointerBindings].sort((left, right) => {
    const pathOrder = includedOrder.get(left.path) - includedOrder.get(right.path);
    return pathOrder === 0 ? compareCodePoints(left.pointer, right.pointer) : pathOrder;
  });

  const outputDir = path.resolve(output);
  await reserveOutputDirectory(outputDir);

  const manifestWithoutHash = {
    schemaVersion: 1,
    packageType: 'second-opinion-request',
    mode,
    prompt: {
      path: 'request.md',
      charCount: promptCharCount,
      byteCount: promptFile.bytes.byteLength,
      sha256: digest(promptFile.bytes)
    },
    promptCharCount,
    maxPromptChars: MAX_PROMPT_CHARS,
    included,
    excluded: [...excluded],
    redactions: [...redactions],
    sourcePointers: canonicalSourcePointers,
    attachments: attachmentRecords.map((attachment) => ({
      path: attachment.path,
      filename: attachment.filename,
      sizeBytes: attachment.bytes.byteLength,
      sha256: digest(attachment.bytes)
    })),
    files
  };
  const packageHash = packageDigest(manifestWithoutHash, promptFile.bytes, attachmentRecords);
  const manifest = { ...manifestWithoutHash, packageHash };

  await mkdir(path.join(outputDir, 'attachments'), { mode: PRIVATE_DIRECTORY_MODE });
  await writeFile(path.join(outputDir, 'request.md'), promptFile.bytes, { mode: PRIVATE_FILE_MODE, flag: 'wx' });
  for (const attachment of attachmentRecords) {
    await writeFile(path.join(outputDir, attachment.path), attachment.bytes, { mode: PRIVATE_FILE_MODE, flag: 'wx' });
  }
  await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: PRIVATE_FILE_MODE, flag: 'wx' });
  return manifest;
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (options.verifyPackage) {
    const packageHash = await verifyPackage({
      packageDir: options.verifyPackage,
      expectedPackageHash: options.expectedPackageHash
    });
    process.stdout.write(`${packageHash}\n`);
    return;
  }
  const manifest = await buildPackage({
    prompt: options.prompt,
    mode: options.mode,
    output: options.output,
    attachments: options.attachments,
    sourcePointers: options.sourcePointers,
    excluded: options.excluded,
    redactions: options.redactions
  });
  process.stdout.write(`${manifest.packageHash}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = 1;
  });
}
