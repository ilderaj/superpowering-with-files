import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadMcpProfile(rootDir, profileName = 'local') {
  const profilePath = path.join(rootDir, 'harness/core/mcp/profiles', `${profileName}.json`);
  return JSON.parse(await readFile(profilePath, 'utf8'));
}

export function validateProfileRequest(profile, { host, origin }) {
  if (host && !profile.allowedHosts.includes(host)) {
    throw new Error(`HTTP host is not allow-listed for profile ${profile.name}: ${host}`);
  }

  if (origin) {
    const normalizedOrigin = String(origin).replace(/\/$/, '');
    const allowed = profile.allowedOrigins.some((allowedOrigin) =>
      normalizedOrigin === allowedOrigin || normalizedOrigin.startsWith(allowedOrigin)
    );
    if (!allowed) {
      throw new Error(`HTTP origin is not allow-listed for profile ${profile.name}: ${origin}`);
    }
  }

  return true;
}
