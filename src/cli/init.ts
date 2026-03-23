import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EnvSchema } from '../core/types.js';
import { loadDotEnvFile } from '../dotenv/loader.js';

const SAMPLE_SCHEMA: EnvSchema = {
  DATABASE_URL: 'string',
  API_KEY: { type: 'string', secret: true },
  PORT: { type: 'number?', default: 3000 },
  DEBUG: { type: 'boolean?', default: false },
};

function schemaFromExample(examplePath: string): EnvSchema {
  const vars = loadDotEnvFile(examplePath);
  const schema: EnvSchema = {};
  for (const key of Object.keys(vars)) {
    schema[key] = 'string';
  }
  return schema;
}

export function runInit(flags: Record<string, string>): void {
  const outputPath = resolve(flags['output'] ?? 'env-schema.json');

  if (existsSync(outputPath)) {
    process.stderr.write(`⚠️  ${outputPath} already exists. Delete it first or use --output.\n`);
    process.exit(1);
  }

  const examplePath = resolve(flags['example'] ?? '.env.example');
  const fromExample = existsSync(examplePath);
  const schema = fromExample ? schemaFromExample(examplePath) : SAMPLE_SCHEMA;

  writeFileSync(outputPath, JSON.stringify(schema, null, 2) + '\n');

  if (fromExample) {
    process.stdout.write(`✅ Created ${outputPath} from ${examplePath}\n`);
    process.stdout.write(`   Review types and mark secrets with { type: 'string', secret: true }\n`);
  } else {
    process.stdout.write(`✅ Created ${outputPath}\n`);
    process.stdout.write(`   Edit this file to match your application's env variables.\n`);
  }
  process.stdout.write(`   Then run: npx envfort check\n`);
}
