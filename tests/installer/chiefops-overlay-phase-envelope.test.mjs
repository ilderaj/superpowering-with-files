import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HARD_GATE_TRIGGERS,
  classifyPhaseEnvelopeTransition,
  validatePhaseEnvelope
} from '../../harness/runtime/chiefops-overlay/phase-envelope.mjs';

function envelope(overrides = {}) {
  return {
    startPhase: 'discovery',
    allowedNextPhases: ['design'],
    objective: 'approved objective',
    nonGoals: ['no publish'],
    allowedSurfaces: ['src/example.mjs', 'planning/active/chiefops-demo/progress.md'],
    proofTarget: 'focused phase tests',
    permissionCeiling: 'workspace',
    delegationPolicy: 'worker_discretion',
    boundedRepairPolicy: { enabled: false, reverifyUnchangedProof: false },
    hardGateTriggers: HARD_GATE_TRIGGERS,
    finalReturnCondition: 'return after approved proof',
    ...overrides
  };
}

function prior(overrides = {}) {
  return {
    majorPhase: 'discovery',
    currentSlice: 'approved objective',
    nonGoals: ['no publish'],
    proofTarget: 'focused phase tests',
    permissionClass: 'workspace',
    delegationPolicy: 'worker_discretion',
    ...overrides
  };
}

function facts(overrides = {}) {
  return {
    bindingVerified: true,
    trioConsistent: true,
    objectiveChanged: false,
    nonGoalChanged: false,
    architectureOutsideAllowedSurfaces: false,
    proofTargetChanged: false,
    newMutableSurface: false,
    crossTaskConflict: false,
    permissionEscalation: false,
    releaseOrExternalEffect: false,
    destructiveOrIrreversible: false,
    evidenceOrTrioConflict: false,
    bindingInvalid: false,
    userAuthorityChange: false,
    finalOutcomeAcceptance: false,
    lifecycleClosure: false,
    proofUnchanged: true,
    mutableSurfacesSubset: true,
    ...overrides
  };
}

test('phase envelopes permit only the approved adjacent transition', () => {
  const approved = envelope();
  assert.deepEqual(validatePhaseEnvelope(approved), approved);
  assert.equal(
    classifyPhaseEnvelopeTransition({
      priorEffectiveBinding: prior(),
      envelope: approved,
      candidateDelta: { majorPhase: 'design', currentSlice: 'approved objective' },
      trustedFacts: facts()
    }),
    'continue_in_envelope'
  );
  assert.equal(
    classifyPhaseEnvelopeTransition({
      priorEffectiveBinding: prior(),
      envelope: approved,
      candidateDelta: { majorPhase: 'execute', currentSlice: 'approved objective' },
      trustedFacts: facts()
    }),
    'chief_gate_required'
  );
});

test('phase envelopes fail closed on hard-gate facts, objective drift, and incomplete trust facts', () => {
  const approved = envelope();
  const input = {
    priorEffectiveBinding: prior(),
    envelope: approved,
    candidateDelta: { majorPhase: 'design', currentSlice: 'approved objective' }
  };
  assert.equal(
    classifyPhaseEnvelopeTransition({ ...input, trustedFacts: facts({ releaseOrExternalEffect: true }) }),
    'chief_gate_required'
  );
  assert.equal(
    classifyPhaseEnvelopeTransition({
      ...input,
      candidateDelta: { majorPhase: 'design', currentSlice: 'unapproved objective' },
      trustedFacts: facts()
    }),
    'chief_gate_required'
  );
  assert.equal(
    classifyPhaseEnvelopeTransition({ ...input, trustedFacts: { bindingVerified: true } }),
    'binding_mismatch'
  );
  assert.throws(
    () => validatePhaseEnvelope(envelope({ hardGateTriggers: HARD_GATE_TRIGGERS.slice(1) })),
    /hardGateTriggers/
  );
});

test('verify repair requires both policy and trusted unchanged-proof/surface facts', () => {
  const approved = envelope({
    startPhase: 'verify',
    allowedNextPhases: ['reconcile'],
    boundedRepairPolicy: { enabled: true, reverifyUnchangedProof: true }
  });
  const input = {
    priorEffectiveBinding: prior({ majorPhase: 'verify' }),
    envelope: approved,
    candidateDelta: { majorPhase: 'verify', currentSlice: 'approved objective' }
  };
  assert.equal(classifyPhaseEnvelopeTransition({ ...input, trustedFacts: facts() }), 'continue_in_envelope');
  assert.equal(
    classifyPhaseEnvelopeTransition({ ...input, trustedFacts: facts({ mutableSurfacesSubset: false }) }),
    'chief_gate_required'
  );
});
