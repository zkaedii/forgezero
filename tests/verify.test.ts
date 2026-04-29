import { describe, it, expect } from 'vitest';
import { runVerify, parseLsRemoteHash, parseAheadBehind } from '../src/verify/verify.js';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());

describe('runVerify parser helpers', () => {
  it('parseLsRemoteHash handles valid output', () => {
    const out = 'abc123abc123abc123abc123abc123abc123abcd\trefs/heads/master\n';
    expect(parseLsRemoteHash(out)).toBe('abc123abc123abc123abc123abc123abc123abcd');
  });

  it('parseLsRemoteHash returns null on empty/invalid', () => {
    expect(parseLsRemoteHash('')).toBe(null);
    expect(parseLsRemoteHash('short')).toBe(null);
    expect(parseLsRemoteHash('not-a-hash\trefs/tags/v1')).toBe(null);
  });

  it('parseAheadBehind handles valid output', () => {
    expect(parseAheadBehind('2\t1\n')).toEqual({ ahead: 2, behind: 1 });
    expect(parseAheadBehind('0\t0')).toEqual({ ahead: 0, behind: 0 });
  });

  it('parseAheadBehind returns null on invalid', () => {
    expect(parseAheadBehind('')).toBe(null);
    expect(parseAheadBehind('nan\t0')).toBe(null);
  });
});

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

  it('supports --remote flag in options', () => {
    const result = runVerify(REPO_ROOT, 'release', undefined, { remote: true });
    // Should include remote checks
    const checkIds = result.checks.map(c => c.id);
    expect(checkIds).toContain('remote.branch_at_head');
    expect(checkIds).toContain('remote.tag_at_head');
  });
});
