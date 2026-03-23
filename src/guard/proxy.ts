import { inspect } from 'node:util';
import { REDACTED } from './redact.js';

type AnyRecord = Record<string, unknown>;

/** Safe string returned when the env object is coerced to a string. */
const SAFE_STRING = '[redacted env — use env.KEY to access individual values]';

/**
 * Returns a shallow copy of the env object with all defined values replaced
 * by REDACTED. Undefined values are omitted (consistent with JSON.stringify
 * skipping undefined — maintains shape parity with non-redacted output).
 */
function buildRedactedSnapshot(target: AnyRecord): AnyRecord {
  const snapshot: AnyRecord = {};
  for (const key of Object.keys(target)) {
    if (target[key] !== undefined) {
      snapshot[key] = REDACTED;
    }
  }
  return snapshot;
}

/**
 * Wraps a parsed env object in a Proxy that redacts values in all unsafe
 * serialization and coercion contexts, while returning real values for
 * direct property access (intentional code use).
 *
 * Intercepted paths:
 * - toJSON          → JSON.stringify(env) returns redacted object
 * - inspect.custom  → console.log(env) in Node.js shows redacted object
 * - toString        → String(env), '' + env returns safe message
 * - Symbol.toPrimitive → `${env}` template literals return safe message
 * - get (secret keys) → always returns REDACTED regardless of context
 *
 * NOT intercepted (by design):
 * - env.KEY for non-secret keys → returns real value; direct access is intentional
 */
export function createRedactedProxy<T extends AnyRecord>(
  parsed: T,
  secretKeys: ReadonlySet<string>,
): T {
  const inspectSymbol = inspect.custom;

  // util.inspect only invokes the inspect.custom symbol if it finds a function
  // on the object (not just a truthy value). Pre-attach a stub function so
  // Node.js calls through the proxy get trap which returns the real redactor.
  (parsed as Record<string | symbol, unknown>)[inspectSymbol] = function () {
    return buildRedactedSnapshot(parsed as AnyRecord);
  };

  const handler: ProxyHandler<T> = {
    get(target, prop) {
      // JSON.stringify serialization path
      if (prop === 'toJSON') {
        return () => buildRedactedSnapshot(target as AnyRecord);
      }

      // util.inspect path — used by console.log in Node.js
      if (prop === inspectSymbol) {
        return () => buildRedactedSnapshot(target as AnyRecord);
      }

      // String coercion: String(env), '' + env
      if (prop === 'toString') {
        return () => SAFE_STRING;
      }

      // Template literal and primitive coercion: `${env}`
      if (prop === Symbol.toPrimitive) {
        return (hint: string) => hint === 'number' ? NaN : SAFE_STRING;
      }

      // Named property access — check for secret keys first
      if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(target, prop)) {
        if (secretKeys.has(prop)) return REDACTED;
        return target[prop as keyof T];
      }

      return Reflect.get(target, prop);
    },
  };

  return new Proxy(parsed, handler);
}
