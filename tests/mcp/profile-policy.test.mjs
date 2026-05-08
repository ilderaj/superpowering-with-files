import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMcpProfile, validateProfileRequest } from '../../harness/mcp/profile-policy.mjs';

test('loadMcpProfile reads the local profile', async () => {
  const profile = await loadMcpProfile(process.cwd(), 'local');
  assert.equal(profile.name, 'local');
  assert.equal(profile.requireAuth, false);
});

test('validateProfileRequest rejects unknown host or origin', async () => {
  const profile = await loadMcpProfile(process.cwd(), 'local');
  assert.throws(
    () => validateProfileRequest(profile, { host: 'evil.example.com', origin: 'http://localhost' }),
    /not allow-listed/
  );
  assert.throws(
    () => validateProfileRequest(profile, { host: '127.0.0.1', origin: 'https://evil.example.com' }),
    /not allow-listed/
  );
});
