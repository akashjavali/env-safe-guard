import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EnvSchema } from '../core/types.js';

const SAMPLE_SCHEMA: EnvSchema = {
  DATABASE_URL: 'string',
  API_KEY: { type: 'string', secret: true },
  PORT: { type: 'number?', default: 3000 },
  DEBUG: { type: 'boolean?', default: false },
};

export function runInit(flags: Record<string, string>): void {
  const outputPath = resolve(flags['output'] ?? 'env-schema.json');

  if (existsSync(outputPath)) {
    process.stderr.write(`⚠️  ${outputPath} already exists. Delete it first or use --output.\n`);
    process.exit(1);
  }

  writeFileSync(outputPath, JSON.stringify(SAMPLE_SCHEMA, null, 2) + '\n');
  process.stdout.write(`✅ Created ${outputPath}\n`);
  process.stdout.write(`   Edit this file to match your application's env variables.\n`);
  process.stdout.write(`   Then run: npx envfort check\n`);
}
