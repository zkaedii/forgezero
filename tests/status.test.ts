/**
 * TrustReport / forge0 status tests.
 * Verifies the buildTrustReport engine produces well-formed, honest output.
 */

import { describe, it, expect } from 'vitest';
import { buildTrustReport } from '../src/trust/status.js';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');

describe('buildTrustReport shape', () => {
  let report: ReturnType<typeof buildTrustReport>;

  // Build once for the suite
  try {
    report = buildTrustReport(REPO_ROOT);
  } catch (e) {
    report = null as any;
  }

  it('returns a report object', () => {
    expect(report).toBeTruthy();
    expect(typeof report).toBe('object');
  });

  it('includes generatedAt ISO timestamp', () => {
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('includes a TrustPosture string', () => {
    const validPostures = [
      'UNINITIALIZED', 'DIRTY', 'GUARDED', 'RELEASABLE',
      'BUNDLE_SAFE', 'DRIFT_DETECTED', 'SECRETS_BLOCKED',
      'TRACE_LIMITED', 'UNKNOWN',
    ];
    expect(validPostures).toContain(report.posture);
  });

  it('includes a signals array', () => {
    expect(Array.isArray(report.signals)).toBe(true);
  });

  it('all signals have required fields', () => {
    for (const sig of report.signals) {
      expect(sig).toHaveProperty('id');
      expect(sig).toHaveProperty('level');
      expect(sig).toHaveProperty('source');
      expect(sig).toHaveProperty('title');
      expect(sig).toHaveProperty('detail');
      expect(sig).toHaveProperty('verified');
    }
  });

  it('includes an honesty bound with three arrays', () => {
    expect(Array.isArray(report.honesty.verified)).toBe(true);
    expect(Array.isArray(report.honesty.unverified)).toBe(true);
    expect(Array.isArray(report.honesty.notObservable)).toBe(true);
    expect(typeof report.honesty.claim).toBe('string');
  });

  it('honesty.verified is non-empty (ForgeZero always verifies something)', () => {
    expect(report.honesty.verified.length).toBeGreaterThan(0);
  });

  it('honesty.notObservable is non-empty (ForgeZero always admits blind spots)', () => {
    expect(report.honesty.notObservable.length).toBeGreaterThan(0);
  });

  it('git field is populated when in a git repo', () => {
    // This test suite runs inside the forgezero repo which is a git repo
    expect(report.git).toBeDefined();
    expect(report.git?.available).toBe(true);
  });

  it('is JSON-serializable without loss (no symbols, no non-enumerable fields)', () => {
    const json = JSON.stringify(report);
    const parsed = JSON.parse(json);
    expect(parsed.posture).toBe(report.posture);
    expect(parsed.honesty.claim).toBe(report.honesty.claim);
  });
});

describe('forge0 status --json output', () => {
  it('emits valid JSON with required top-level fields', () => {
    const output = execSync(
      `npx tsx ${resolve(REPO_ROOT, 'bin/forge0.ts')} status --json`,
      { cwd: REPO_ROOT, encoding: 'utf-8' }
    );
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('posture');
    expect(parsed).toHaveProperty('signals');
    expect(parsed).toHaveProperty('honesty');
    expect(parsed).toHaveProperty('generatedAt');
  });

  it('--json output contains no banner pollution before JSON', () => {
    const output = execSync(
      `npx tsx ${resolve(REPO_ROOT, 'bin/forge0.ts')} status --json`,
      { cwd: REPO_ROOT, encoding: 'utf-8' }
    );
    // First non-whitespace char must be '{'
    expect(output.trimStart()[0]).toBe('{');
  });
});
