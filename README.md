# env-safe-guard

> Type-safe environment validation with automatic secret redaction — built for the AI era.

[![npm version](https://img.shields.io/npm/v/@akashjavali/env-safe-guard?style=flat-square)](https://www.npmjs.com/package/@akashjavali/env-safe-guard)
[![npm downloads](https://img.shields.io/npm/dm/@akashjavali/env-safe-guard?style=flat-square)](https://www.npmjs.com/package/@akashjavali/env-safe-guard)
[![license](https://img.shields.io/npm/l/@akashjavali/env-safe-guard?style=flat-square)](./LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/akashjavali/env-safe-guard/ci.yml?style=flat-square&label=CI)](https://github.com/akashjavali/env-safe-guard/actions)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@akashjavali/env-safe-guard?style=flat-square)](https://bundlephobia.com/package/@akashjavali/env-safe-guard)

---

## Why env-safe-guard?

AI coding assistants — Claude, Copilot, Cursor, ChatGPT — read your terminal output, error logs, and clipboard. Every time you `console.log(process.env)` or paste a stack trace into a chat window, you risk leaking database credentials, API keys, and tokens to a third-party model.

`env-safe-guard` intercepts your environment object at the JavaScript layer using a `Proxy`. Secrets are **validated and typed at startup**, then **redacted everywhere they could accidentally escape** — logs, JSON serialization, template literals, error messages — while remaining fully accessible as raw values in your actual application code. Zero runtime overhead on hot paths. Zero extra dependencies for `.env` loading.

---

## Features

- **Fail-fast validation** — throws a clear error at boot if required variables are missing or have the wrong type
- **Full TypeScript inference** — `env.PORT` is typed as `number`, `env.DEBUG` as `boolean | undefined`, automatically
- **Secret redaction via Proxy** — `console.log(env)`, `JSON.stringify(env)`, and template literals all produce `***REDACTED***` for marked fields
- **Always-redacted secrets** — `secret: true` fields are redacted even on direct access (`env.API_KEY` returns `***REDACTED***`)
- **Optional fields + defaults** — use `'number?'` with a `default` to express exactly what your schema means
- **Zero-dependency `.env` loading** — built-in loader, no `dotenv` required
- **CLI toolkit** — validate, scaffold, and lock down your env from the command line
- **Git pre-commit hook** — blocks commits that introduce unprotected secrets
- **Cross-runtime support** — Node 18+, Cloudflare Workers, Deno, Bun via `options.env`

---

## Installation

```bash
# npm
npm install @akashjavali/env-safe-guard

# yarn
yarn add @akashjavali/env-safe-guard

# pnpm
pnpm add @akashjavali/env-safe-guard

# bun
bun add @akashjavali/env-safe-guard
```

---

## Quick Start

```ts
import { createEnv } from '@akashjavali/env-safe-guard'

export const env = createEnv({
  DATABASE_URL: 'string',
  API_KEY: { type: 'string', secret: true },
  PORT: { type: 'number?', default: 3000 },
  DEBUG: { type: 'boolean?', default: false },
}, { redact: true })
```

That's it. Import `env` anywhere in your app and get fully typed, validated, redaction-safe access to your environment.

---

## API Reference

### `createEnv(schema, options?)`

#### Schema Types

| Syntax | TypeScript type | Behaviour |
|---|---|---|
| `'string'` | `string` | Required. Throws if absent. |
| `'number'` | `number` | Required. Parsed with `Number()`. Throws if `NaN`. |
| `'boolean'` | `boolean` | Required. `'true'`/`'1'` → `true`, `'false'`/`'0'` → `false`. |
| `'string?'` | `string \| undefined` | Optional. Returns `undefined` if absent. |
| `'number?'` | `number \| undefined` | Optional. Returns `undefined` if absent. |
| `'boolean?'` | `boolean \| undefined` | Optional. Returns `undefined` if absent. |
| `{ type: 'string', secret: true }` | `'***REDACTED***'` | Always redacted, even on direct access. |
| `{ type: 'number?', default: 3000 }` | `number` | Optional with fallback. Never `undefined`. |
| `{ type: 'boolean?', default: false }` | `boolean` | Optional with fallback. Never `undefined`. |

#### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `redact` | `boolean` | `false` | Enable Proxy-based redaction for `console.log`, `JSON.stringify`, and string coercion. |
| `loadDotEnv` | `boolean` | `false` | Parse and load a `.env` file before validation. Zero external dependencies. |
| `dotEnvPath` | `string` | `'.env'` | Path to the `.env` file. Only used when `loadDotEnv: true`. |
| `env` | `Record<string, string \| undefined>` | `process.env` | Override the source environment. Useful for tests and non-Node runtimes. |

#### TypeScript inference example

```ts
import { createEnv } from '@akashjavali/env-safe-guard'

export const env = createEnv({
  DATABASE_URL: 'string',
  API_KEY: { type: 'string', secret: true },
  PORT: { type: 'number?', default: 3000 },
  DEBUG: { type: 'boolean?', default: false },
}, { redact: true })

// Inferred types:
env.DATABASE_URL  // string
env.API_KEY       // '***REDACTED***'  (always, by design)
env.PORT          // number            (never undefined — has a default)
env.DEBUG         // boolean           (never undefined — has a default)
```

---

## Redaction Table

When `redact: true` is set, `env` becomes a `Proxy`. Every access path that could cause a secret to escape is intercepted:

| Access pattern | Result |
|---|---|
| `env.DATABASE_URL` | Real value (use freely in code) |
| `env.API_KEY` where `secret: true` | `***REDACTED***` always |
| `console.log(env)` | `{ DATABASE_URL: 'postgres://...', API_KEY: '***REDACTED***', PORT: 3000, ... }` |
| `JSON.stringify(env)` | `{"DATABASE_URL":"postgres://...","API_KEY":"***REDACTED***","PORT":3000,...}` |
| `JSON.stringify({ config: env })` | Safe — nested serialization is also intercepted |
| `` `Config: ${env}` `` | `[redacted env — use env.KEY]` |
| `String(env)` | `[redacted env — use env.KEY]` |
| `console.log(env.API_KEY)` | `***REDACTED***` |
| Error stack traces that include `env` | Redacted object representation |

**The rule of thumb:** read individual keys (`env.DATABASE_URL`) in your business logic — they return real values for non-secret fields. Never spread or serialize the whole `env` object; the Proxy has you covered if you forget.

---

## CLI Reference

All commands are available via `npx` with no installation required.

### `check` — Validate your environment

Reads your schema and current `.env`, reports missing or invalid variables.

```bash
npx @akashjavali/env-safe-guard check
npx @akashjavali/env-safe-guard check --schema ./config/env.schema.ts
```

### `init` — Generate a schema file

Scaffolds a `env.ts` schema file from your existing `.env`.

```bash
npx @akashjavali/env-safe-guard init
npx @akashjavali/env-safe-guard init --output ./src/env.ts
```

### `gen-example` — Generate `.env.example`

Produces a `.env.example` with all keys present and secret values replaced by placeholders.

```bash
npx @akashjavali/env-safe-guard gen-example
npx @akashjavali/env-safe-guard gen-example --schema ./src/env.ts --output .env.example
```

### `install-hook` — Install git pre-commit hook

Installs a pre-commit hook that runs `check` before every commit and ensures `.env` is in `.gitignore`.

```bash
npx @akashjavali/env-safe-guard install-hook
npx @akashjavali/env-safe-guard install-hook --root ./packages/api
```

After installation, commits that would expose unprotected secrets are automatically blocked.

---

## Framework Examples

### Next.js (App Router)

Create `src/env.ts` and import it in `next.config.ts` to validate at build time.

```ts
// src/env.ts
import { createEnv } from '@akashjavali/env-safe-guard'

export const env = createEnv({
  DATABASE_URL: 'string',
  NEXTAUTH_SECRET: { type: 'string', secret: true },
  NEXT_PUBLIC_APP_URL: 'string',
  NODE_ENV: 'string',
}, { redact: true })
```

```ts
// next.config.ts
import './src/env'  // validates at build time — bad config fails the build
import type { NextConfig } from 'next'

const config: NextConfig = {
  // ...
}
export default config
```

```ts
// app/api/route.ts
import { env } from '@/env'

export async function GET() {
  const db = await connect(env.DATABASE_URL)  // typed as string
  // ...
}
```

### Express

```ts
// src/env.ts
import { createEnv } from '@akashjavali/env-safe-guard'

export const env = createEnv({
  DATABASE_URL: 'string',
  JWT_SECRET: { type: 'string', secret: true },
  PORT: { type: 'number?', default: 3000 },
}, { redact: true, loadDotEnv: true })
```

```ts
// src/index.ts
import express from 'express'
import { env } from './env'

const app = express()

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`)
  // If you accidentally log env here, secrets stay redacted
})
```

### Plain Node.js with `loadDotEnv`

```ts
import { createEnv } from '@akashjavali/env-safe-guard'

const env = createEnv({
  STRIPE_SECRET_KEY: { type: 'string', secret: true },
  WEBHOOK_URL: 'string',
  RETRY_LIMIT: { type: 'number?', default: 3 },
}, {
  redact: true,
  loadDotEnv: true,
  dotEnvPath: '.env.local',
})

console.log(env.RETRY_LIMIT)       // 3 (number)
console.log(env.STRIPE_SECRET_KEY) // ***REDACTED***
```

---

## Cross-Environment Support

`env-safe-guard` is not tied to Node's `process.env`. Pass any environment source via `options.env`.

### Cloudflare Workers

```ts
// worker.ts
import { createEnv } from '@akashjavali/env-safe-guard'

export default {
  async fetch(request: Request, cfEnv: Env) {
    const env = createEnv({
      API_KEY: { type: 'string', secret: true },
      UPSTREAM_URL: 'string',
    }, {
      redact: true,
      env: cfEnv as Record<string, string>,
    })

    // env is fully validated and redacted
  }
}
```

### Deno

```ts
import { createEnv } from 'npm:@akashjavali/env-safe-guard'

const env = createEnv({
  DATABASE_URL: 'string',
  PORT: { type: 'number?', default: 8000 },
}, {
  redact: true,
  env: Deno.env.toObject(),
})
```

### Bun

```ts
import { createEnv } from '@akashjavali/env-safe-guard'

const env = createEnv({
  DATABASE_URL: 'string',
  SECRET_KEY: { type: 'string', secret: true },
}, {
  redact: true,
  env: Bun.env as Record<string, string | undefined>,
})
```

### Testing

Inject a fake environment in your test suite without touching `process.env`:

```ts
import { createEnv } from '@akashjavali/env-safe-guard'

const env = createEnv({
  DATABASE_URL: 'string',
  FEATURE_FLAG: { type: 'boolean?', default: false },
}, {
  env: {
    DATABASE_URL: 'postgres://localhost/test',
    FEATURE_FLAG: 'true',
  },
})
```

---

## Git Safety

Install the pre-commit hook once per repository:

```bash
npx @akashjavali/env-safe-guard install-hook
```

This does two things:

1. Adds a `.git/hooks/pre-commit` script that runs `env-safe-guard check` before every commit. If your environment schema is invalid or variables are missing, the commit is blocked with a clear message.
2. Audits `.gitignore` and ensures `.env` (and common variants) are listed. If they are missing, it adds them automatically.

For monorepos, point it at the package root:

```bash
npx @akashjavali/env-safe-guard install-hook --root ./packages/api
```

---

## Comparison

| Feature | dotenv | envalid | @t3-oss/env-nextjs | Doppler | **env-safe-guard** |
|---|---|---|---|---|---|
| Load `.env` | Yes | No | No | No | Yes (built-in, zero deps) |
| Validate schema | No | Yes | Yes | No | Yes |
| TypeScript inference | No | Partial | Yes | No | Yes |
| Optional + defaults | No | Yes | Yes | No | Yes |
| Secret redaction | No | No | No | No | **Yes** |
| `console.log` safe | No | No | No | No | **Yes** |
| `JSON.stringify` safe | No | No | No | No | **Yes** |
| Template literal safe | No | No | No | No | **Yes** |
| Always-redacted fields | No | No | No | No | **Yes** |
| CLI toolkit | No | No | No | Yes | Yes |
| Git hook | No | No | No | No | Yes |
| Zero external deps | No | No | No | No | **Yes** |
| Works outside Node | No | No | No | No | **Yes** |

---

## How It Works

`createEnv` validates and coerces all environment values at call time. If validation passes, it returns a **JavaScript `Proxy`** wrapping a plain object of the parsed values.

The Proxy intercepts:

- **Property access (`get`)** — returns `***REDACTED***` for `secret: true` fields; returns real values for everything else.
- **`ownKeys` + `getOwnPropertyDescriptor`** — called by `JSON.stringify` and spread operators. The Proxy returns redacted representations for secret fields.
- **`Symbol.toPrimitive` / `toString` / `valueOf`** — called when the object is coerced to a string (template literals, `String()`, `+` operator). Returns a safe sentinel message instead of exposing any values.

This means **you never need to call a helper function** to safely log your config. The object itself is safe by construction whenever `redact: true` is set.

The Proxy layer is allocated once at startup and adds no overhead to individual property access in hot code paths.

---

## Roadmap

- **Secret leak scanner** — static analysis pass that finds raw `process.env` access in your codebase
- **AI agent firewall** — intercept MCP tool calls and sanitize environment context before it reaches an AI model
- **Team sync SaaS** — encrypted shared env for teams, with per-developer overrides and audit logs
- **Schema export** — emit a JSON Schema or Zod schema from your `createEnv` definition
- **CI integration** — GitHub Action that runs `check` on every pull request

---

## Contributing

Contributions are welcome. Please open an issue to discuss significant changes before submitting a pull request.

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes with tests
4. Run the test suite: `npm test`
5. Submit a pull request

Please follow the existing code style and keep commits focused.

---

## License

MIT — see [LICENSE](./LICENSE) for details.

---

> If `env-safe-guard` has saved you from an accidental secret leak, consider giving it a star. It helps others find the project.
