import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { readHarnessHealth } from './health.mjs';
import { loadPlatforms, normalizeTargets } from './metadata.mjs';
import { resolveTargetPaths } from './paths.mjs';
import { loadSkillProfiles } from './skill-projection.mjs';
import { readState, writeState } from './state.mjs';

const execFileAsync = promisify(execFile);
const ADOPTION_DIR = '.harness/adoption';
const RECEIPT_SCHEMA_VERSION = 1;

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function parseList(value) {
  if (!value) return [];
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function validateProjectionMode(projectionMode) {
  if (!['link', 'portable'].includes(projectionMode)) {
    throw new Error(`Invalid projection mode: ${projectionMode}`);
  }
}

function validateHookMode(hookMode) {
  if (!['off', 'on'].includes(hookMode)) {
    throw new Error(`Invalid hooks mode: ${hookMode}`);
  }
}

function validateAdoptionMode(mode) {
  if (!['ensure', 'force'].includes(mode)) {
    throw new Error(`Invalid adoption mode: ${mode}`);
  }
}

function isEffectivelyEmptyState(state) {
  return Object.keys(state.targets ?? {}).length === 0 && Object.keys(state.upstream ?? {}).length === 0;
}

export function enabledTargetsFromState(state) {
  return sortedUnique(
    Object.entries(state.targets ?? {})
      .filter(([, targetState]) => targetState?.enabled)
      .map(([target]) => target)
  );
}

function buildTargetState(rootDir, homeDir, targets) {
  return Object.fromEntries(
    targets.map((target) => [
      target,
      {
        enabled: true,
        paths: resolveTargetPaths(rootDir, homeDir, 'user-global', target)
      }
    ])
  );
}

export function adoptionReceiptPath(rootDir) {
  return path.join(rootDir, ADOPTION_DIR, 'global.json');
}

export function adoptionFailurePath(rootDir) {
  return path.join(rootDir, ADOPTION_DIR, 'global.failure.json');
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readAdoptionReceipt(rootDir) {
  try {
    return JSON.parse(await readFile(adoptionReceiptPath(rootDir), 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeAdoptionReceipt(rootDir, receipt) {
  await writeJson(adoptionReceiptPath(rootDir), receipt);
}

export async function writeAdoptionFailure(rootDir, failure) {
  await writeJson(adoptionFailurePath(rootDir), failure);
}

export async function readGitMetadata(rootDir) {
  try {
    const [{ stdout: branch }, { stdout: head }] = await Promise.all([
      execFileAsync('git', ['branch', '--show-current'], { cwd: rootDir }),
      execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: rootDir })
    ]);
    return {
      repoBranch: branch.trim() || null,
      repoHead: head.trim() || null
    };
  } catch {
    return {
      repoBranch: null,
      repoHead: null
    };
  }
}

export async function ensureUserGlobalState(rootDir, options = {}) {
  const homeDir = options.homeDir ?? os.homedir();
  const state = await readState(rootDir);
  const metadata = await loadPlatforms(rootDir);
  const skillProfiles = await loadSkillProfiles(rootDir);
  const mode = options.mode ?? 'ensure';
  validateAdoptionMode(mode);

  const currentTargets = enabledTargetsFromState(state);
  const requestedTargets = options.targets?.length
    ? normalizeTargets(metadata, options.targets)
    : currentTargets.length > 0
      ? currentTargets
      : normalizeTargets(metadata, ['all']);

  const projectionMode = options.projectionMode ?? state.projectionMode ?? 'link';
  const hookMode = options.hookMode ?? state.hookMode ?? 'off';
  const skillProfile = options.skillProfile ?? state.skillProfile ?? skillProfiles.defaultProfile;

  validateProjectionMode(projectionMode);
  validateHookMode(hookMode);

  if (!skillProfiles.profiles[skillProfile]) {
    throw new Error(
      `Invalid skills profile: ${skillProfile}. Expected one of: ${Object.keys(skillProfiles.profiles).join(', ')}.`
    );
  }

  if (state.scope !== 'user-global' && !isEffectivelyEmptyState(state)) {
    throw new Error(
      'adopt-global is user-global-only and refuses workspace mutation from an existing workspace/both install state.'
    );
  }

  const nextState =
    state.scope === 'user-global'
      ? {
          ...state,
          projectionMode: mode === 'force' ? projectionMode : state.projectionMode,
          hookMode: mode === 'force' ? hookMode : state.hookMode,
          skillProfile: mode === 'force' ? skillProfile : state.skillProfile,
          targets:
            mode === 'force'
              ? buildTargetState(rootDir, homeDir, requestedTargets)
              : state.targets
        }
      : {
          schemaVersion: 1,
          scope: 'user-global',
          projectionMode,
          hookMode,
          skillProfile,
          targets: buildTargetState(rootDir, homeDir, requestedTargets),
          upstream: state.upstream ?? {}
        };

  const changed = JSON.stringify(state) !== JSON.stringify(nextState);
  if (changed) {
    await writeState(rootDir, nextState);
  }

  return nextState;
}

export async function createSuccessReceipt(rootDir, state, options = {}) {
  const { repoHead, repoBranch } = await readGitMetadata(rootDir);
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    status: 'success',
    scope: 'user-global',
    repoHead,
    repoBranch,
    appliedAt: new Date().toISOString(),
    projectionMode: state.projectionMode,
    hookMode: state.hookMode,
    skillProfile: state.skillProfile,
    targets: enabledTargetsFromState(state),
    doctorPassed: true,
    verificationReportPath: options.verificationReportPath ?? '.harness/adoption/verification/latest.json'
  };
}

export async function computeAdoptionStatus(rootDir, homeDir = os.homedir()) {
  const state = await readState(rootDir);
  const health = await readHarnessHealth(rootDir, homeDir);
  const receipt = await readAdoptionReceipt(rootDir);
  const { repoHead, repoBranch } = await readGitMetadata(rootDir);
  const reasons = [];
  const targets = enabledTargetsFromState(state);

  let status = 'in_sync';

  if (state.scope !== 'user-global') {
    status = 'state_mismatch';
    reasons.push(`Expected scope user-global, found ${state.scope}.`);
  }

  if (targets.length === 0) {
    status = 'state_mismatch';
    reasons.push('No enabled user-global targets are configured.');
  }

  if (health.problems.length > 0) {
    if (status !== 'state_mismatch') {
      status = 'apply_failed';
    }
    reasons.push(...health.problems);
  }

  if (!receipt) {
    if (status === 'in_sync') {
      status = 'needs_apply';
    }
    reasons.push('No successful adoption receipt found.');
  } else {
    if (receipt.scope !== 'user-global') {
      status = 'state_mismatch';
      reasons.push(`Receipt scope ${receipt.scope} does not match user-global.`);
    }

    if (receipt.skillProfile !== state.skillProfile) {
      status = 'state_mismatch';
      reasons.push(
        `Receipt skillProfile ${receipt.skillProfile} does not match current state ${state.skillProfile}.`
      );
    }

    if (receipt.hookMode !== state.hookMode) {
      status = 'state_mismatch';
      reasons.push(`Receipt hookMode ${receipt.hookMode} does not match current state ${state.hookMode}.`);
    }

    if (receipt.projectionMode !== state.projectionMode) {
      status = 'state_mismatch';
      reasons.push(
        `Receipt projectionMode ${receipt.projectionMode} does not match current state ${state.projectionMode}.`
      );
    }

    if (JSON.stringify(sortedUnique(receipt.targets ?? [])) !== JSON.stringify(targets)) {
      status = 'state_mismatch';
      reasons.push('Receipt targets do not match current enabled targets.');
    }

    if (status === 'in_sync' && receipt.repoHead && repoHead && receipt.repoHead !== repoHead) {
      status = 'needs_apply';
      reasons.push(`Current repo HEAD ${repoHead} differs from receipt HEAD ${receipt.repoHead}.`);
    }
  }

  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    status,
    scope: 'user-global',
    repoHead,
    repoBranch,
    targets,
    reasons,
    receipt,
    health: {
      problems: health.problems,
      warnings: health.warnings
    }
  };
}

export function parseAdoptionTargets(targetValue) {
  return parseList(targetValue);
}
