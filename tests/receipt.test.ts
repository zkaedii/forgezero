/**
 * Release receipt tests.
 * Validates the receipt engine produces well-formed, honest release
 * attestations with checks, suggested release notes, and honesty bounds.
 */

import { describe, it, expect } from 'vitest';
import { buildReleaseReceipt } from '../src/receipt/receipt.js';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');

describe('buildReleaseReceipt shape', () => {
  const receipt = buildReleaseReceipt(REPO_ROOT);

  it('returns a ReleaseReceipt with required top-level fields', () => {
    expect(receipt).toHaveProperty('generatedAt');
    expect(receipt).toHaveProperty('repoRoot');
    expect(receipt).toHaveProperty('gitClean');
    expect(receipt).toHaveProperty('trustPosture');
    expect(receipt).toHaveProperty('doctor');
    expect(receipt).toHaveProperty('checks');
    expect(receipt).toHaveProperty('suggestedReleaseNote');
    expect(receipt).toHaveProperty('honesty');
  });

  it('generatedAt is an ISO timestamp', () => {
    expect(receipt.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('expectedTag equals v${version} when version exists', () => {
    if (receipt.version) {
      expect(receipt.expectedTag).toBe(`v${receipt.version}`);
    }
  });

  it('checks array is non-empty', () => {
    expect(Array.isArray(receipt.checks)).toBe(true);
    expect(receipt.checks.length).toBeGreaterThan(0);
  });

  it('all checks have required fields', () => {
    for (const check of receipt.checks) {
      expect(check).toHaveProperty('id');
      expect(check).toHaveProperty('label');
      expect(check).toHaveProperty('passed');
      expect(check).toHaveProperty('detail');
      expect(typeof check.passed).toBe('boolean');
    }
  });

  it('honesty block contains verified and notObservable arrays', () => {
    expect(Array.isArray(receipt.honesty.verified)).toBe(true);
    expect(Array.isArray(receipt.honesty.notObservable)).toBe(true);
    expect(typeof receipt.honesty.claim).toBe('string');
    expect(receipt.honesty.verified.length).toBeGreaterThan(0);
    expect(receipt.honesty.notObservable.length).toBeGreaterThan(0);
  });

  it('suggested release note includes version and honesty boundary', () => {
    expect(receipt.suggestedReleaseNote).toContain('release receipt');
    expect(receipt.suggestedReleaseNote).toContain('Honesty bound');
    expect(receipt.suggestedReleaseNote).toContain('Verified locally');
    if (receipt.version) {
      expect(receipt.suggestedReleaseNote).toContain(receipt.version);
    }
  });

  it('doctor section has required fields', () => {
    expect(receipt.doctor).toHaveProperty('findingCount');
    expect(receipt.doctor).toHaveProperty('highestSeverity');
    expect(receipt.doctor).toHaveProperty('blockingFindings');
    expect(receipt.doctor).toHaveProperty('releaseReady');
    expect(Array.isArray(receipt.doctor.blockingFindings)).toBe(true);
    expect(typeof receipt.doctor.releaseReady).toBe('boolean');
  });

  it('is JSON-serializable without loss', () => {
    const json = JSON.stringify(receipt);
    const parsed = JSON.parse(json);
    expect(parsed.trustPosture).toBe(receipt.trustPosture);
    expect(parsed.checks.length).toBe(receipt.checks.length);
    expect(parsed.honesty.claim).toBe(receipt.honesty.claim);
  });
});

describe('forge0 receipt --json CLI', () => {
  it('emits valid JSON with required fields', () => {
    const output = execSync(
      `npx tsx ${resolve(REPO_ROOT, 'bin/forge0.ts')} receipt --json`,
      { cwd: REPO_ROOT, encoding: 'utf-8' }
    );
    expect(output.trimStart()[0]).toBe('{');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('trustPosture');
    expect(parsed).toHaveProperty('checks');
    expect(parsed).toHaveProperty('doctor');
    expect(parsed).toHaveProperty('honesty');
    expect(parsed).toHaveProperty('suggestedReleaseNote');
  });

  it('--json output has no banner pollution', () => {
    const output = execSync(
      `npx tsx ${resolve(REPO_ROOT, 'bin/forge0.ts')} receipt --json`,
      { cwd: REPO_ROOT, encoding: 'utf-8' }
    );
    expect(output.trimStart()[0]).toBe('{');
  });
});
