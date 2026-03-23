import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = join(process.cwd(), 'dist/cli/index.js');

/** Run CLI via spawnSync — explicit argv array, no shell, no injection risk. */
function runCli(args: string[], envVars: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    env: { PATH: process.env['PATH'] ?? '', ...envVars },
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    code: result.status ?? 1,
  };
}

describe('check command', () => {
  it('exits 0 when all required vars present', () => {
    const schema = join(tmpdir(), `schema-${Date.now()}.json`);
    writeFileSync(schema, JSON.stringify({ HOST: 'string', PORT: 'number' }));
    const { stdout, code } = runCli(
      ['check', '--schema', schema],
      { HOST: 'localhost', PORT: '3000' },
    );
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

  it('exits 1 when schema file not found', () => {
    const { stderr, code } = runCli(['check', '--schema', '/tmp/nonexistent-xyz-schema.json']);
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
  it('generates .env.example from schema', () => {
    const schema = join(tmpdir(), `schema-${Date.now()}.json`);
    const output = join(tmpdir(), `example-${Date.now()}.txt`);
    writeFileSync(schema, JSON.stringify({
      API_KEY: { type: 'string', secret: true },
      PORT: { type: 'number?', default: 3000 },
    }));
    const { stdout, code } = runCli(['gen-example', '--schema', schema, '--output', output]);
    expect(code).toBe(0);
    const content = readFileSync(output, 'utf8');
    expect(content).toContain('API_KEY=');
    expect(content).toContain('SECRET');
    expect(content).toContain('PORT=');
    expect(stdout).toContain('✅');
    unlinkSync(schema);
    unlinkSync(output);
  });
});

describe('install-hook command', () => {
  it('installs pre-commit hook and creates .gitignore', () => {
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

  it('exits 1 when no .git directory found', () => {
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
