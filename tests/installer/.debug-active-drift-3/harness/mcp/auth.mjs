export function extractBearerToken(headers) {
  const authorization = headers.authorization ?? headers.Authorization;
  if (!authorization) {
    return null;
  }

  const match = String(authorization).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export function validateBearerToken(profile, headers, expectedToken = process.env.HARNESS_MCP_BEARER_TOKEN) {
  if (!profile.requireAuth) {
    return {
      principal: 'anonymous',
      authenticated: false
    };
  }

  const token = extractBearerToken(headers);
  if (!token) {
    throw new Error(`Missing bearer token for profile ${profile.name}.`);
  }

  if (!expectedToken || token !== expectedToken) {
    throw new Error(`Bearer token validation failed for profile ${profile.name}.`);
  }

  return {
    principal: 'bearer-token',
    authenticated: true
  };
}
