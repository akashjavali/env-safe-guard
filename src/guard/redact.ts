/** Sentinel value shown in unsafe serialization contexts. */
export const REDACTED = '***REDACTED***' as const;

/**
 * Known secret value patterns.
 * Add new patterns here as new AI/cloud providers emerge.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /^sk-[a-zA-Z0-9]{20,}/,          // OpenAI, Anthropic API keys
  /^ghp_[a-zA-Z0-9]{30,}/,          // GitHub personal access tokens
  /^Bearer\s/i,                     // Authorization Bearer tokens
  /^AKIA[0-9A-Z]{16}/,              // AWS access key IDs
  /^xox[baprs]-[0-9]+-[0-9a-z-]+/, // Slack tokens (bot, app, user, etc.)
  /^[0-9a-f]{32,64}$/,              // Long lowercase hex strings (API keys, secrets)
];

/**
 * Returns true if a value matches known secret patterns.
 * Used to warn when a variable that is not marked secret: true contains
 * a value that looks like a credential — so the developer can fix the schema.
 *
 * This is advisory only (triggers console.warn, not a throw).
 */
export function looksLikeSecret(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}
