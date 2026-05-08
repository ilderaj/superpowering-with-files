import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractBearerToken, validateBearerToken } from '../../harness/mcp/auth.mjs';
import { loadMcpProfile } from '../../harness/mcp/profile-policy.mjs';

test('extractBearerToken parses Authorization headers', async () => {
  assert.equal(extractBearerToken({ authorization: 'Bearer secret-token' }), 'secret-token');
  assert.equal(extractBearerToken({}), null);
});

test('validateBearerToken enforces remote auth profiles', async () => {
  const local = await loadMcpProfile(process.cwd(), 'local');
  const codespaces = await loadMcpProfile(process.cwd(), 'codespaces');
  assert.equal(validateBearerToken(local, {}).authenticated, false);
  assert.throws(() => validateBearerToken(codespaces, {}, 'expected'), /Missing bearer token/);
  assert.throws(
    () => validateBearerToken(codespaces, { authorization: 'Bearer wrong' }, 'expected'),
    /validation failed/
  );
  assert.equal(
    validateBearerToken(codespaces, { authorization: 'Bearer expected' }, 'expected').authenticated,
    true
  );
});
