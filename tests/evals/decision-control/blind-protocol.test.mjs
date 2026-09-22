import test from 'node:test';
import assert from 'node:assert/strict';
import {hashBlindInput,validateBlindDataset} from './blind-protocol.mjs';
function row(){const r={caseId:'c1',taskId:'t1',taskSource:'synthetic-test',partition:'development',rawInput:'A test-only task',visibleEvidence:['Evidence available before decision'],rubricHash:'rubric1',methodHash:'method1',hostEvidence:null};return {...r,inputHash:hashBlindInput(r)};}
test('empty manifest is protocol only, not a dataset result',()=>assert.equal(validateBlindDataset({schemaVersion:1,cases:[]}).status,'protocol-only'));
test('raw frozen input accepts unknown Host identity without declaring comparability',()=>assert.equal(validateBlindDataset({schemaVersion:1,cases:[row()]}).modelComparability,'unknown'));
test('prediction/truth leakage and changed input reject',()=>{
 assert.throws(()=>validateBlindDataset({schemaVersion:1,cases:[{...row(),truth:'done'}]}),/exclude/);
 assert.throws(()=>validateBlindDataset({schemaVersion:1,cases:[{...row(),rawInput:'changed'}]}),/hash/);
});
test('same-task holdout and duplicate cases reject',()=>{
 assert.throws(()=>validateBlindDataset({schemaVersion:1,cases:[row(),{...row(),caseId:'c2',partition:'holdout'}]}),/leakage/);
 assert.throws(()=>validateBlindDataset({schemaVersion:1,cases:[row(),row()]}),/Duplicate/);
});
