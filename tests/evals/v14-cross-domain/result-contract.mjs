const CASE_IDS = new Set(['O1', 'O2', 'O3', 'O4', 'D1']);
const WORKFLOW_IDS = new Set(['W1', 'W2', 'W3']);
const VARIANTS = new Set(['deterministic-fixture', 'semantic-replay', 'pilot']);
const RESULTS = new Set(['pass', 'fail', 'blocked', 'unknown', 'not_run', 'unavailable']);
const ARTIFACT_STATES = new Set(['generated', 'opened', 'rendered', 'accepted', 'delivered']);
const EVIDENCE_STATES = new Set(['yes', 'no', 'unknown']);
const LIVE_GATE_FIELDS = Object.freeze([
  'source', 'schedule', 'recipient', 'authorization', 'executionEvent', 'recipientVisible',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateStringField(record, field, errors) {
  if (!isNonEmptyString(record[field])) errors.push(`${field} must be a non-empty string`);
}

export function validateResultRecord(record) {
  const errors = [];
  if (!isRecord(record)) return ['result record must be an object'];

  if (record.schemaVersion !== 'v1.4') errors.push('schemaVersion must equal v1.4');
  for (const field of [
    'runId', 'hostRunRef', 'hostEvidenceRef', 'requestedModel',
    'requestedEffort', 'actualModelEvidence',
  ]) validateStringField(record, field, errors);

  if (!CASE_IDS.has(record.caseId)) errors.push('caseId is invalid');
  if (!VARIANTS.has(record.variant)) errors.push('variant is invalid');
  if (!RESULTS.has(record.result)) errors.push('result is invalid');

  if (!Number.isInteger(record.attempt) || record.attempt < 1) {
    errors.push('attempt must be a positive integer');
  }
  if (!Number.isInteger(record.retries) || record.retries !== record.attempt - 1) {
    errors.push('retries must equal attempt - 1');
  }

  if (!Array.isArray(record.workflowIds)
      || record.workflowIds.some((id) => !WORKFLOW_IDS.has(id))
      || new Set(record.workflowIds).size !== record.workflowIds.length) {
    errors.push('workflowIds must be a unique W1/W2/W3 array');
  }

  if (!Array.isArray(record.sourceRefs) || record.sourceRefs.length === 0) {
    errors.push('sourceRefs must be a non-empty array');
  } else {
    record.sourceRefs.forEach((source, index) => {
      if (!isRecord(source) || !isNonEmptyString(source.ref) || !isNonEmptyString(source.range)) {
        errors.push(`sourceRefs[${index}] must contain non-empty ref and range`);
      }
    });
  }

  if (!Array.isArray(record.artifactRefs) || record.artifactRefs.length === 0) {
    errors.push('artifactRefs must be a non-empty array');
  } else {
    record.artifactRefs.forEach((artifact, index) => {
      if (!isRecord(artifact) || !isNonEmptyString(artifact.pathOrHostRef)) {
        errors.push(`artifactRefs[${index}].pathOrHostRef must be a non-empty string`);
      }
      if (!isRecord(artifact) || !ARTIFACT_STATES.has(artifact.state)) {
        errors.push(`artifactRefs[${index}].state is invalid`);
      }
    });
  }

  if (!Array.isArray(record.limitations)
      || record.limitations.length === 0
      || record.limitations.some((item) => !isNonEmptyString(item))) {
    errors.push('limitations must be a non-empty string array');
  }

  if (!isRecord(record.usage)
      || !Object.hasOwn(record.usage, 'freshTokens')
      || !Object.hasOwn(record.usage, 'cachedTokens')
      || !Object.hasOwn(record.usage, 'billing')) {
    errors.push('usage must contain freshTokens, cachedTokens, and billing');
  }

  if (!isRecord(record.delivery)
      || !EVIDENCE_STATES.has(record.delivery.authorized)
      || !EVIDENCE_STATES.has(record.delivery.recipientVisible)) {
    errors.push('delivery must contain authorized and recipientVisible evidence states');
  }

  if (!Object.hasOwn(record, 'liveGateEvidence')) {
    errors.push('liveGateEvidence must be present');
  } else if (record.caseId === 'O4') {
    if (!isRecord(record.liveGateEvidence)) {
      errors.push('O4 liveGateEvidence must contain all six gate records');
    } else {
      for (const field of LIVE_GATE_FIELDS) {
        const evidence = record.liveGateEvidence[field];
        if (!isRecord(evidence)
            || !EVIDENCE_STATES.has(evidence.state)
            || !isNonEmptyString(evidence.ref)) {
          errors.push(`liveGateEvidence.${field} must contain a state and evidence ref`);
        }
      }
    }
  } else if (record.liveGateEvidence !== null) {
    errors.push('liveGateEvidence must be null outside O4');
  }

  if (record.caseId === 'O4' && record.result === 'pass') {
    if (record.delivery?.authorized !== 'yes' || record.delivery?.recipientVisible !== 'yes') {
      errors.push('O4 pass requires authorized=yes and recipientVisible=yes');
    }
    if (record.hostRunRef === 'unknown'
        || record.hostEvidenceRef === 'unknown'
        || !record.artifactRefs?.some((artifact) => artifact.state === 'delivered')) {
      errors.push('O4 pass requires real Host execution and delivered artifact evidence');
    }
    if (!isRecord(record.liveGateEvidence)
        || LIVE_GATE_FIELDS.some((field) => record.liveGateEvidence[field]?.state !== 'yes'
          || record.liveGateEvidence[field]?.ref === 'unknown')) {
      errors.push('O4 pass requires all live gate evidence states and refs');
    }
  }

  return errors;
}
