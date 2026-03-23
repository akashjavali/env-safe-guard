import { parseEnv } from './parser.js';
import type { EnvSchema, InferEnv, CreateEnvOptions, SchemaDescriptor } from './types.js';
import { createRedactedProxy } from '../guard/proxy.js';
import { looksLikeSecret } from '../guard/redact.js';
import { loadDotEnvFile } from '../dotenv/loader.js';

/** Collect all keys marked secret: true in the schema. */
function getSecretKeys(schema: EnvSchema): Set<string> {
  const keys = new Set<string>();
  for (const [key, entry] of Object.entries(schema)) {
    if (typeof entry !== 'string' && (entry as SchemaDescriptor).secret === true) {
      keys.add(key);
    }
  }
  return keys;
}

/**
 * Emits a console.warn for any non-secret variable whose value matches
 * known secret patterns (sk-, ghp_, Bearer, etc.). Advisory only.
 */
function warnIfSecretLooking(
  schema: EnvSchema,
  parsed: Record<string, unknown>,
  secretKeys: Set<string>,
): void {
  for (const [key, value] of Object.entries(parsed)) {
    if (secretKeys.has(key)) continue;
    if (typeof value === 'string' && looksLikeSecret(value)) {
      console.warn(
        `[env-safe-guard] ⚠️  "${key}" looks like a secret. Consider marking it { type: '...', secret: true } in your schema.`,
      );
    }
  }
}

/**
 * Validates env variables against a schema, returning a fully-typed,
 * optionally-redacted environment object.
 *
 * The returned object is always frozen when redact is false to prevent
 * accidental mutation. When redact is true, the Proxy handles protection.
 *
 * @example
 * export const env = createEnv({
 *   DATABASE_URL: 'string',
 *   API_KEY: { type: 'string', secret: true },
 *   PORT: { type: 'number?', default: 3000 },
 * }, { redact: true });
 */
export function createEnv<S extends EnvSchema>(
  schema: S,
  options: CreateEnvOptions = {},
): InferEnv<S> {
  let rawEnv: Record<string, string | undefined>;

  if (options.env !== undefined) {
    // Explicit injection — used in tests and non-Node runtimes
    rawEnv = options.env;
  } else {
    rawEnv = { ...(process.env as Record<string, string | undefined>) };
    if (options.loadDotEnv === true) {
      const fileVars = loadDotEnvFile(options.dotEnvPath ?? '.env');
      // process.env takes precedence over .env file
      rawEnv = { ...fileVars, ...rawEnv };
    }
  }

  const parsed = parseEnv(schema, rawEnv);
  const secretKeys = getSecretKeys(schema);

  // Warn about non-secret keys with secret-looking values
  warnIfSecretLooking(schema, parsed as Record<string, unknown>, secretKeys);

  // Auto-enable redaction when any key is marked secret: true, so that
  // secret values are always redacted even on direct property access.
  const effectiveRedact = options.redact === true || secretKeys.size > 0;

  if (effectiveRedact) {
    return createRedactedProxy(parsed, secretKeys);
  }

  return Object.freeze(parsed) as InferEnv<S>;
}
