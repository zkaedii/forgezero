import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planRelease } from '../src/release/release.js';

function createPackageFixture(version = '1.2.3'): string {
  const dir = mkdtempSync(join(tmpdir(), 'forge0-release-fixture-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'fixture',
    version,
  }, null, 2));
  return dir;
}

describe('release planner', () => {
  it('plans a patch bump without executing commands', () => {
    const dir = createPackageFixture('1.2.3');
    try {
      const plan = planRelease(dir, {
        versionType: 'patch',
        verifyRemote: false,
        verifyCi: false,
        dryRun: true,
      });

      expect(plan.currentVersion).toBe('1.2.3');
      expect(plan.targetVersion).toBe('1.2.4');
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.steps.some((s) => s.command.includes('npm version patch'))).toBe(true);
      expect(plan.steps.some((s) => s.command.includes('git push origin v1.2.4'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('plans minor and major bumps', () => {
    const dir = createPackageFixture('1.2.3');
    try {
      expect(planRelease(dir, {
        versionType: 'minor',
        verifyRemote: false,
        verifyCi: false,
        dryRun: true,
      }).targetVersion).toBe('1.3.0');

      expect(planRelease(dir, {
        versionType: 'major',
        verifyRemote: false,
        verifyCi: false,
        dryRun: true,
      }).targetVersion).toBe('2.0.0');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps target version unchanged for bump none', () => {
    const dir = createPackageFixture('1.2.3');
    try {
      const plan = planRelease(dir, {
        versionType: 'none',
        verifyRemote: false,
        verifyCi: false,
        dryRun: true,
      });

      expect(plan.targetVersion).toBe('1.2.3');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('includes remote and ci flags when requested', () => {
    const dir = createPackageFixture('1.2.3');
    try {
      const plan = planRelease(dir, {
        versionType: 'patch',
        verifyRemote: true,
        verifyCi: true,
        dryRun: true,
      });

      const commands = plan.steps.map((s) => s.command).join('\n');
      expect(commands).toContain('forge0 verify --mode release --remote --ci');
      expect(commands).toContain('forge0 ledger record --event verify --mode release --remote --ci');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws or reports clearly when package.json is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge0-release-no-package-'));
    try {
      expect(() => planRelease(dir, {
        versionType: 'patch',
        verifyRemote: false,
        verifyCi: false,
        dryRun: true,
      })).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
