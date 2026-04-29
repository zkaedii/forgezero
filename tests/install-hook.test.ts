/**
 * install-hook regression tests.
 * Asserts the generated hook shell script contains all three gates
 * and the production-safety patterns. Catches future edits that
 * accidentally weaken the gate.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';

/**
 * Create a minimal git repo in a temp dir, install the hook, and return
 * the generated hook content for assertion.
 */
function installHookInTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'forge0-hook-test-'));

  try {
    // Init bare-minimum git repo
    execSync('git init', { cwd: dir, stdio: 'pipe' });
    execSync('git commit --allow-empty -m "init"', {
      cwd: dir,
      stdio: 'pipe',
      env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test.com',
             GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test.com' },
    });

    // Run install-hook via tsx, pointed at the temp repo
    const tsxPath = resolve(import.meta.dirname, '../node_modules/tsx/dist/cli.mjs');
    execSync(`"${process.execPath}" "${tsxPath}" "${resolve(import.meta.dirname, '../bin/forge0.ts')}" install-hook`, {
      cwd: dir,
      stdio: 'pipe',
    });

    const hookPath = join(dir, '.git', 'hooks', 'pre-commit');
    const content = readFileSync(hookPath, 'utf-8');
    return content;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('install-hook output', () => {
  let hookContent: string;

  // Generate once, share across all tests in this suite
  try {
    hookContent = installHookInTempRepo();
  } catch {
    hookContent = '';
  }

  it('generated hook contains Gate 1: tsc --noEmit', () => {
    expect(hookContent).toContain('npx tsc --noEmit');
  });

  it('generated hook contains Gate 2: npm test --silent', () => {
    expect(hookContent).toContain('npm test --silent');
  });

  it('generated hook contains Gate 3: forge0 audit --json', () => {
    expect(hookContent).toContain('forge0 audit --json');
  });

  it('generated hook has .agents guard (does not audit repos without .agents/)', () => {
    expect(hookContent).toContain('[ -d .agents ]');
  });

  it('generated hook uses mktemp for unique temp files', () => {
    expect(hookContent).toContain('mktemp');
  });

  it('generated hook has trap for cleanup', () => {
    expect(hookContent).toContain('trap');
    expect(hookContent).toContain('rm -rf');
  });

  it('generated hook has local binary fallback via run_forge0()', () => {
    expect(hookContent).toContain('run_forge0');
    expect(hookContent).toContain('node_modules/.bin/forge0');
  });

  it('generated hook scopes audit to --path .agents', () => {
    expect(hookContent).toContain('--path .agents');
  });
});
