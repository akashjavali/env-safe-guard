# envfort MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `envfort` — a TypeScript npm package that validates environment variables, provides full type inference, and acts as a security layer preventing secrets from leaking into logs, AI tools, and git history.

**Architecture:** `createEnv(schema, options)` validates `process.env`, returns a Proxy-wrapped typed object. The Proxy intercepts all serialization paths (`toJSON`, `util.inspect.custom`, `toString`, `Symbol.toPrimitive`) to redact secrets in any output context. A CLI provides `check`, `init`, `gen-example`, and `install-hook` commands. GitHub Actions runs CI and auto-publishes to npm.

**Tech Stack:** TypeScript 5, Vitest, tsup (ESM + CJS dual output), Node.js 18+ — zero runtime dependencies.

---

## Design Notes

### Redaction Scope

The Proxy intercepts **all serialization and coercion paths**:

| How the env is used | Intercepted? | Result |
|---|---|---|
| `JSON.stringify(env)` | ✅ via `toJSON` | `{"API_KEY":"***REDACTED***"}` |
| `console.log(env)` | ✅ via `util.inspect.custom` | `{ API_KEY: '***REDACTED***' }` |
| `` `Config: ${env}` `` | ✅ via `Symbol.toPrimitive` | `Config: [redacted env]` |
| `String(env)` | ✅ via `toString` | `[redacted env]` |
| AI SDK: `{ content: \`${env}\` }` | ✅ via `Symbol.toPrimitive` | safe |
| AI SDK: `JSON.stringify({ env })` | ✅ via `toJSON` | safe |
| `env.API_KEY` (runtime use) | real value (by design) | `"sk-abc123"` |

Individual property access returns the real value — direct access is intentional code, not accidental leakage.

### Schema Value Types

```ts
// Simple type strings
{ PORT: 'number?' }              // optional
{ HOST: 'string' }               // required

// Rich descriptor (with default or secret flag)
{ PORT: { type: 'number', default: 3000 } }
{ API_KEY: { type: 'string', secret: true } }   // secret: true = always redacted even on direct access
```

### Git Safety

`install-hook` writes a `.git/hooks/pre-commit` script that:
1. Blocks commits containing `.env` files (except `.env.example`)
2. Auto-adds `.env*` to `.gitignore` if missing
3. Runs `envfort check` if `env-schema.json` exists

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Package metadata, scripts, exports map (ESM+CJS with correct type conditions) |
| `tsconfig.json` | TypeScript config for IDE + type checking (no rootDir — covers src + tests) |
| `tsconfig.build.json` | TypeScript config for tsup (rootDir: src, excludes tests) |
| `tsup.config.ts` | Dual ESM+CJS library build + CLI build with shebang |
| `vitest.config.ts` | Test runner config |
| `src/core/types.ts` | All TypeScript types — schema, options, inference utilities |
| `src/core/parser.ts` | Schema parsing, validation, type coercion, default values |
| `src/core/createEnv.ts` | Main public API — parser + proxy + optional dotenv loading |
| `src/guard/redact.ts` | `REDACTED` constant + `looksLikeSecret()` pattern detector |
| `src/guard/proxy.ts` | `createRedactedProxy()` — intercepts all serialization paths |
| `src/cli/index.ts` | CLI router — delegates to command modules |
| `src/cli/check.ts` | `check` command |
| `src/cli/init.ts` | `init` command (generate schema file) |
| `src/cli/gen-example.ts` | `gen-example` command (generate `.env.example`) |
| `src/cli/install-hook.ts` | `install-hook` command (git pre-commit hook) |
| `src/dotenv/loader.ts` | Minimal `.env` file parser (no external deps) |
| `src/index.ts` | Public barrel export |
| `tests/core/parser.test.ts` | Parser unit tests |
| `tests/core/createEnv.test.ts` | createEnv integration tests |
| `tests/guard/redact.test.ts` | Secret pattern detection tests |
| `tests/guard/proxy.test.ts` | Proxy redaction tests (all interception paths) |
| `tests/dotenv/loader.test.ts` | Dotenv loader unit tests |
| `tests/cli/cli.test.ts` | CLI command tests (spawnSync — no shell injection) |
| `example/index.ts` | Runnable demo |
| `.github/workflows/ci.yml` | Run tests on every push and PR |
| `.github/workflows/publish.yml` | Auto-publish to npm when a version tag is pushed |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "envfort",
  "version": "0.1.0",
  "description": "Validate and protect environment variables — with automatic secret redaction for the AI era.",
  "keywords": ["env", "environment", "validation", "security", "dotenv", "typescript", "ai-safe"],
  "license": "MIT",
  "type": "module",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "envfort": "./dist/cli/index.js"
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run build && npm test"
  },
  "engines": { "node": ">=18" },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

No `rootDir` here — this config covers both `src/` and `tests/` for IDE and `tsc --noEmit`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src", "tests"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "exclude": ["node_modules", "dist", "tests", "example"]
}
```

- [ ] **Step 4: Create `tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: 'dist',
    tsconfig: 'tsconfig.build.json',
  },
  {
    entry: ['src/cli/index.ts'],
    format: ['esm'],
    banner: { js: '#!/usr/bin/env node' },
    outDir: 'dist/cli',
    sourcemap: false,
    clean: false,
    tsconfig: 'tsconfig.build.json',
  },
]);
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/cli/**'],
    },
  },
});
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
dist/
*.log
.env
.env.*
!.env.example
coverage/
```

- [ ] **Step 7: Install dependencies and commit**

```bash
npm install
git add package.json tsconfig.json tsconfig.build.json tsup.config.ts vitest.config.ts .gitignore
git commit -m "chore: project scaffolding — tsup, vitest, typescript"
```

---

## Task 2: TypeScript Type System

**Files:**
- Create: `src/core/types.ts`

- [ ] **Step 1: Create `src/core/types.ts`**

```ts
/** Base type names. Append "?" for optional. */
export type BaseTypeString = 'string' | 'number' | 'boolean';
export type SchemaTypeString = BaseTypeString | `${BaseTypeString}?`;

/**
 * Rich schema descriptor — alternative to plain SchemaTypeString.
 * Allows default values and marking a variable as secret.
 */
export interface SchemaDescriptor {
  type: SchemaTypeString;
  /**
   * Default value used when the env variable is absent.
   * Only valid for optional types ("string?", "number?", "boolean?").
   */
  default?: string | number | boolean;
  /**
   * When true, this variable is ALWAYS redacted — even on direct property
   * access (env.API_KEY). Use for the most sensitive credentials.
   * @default false
   */
  secret?: boolean;
}

/** A schema entry is either a simple type string or a rich descriptor. */
export type SchemaEntry = SchemaTypeString | SchemaDescriptor;

/** The schema object the user passes to createEnv. */
export type EnvSchema = Record<string, SchemaEntry>;

/** Resolve a SchemaEntry to its SchemaDescriptor form. */
export type ResolvedDescriptor = Required<Pick<SchemaDescriptor, 'type'>> &
  Pick<SchemaDescriptor, 'default' | 'secret'>;

/** Map a single SchemaTypeString to its TypeScript type. */
type InferSingle<T extends SchemaTypeString> =
  T extends 'string'   ? string :
  T extends 'number'   ? number :
  T extends 'boolean'  ? boolean :
  T extends 'string?'  ? string | undefined :
  T extends 'number?'  ? number | undefined :
  T extends 'boolean?' ? boolean | undefined :
  never;

/** Resolve the TypeString from a SchemaEntry. */
type EntryTypeStr<E extends SchemaEntry> =
  E extends SchemaTypeString   ? E :
  E extends SchemaDescriptor   ? E['type'] :
  never;

/**
 * Maps a full schema to its TypeScript type.
 *
 * @example
 * type Env = InferEnv<{
 *   DATABASE_URL: 'string';
 *   PORT: { type: 'number?'; default: 3000 };
 * }>
 * // => { DATABASE_URL: string; PORT: number | undefined }
 */
export type InferEnv<S extends EnvSchema> = {
  readonly [K in keyof S]: InferSingle<EntryTypeStr<S[K]>>;
};

/** Options accepted by createEnv. */
export interface CreateEnvOptions {
  /**
   * Wrap the returned env in a Proxy that redacts values in all unsafe
   * serialization contexts (JSON, util.inspect, toString, template literals).
   * Variables marked `secret: true` in the schema are also redacted on
   * direct property access.
   * @default false
   */
  redact?: boolean;

  /**
   * Load variables from a `.env` file before validation.
   * File variables are merged under process.env — process.env takes precedence.
   * @default false
   */
  loadDotEnv?: boolean;

  /** Path to the `.env` file. Only used when `loadDotEnv: true`. @default '.env' */
  dotEnvPath?: string;

  /**
   * Custom env source. Overrides process.env and dotEnv loading.
   * Use in tests to inject values without touching process.env.
   */
  env?: Record<string, string | undefined>;
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat: add TypeScript type system — schema inference, descriptors, options"
```

---

## Task 3: Schema Parser

**Files:**
- Create: `src/core/parser.ts`
- Create: `tests/core/parser.test.ts`

- [ ] **Step 1: Write failing tests (`tests/core/parser.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { parseEnv } from '../../src/core/parser.js';

describe('parseEnv — required string', () => {
  it('returns value when present', () => {
    expect(parseEnv({ DB: 'string' }, { DB: 'postgres://localhost' }).DB)
      .toBe('postgres://localhost');
  });
  it('throws when missing', () => {
    expect(() => parseEnv({ DB: 'string' }, {}))
      .toThrow('Missing required env variable: DB');
  });
  it('throws when empty string', () => {
    expect(() => parseEnv({ DB: 'string' }, { DB: '' }))
      .toThrow('Missing required env variable: DB');
  });
});

describe('parseEnv — required number', () => {
  it('parses a number string', () => {
    expect(parseEnv({ PORT: 'number' }, { PORT: '3000' }).PORT).toBe(3000);
  });
  it('throws for non-numeric', () => {
    expect(() => parseEnv({ PORT: 'number' }, { PORT: 'abc' }))
      .toThrow('expected a number');
  });
  it('throws when missing', () => {
    expect(() => parseEnv({ PORT: 'number' }, {}))
      .toThrow('Missing required env variable: PORT');
  });
});

describe('parseEnv — required boolean', () => {
  it.each([['true', true], ['1', true], ['false', false], ['0', false]])(
    'parses "%s" as %s', (raw, expected) => {
      expect(parseEnv({ FLAG: 'boolean' }, { FLAG: raw }).FLAG).toBe(expected);
    }
  );
  it('throws for invalid boolean', () => {
    expect(() => parseEnv({ FLAG: 'boolean' }, { FLAG: 'yes' }))
      .toThrow('expected "true", "false", "1", or "0"');
  });
});

describe('parseEnv — optional variables', () => {
  it('returns undefined when absent', () => {
    expect(parseEnv({ PORT: 'number?' }, {}).PORT).toBeUndefined();
  });
  it('parses when present', () => {
    expect(parseEnv({ PORT: 'number?' }, { PORT: '8080' }).PORT).toBe(8080);
  });
});

describe('parseEnv — default values', () => {
  it('uses default when optional var is absent', () => {
    expect(
      parseEnv({ PORT: { type: 'number?', default: 3000 } }, {}).PORT
    ).toBe(3000);
  });
  it('prefers env value over default', () => {
    expect(
      parseEnv({ PORT: { type: 'number?', default: 3000 } }, { PORT: '9000' }).PORT
    ).toBe(9000);
  });
  it('uses string default', () => {
    expect(
      parseEnv({ HOST: { type: 'string?', default: 'localhost' } }, {}).HOST
    ).toBe('localhost');
  });
  it('uses boolean default', () => {
    expect(
      parseEnv({ DEBUG: { type: 'boolean?', default: false } }, {}).DEBUG
    ).toBe(false);
  });
});

describe('parseEnv — multiple missing variables', () => {
  it('collects all missing into one error', () => {
    expect(() => parseEnv({ A: 'string', B: 'string', C: 'number' }, {}))
      .toThrow('Missing required env variables: A, B, C');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/core/parser.test.ts
```

Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Implement `src/core/parser.ts`**

```ts
import type { EnvSchema, InferEnv, SchemaEntry, ResolvedDescriptor } from './types.js';

type RawEnv = Record<string, string | undefined>;
const MISSING = Symbol('MISSING');

function resolveDescriptor(entry: SchemaEntry): ResolvedDescriptor {
  if (typeof entry === 'string') return { type: entry };
  return entry;
}

function coerce(key: string, raw: string, baseType: string): unknown {
  if (baseType === 'string') return raw;
  if (baseType === 'number') {
    const n = Number(raw);
    if (Number.isNaN(n))
      throw new Error(`Invalid value for env variable ${key}: expected a number, got "${raw}"`);
    return n;
  }
  if (baseType === 'boolean') {
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    throw new Error(
      `Invalid value for env variable ${key}: expected "true", "false", "1", or "0"`,
    );
  }
  throw new Error(`Unknown schema type: "${baseType}" for key "${key}"`);
}

function parseSingleValue(key: string, rawValue: string | undefined, desc: ResolvedDescriptor): unknown {
  const isOptional = desc.type.endsWith('?');
  const baseType = desc.type.replace('?', '');

  if (rawValue === undefined || rawValue === '') {
    if (desc.default !== undefined) return desc.default;
    if (isOptional) return undefined;
    return MISSING;
  }

  return coerce(key, rawValue, baseType);
}

/**
 * Validates and coerces raw environment variables against a schema.
 * Throws descriptive, developer-friendly errors on failure.
 */
export function parseEnv<S extends EnvSchema>(schema: S, rawEnv: RawEnv): InferEnv<S> {
  const result: Record<string, unknown> = {};
  const missing: string[] = [];

  for (const [key, entry] of Object.entries(schema)) {
    const desc = resolveDescriptor(entry);
    const parsed = parseSingleValue(key, rawEnv[key], desc);
    if (parsed === MISSING) {
      missing.push(key);
    } else {
      result[key] = parsed;
    }
  }

  if (missing.length === 1) throw new Error(`Missing required env variable: ${missing[0]!}`);
  if (missing.length > 1) throw new Error(`Missing required env variables: ${missing.join(', ')}`);

  return result as InferEnv<S>;
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run tests/core/parser.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/parser.ts tests/core/parser.test.ts
git commit -m "feat: schema parser — type coercion, defaults, descriptive errors"
```

---

## Task 4: Redaction Module

**Files:**
- Create: `src/guard/redact.ts`
- Create: `tests/guard/redact.test.ts`

- [ ] **Step 1: Write failing tests (`tests/guard/redact.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { REDACTED, looksLikeSecret } from '../../src/guard/redact.js';

describe('REDACTED', () => {
  it('is the sentinel string', () => {
    expect(REDACTED).toBe('***REDACTED***');
  });
});

describe('looksLikeSecret', () => {
  it.each([
    ['sk-abc123def456'],       // OpenAI-style key
    ['ghp_abcdefghijklmnop'], // GitHub PAT
    ['Bearer eyJhbGci'],       // Bearer token
    ['AKIA1234567890AB'],      // AWS access key
    ['xoxb-123-456-abc'],      // Slack bot token
  ])('detects "%s" as a secret', (value) => {
    expect(looksLikeSecret(value)).toBe(true);
  });

  it.each([
    ['localhost'],
    ['3000'],
    ['true'],
    ['my-database-name'],
    ['production'],
  ])('does not flag "%s" as a secret', (value) => {
    expect(looksLikeSecret(value)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/guard/redact.test.ts
```

Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Implement `src/guard/redact.ts`**

```ts
/** Sentinel value shown in unsafe output contexts. */
export const REDACTED = '***REDACTED***' as const;

/**
 * Common secret prefixes and patterns.
 * Used to warn developers if a non-secret variable contains a secret-looking value.
 *
 * Future extension: add patterns for new AI/cloud providers here.
 */
const SECRET_PATTERNS = [
  /^sk-[a-zA-Z0-9]{20,}/,          // OpenAI, Anthropic keys
  /^ghp_[a-zA-Z0-9]{36}/,          // GitHub PATs
  /^Bearer\s/i,                     // Bearer tokens
  /^AKIA[0-9A-Z]{16}/,              // AWS access keys
  /^xox[baprs]-[0-9]+-[0-9a-z]+/,  // Slack tokens
  /^[0-9a-f]{32,64}$/,              // Long hex strings (API keys, secrets)
] as const;

/**
 * Returns true if a value matches known secret patterns.
 * Used to warn when a variable that isn't marked `secret: true` contains
 * a value that looks like a credential.
 */
export function looksLikeSecret(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run tests/guard/redact.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/guard/redact.ts tests/guard/redact.test.ts
git commit -m "feat: REDACTED sentinel and secret pattern detector"
```

---

## Task 5: Proxy Wrapper

**Files:**
- Create: `src/guard/proxy.ts`
- Create: `tests/guard/proxy.test.ts`

Intercepts **all** serialization and coercion paths:
- `toJSON` — `JSON.stringify(env)`
- `util.inspect.custom` — `console.log(env)`
- `toString` — `String(env)`, `'' + env`
- `Symbol.toPrimitive` — `` `${env}` ``

Variables marked `secret: true` in the schema are also redacted on direct property access.

- [ ] **Step 1: Write failing tests (`tests/guard/proxy.test.ts`)**

```ts
import { describe, it, expect, vi } from 'vitest';
import { createRedactedProxy } from '../../src/guard/proxy.js';
import { REDACTED } from '../../src/guard/redact.js';
import * as util from 'node:util';

describe('createRedactedProxy — normal access (real values)', () => {
  const env = createRedactedProxy(
    { API_KEY: 'sk-abc123', PORT: 3000, OPTIONAL: undefined },
    new Set(),
  );

  it('returns real string value', () => { expect(env['API_KEY']).toBe('sk-abc123'); });
  it('returns real number value', () => { expect(env['PORT']).toBe(3000); });
  it('returns undefined for absent optional', () => { expect(env['OPTIONAL']).toBeUndefined(); });
});

describe('createRedactedProxy — JSON.stringify', () => {
  it('redacts all defined values', () => {
    const env = createRedactedProxy({ API_KEY: 'sk-abc123', PORT: 3000 }, new Set());
    const obj = JSON.parse(JSON.stringify(env)) as Record<string, unknown>;
    expect(obj['API_KEY']).toBe(REDACTED);
    expect(obj['PORT']).toBe(REDACTED);
  });

  it('omits undefined optional values (consistent with non-redacted shape)', () => {
    const env = createRedactedProxy({ API_KEY: 'sk-abc123', PORT: undefined }, new Set());
    const obj = JSON.parse(JSON.stringify(env)) as Record<string, unknown>;
    expect(obj['API_KEY']).toBe(REDACTED);
    expect('PORT' in obj).toBe(false);
  });
});

describe('createRedactedProxy — util.inspect / console.log', () => {
  it('redacts values in util.inspect output', () => {
    const env = createRedactedProxy({ API_KEY: 'sk-abc123' }, new Set());
    expect(util.inspect(env)).not.toContain('sk-abc123');
    expect(util.inspect(env)).toContain(REDACTED);
  });

  it('hides real values when console.logged', () => {
    const env = createRedactedProxy({ API_KEY: 'sk-abc123' }, new Set());
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c) => {
      chunks.push(String(c)); return true;
    });
    console.log(env);
    spy.mockRestore();
    expect(chunks.join('')).not.toContain('sk-abc123');
  });
});

describe('createRedactedProxy — toString / template literals', () => {
  it('returns safe string from toString()', () => {
    const env = createRedactedProxy({ API_KEY: 'sk-abc123' }, new Set());
    expect(String(env)).not.toContain('sk-abc123');
    expect(String(env)).toContain('redacted');
  });

  it('returns safe string from template literal interpolation', () => {
    const env = createRedactedProxy({ API_KEY: 'sk-abc123' }, new Set());
    const result = `Config: ${env}`;
    expect(result).not.toContain('sk-abc123');
  });

  it('returns safe string from string concatenation', () => {
    const env = createRedactedProxy({ API_KEY: 'sk-abc123' }, new Set());
    const result = 'Config: ' + env;
    expect(result).not.toContain('sk-abc123');
  });
});

describe('createRedactedProxy — secret: true keys', () => {
  it('redacts direct access for secret-marked keys', () => {
    const env = createRedactedProxy(
      { API_KEY: 'sk-abc123', HOST: 'localhost' },
      new Set(['API_KEY']), // secretKeys
    );
    expect(env['API_KEY']).toBe(REDACTED);
    expect(env['HOST']).toBe('localhost'); // non-secret: real value
  });
});

describe('createRedactedProxy — runtime usage (real values for code)', () => {
  it('allows using value in string interpolation', () => {
    const env = createRedactedProxy({ API_KEY: 'sk-abc123' }, new Set());
    const header = `Bearer ${env['API_KEY'] as string}`;
    expect(header).toBe('Bearer sk-abc123');
  });

  it('allows arithmetic with number value', () => {
    const env = createRedactedProxy({ PORT: 3000 }, new Set());
    expect((env['PORT'] as number) + 1).toBe(3001);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/guard/proxy.test.ts
```

Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Implement `src/guard/proxy.ts`**

```ts
import { inspect } from 'node:util';
import { REDACTED } from './redact.js';

type AnyRecord = Record<string, unknown>;

/** Safe string returned when the env object is coerced to a string. */
const REDACTED_STRING = '[redacted env — use env.KEY to access individual values]';

function buildRedactedSnapshot(target: AnyRecord): AnyRecord {
  const snapshot: AnyRecord = {};
  for (const key of Object.keys(target)) {
    if (target[key] !== undefined) snapshot[key] = REDACTED;
  }
  return snapshot;
}

/**
 * Wraps a parsed env object in a Proxy that redacts values in all
 * unsafe serialization and coercion contexts.
 *
 * @param parsed     The validated env object.
 * @param secretKeys Set of key names marked `secret: true` — always redacted
 *                   even on direct property access.
 */
export function createRedactedProxy<T extends AnyRecord>(
  parsed: T,
  secretKeys: ReadonlySet<string>,
): T {
  const handler: ProxyHandler<T> = {
    get(target, prop) {
      // JSON.stringify path
      if (prop === 'toJSON') return () => buildRedactedSnapshot(target as AnyRecord);

      // util.inspect path (Node.js console.log)
      if (prop === inspect.custom) return () => buildRedactedSnapshot(target as AnyRecord);

      // String coercion path: String(env), '' + env
      if (prop === 'toString') return () => REDACTED_STRING;

      // Template literal path: `${env}`, and string hint coercion
      if (prop === Symbol.toPrimitive) {
        return (hint: string) => hint === 'number' ? NaN : REDACTED_STRING;
      }

      // Direct property access: real value, UNLESS marked secret
      if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(target, prop)) {
        if (secretKeys.has(prop)) return REDACTED;
        return target[prop as keyof T];
      }

      return Reflect.get(target, prop);
    },
  };

  return new Proxy(parsed, handler);
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run tests/guard/proxy.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/guard/proxy.ts tests/guard/proxy.test.ts
git commit -m "feat: redacted proxy — covers JSON, inspect, toString, template literals, secret keys"
```

---

## Task 6: Dotenv Loader

**Files:**
- Create: `src/dotenv/loader.ts`
- Create: `tests/dotenv/loader.test.ts`

Minimal `.env` file parser — no external dependencies. Handles `KEY=value`, `KEY="value"`, comments, and blank lines.

- [ ] **Step 1: Write failing tests (`tests/dotenv/loader.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { parseDotEnv } from '../../src/dotenv/loader.js';

describe('parseDotEnv', () => {
  it('parses simple key=value pairs', () => {
    const result = parseDotEnv('DB_URL=postgres://localhost\nPORT=3000');
    expect(result).toEqual({ DB_URL: 'postgres://localhost', PORT: '3000' });
  });

  it('strips double quotes from values', () => {
    expect(parseDotEnv('API_KEY="sk-abc123"')).toEqual({ API_KEY: 'sk-abc123' });
  });

  it('strips single quotes from values', () => {
    expect(parseDotEnv("HOST='localhost'")).toEqual({ HOST: 'localhost' });
  });

  it('ignores comment lines', () => {
    expect(parseDotEnv('# comment\nHOST=localhost')).toEqual({ HOST: 'localhost' });
  });

  it('ignores blank lines', () => {
    expect(parseDotEnv('\nHOST=localhost\n\nPORT=3000\n')).toEqual({
      HOST: 'localhost',
      PORT: '3000',
    });
  });

  it('ignores lines without "="', () => {
    expect(parseDotEnv('INVALID\nHOST=localhost')).toEqual({ HOST: 'localhost' });
  });

  it('handles values with "=" in them', () => {
    expect(parseDotEnv('URL=http://a.com?x=1&y=2')).toEqual({
      URL: 'http://a.com?x=1&y=2',
    });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/dotenv/loader.test.ts
```

Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Implement `src/dotenv/loader.ts`**

```ts
import { readFileSync, existsSync } from 'node:fs';

/**
 * Parses a .env file string into a key-value map.
 * Handles comments (#), blank lines, quoted values, and values containing "=".
 * Does NOT execute shell substitutions or expand variables.
 */
export function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes (single or double)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) result[key] = value;
  }

  return result;
}

/**
 * Reads and parses a .env file. Returns empty object if file doesn't exist.
 * process.env variables take precedence over .env file variables.
 */
export function loadDotEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  return parseDotEnv(readFileSync(path, 'utf8'));
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npx vitest run tests/dotenv/loader.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dotenv/loader.ts tests/dotenv/loader.test.ts
git commit -m "feat: minimal .env file parser (zero dependencies)"
```

---

## Task 7: createEnv — Main API

**Files:**
- Create: `src/core/createEnv.ts`
- Create: `src/index.ts`
- Create: `tests/core/createEnv.test.ts`

- [ ] **Step 1: Write failing tests (`tests/core/createEnv.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { createEnv } from '../../src/core/createEnv.js';
import { REDACTED } from '../../src/guard/redact.js';

describe('createEnv — validation', () => {
  it('returns typed values', () => {
    const env = createEnv(
      { HOST: 'string', PORT: 'number', DEBUG: 'boolean' },
      { env: { HOST: 'localhost', PORT: '8080', DEBUG: 'true' } },
    );
    expect(env.HOST).toBe('localhost');
    expect(env.PORT).toBe(8080);
    expect(env.DEBUG).toBe(true);
  });

  it('throws on missing required variable', () => {
    expect(() => createEnv({ SECRET: 'string' }, { env: {} }))
      .toThrow('Missing required env variable: SECRET');
  });

  it('returns undefined for missing optional', () => {
    expect(createEnv({ PORT: 'number?' }, { env: {} }).PORT).toBeUndefined();
  });

  it('applies default values', () => {
    const env = createEnv(
      { PORT: { type: 'number?', default: 3000 } },
      { env: {} },
    );
    expect(env.PORT).toBe(3000);
  });
});

describe('createEnv — secret detection warnings', () => {
  it('warns to console.warn when a non-secret var has a secret-looking value', () => {
    const warns: string[] = [];
    const orig = console.warn;
    console.warn = (msg: string) => warns.push(msg);
    createEnv({ HOST: 'string' }, { env: { HOST: 'sk-abc123def456ghij' } });
    console.warn = orig;
    expect(warns.some(w => w.includes('HOST'))).toBe(true);
  });
});

describe('createEnv — redaction', () => {
  it('redacts values in JSON.stringify', () => {
    const env = createEnv(
      { API_KEY: 'string' },
      { redact: true, env: { API_KEY: 'sk-secret' } },
    );
    expect(JSON.stringify(env)).not.toContain('sk-secret');
    expect(JSON.stringify(env)).toContain(REDACTED);
  });

  it('redacts in template literals', () => {
    const env = createEnv(
      { API_KEY: 'string' },
      { redact: true, env: { API_KEY: 'sk-secret' } },
    );
    expect(`${env}`).not.toContain('sk-secret');
  });

  it('returns real value for runtime access', () => {
    const env = createEnv(
      { API_KEY: 'string' },
      { redact: true, env: { API_KEY: 'sk-secret' } },
    );
    expect(env.API_KEY).toBe('sk-secret');
  });

  it('always redacts keys marked secret: true', () => {
    const env = createEnv(
      { API_KEY: { type: 'string', secret: true } },
      { redact: true, env: { API_KEY: 'sk-secret' } },
    );
    expect(env.API_KEY).toBe(REDACTED);
  });
});

describe('createEnv — TypeScript types', () => {
  it('infers correct types', () => {
    const env = createEnv(
      { NAME: 'string', PORT: 'number?', FLAG: 'boolean' },
      { env: { NAME: 'test', FLAG: 'true' } },
    );
    const name: string = env.NAME;
    const port: number | undefined = env.PORT;
    const flag: boolean = env.FLAG;
    expect(name).toBe('test');
    expect(port).toBeUndefined();
    expect(flag).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/core/createEnv.test.ts
```

Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Implement `src/core/createEnv.ts`**

```ts
import { parseEnv } from './parser.js';
import type { EnvSchema, InferEnv, CreateEnvOptions, SchemaDescriptor } from './types.js';
import { createRedactedProxy } from '../guard/proxy.js';
import { looksLikeSecret } from '../guard/redact.js';
import { loadDotEnvFile } from '../dotenv/loader.js';

function getSecretKeys(schema: EnvSchema): Set<string> {
  const keys = new Set<string>();
  for (const [key, entry] of Object.entries(schema)) {
    if (typeof entry !== 'string' && (entry as SchemaDescriptor).secret === true) {
      keys.add(key);
    }
  }
  return keys;
}

function warnIfSecretLooking(schema: EnvSchema, parsed: Record<string, unknown>): void {
  const secretKeys = getSecretKeys(schema);
  for (const [key, value] of Object.entries(parsed)) {
    if (secretKeys.has(key)) continue; // already marked secret — no need to warn
    if (typeof value === 'string' && looksLikeSecret(value)) {
      console.warn(
        `[envfort] ⚠️  ${key} looks like a secret. Consider marking it secret: true in the schema.`,
      );
    }
  }
}

/**
 * Validates env variables against a schema, returning a fully-typed,
 * optionally-redacted environment object.
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

  if (options.env) {
    rawEnv = options.env;
  } else {
    rawEnv = { ...(process.env as Record<string, string | undefined>) };
    if (options.loadDotEnv) {
      const fileVars = loadDotEnvFile(options.dotEnvPath ?? '.env');
      // process.env takes precedence over .env file
      rawEnv = { ...fileVars, ...rawEnv };
    }
  }

  const parsed = parseEnv(schema, rawEnv);

  // Warn about non-secret keys with secret-looking values
  warnIfSecretLooking(schema, parsed as Record<string, unknown>);

  if (options.redact) {
    const secretKeys = getSecretKeys(schema);
    return createRedactedProxy(parsed, secretKeys);
  }

  // Always freeze the env object to prevent accidental mutation
  return Object.freeze(parsed) as InferEnv<S>;
}
```

- [ ] **Step 4: Create `src/index.ts`**

```ts
export { createEnv } from './core/createEnv.js';
export type {
  EnvSchema,
  SchemaEntry,
  SchemaDescriptor,
  InferEnv,
  CreateEnvOptions,
} from './core/types.js';
export { REDACTED, looksLikeSecret } from './guard/redact.js';
```

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: All PASS.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/core/createEnv.ts src/index.ts tests/core/createEnv.test.ts
git commit -m "feat: createEnv — validation, redaction, dotenv loading, secret warnings, freeze"
```

---

## Task 8: CLI Commands

**Files:**
- Create: `src/cli/index.ts`
- Create: `src/cli/check.ts`
- Create: `src/cli/init.ts`
- Create: `src/cli/gen-example.ts`
- Create: `src/cli/install-hook.ts`
- Create: `tests/cli/cli.test.ts`

Commands:
- `check [--schema <path>]` — validate env against schema file
- `init [--output <path>]` — generate schema file
- `gen-example [--schema <path>] [--output <path>]` — generate `.env.example`
- `install-hook` — install git pre-commit hook + fix `.gitignore`

- [ ] **Step 1: Create `src/cli/check.ts`**

```ts
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
```

- [ ] **Step 2: Create `src/cli/init.ts`**

```ts
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
```

- [ ] **Step 3: Create `src/cli/gen-example.ts`**

```ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EnvSchema, SchemaDescriptor } from '../core/types.js';

export function runGenExample(flags: Record<string, string>): void {
  const schemaPath = resolve(flags['schema'] ?? 'env-schema.json');
  const outputPath = resolve(flags['output'] ?? '.env.example');

  if (!existsSync(schemaPath)) {
    process.stderr.write(`❌ Schema file not found: ${schemaPath}\n`);
    process.exit(1);
  }

  const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as EnvSchema;

  const lines: string[] = [
    '# Generated by envfort',
    '# Fill in real values and rename to .env (never commit .env)',
    '',
  ];

  for (const [key, entry] of Object.entries(schema)) {
    const isDescriptor = typeof entry !== 'string';
    const descriptor = isDescriptor ? (entry as SchemaDescriptor) : null;
    const typeStr = isDescriptor ? descriptor!.type : entry;
    const isOptional = typeStr.endsWith('?');
    const hasDefault = descriptor?.default !== undefined;
    const isSecret = descriptor?.secret === true;

    const comment = [
      isOptional ? 'optional' : 'required',
      hasDefault ? `default: ${String(descriptor!.default)}` : null,
      isSecret ? 'SECRET — never log or share' : null,
    ].filter(Boolean).join(', ');

    lines.push(`# ${comment}`);
    lines.push(`${key}=`);
    lines.push('');
  }

  writeFileSync(outputPath, lines.join('\n'));
  process.stdout.write(`✅ Created ${outputPath}\n`);
  process.stdout.write(`   Fill in values and rename to .env\n`);
  process.stdout.write(`   ⚠️  Never commit .env — only commit .env.example\n`);
}
```

- [ ] **Step 4: Create `src/cli/install-hook.ts`**

```ts
import {
  writeFileSync, readFileSync, existsSync, mkdirSync, chmodSync,
} from 'node:fs';
import { resolve, join } from 'node:path';

const HOOK_CONTENT = `#!/bin/sh
# envfort pre-commit hook
# Auto-installed by: npx envfort install-hook

# 1. Block .env files from being committed
STAGED=$(git diff --cached --name-only 2>/dev/null)
for FILE in $STAGED; do
  BASENAME=$(basename "$FILE")
  case "$BASENAME" in
    .env|.env.local|.env.development|.env.production|.env.staging)
      echo "❌ envfort: Blocked commit of secret file: $FILE"
      echo "   Remove it from staging: git rm --cached $FILE"
      echo "   Commit .env.example instead."
      exit 1
      ;;
  esac
done

# 2. Validate env against schema (if schema exists)
if [ -f "env-schema.json" ]; then
  if command -v npx >/dev/null 2>&1; then
    npx envfort check --schema env-schema.json
    if [ $? -ne 0 ]; then
      echo "❌ envfort: Fix missing env variables before committing."
      exit 1
    fi
  fi
fi

exit 0
`;

function ensureGitIgnoreProtected(projectRoot: string): void {
  const gitignorePath = join(projectRoot, '.gitignore');
  const envPatterns = ['.env', '.env.*', '!.env.example'];

  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, envPatterns.join('\n') + '\n');
    process.stdout.write(`✅ Created .gitignore with .env protection\n`);
    return;
  }

  const content = readFileSync(gitignorePath, 'utf8');
  const missing = envPatterns.filter(p => !content.includes(p));

  if (missing.length > 0) {
    writeFileSync(gitignorePath, content.trimEnd() + '\n\n# envfort\n' + missing.join('\n') + '\n');
    process.stdout.write(`✅ Added .env patterns to .gitignore: ${missing.join(', ')}\n`);
  } else {
    process.stdout.write(`✅ .gitignore already protects .env files\n`);
  }
}

export function runInstallHook(flags: Record<string, string>): void {
  const projectRoot = resolve(flags['root'] ?? '.');
  const gitDir = join(projectRoot, '.git');
  const hooksDir = join(gitDir, 'hooks');
  const hookPath = join(hooksDir, 'pre-commit');

  if (!existsSync(gitDir)) {
    process.stderr.write(`❌ No .git directory found at: ${projectRoot}\n`);
    process.stderr.write(`   Run this command from the root of a git repository.\n`);
    process.exit(1);
  }

  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, 'utf8');
    if (existing.includes('envfort')) {
      process.stdout.write(`✅ envfort hook already installed at ${hookPath}\n`);
    } else {
      // Append to existing hook
      writeFileSync(hookPath, existing.trimEnd() + '\n\n' + HOOK_CONTENT);
      process.stdout.write(`✅ Appended envfort checks to existing hook: ${hookPath}\n`);
    }
  } else {
    writeFileSync(hookPath, HOOK_CONTENT);
    chmodSync(hookPath, 0o755);
    process.stdout.write(`✅ Installed pre-commit hook: ${hookPath}\n`);
  }

  ensureGitIgnoreProtected(projectRoot);

  process.stdout.write(`\n🔐 Git is now protected:\n`);
  process.stdout.write(`   • .env files are blocked from commits\n`);
  process.stdout.write(`   • env variables validated before each commit\n`);
  process.stdout.write(`   • .gitignore updated to exclude .env files\n`);
}
```

- [ ] **Step 5: Create `src/cli/index.ts`**

```ts
import { runCheck } from './check.js';
import { runInit } from './init.js';
import { runGenExample } from './gen-example.js';
import { runInstallHook } from './install-hook.js';

function printUsage(): void {
  process.stdout.write(`envfort CLI

Commands:
  check        [--schema <path>]              Validate env against a schema file
  init         [--output <path>]              Generate a sample schema file
  gen-example  [--schema <path>]              Generate a .env.example file
               [--output <path>]
  install-hook [--root <path>]               Install git pre-commit hook + fix .gitignore
`);
}

function parseArgs(argv: string[]): { command: string; flags: Record<string, string> } {
  const [command = '', ...rest] = argv;
  const flags: Record<string, string> = {};

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === undefined) break;
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const val = rest[i + 1];
      if (val === undefined || val.startsWith('--')) {
        process.stderr.write(`❌ Flag --${key} requires a value\n`);
        process.exit(1);
      }
      flags[key] = val;
      i++;
    }
  }

  return { command, flags };
}

const { command, flags } = parseArgs(process.argv.slice(2));

switch (command) {
  case 'check':        runCheck(flags); break;
  case 'init':         runInit(flags); break;
  case 'gen-example':  runGenExample(flags); break;
  case 'install-hook': runInstallHook(flags); break;
  default:
    printUsage();
    if (command) process.exit(1);
}
```

- [ ] **Step 6: Write CLI tests (`tests/cli/cli.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = join(process.cwd(), 'dist/cli/index.js');

/** Run CLI via spawnSync — no shell, no injection risk. */
function runCli(args: string[], envVars: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    env: { PATH: process.env['PATH'] ?? '', ...envVars },
    encoding: 'utf8',
  });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', code: result.status ?? 1 };
}

describe('check command', () => {
  it('exits 0 when all required vars present', () => {
    const schema = join(tmpdir(), `schema-${Date.now()}.json`);
    writeFileSync(schema, JSON.stringify({ HOST: 'string', PORT: 'number' }));
    const { stdout, code } = runCli(['check', '--schema', schema], { HOST: 'localhost', PORT: '3000' });
    unlinkSync(schema);
    expect(code).toBe(0);
    expect(stdout).toContain('✅');
  });

  it('exits 1 and names the missing variable', () => {
    const schema = join(tmpdir(), `schema-${Date.now()}.json`);
    writeFileSync(schema, JSON.stringify({ HOST: 'string' }));
    const { stderr, code } = runCli(['check', '--schema', schema]);
    unlinkSync(schema);
    expect(code).toBe(1);
    expect(stderr).toContain('HOST');
  });

  it('exits 1 when schema not found', () => {
    const { stderr, code } = runCli(['check', '--schema', '/tmp/nonexistent-xyz.json']);
    expect(code).toBe(1);
    expect(stderr).toContain('not found');
  });
});

describe('init command', () => {
  it('creates a schema file', () => {
    const out = join(tmpdir(), `schema-${Date.now()}.json`);
    const { stdout, code } = runCli(['init', '--output', out]);
    expect(code).toBe(0);
    expect(existsSync(out)).toBe(true);
    expect(stdout).toContain('✅');
    unlinkSync(out);
  });

  it('exits 1 if file already exists', () => {
    const out = join(tmpdir(), `schema-${Date.now()}.json`);
    writeFileSync(out, '{}');
    const { stderr, code } = runCli(['init', '--output', out]);
    expect(code).toBe(1);
    expect(stderr).toContain('already exists');
    unlinkSync(out);
  });
});

describe('gen-example command', () => {
  it('generates a .env.example from schema', () => {
    const schema = join(tmpdir(), `schema-${Date.now()}.json`);
    const output = join(tmpdir(), `env-example-${Date.now()}.txt`);
    writeFileSync(schema, JSON.stringify({ API_KEY: { type: 'string', secret: true }, PORT: 'number?' }));
    const { stdout, code } = runCli(['gen-example', '--schema', schema, '--output', output]);
    expect(code).toBe(0);
    const content = readFileSync(output, 'utf8');
    expect(content).toContain('API_KEY=');
    expect(content).toContain('SECRET');
    expect(content).toContain('PORT=');
    unlinkSync(schema);
    unlinkSync(output);
  });
});

describe('install-hook command', () => {
  it('installs pre-commit hook and updates .gitignore', () => {
    // Set up a fake git repo in a temp dir
    const dir = join(tmpdir(), `repo-${Date.now()}`);
    mkdirSync(join(dir, '.git', 'hooks'), { recursive: true });
    const { stdout, code } = runCli(['install-hook', '--root', dir]);
    expect(code).toBe(0);
    expect(stdout).toContain('✅');
    expect(existsSync(join(dir, '.git', 'hooks', 'pre-commit'))).toBe(true);
    const hookContent = readFileSync(join(dir, '.git', 'hooks', 'pre-commit'), 'utf8');
    expect(hookContent).toContain('envfort');
    rmSync(dir, { recursive: true });
  });

  it('exits 1 when not in a git repo', () => {
    const dir = join(tmpdir(), `no-git-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const { stderr, code } = runCli(['install-hook', '--root', dir]);
    expect(code).toBe(1);
    expect(stderr).toContain('No .git directory');
    rmSync(dir, { recursive: true });
  });
});

describe('flag validation', () => {
  it('exits 1 when --schema has no value', () => {
    const { stderr, code } = runCli(['check', '--schema']);
    expect(code).toBe(1);
    expect(stderr).toContain('requires a value');
  });
});

describe('unknown command', () => {
  it('prints usage and exits 1', () => {
    const { stdout, code } = runCli(['unknown-command']);
    expect(code).toBe(1);
    expect(stdout).toContain('Commands:');
  });
});
```

- [ ] **Step 7: Build and make CLI executable**

```bash
npx tsup && chmod +x dist/cli/index.js
```

- [ ] **Step 8: Smoke-test manually**

```bash
node dist/cli/index.js
node dist/cli/index.js init --output /tmp/test-schema.json
node dist/cli/index.js gen-example --schema /tmp/test-schema.json --output /tmp/test.env.example
cat /tmp/test.env.example
node dist/cli/index.js install-hook --root .
cat .git/hooks/pre-commit
```

- [ ] **Step 9: Run CLI tests**

```bash
npx vitest run tests/cli/cli.test.ts
```

Expected: All PASS.

- [ ] **Step 10: Commit**

```bash
git add src/cli/ tests/cli/cli.test.ts
git commit -m "feat: CLI — check, init, gen-example, install-hook with git safety"
```

---

## Task 9: GitHub Actions CI/CD

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/publish.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    name: Test (Node ${{ matrix.node-version }})
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18, 20, 22]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run typecheck

      - name: Build
        run: npm run build

      - name: Test
        run: npm test

      - name: Upload coverage
        if: matrix.node-version == 20
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
```

- [ ] **Step 2: Create `.github/workflows/publish.yml`**

```yaml
name: Publish to npm

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write  # for npm provenance

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Verify tests pass
        run: npm test

      - name: Publish
        run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 3: Commit**

```bash
mkdir -p .github/workflows
git add .github/workflows/ci.yml .github/workflows/publish.yml
git commit -m "ci: add GitHub Actions — test matrix and npm auto-publish on tag"
```

---

## Task 10: Example File

**Files:**
- Create: `example/index.ts`

- [ ] **Step 1: Create `example/index.ts`**

```ts
/**
 * envfort — Complete Example
 *
 * Run:  npx tsx example/index.ts
 */
import { createEnv } from '../src/index.js';

const env = createEnv(
  {
    DATABASE_URL: 'string',
    API_KEY: { type: 'string', secret: true },   // always redacted, even on env.API_KEY
    PORT: { type: 'number?', default: 3000 },
    DEBUG: { type: 'boolean?', default: false },
  },
  {
    redact: true,
    env: {
      DATABASE_URL: 'postgres://localhost:5432/mydb',
      API_KEY: 'sk-super-secret-key',
      // PORT and DEBUG omitted — defaults apply
    },
  },
);

// ─── Runtime usage ────────────────────────────────────────────────────────────
console.log(`Starting on port ${env.PORT}...`);    // 3000 (number, not secret)
const dbUrl: string = env.DATABASE_URL;             // real value, usable in code

// ─── Accidental whole-object log — SAFE ──────────────────────────────────────
console.log('Config:', env);
// { DATABASE_URL: '***REDACTED***', API_KEY: '***REDACTED***', PORT: '***REDACTED***' }

// ─── Template literal coercion — SAFE ────────────────────────────────────────
const msg = `Sending config to AI: ${env}`;
console.log(msg);
// "Sending config to AI: [redacted env — use env.KEY to access individual values]"

// ─── JSON.stringify — SAFE ────────────────────────────────────────────────────
const payload = JSON.stringify({ config: env });
console.log('Payload:', payload);
// {"config":{"DATABASE_URL":"***REDACTED***","API_KEY":"***REDACTED***",...}}

// ─── secret: true key — ALWAYS REDACTED ──────────────────────────────────────
console.log('API_KEY direct access:', env.API_KEY);
// ***REDACTED***  (because secret: true)

// ─── Non-secret key — real value for runtime ─────────────────────────────────
console.log('DB URL (first 20 chars):', dbUrl.slice(0, 20) + '...');
```

- [ ] **Step 2: Commit**

```bash
git add example/index.ts
git commit -m "docs: add complete example showing all redaction paths and secret keys"
```

---

## Task 11: Build Verification

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Build**

```bash
npx tsup
```

Expected: `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, `dist/index.d.cts`, `dist/cli/index.js`.

- [ ] **Step 4: Dry-run publish**

```bash
npm pack --dry-run
```

Expected: Only `dist/` files and `README.md` listed.

- [ ] **Step 5: End-to-end smoke test**

```bash
# Write a schema
printf '{"DATABASE_URL":"string","API_KEY":{"type":"string","secret":true},"PORT":{"type":"number?","default":3000}}' > /tmp/smoke-schema.json

# Validate with real vars
DATABASE_URL=postgres://localhost API_KEY=sk-test node dist/cli/index.js check --schema /tmp/smoke-schema.json

# Generate .env.example
node dist/cli/index.js gen-example --schema /tmp/smoke-schema.json --output /tmp/smoke.env.example
cat /tmp/smoke.env.example
```

Expected:
- `✅ All environment variables are valid.`
- `.env.example` contains `API_KEY=` with `# SECRET — never log or share` comment

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: v0.1.0 — verified build, types, CLI, CI workflows"
```

---

## Architecture for Future Roadmap

| Feature | Extension Point | Effort |
|---|---|---|
| `scan` command | New `src/cli/scan.ts` — walks JS/TS files, finds unguarded `process.env.X` | Medium |
| Validation rules (`{ pattern: /^sk-/ }`) | New field in `SchemaDescriptor`, new branch in `coerce()` in `parser.ts` | Low |
| AI-safe mode (intercept HTTP/LLM SDKs) | New `src/guard/ai-intercept.ts` — monkey-patches `fetch` to scan request bodies | Medium |
| SaaS dashboard reporting | New `reportTo` in `CreateEnvOptions` → `src/integrations/remote.ts` | High |
| CI integration | `check` already exits 1 — works today in any CI pipeline | Done |
| Framework adapters | New `src/adapters/nextjs.ts`, `src/adapters/express.ts` — thin wrappers | Low |
