import { createHash } from 'node:crypto';

export function hashContent(content) {
  return `sha256:${createHash('sha256').update(String(content || ''), 'utf8').digest('hex')}`;
}

export function makeSourceProgressRef({ file, blockId, content, startLine = null, observedAt }) {
  return {
    file,
    blockId,
    startLine,
    contentHash: hashContent(content),
    observedAt
  };
}

export function makeChiefOpsBlockSourceProgressRef({ file, block, observedAt }) {
  const blockId = block?.value?.deltaBindingId;
  if (!blockId || typeof block?.raw !== 'string') {
    throw new Error('V2 source-progress references require a parsed delta block with raw fenced bytes.');
  }
  return makeSourceProgressRef({
    file,
    blockId,
    content: block.raw,
    observedAt
  });
}

export function compareSourceProgressRef(observedRef, currentBlock) {
  if (!currentBlock) {
    return { drifted: true, reason: 'missing_current_block' };
  }

  if (observedRef.file !== currentBlock.file) {
    return { drifted: true, reason: 'file_mismatch' };
  }

  if (observedRef.blockId !== currentBlock.blockId) {
    return { drifted: true, reason: 'block_id_mismatch' };
  }

  if (observedRef.contentHash !== hashContent(currentBlock.content)) {
    return { drifted: true, reason: 'content_hash_mismatch' };
  }

  return { drifted: false, reason: null };
}

export function compareChiefOpsBlockSourceProgressRef(observedRef, file, currentBlock) {
  if (!currentBlock) {
    return { drifted: true, reason: 'missing_current_block' };
  }
  return compareSourceProgressRef(observedRef, {
    file,
    blockId: currentBlock.value?.deltaBindingId,
    content: currentBlock.raw
  });
}
