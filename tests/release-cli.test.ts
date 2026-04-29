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
});
