/**
 * env-safe-guard — Complete Example
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
