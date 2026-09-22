import {createHash} from 'node:crypto';
const fields=['caseId','taskId','taskSource','partition','rawInput','visibleEvidence','rubricHash','inputHash','methodHash','hostEvidence'];
export const hashBlindInput = row => createHash('sha256').update(JSON.stringify({rawInput:row.rawInput,visibleEvidence:row.visibleEvidence})).digest('hex');
export function validateBlindDataset(dataset) {
  if(!dataset||dataset.schemaVersion!==1||!Array.isArray(dataset.cases)) throw Error('Invalid blind dataset');
  const ids=new Set(),partitions=new Map();
  for(const row of dataset.cases) {
    if(!row||typeof row!=='object'||fields.some(k=>!Object.hasOwn(row,k))||Object.keys(row).some(k=>!fields.includes(k))) throw Error('Blind record fields must exclude truth, operator and predictions');
    for(const key of ['caseId','taskId','taskSource','rawInput','rubricHash','methodHash']) if(typeof row[key]!=='string'||!row[key].trim()) throw Error(`Missing ${key}`);
    if(ids.has(row.caseId)) throw Error('Duplicate case');ids.add(row.caseId);
    if(!['development','holdout'].includes(row.partition)) throw Error('Invalid partition');
    if(partitions.has(row.taskId)&&partitions.get(row.taskId)!==row.partition) throw Error('Task leakage into holdout');
    partitions.set(row.taskId,row.partition);
    if(!Array.isArray(row.visibleEvidence)||row.visibleEvidence.some(e=>typeof e!=='string')) throw Error('Evidence must be frozen text');
    if(row.inputHash!==hashBlindInput(row)) throw Error('Input hash mismatch');
    if(row.hostEvidence!==null&&(typeof row.hostEvidence!=='string'||!row.hostEvidence.trim())) throw Error('Host evidence must be a reference or null');
  }
  return {valid:true,count:dataset.cases.length,status:dataset.cases.length?'ready-for-independent-labeling':'protocol-only',modelComparability:dataset.cases.length&&dataset.cases.every(r=>r.hostEvidence!==null)?'requires-source-verification':'unknown'};
}
