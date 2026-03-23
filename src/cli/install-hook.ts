import {
  writeFileSync, readFileSync, existsSync, mkdirSync, chmodSync,
} from 'node:fs';
import { resolve, join } from 'node:path';

const HOOK_CONTENT = `#!/bin/sh
# envfort pre-commit hook
# Installed by: npx envfort install-hook

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
    npx --yes envfort check --schema env-schema.json
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
  const missing = envPatterns.filter((p) => !content.includes(p));

  if (missing.length > 0) {
    const appended = content.trimEnd() + '\n\n# envfort\n' + missing.join('\n') + '\n';
    writeFileSync(gitignorePath, appended);
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
      writeFileSync(hookPath, existing.trimEnd() + '\n\n' + HOOK_CONTENT);
      chmodSync(hookPath, 0o755);
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
