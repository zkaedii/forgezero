/**
 * Doctor diagnostic tests.
 * Validates that runDoctor produces well-formed findings with evidence,
 * explanations, and recovery commands. Each finding is a scar from a
 * real failure — the tests ensure those scars remain in the product.
 */

import { describe, it, expect } from 'vitest';
import { runDoctor } from '../src/doctor/doctor.js';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { DoctorFinding, DoctorReport } from '../src/doctor/types.js';

const REPO_ROOT = resolve(import.meta.dirname, '..');

describe('runDoctor report shape', () => {
  const report = runDoctor(REPO_ROOT);

  it('returns a DoctorReport with required top-level fields', () => {
    expect(report).toHaveProperty('generatedAt');
    expect(report).toHaveProperty('repoRoot');
    expect(report).toHaveProperty('mode');
    expect(report).toHaveProperty('trustPosture');
    expect(report).toHaveProperty('findings');
    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('honesty');
  });

  it('generatedAt is an ISO timestamp', () => {
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('findings is an array', () => {
    expect(Array.isArray(report.findings)).toBe(true);
  });

  it('all findings have required fields', () => {
    for (const f of report.findings) {
      expect(f).toHaveProperty('id');
      expect(f).toHaveProperty('severity');
      expect(f).toHaveProperty('title');
      expect(f).toHaveProperty('evidence');
      expect(f).toHaveProperty('explanation');
      expect(f).toHaveProperty('recommendedCommands');
      expect(f).toHaveProperty('safeToAutoFix');
      expect(Array.isArray(f.evidence)).toBe(true);
      expect(Array.isArray(f.recommendedCommands)).toBe(true);
      expect(typeof f.explanation).toBe('string');
      expect(f.explanation.length).toBeGreaterThan(0);
    }
  });

  it('summary includes highestSeverity, findingCount, and recommendedNextAction', () => {
    expect(report.summary).toHaveProperty('highestSeverity');
    expect(report.summary).toHaveProperty('findingCount');
    expect(report.summary).toHaveProperty('recommendedNextAction');
    expect(typeof report.summary.recommendedNextAction).toBe('string');
  });

  it('honesty block is always present with verified and notObservable', () => {
    expect(Array.isArray(report.honesty.verified)).toBe(true);
    expect(Array.isArray(report.honesty.notObservable)).toBe(true);
    expect(typeof report.honesty.claim).toBe('string');
    expect(report.honesty.verified.length).toBeGreaterThan(0);
    expect(report.honesty.notObservable.length).toBeGreaterThan(0);
  });

  it('is JSON-serializable without loss', () => {
    const json = JSON.stringify(report);
    const parsed = JSON.parse(json);
    expect(parsed.trustPosture).toBe(report.trustPosture);
    expect(parsed.findings.length).toBe(report.findings.length);
    expect(parsed.honesty.claim).toBe(report.honesty.claim);
  });
});

describe('runDoctor mode filtering', () => {
  it('workspace mode returns only workspace-relevant findings', () => {
    const report = runDoctor(REPO_ROOT, 'workspace');
    expect(report.mode).toBe('workspace');
    // Should not contain release-specific findings like VERSION_TAG_MISSING
    // (unless workspace is also dirty — but the IDs are distinct)
    for (const f of report.findings) {
      expect(['WORKSPACE_DIRTY', 'GENERATED_ARTIFACTS_UNTRACKED', 'PACKAGE_LOCK_NOISE', 'NO_GIT']).toContain(f.id);
    }
  });

  it('hook mode returns only hook-relevant findings', () => {
    const report = runDoctor(REPO_ROOT, 'hook');
    expect(report.mode).toBe('hook');
    for (const f of report.findings) {
      expect(['HOOK_ABSENT', 'HOOK_WEAK', 'HOOK_GLOBAL_FIRST']).toContain(f.id);
    }
  });

  it('release mode returns only release-relevant findings', () => {
    const report = runDoctor(REPO_ROOT, 'release');
    expect(report.mode).toBe('release');
    for (const f of report.findings) {
      expect([
        'VERSION_TAG_MISSING', 'VERSION_TAG_NOT_AT_HEAD',
        'CHANGELOG_MISSING_VERSION', 'RELEASE_READY',
      ]).toContain(f.id);
    }
  });
});

describe('forge0 doctor --json CLI', () => {
  it('emits valid JSON with required fields', () => {
    const output = execSync(
      `npx tsx ${resolve(REPO_ROOT, 'bin/forge0.ts')} doctor --json`,
      { cwd: REPO_ROOT, encoding: 'utf-8' }
    );
    // First non-whitespace must be {
    expect(output.trimStart()[0]).toBe('{');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('trustPosture');
    expect(parsed).toHaveProperty('findings');
    expect(parsed).toHaveProperty('summary');
    expect(parsed).toHaveProperty('honesty');
  });

  it('--mode release narrows findings to release diagnostics only', () => {
    const output = execSync(
      `npx tsx ${resolve(REPO_ROOT, 'bin/forge0.ts')} doctor --json --mode release`,
      { cwd: REPO_ROOT, encoding: 'utf-8' }
    );
    const parsed = JSON.parse(output);
    expect(parsed.mode).toBe('release');
    for (const f of parsed.findings) {
      expect([
        'VERSION_TAG_MISSING', 'VERSION_TAG_NOT_AT_HEAD',
        'CHANGELOG_MISSING_VERSION', 'RELEASE_READY',
      ]).toContain(f.id);
    }
  });
});
