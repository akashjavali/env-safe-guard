import { readFileSync, existsSync } from 'node:fs';

/**
 * Parses a .env file string into a key-value map.
 *
 * Rules:
 * - Lines starting with # are comments (skipped)
 * - Blank lines are skipped
 * - Lines without "=" are skipped
 * - The first "=" splits key and value (value may contain "=")
 * - Surrounding single or double quotes on the value are stripped
 * - CRLF and LF line endings are both handled
 * - Whitespace around keys is trimmed
 *
 * Does NOT execute shell substitution or expand variables.
 * Does NOT strip inline comments — value is everything after "=".
 */
export function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    const rawValue = line.slice(eqIndex + 1);

    let value: string;

    // Strip matching surrounding quotes (single or double) for quoted values
    const trimmedValue = rawValue.trim();
    if (trimmedValue.length >= 2) {
      const first = trimmedValue[0];
      const last = trimmedValue[trimmedValue.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = trimmedValue.slice(1, -1);
      } else {
        // Unquoted: trimEnd only — preserve intentional leading spaces,
        // remove trailing whitespace which is almost always noise.
        value = rawValue.trimEnd();
      }
    } else {
      // Short or empty unquoted value: trimEnd for consistency
      value = rawValue.trimEnd();
    }

    if (key) result[key] = value;
  }

  return result;
}

/**
 * Reads and parses a .env file from disk.
 * Returns an empty object if the file does not exist.
 *
 * process.env values take precedence over .env file values — merge
 * as: { ...fileVars, ...process.env }
 */
export function loadDotEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  return parseDotEnv(readFileSync(path, 'utf8'));
}
