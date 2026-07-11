import { hashChiefOpsBlock } from './coordination-blocks.mjs';
import { validateSubagentDispatch, validateSubagentReturn } from './schema.mjs';

const CAPABILITY_RANK = new Map([['fast_check', 0], ['economy_mechanical', 1], ['balanced_execution', 2], ['frontier_reasoning', 3]]);
const PERMISSION_RANK = new Map([['observe', 0], ['workspace', 1], ['egress_gated', 2], ['release', 3]]);

function subset(child = [], parent = []) { return child.every((value) => parent.includes(value)); }
function same(left = [], right = []) { return left.length === right.length && subset(left, right) && subset(right, left); }

export function validateNarrowSubagentDispatch({ parentBinding, childDispatch, inventory }) {
  const child = validateSubagentDispatch(childDispatch);
  if (child.parentBindingId !== parentBinding.bindingId) throw new Error('subagent_parent_binding_mismatch');
  if (parentBinding.delegationPolicy === 'prohibited') throw new Error('subagent_delegation_prohibited');
  if (!subset(child.allowedOps, parentBinding.allowedOps)
    || PERMISSION_RANK.get(child.permissionClass) > PERMISSION_RANK.get(parentBinding.permissionClass)
    || CAPABILITY_RANK.get(child.capabilityClass) > CAPABILITY_RANK.get(parentBinding.capabilityClass)) {
    throw new Error('subagent_envelope_widened');
  }
  if (parentBinding.sourceSet?.length ? (!child.sourceSet?.length || !subset(child.sourceSet, parentBinding.sourceSet)) : child.sourceSet?.length) {
    throw new Error('subagent_envelope_widened');
  }
  if (!subset(parentBinding.nonGoals ?? [], child.nonGoals)) throw new Error('subagent_envelope_widened');
  const narrowed = !same(child.allowedOps, parentBinding.allowedOps)
    || PERMISSION_RANK.get(child.permissionClass) < PERMISSION_RANK.get(parentBinding.permissionClass)
    || CAPABILITY_RANK.get(child.capabilityClass) < CAPABILITY_RANK.get(parentBinding.capabilityClass)
    || (parentBinding.sourceSet?.length && !same(child.sourceSet, parentBinding.sourceSet))
    || !same(child.nonGoals, parentBinding.nonGoals ?? []);
  if (!narrowed) throw new Error('subagent_envelope_not_narrowed');
  if (!inventory?.models?.some((entry) => entry.model === child.model && entry.supportedReasoningLevels?.includes(child.thinking))) {
    throw new Error('subagent_model_untrusted');
  }
  return {
    ...child,
    contractHash: hashChiefOpsBlock({ type: 'ChiefOpsSubagentDispatch', value: child }),
    applicationStatus: 'manual_pending', nativeThreadControl: false
  };
}

export function validateBoundSubagentReturn({ childContract, childReturn }) {
  const returned = validateSubagentReturn(childReturn);
  if (returned.childId !== childContract.childId || returned.contractHash !== childContract.contractHash
    || returned.model !== childContract.model || returned.thinking !== childContract.thinking) {
    throw new Error('subagent_return_mismatch');
  }
  if (hashChiefOpsBlock({ type: 'ChiefOpsSubagentDispatch', value: returned.contract }) !== childContract.contractHash) {
    throw new Error('subagent_return_mismatch');
  }
  return returned;
}
