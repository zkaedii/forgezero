import { describe, it, expect, afterEach } from 'vitest';
import { runVerify, parseLsRemoteHash, parseAheadBehind, parseGhRuns, summarizeCiRuns } from '../src/verify/verify.js';
import { resolve, join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createTempGitRepoWithRemoteAndAnnotatedTag } from './helpers/temp-git-repo.js';

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

  it('parseLsRemoteHash returns the peeled commit SHA for annotated tag output', () => {
    const tagObjectSha = 'aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111';
    const commitSha    = 'bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222';
    const out = `${tagObjectSha}\trefs/tags/v0.2.0\n${commitSha}\trefs/tags/v0.2.0^{}\n`;
    expect(parseLsRemoteHash(out)).toBe(commitSha);
  });

  it('parseAheadBehind handles valid output', () => {
    expect(parseAheadBehind('2\t1\n')).toEqual({ ahead: 2, behind: 1 });
    expect(parseAheadBehind('0\t0')).toEqual({ ahead: 0, behind: 0 });
  });

  it('parseAheadBehind returns null on invalid', () => {
    expect(parseAheadBehind('')).toBe(null);
    expect(parseAheadBehind('nan\t0')).toBe(null);
  });

  it('parseGhRuns parses valid gh JSON', () => {
    const json = '[{"status":"completed","conclusion":"success","headSha":"abc"}]';
    expect(parseGhRuns(json)).toEqual([{status: 'completed', conclusion: 'success', headSha: 'abc'}]);
  });

  it('parseGhRuns returns null for invalid JSON or non-array', () => {
    expect(parseGhRuns('invalid')).toBe(null);
    expect(parseGhRuns('{"status":"completed"}')).toBe(null);
  });

  it('summarizeCiRuns passes when all runs completed with success', () => {
    const runs = [{ status: 'completed', conclusion: 'success', headSha: 'abc', workflowName: 'CI' }];
    const summary = summarizeCiRuns(runs, 'abc');
    expect(summary.passed).toBe(true);
  });

  it('summarizeCiRuns fails when no runs exist or none match head', () => {
    expect(summarizeCiRuns([], 'abc').passed).toBe(false);
    
    const runs = [{ status: 'completed', conclusion: 'success', headSha: 'def', workflowName: 'CI' }];
    expect(summarizeCiRuns(runs, 'abc').passed).toBe(false);
  });

  it('summarizeCiRuns fails when a run is pending', () => {
    const runs = [{ status: 'in_progress', conclusion: null, headSha: 'abc', workflowName: 'CI' }];
    const summary = summarizeCiRuns(runs, 'abc');
    expect(summary.passed).toBe(false);
    expect(summary.detail).toContain('CI still pending: CI');
  });

  it('summarizeCiRuns fails when a run conclusion is failure', () => {
    const runs = [{ status: 'completed', conclusion: 'failure', headSha: 'abc', workflowName: 'CI', url: 'http://test' }];
    const summary = summarizeCiRuns(runs, 'abc');
    expect(summary.passed).toBe(false);
    expect(summary.detail).toContain('CI failed: CI http://test');
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

});

// ─── HYGIENE-011 Remote Integration Tests ───────────────────────────

describe('runVerify — remote integration', () => {
  it('runVerify --remote against annotated tag returns matching remote.tag_at_head', () => {
    const { repoRoot, cleanup } = createTempGitRepoWithRemoteAndAnnotatedTag('0.0.1');
    try {
      const result = runVerify(repoRoot, 'release', '0.0.1', { remote: true });
      const tagCheck = result.checks.find(c => c.id === 'remote.tag_at_head');
      expect(tagCheck).toBeDefined();
      expect(tagCheck!.passed).toBe(true);
      expect(tagCheck!.detail).toContain('Synchronization confirmed.');
    } finally {
      cleanup();
    }
  });
});

// ─── HYGIENE-007 CLI Rejection Tests ────────────────────────────────

describe('verify CLI choices rejection', () => {
  it('forge0 verify --mode invalid rejects with exit code 1', () => {
    const tsxPath = join(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
    let exitCode = 0;
    try {
      execSync(
        `"${process.execPath}" "${tsxPath}" "${join(process.cwd(), 'bin/forge0.ts')}" verify --mode invalid`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
    } catch (err: any) {
      exitCode = err.status ?? 1;
    }
    expect(exitCode).not.toBe(0);
  });
});
