import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from '../core/parser.js';
import type { EnvSchema } from '../core/types.js';

export function runCheck(flags: Record<string, string>): void {
  const schemaPath = resolve(flags['schema'] ?? 'env-schema.json');

  if (!existsSync(schemaPath)) {
    process.stderr.write(`❌ Schema file not found: ${schemaPath}\n`);
    process.stderr.write(`   Run: npx envfort init\n`);
    process.exit(1);
  }

  let schema: EnvSchema;
  try {
    schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as EnvSchema;
  } catch {
    process.stderr.write(`❌ Failed to parse schema file: ${schemaPath}\n`);
    process.exit(1);
  }

  try {
    parseEnv(schema, process.env as Record<string, string | undefined>);
    process.stdout.write(`✅ All environment variables are valid.\n`);
  } catch (err) {
    process.stderr.write(`❌ ${(err as Error).message}\n`);
    process.stderr.write(`   👉 Add the missing variable(s) to your .env file\n`);
    process.exit(1);
  }
}
