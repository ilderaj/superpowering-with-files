import { z } from 'zod';

const MAJOR_PHASES = ['discovery', 'design', 'execute', 'verify', 'reconcile'];
const PERMISSION_CLASSES = ['observe', 'workspace', 'egress_gated', 'release'];
const DELEGATION_POLICIES = ['prohibited', 'worker_discretion', 'encouraged'];

export const HARD_GATE_TRIGGERS = [
  'objective_change',
  'non_goal_change',
  'architecture_outside_allowed_surfaces',
  'proof_target_change',
  'new_mutable_surface',
  'cross_task_conflict',
  'permission_escalation',
  'release_or_external_effect',
  'destructive_or_irreversible',
  'evidence_or_trio_conflict',
  'binding_invalid',
  'user_authority_change',
  'final_outcome_acceptance',
  'lifecycle_closure'
];

const hardGateFactKeys = {
  objective_change: 'objectiveChanged',
  non_goal_change: 'nonGoalChanged',
  architecture_outside_allowed_surfaces: 'architectureOutsideAllowedSurfaces',
  proof_target_change: 'proofTargetChanged',
  new_mutable_surface: 'newMutableSurface',
  cross_task_conflict: 'crossTaskConflict',
  permission_escalation: 'permissionEscalation',
  release_or_external_effect: 'releaseOrExternalEffect',
  destructive_or_irreversible: 'destructiveOrIrreversible',
  evidence_or_trio_conflict: 'evidenceOrTrioConflict',
  binding_invalid: 'bindingInvalid',
  user_authority_change: 'userAuthorityChange',
  final_outcome_acceptance: 'finalOutcomeAcceptance',
  lifecycle_closure: 'lifecycleClosure'
};

const relativeAuthorityPath = z.string().min(1).superRefine((value, ctx) => {
  const normalized = value.replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.split('/').includes('..') || /[\u0000-\u001f\u007f]/.test(normalized)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'allowedSurfaces must be safe relative authority-root paths.' });
  }
});

export const PhaseEnvelopeSchema = z.object({
  startPhase: z.enum(MAJOR_PHASES),
  allowedNextPhases: z.array(z.enum(MAJOR_PHASES)).min(1),
  objective: z.string().min(1),
  nonGoals: z.array(z.string().min(1)).min(1),
  allowedSurfaces: z.array(relativeAuthorityPath).min(1),
  proofTarget: z.string().min(1),
  permissionCeiling: z.enum(PERMISSION_CLASSES),
  delegationPolicy: z.enum(DELEGATION_POLICIES),
  boundedRepairPolicy: z.object({
    enabled: z.boolean(),
    reverifyUnchangedProof: z.boolean()
  }).strict(),
  hardGateTriggers: z.array(z.enum(HARD_GATE_TRIGGERS)).length(HARD_GATE_TRIGGERS.length),
  finalReturnCondition: z.string().min(1)
}).strict().superRefine((envelope, ctx) => {
  for (const field of ['allowedNextPhases', 'allowedSurfaces', 'hardGateTriggers']) {
    const values = envelope[field];
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} must not contain duplicates.` });
    }
  }
  if (!HARD_GATE_TRIGGERS.every((trigger) => envelope.hardGateTriggers.includes(trigger))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['hardGateTriggers'],
      message: 'hardGateTriggers must contain the complete mandatory trigger set.'
    });
  }
});

const TrustedFactsSchema = z.object({
  bindingVerified: z.boolean(),
  trioConsistent: z.boolean(),
  objectiveChanged: z.boolean(),
  nonGoalChanged: z.boolean(),
  architectureOutsideAllowedSurfaces: z.boolean(),
  proofTargetChanged: z.boolean(),
  newMutableSurface: z.boolean(),
  crossTaskConflict: z.boolean(),
  permissionEscalation: z.boolean(),
  releaseOrExternalEffect: z.boolean(),
  destructiveOrIrreversible: z.boolean(),
  evidenceOrTrioConflict: z.boolean(),
  bindingInvalid: z.boolean(),
  userAuthorityChange: z.boolean(),
  finalOutcomeAcceptance: z.boolean(),
  lifecycleClosure: z.boolean(),
  proofUnchanged: z.boolean(),
  mutableSurfacesSubset: z.boolean()
}).strict();

function sameArray(left = [], right = []) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function envelopeMatchesBinding(envelope, binding) {
  return envelope.objective === binding.currentSlice
    && sameArray(envelope.nonGoals, binding.nonGoals)
    && envelope.proofTarget === binding.proofTarget
    && envelope.permissionCeiling === binding.permissionClass
    && envelope.delegationPolicy === binding.delegationPolicy;
}

export function validatePhaseEnvelope(value) {
  return PhaseEnvelopeSchema.parse(value);
}

export function classifyPhaseEnvelopeTransition({ priorEffectiveBinding, envelope, candidateDelta, trustedFacts }) {
  let validatedEnvelope;
  let facts;
  try {
    validatedEnvelope = validatePhaseEnvelope(envelope);
    facts = TrustedFactsSchema.parse(trustedFacts);
  } catch {
    return 'binding_mismatch';
  }

  if (!priorEffectiveBinding || !candidateDelta || !envelopeMatchesBinding(validatedEnvelope, priorEffectiveBinding)
    || !facts.bindingVerified || !facts.trioConsistent || facts.bindingInvalid) {
    return 'binding_mismatch';
  }
  if (HARD_GATE_TRIGGERS.some((trigger) => facts[hardGateFactKeys[trigger]])) {
    return 'chief_gate_required';
  }
  if (candidateDelta.currentSlice !== validatedEnvelope.objective) {
    return 'chief_gate_required';
  }

  const priorIndex = MAJOR_PHASES.indexOf(priorEffectiveBinding.majorPhase);
  const targetIndex = MAJOR_PHASES.indexOf(candidateDelta.majorPhase);
  if (priorIndex < 0 || targetIndex < 0) return 'binding_mismatch';
  if (targetIndex === priorIndex) {
    if (candidateDelta.majorPhase !== 'verify') return 'continue_in_envelope';
    return validatedEnvelope.boundedRepairPolicy.enabled
      && validatedEnvelope.boundedRepairPolicy.reverifyUnchangedProof
      && facts.proofUnchanged
      && facts.mutableSurfacesSubset
      ? 'continue_in_envelope'
      : 'chief_gate_required';
  }
  return priorEffectiveBinding.majorPhase === validatedEnvelope.startPhase
    && targetIndex === priorIndex + 1
    && validatedEnvelope.allowedNextPhases.includes(candidateDelta.majorPhase)
    ? 'continue_in_envelope'
    : 'chief_gate_required';
}
