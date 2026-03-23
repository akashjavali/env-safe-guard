import { describe, it, expect } from 'vitest';
import { REDACTED, looksLikeSecret } from '../../src/guard/redact.js';

describe('REDACTED', () => {
  it('is the sentinel string', () => {
    expect(REDACTED).toBe('***REDACTED***');
  });
});

describe('looksLikeSecret', () => {
  it.each([
    ['sk-abc123def456ghijklmno'],       // OpenAI/Anthropic-style key
    ['ghp_abcdefghijklmnopqrstuvwxyz1234'], // GitHub PAT
    ['Bearer eyJhbGciOiJIUzI1NiJ9'],    // Bearer token
    ['AKIAIOSFODNN7EXAMPLE'],           // AWS access key
    ['xoxb-123456789-123456789-abcdefghij'], // Slack bot token
    ['a'.repeat(40)],                   // 40-char hex-like string
  ])('detects "%s" as a secret', (value) => {
    expect(looksLikeSecret(value)).toBe(true);
  });

  it.each([
    ['localhost'],
    ['3000'],
    ['true'],
    ['my-database-name'],
    ['production'],
    ['https://example.com'],
    ['short'],
  ])('does not flag "%s" as a secret', (value) => {
    expect(looksLikeSecret(value)).toBe(false);
  });
});
