const PACKET_SCHEMA = 'swf/change-quality-gate-packet';
const RESULT_SCHEMA = 'swf/change-quality-gate-result';
const VERSION = 1;
const VERIFICATION_PLANES = new Set([
  'source-test',
  'generated-package',
  'clean-ci',
  'runtime-release-public'
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function error(code, reason, field) {
  return { code, reason, field };
}

function hasSuccessfulEvidence(entry) {
  return isRecord(entry)
    && hasText(entry.command)
    && entry.exitCode === 0
    && hasText(entry.result ?? entry.evidence);
}

function hasNonZeroExitCode(value) {
  return Number.isInteger(value) && value !== 0;
}

function hasActionRequest(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.some((entry) => hasActionRequest(entry));
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (isRecord(value)) return Object.values(value).some((entry) => hasActionRequest(entry));
  return true;
}

function evaluatePacket(packet) {
  const errors = [];

  if (!isRecord(packet) || packet.schema !== PACKET_SCHEMA) {
    errors.push(error(
      'invalid_packet_schema',
      `Packet schema must be ${PACKET_SCHEMA}.`,
      'schema'
    ));
    return errors;
  }

  if (packet.version !== VERSION) {
    errors.push(error(
      'unsupported_packet_version',
      `Packet version must be ${VERSION}.`,
      'version'
    ));
  }

  for (const field of [
    'requestedActions',
    'externalActions',
    'requestedExternalActions',
    'requestedOperation',
    'requestedOperations'
  ]) {
    if (hasActionRequest(packet[field])) {
      errors.push(error(
        'external_action_requested',
        'The read-only evaluator cannot authorize or perform requested external actions.',
        field
      ));
      break;
    }
  }

  const binding = packet.binding;
  if (!isRecord(binding?.base) || !hasText(binding.base.ref) || !hasText(binding.base.sha)) {
    errors.push(error('missing_base', 'A bound base ref and SHA are required.', 'binding.base'));
  }
  if (
    !isRecord(binding?.taskOrSpec)
    || !hasText(binding.taskOrSpec.id)
    || !hasText(binding.taskOrSpec.reference)
  ) {
    errors.push(error(
      'missing_task_or_spec',
      'A bound task/spec id and reference are required.',
      'binding.taskOrSpec'
    ));
  }
  if (!isRecord(binding?.head) || !hasText(binding.head.sha)) {
    errors.push(error('missing_head', 'A bound head SHA is required.', 'binding.head'));
  }

  if (!Array.isArray(packet.changedPaths) || packet.changedPaths.length === 0) {
    errors.push(error('missing_changed_paths', 'At least one changed path is required.', 'changedPaths'));
  } else if (packet.changedPaths.some((changedPath) => !hasText(changedPath))) {
    errors.push(error('invalid_changed_paths', 'Every changed path must be non-empty text.', 'changedPaths'));
  }

  const behavior = packet.behavior;
  if (
    !isRecord(behavior)
    || typeof behavior.changed !== 'boolean'
    || !hasText(behavior.description)
    || !hasText(behavior.specReference)
  ) {
    errors.push(error(
      'missing_behavior',
      'Behavior change, description, and specification reference are required.',
      'behavior'
    ));
  }

  const riskMatrix = packet.riskMatrix;
  if (!Array.isArray(riskMatrix) || riskMatrix.length === 0) {
    errors.push(error('missing_risk_matrix', 'A risk-oriented test matrix is required.', 'riskMatrix'));
  } else {
    const applicableCells = riskMatrix.filter((cell) => cell?.applicable !== false);
    const applicableKinds = new Set(applicableCells.map((cell) => cell?.kind));
    if (
      applicableCells.length < 2
      || !applicableKinds.has('normal')
      || !applicableKinds.has('boundary')
    ) {
      errors.push(error(
        'insufficient_risk_coverage',
        'At least two applicable risk cells, including normal and boundary coverage, are required.',
        'riskMatrix'
      ));
    }
    for (const cell of riskMatrix) {
      if (!isRecord(cell) || !hasText(cell.id) || !hasText(cell.kind) || !hasText(cell.risk)) {
        errors.push(error('invalid_risk_cell', 'Every risk cell needs an id, kind, and risk description.', 'riskMatrix'));
        break;
      }
      if (cell.applicable === false) {
        if (cell.result !== 'not-applicable' || !hasText(cell.evidence)) {
          errors.push(error(
            'risk_result_missing',
            'An inapplicable risk cell must record not-applicable evidence.',
            `riskMatrix.${cell.id}`
          ));
          break;
        }
      } else if (cell.result !== 'passed' || !hasText(cell.evidence)) {
        errors.push(error(
          cell.result === 'failed' ? 'risk_result_failed' : 'risk_result_missing',
          'Every applicable risk cell must have passed evidence.',
          `riskMatrix.${cell.id}`
        ));
        break;
      }
    }
  }

  if (behavior?.changed === true) {
    const redGreen = packet.redGreen;
    if (!isRecord(redGreen) || !isRecord(redGreen.red) || !isRecord(redGreen.green)) {
      errors.push(error(
        'missing_red_green',
        'A behavior-changing slice requires RED and smallest-GREEN evidence.',
        'redGreen'
      ));
    } else {
      const red = redGreen.red;
      if (red.observed !== true || !hasNonZeroExitCode(red.exitCode) || !hasText(red.command) || !hasText(red.failure)) {
        errors.push(error(
          'red_not_real',
          'RED evidence must show the old behavior failing at a real command seam.',
          'redGreen.red'
        ));
      }
      const green = redGreen.green;
      if (
        green.observed !== true
        || green.smallest !== true
        || green.exitCode !== 0
        || !hasText(green.command)
        || !hasText(green.result ?? green.evidence)
      ) {
        errors.push(error(
          'green_not_smallest',
          'GREEN evidence must be observed, passing, and explicitly the smallest correction.',
          'redGreen.green'
        ));
      }
    }
  }

  const defect = packet.defect;
  if (!isRecord(defect) || typeof defect.triggered !== 'boolean') {
    errors.push(error(
      'missing_defect_trigger',
      'The packet must explicitly state whether the defect trigger applies.',
      'defect.triggered'
    ));
  } else if (defect.triggered === true) {
    const regression = defect.regression;
    if (
      !isRecord(regression)
      || regression.oldCodeFailed !== true
      || regression.minimal !== true
      || !hasNonZeroExitCode(regression.exitCode)
      || !hasText(regression.command)
      || !hasText(regression.evidence)
    ) {
      errors.push(error(
        'missing_old_code_regression',
        'A defect trigger requires a minimal old-code-failing regression.',
        'defect.regression'
      ));
    }
    const siblingScan = defect.siblingScan;
    if (
      !isRecord(siblingScan)
      || siblingScan.performed !== true
      || !hasText(siblingScan.result)
      || !hasText(siblingScan.evidence)
    ) {
      errors.push(error(
        'missing_sibling_scan',
        'A defect trigger requires a sibling-path scan with recorded evidence.',
        'defect.siblingScan'
      ));
    }
  }

  const focusedVerification = packet.focusedVerification;
  if (!Array.isArray(focusedVerification) || focusedVerification.length === 0) {
    errors.push(error(
      'missing_focused_verification',
      'At least one focused verification result is required.',
      'focusedVerification'
    ));
  } else if (focusedVerification.some((entry) => !hasSuccessfulEvidence(entry))) {
    errors.push(error(
      'focused_verification_failed',
      'Every focused verification command must have a passing exit and result.',
      'focusedVerification'
    ));
  }

  if (!isRecord(packet.gitDiffCheck) || packet.gitDiffCheck.ran !== true) {
    errors.push(error(
      'git_diff_check_missing',
      'A completed git diff check is required.',
      'gitDiffCheck'
    ));
  } else if (packet.gitDiffCheck.exitCode !== 0) {
    errors.push(error(
      'git_diff_check_failed',
      'git diff --check must pass.',
      'gitDiffCheck'
    ));
  }

  const reviews = packet.reviews;
  if (!isRecord(reviews?.standards)) {
    errors.push(error(
      'missing_standards_review',
      'A separate Standards review result is required.',
      'reviews.standards'
    ));
  } else if (reviews.standards.status !== 'passed' || !Array.isArray(reviews.standards.findings)) {
    errors.push(error(
      'standards_review_failed',
      'The Standards review must pass and retain its findings list.',
      'reviews.standards'
    ));
  }
  if (!isRecord(reviews?.spec)) {
    errors.push(error(
      'missing_spec_review',
      'A separate Spec review result is required.',
      'reviews.spec'
    ));
  } else if (reviews.spec.status !== 'passed' || !Array.isArray(reviews.spec.findings)) {
    errors.push(error(
      'spec_review_failed',
      'The Spec review must pass and retain its findings list.',
      'reviews.spec'
    ));
  }

  if (!Array.isArray(packet.limitations) || packet.limitations.length === 0 || packet.limitations.some((limitation) => !hasText(limitation))) {
    errors.push(error(
      'missing_limitations',
      'Limitations must be explicitly recorded, including when another plane is not proven.',
      'limitations'
    ));
  }

  const planes = packet.verificationPlanes;
  if (!isRecord(planes) || !Array.isArray(planes.required) || planes.required.length === 0 || !Array.isArray(planes.declared)) {
    errors.push(error(
      'missing_verification_planes',
      'Required and declared verification planes are required.',
      'verificationPlanes'
    ));
  } else {
    const required = [...planes.required];
    const declared = planes.declared;
    const uniqueRequired = new Set(required);
    const uniqueDeclared = new Set(declared.map((entry) => entry?.plane));
    const exactPlanes = uniqueRequired.size === required.length
      && uniqueDeclared.size === declared.length
      && required.length === declared.length
      && required.every((plane) => uniqueDeclared.has(plane))
      && declared.every((entry) => uniqueRequired.has(entry?.plane));
    if (!exactPlanes || required.some((plane) => !VERIFICATION_PLANES.has(plane))) {
      errors.push(error(
        'verification_planes_not_exact',
        'Declared verification planes must exactly match the required known planes.',
        'verificationPlanes'
      ));
    } else if (declared.some((entry) => entry?.status !== 'passed' || !hasText(entry?.evidence))) {
      errors.push(error(
        'verification_plane_failed',
        'Every required verification plane must have passing evidence.',
        'verificationPlanes.declared'
      ));
    }
  }

  const freshness = packet.freshness;
  if (
    !isRecord(freshness)
    || !hasText(freshness.currentHeadSha)
    || !hasText(freshness.reviewedHeadSha)
    || typeof freshness.fixedPoint !== 'boolean'
  ) {
    errors.push(error(
      'missing_freshness',
      'Current-head, reviewed-head, and fixed-point freshness evidence are required.',
      'freshness'
    ));
  } else if (
    freshness.currentHeadSha !== binding?.head?.sha
    || freshness.reviewedHeadSha !== freshness.currentHeadSha
    || reviews?.standards?.headSha !== freshness.currentHeadSha
    || reviews?.spec?.headSha !== freshness.currentHeadSha
  ) {
    errors.push(error(
      'stale_review_after_head_movement',
      'Current head, review heads, and bound head must be identical.',
      'freshness'
    ));
  } else if (freshness.fixedPoint !== true) {
    errors.push(error(
      'not_fixed_point',
      'The packet must identify the reviewed diff as a fixed point.',
      'freshness.fixedPoint'
    ));
  }

  return errors;
}

export function evaluateChangeQuality(packet) {
  const errors = evaluatePacket(packet);
  return {
    schema: RESULT_SCHEMA,
    version: VERSION,
    status: errors.length === 0 ? 'accepted' : 'rejected',
    readOnly: true,
    errors
  };
}
