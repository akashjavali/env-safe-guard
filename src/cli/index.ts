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
