#!/usr/bin/env node
/**
 * Self-validating blueprint: run test suite and optionally coverage.
 * Exit 0 iff all tests pass. Use in CI or pre-commit for intent-graph consistency.
 * See docs/INTENT_BLUEPRINT.md.
 */
import { spawn } from 'child_process';

const run = (cmd, args = []) =>
  new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('close', (code) => resolve(code ?? 0));
  });

const withCoverage = process.argv.includes('--coverage');

async function main() {
  const testCode = await run('pnpm', ['run', 'test']);
  if (testCode !== 0) {
    process.exit(testCode);
  }
  if (withCoverage) {
    const covCode = await run('pnpm', ['run', 'test:coverage']);
    process.exit(covCode);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
