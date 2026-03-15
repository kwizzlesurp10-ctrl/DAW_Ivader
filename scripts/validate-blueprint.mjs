#!/usr/bin/env node
/**
 * Self-validating blueprint: run test suite and optionally coverage + thresholds.
 * Exit 0 iff all tests pass and (when --coverage) coverage thresholds are met.
 * See docs/INTENT_BLUEPRINT.md.
 */
import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const run = (cmd, args = [], cwd = projectRoot) =>
  new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'inherit', cwd });
    p.on('close', (code) => resolve(code ?? 0));
  });

const withCoverage = process.argv.includes('--coverage');

/** Minimum coverage (percent). Enforce in CI to prevent regression. */
const THRESHOLD_STATEMENTS = 80;
const THRESHOLD_BRANCHES = 65;

function checkCoverageThresholds() {
  const summaryPath = path.join(projectRoot, 'coverage', 'coverage-summary.json');
  if (!existsSync(summaryPath)) {
    console.error('validate-blueprint: coverage-summary.json not found. Run test:coverage first.');
    process.exit(1);
  }
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const total = summary.total;
  if (!total) {
    console.error('validate-blueprint: no total in coverage summary.');
    process.exit(1);
  }
  const stmtPct = total.statements?.pct ?? 0;
  const branchPct = total.branches?.pct ?? 0;
  if (stmtPct < THRESHOLD_STATEMENTS || branchPct < THRESHOLD_BRANCHES) {
    console.error(
      `validate-blueprint: coverage below thresholds. Statements: ${stmtPct}% (min ${THRESHOLD_STATEMENTS}%), Branches: ${branchPct}% (min ${THRESHOLD_BRANCHES}%).`
    );
    process.exit(1);
  }
  console.log(
    `validate-blueprint: coverage OK — statements ${stmtPct}%, branches ${branchPct}%`
  );
}

async function main() {
  const testCode = await run('pnpm', ['run', 'test']);
  if (testCode !== 0) {
    process.exit(testCode);
  }
  if (withCoverage) {
    const covCode = await run('pnpm', ['run', 'test:coverage']);
    if (covCode !== 0) process.exit(covCode);
    checkCoverageThresholds();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
