import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('empty lifecycle fields cannot consume the following field', () => {
 const result = JSON.parse(execFileSync('python3', ['-B', '-c', `
import sys,json,tempfile
from pathlib import Path
sys.path.insert(0,'harness/core/upstream-overlays/planning-with-files/scripts')
from task_lifecycle import inspect_plan_dir
with tempfile.TemporaryDirectory() as directory:
 p=Path(directory)
 (p/'task_plan.md').write_text('# Task\\n## Current State\\nStatus: waiting_review\\nArchive Eligible: no\\nClose Reason:\\nReconcile: open\\n')
 print(json.dumps(inspect_plan_dir(p)))
`], {encoding:'utf8'}));
 assert.equal(result.close_reason, '');
 assert.equal(result.status, 'waiting_review');
 assert.equal(result.reconciliation_status, 'open');
 assert.equal(result.safe_to_archive, false);
});
