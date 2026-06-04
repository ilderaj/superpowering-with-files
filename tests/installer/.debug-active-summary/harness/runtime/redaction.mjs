import os from 'node:os';

const TOKEN_PATTERN = /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{10,}\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._-]{16,}\b/g;

export function redactText(input, options = {}) {
  let text = String(input ?? '');
  const homeDir = options.homeDir ?? os.homedir();

  if (homeDir) {
    text = text.split(homeDir).join('<HOME>');
  }

  return text
    .replace(TOKEN_PATTERN, '<REDACTED_TOKEN>')
    .replace(BEARER_PATTERN, 'Bearer <REDACTED_TOKEN>');
}

export function truncateText(input, maxLength = 12000) {
  const text = String(input ?? '');
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}\n…truncated…`;
}

export function sanitizeText(input, options = {}) {
  return truncateText(redactText(input, options), options.maxLength);
}
