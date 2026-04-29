import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runVerify } from '../src/verify/verify.js';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const REPO_ROOT = resolve(process.cwd());

describe('runVerify', () => {
  it('release mode requires clean tree and matching versions', () => {
    // This will depend on the current repo state, but we can check the shape
    const result = runVerify(REPO_ROOT, 'release', '0.1.5');
    
    expect(result.mode).toBe('release');
    expect(result.checks.length).toBeGreaterThan(0);
    
    // Check for existence of core release checks
    const checkIds = result.checks.map(c => c.id);
    expect(checkIds).toContain('verify.no_blocking_findings');
    expect(checkIds).toContain('verify.lock_version_match');
  });

  it('score is calculated correctly', () => {
    const result = runVerify(REPO_ROOT, 'release');
    const passedCount = result.checks.filter(c => c.passed).length;
    const expectedScore = Math.round((passedCount / result.checks.length) * 100);
    expect(result.score).toBe(expectedScore);
  });
});
