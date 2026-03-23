# CLAUDE.md — env-safe-guard

This file provides project context, architecture decisions, and conventions for Claude Code when working on this repository.

---

## Project Overview

env-safe-guard is an npm package that:

- Validates env variables against a schema (string, number, boolean, optional via "?", rich descriptors with default/secret)
- Provides full TypeScript type inference from schema
- Redacts secrets in ALL serialization contexts (JSON.stringify, console.log, template literals, String())
- Variables marked `secret: true` are always redacted even on direct access
- Detects secret-looking values (sk-, ghp_, Bearer, AKIA, etc.) and warns
- Has a CLI: check, init, gen-example, install-hook (git pre-commit hook)
- Loads .env files optionally (zero deps, custom parser)
- Target: zero runtime dependencies, Node 18+, ESM + CJS dual output

---

## Tech Stack

- TypeScript 5 (strict mode, exactOptionalPropertyTypes, noUncheckedIndexedAccess)
- tsup for building (ESM + CJS + .d.ts + .d.cts)
- Vitest for testing
- Node.js 18+ (no external runtime deps)

---

## File Structure

```
src/
  core/
    types.ts          - All TypeScript types (SchemaEntry, InferEnv, CreateEnvOptions, etc.)
    parser.ts         - Schema parsing, coercion, defaults, batch error collection
    createEnv.ts      - Main API, ties parser+proxy+loader, secret warnings, Object.freeze
  guard/
    redact.ts         - REDACTED constant, looksLikeSecret() pattern detector
    proxy.ts          - createRedactedProxy() — intercepts toJSON, inspect.custom, toString, Symbol.toPrimitive, secret keys
  dotenv/
    loader.ts         - parseDotEnv(), loadDotEnvFile() — zero deps .env parser
  cli/
    index.ts          - CLI router + parseArgs()
    check.ts          - check command
    init.ts           - init command
    gen-example.ts    - gen-example command
    install-hook.ts   - install-hook command (git pre-commit + .gitignore)
  index.ts            - Public barrel export
tests/                - Mirrors src/ structure
example/index.ts      - Runnable demo
.github/workflows/    - CI + publish
```

---

## Commands

| Command | Description |
|---|---|
| `npm run build` | tsup (produces dist/) |
| `npm test` | vitest run (all tests) |
| `npm run test:watch` | vitest in watch mode |
| `npm run typecheck` | tsc --noEmit |
| `npm run dev` | tsup --watch |

---

## Architecture Decisions

### REDACTED Sentinel
- `REDACTED = "***REDACTED***"` — constant string, never changes
- Used as the replacement value in all serialization contexts for secrets

### Proxy Interception Strategy
`createRedactedProxy()` intercepts the following to ensure secrets never leak:

| Intercept | Context |
|---|---|
| `toJSON` | `JSON.stringify()` |
| `util.inspect.custom` | `console.log()` |
| `toString` | `String()` |
| `Symbol.toPrimitive` | Template literals (`` `${env}` ``) |

Individual property access (`env.KEY`) returns the real value by design — except for keys marked `secret: true`, which are always redacted even on direct access.

### Parser Design
- `Symbol('MISSING')` sentinel in parser (not null/undefined) avoids collision with valid values
- Batch error collection: all schema violations are gathered before throwing, not fail-fast
- Coercion: string → number/boolean performed at parse time

### Build Configuration
- No `rootDir` in `tsconfig.json` (covers src + tests)
- `tsconfig.build.json` sets `rootDir: src`
- `package.json` exports: per-condition types for NodeNext TS5 compat (`.d.ts` for ESM, `.d.cts` for CJS)

### Safety Measures
- `Object.freeze` applied to non-redacted env object to prevent mutation bugs
- `looksLikeSecret()` warns via `console.warn` but does NOT throw — developer hint, not a hard failure
- CLI uses `spawnSync` (not `exec`) in tests — no shell injection risk

### .env Loading Precedence
- File vars loaded first
- `process.env` takes precedence over file vars
- Pass `options.env` to override for non-Node environments

---

## Cross-Environment Support

This package is designed to work across:

| Environment | Notes |
|---|---|
| Node.js 18, 20, 22 | Primary targets |
| Cloudflare Workers | No `process.env` — use `options.env` |
| Deno | Use `options.env` |
| Bun | Supported |
| Browser | Use `options.env` |

For non-Node environments, pass env values via `options.env` since `process.env` may not exist.

---

## Testing Approach

- **TDD**: write failing test → implement → make pass → commit
- Each module has a corresponding test file in `tests/`
- CLI tests use `spawnSync` against built `dist/` — run `npm run build` first
- No mocking of `fs` or `process.env` — use `options.env` injection in `createEnv` tests
- Test files mirror `src/` structure: `tests/core/`, `tests/guard/`, `tests/dotenv/`, `tests/cli/`

---

## Key Conventions

- All Node built-ins use the `node:` protocol: `import { readFileSync } from 'node:fs'`
- No default exports — named exports only
- Commit message format: `feat:`, `fix:`, `chore:`, `docs:`, `ci:`
- Every new source file must have a corresponding test file

---

## Future Roadmap (do not implement)

The following features are planned but must NOT be implemented until explicitly requested:

- `scan` command: find unguarded `process.env.X` in source files
- Validation rules: `{ type: 'string', pattern: /^sk-/ }`
- AI Agent Firewall: intercept MCP/IDE `.env` reads in real-time
- Team secret sync (SaaS)
- Audit trail + SOC2 compliance reports
- Secret rotation reminders
