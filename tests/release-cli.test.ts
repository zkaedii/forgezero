import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

describe('release CLI', () => {
  it('emits parseable JSON in dry-run mode', () => {
    // Note: Use process.execPath and local tsx to avoid Windows path space issues
    const tsxPath = join(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
    const out = execSync(
      `"${process.execPath}" "${tsxPath}" bin/forge0.ts release --bump patch --verify-remote --verify-ci --dry-run --json`,
      { encoding: 'utf-8' }
    );

    const parsed = JSON.parse(out);
    expect(parsed).toHaveProperty('currentVersion');
    expect(parsed).toHaveProperty('targetVersion');
    expect(Array.isArray(parsed.steps)).toBe(true);
  });

  it('forge0 release --bump invalid rejects with exit code 1', () => {
    const tsxPath = join(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
    let exitCode = 0;
    try {
      execSync(
        `"${process.execPath}" "${tsxPath}" bin/forge0.ts release --bump invalid`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
    } catch (err: any) {
      exitCode = err.status ?? 1;
    }
    expect(exitCode).not.toBe(0);
  });

  it('forge0 release --bump invalid --dry-run rejects with exit code 1', () => {
    const tsxPath = join(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
    let exitCode = 0;
    try {
      execSync(
        `"${process.execPath}" "${tsxPath}" bin/forge0.ts release --bump invalid --dry-run`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
    } catch (err: any) {
      exitCode = err.status ?? 1;
    }
    expect(exitCode).not.toBe(0);
  });
});
