import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('installer debug artifact trees are not tracked', () => {
  const tracked = execFileSync('git', ['ls-files', '--', 'tests/installer/.debug-*'], {
    encoding: 'utf8'
  }).trim();
  assert.equal(tracked, '', `tracked installer debug artifacts remain:\n${tracked}`);
});
