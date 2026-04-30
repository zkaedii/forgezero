/**
 * forge0 verify — enforcement engine.
 *
 * Checks TrustReport, DoctorReport, and ReleaseReceipt against
 * strict mode-specific criteria to determine if a state is
 * "authorized" for precommit, release, or bundle.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { buildReleaseReceipt } from '../receipt/receipt.js';
import type { VerifyMode, VerifyResult, VerifyOptions } from './types.js';

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * parseLsRemoteHash — extracts the 40-char SHA-1 from git ls-remote output.
 * For annotated tags, prefers the peeled commit SHA (the line ending in ^{})
 * over the tag-object SHA. Falls back to the first valid SHA for lightweight tags.
 */
export function parseLsRemoteHash(output: string): string | null {
  const lines = output.trim().split('\n').filter(l => l.length > 0);
  // Prefer peeled ref (annotated tag → commit SHA)
  const peeledLine = lines.find(l => l.includes('^{}'));
  const targetLine = peeledLine ?? lines[0];
  if (!targetLine) return null;
  const sha = targetLine.trim().split(/\s+/)[0];
  return sha && /^[0-9a-f]{40}$/i.test(sha) ? sha : null;
}

/**
 * parseAheadBehind — extracts { ahead, behind } counts from git rev-list output.
 */
export function parseAheadBehind(output: string): { ahead: number; behind: number } | null {
  const parts = output.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const ahead = Number(parts[0]);
  const behind = Number(parts[1]);
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) return null;
  return { ahead, behind };
}

export interface GhRun {
  status?: string;
  conclusion?: string | null;
  headSha?: string;
  workflowName?: string;
  url?: string;
}

export interface CiSummary {
  passed: boolean;
  detail: string;
  runCount: number;
  failingRuns: string[];
  pendingRuns: string[];
}

export function parseGhRuns(json: string): GhRun[] | null {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function summarizeCiRuns(runs: GhRun[], head: string): CiSummary {
  if (runs.length === 0) {
    return { passed: false, detail: 'No GitHub Actions runs found for HEAD.', runCount: 0, failingRuns: [], pendingRuns: [] };
  }

  const failingRuns: string[] = [];
  const pendingRuns: string[] = [];
  let matchedCount = 0;

  for (const run of runs) {
    if (run.headSha && !head.startsWith(run.headSha)) continue;
    matchedCount++;

    if (run.status !== 'completed') {
      pendingRuns.push(run.workflowName || 'unknown');
    } else if (run.conclusion !== 'success') {
      failingRuns.push(`${run.workflowName || 'unknown'} ${run.url || ''}`.trim());
    }
  }

  if (matchedCount === 0) {
    return { passed: false, detail: 'No GitHub Actions runs found for HEAD.', runCount: runs.length, failingRuns, pendingRuns };
  }

  if (failingRuns.length > 0) {
    return { passed: false, detail: `CI failed: ${failingRuns.join(', ')}`, runCount: runs.length, failingRuns, pendingRuns };
  }
  
  if (pendingRuns.length > 0) {
    return { passed: false, detail: `CI still pending: ${pendingRuns.join(', ')}`, runCount: runs.length, failingRuns, pendingRuns };
  }

  return { passed: true, detail: 'All GitHub Actions checks passed for HEAD.', runCount: runs.length, failingRuns, pendingRuns };
}

// ─── Engine ─────────────────────────────────────────────────────────

export function runVerify(
  repoRoot: string,
  mode: VerifyMode,
  cliVersion?: string,
  opts: VerifyOptions = {}
): VerifyResult {
  const receipt = buildReleaseReceipt(repoRoot);
  const checks: VerifyResult['checks'] = [];

  // Map receipt checks to verify checks
  for (const c of receipt.checks) {
    checks.push({
      id: `receipt.${c.id}`,
      label: c.label,
      passed: c.passed,
      severity: c.passed ? 'info' : 'high',
      detail: c.detail,
    });
  }

  // Add release-specific mode checks
  if (mode === 'release') {
    // 1. CLI Version Match
    if (cliVersion && receipt.version) {
      const match = receipt.version === cliVersion;
      checks.push({
        id: 'verify.cli_version_match',
        label: `Package version matches CLI version (${receipt.version})`,
        passed: match,
        severity: 'critical',
        detail: match
          ? 'Alignment confirmed.'
          : `Mismatch! Package is ${receipt.version}, CLI is ${cliVersion}.`,
      });
    }

    // 2. package-lock.json version match
    const lockPath = join(repoRoot, 'package-lock.json');
    if (existsSync(lockPath)) {
      try {
        const lock = JSON.parse(readFileSync(lockPath, 'utf-8'));
        const lockVersion = lock.packages?.['']?.version ?? lock.version;
        const match = lockVersion === receipt.version;
        checks.push({
          id: 'verify.lock_version_match',
          label: 'package-lock.json version matches package.json',
          passed: match,
          severity: 'high',
          detail: match
            ? `Both at ${receipt.version}`
            : `Mismatch! Lock is ${lockVersion}, Package is ${receipt.version}`,
        });
      } catch {
        checks.push({
          id: 'verify.lock_version_match',
          label: 'package-lock.json version matches package.json',
          passed: false,
          severity: 'high',
          detail: 'Failed to parse package-lock.json',
        });
      }
    }

    // 3. No blocking findings in doctor
    const blocking = receipt.doctor.blockingFindings.length;
    checks.push({
      id: 'verify.no_blocking_findings',
      label: 'No blocking findings in doctor',
      passed: blocking === 0,
      severity: 'critical',
      detail: blocking === 0 ? 'Zero blocking findings.' : `${blocking} blocking finding(s) detected.`,
    });

    // 4. Remote checks
    if (opts.remote) {
      const head = receipt.head;
      const branch = receipt.branch;
      const version = receipt.version;

      // Check remote branch at head
      if (branch) {
        try {
          const out = execSync(`git ls-remote --heads origin ${branch}`, { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
          const remoteHash = parseLsRemoteHash(out);
          const match = remoteHash === head;
          checks.push({
            id: 'remote.branch_at_head',
            label: `Remote origin/${branch} points to HEAD`,
            passed: match,
            severity: 'critical',
            detail: match 
              ? 'Synchronization confirmed.' 
              : (remoteHash ? `Mismatch! Remote: ${remoteHash.slice(0, 7)}, Local: ${head?.slice(0, 7)}` : `Remote branch origin/${branch} not found.`),
          });
        } catch {
          checks.push({ id: 'remote.branch_at_head', label: `Remote origin/${branch} check failed`, passed: false, severity: 'critical', detail: 'Network or git error.' });
        }
      }

      // Check remote tag at head
      if (version) {
        const tagName = `v${version}`;
        try {
          const out = execSync(`git ls-remote --tags origin "${tagName}" "${tagName}^{}"`, { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
          const remoteHash = parseLsRemoteHash(out);
          const match = remoteHash === head;
          checks.push({
            id: 'remote.tag_at_head',
            label: `Remote tag ${tagName} points to HEAD`,
            passed: match,
            severity: 'critical',
            detail: match 
              ? 'Synchronization confirmed.' 
              : (remoteHash ? `Mismatch! Remote: ${remoteHash.slice(0, 7)}, Local: ${head?.slice(0, 7)}` : `Remote tag ${tagName} is missing. Run: git push origin ${tagName}`),
          });
        } catch {
          checks.push({ id: 'remote.tag_at_head', label: `Remote tag ${tagName} check failed`, passed: false, severity: 'critical', detail: 'Network or git error.' });
        }
      }

      // Check ahead/behind
      try {
        const out = execSync('git rev-list --left-right --count HEAD...@{upstream}', { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        const ab = parseAheadBehind(out);
        if (ab) {
          checks.push({
            id: 'remote.branch_not_ahead',
            label: 'Local branch is not ahead of upstream',
            passed: ab.ahead === 0,
            severity: 'high',
            detail: ab.ahead === 0 ? 'Clean.' : `Local branch is ahead of upstream by ${ab.ahead} commit(s). Run: git push origin ${branch}`,
          });
          checks.push({
            id: 'remote.branch_not_behind',
            label: 'Local branch is not behind upstream',
            passed: ab.behind === 0,
            severity: 'high',
            detail: ab.behind === 0 ? 'Clean.' : `Local branch is behind upstream by ${ab.behind} commit(s). Run: git pull --ff-only`,
          });
        }
      } catch {
        // Upstream might not be set
        checks.push({ id: 'remote.sync_state', label: 'Upstream synchronization check', passed: false, severity: 'high', detail: 'No upstream set or network error.' });
      }
    }
  }

  // 5. CI checks
  if (mode === 'release' && opts.ci) {
    const head = receipt.head;
    if (!head) {
      checks.push({ id: 'ci.status', label: 'GitHub Actions checks passed for HEAD', passed: false, severity: 'critical', detail: 'Local HEAD hash not found.' });
    } else {
      try {
        const out = execSync(`gh run list --commit ${head} --limit 10 --json status,conclusion,headSha,workflowName,url`, { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        const runs = parseGhRuns(out);
        if (runs) {
          const summary = summarizeCiRuns(runs, head);
          checks.push({
            id: 'ci.status',
            label: 'GitHub Actions checks passed for HEAD',
            passed: summary.passed,
            severity: 'critical',
            detail: summary.detail,
          });
        } else {
          checks.push({ id: 'ci.status', label: 'GitHub Actions checks passed for HEAD', passed: false, severity: 'critical', detail: 'Failed to parse GitHub Actions runs output.' });
        }
      } catch {
        checks.push({ id: 'ci.status', label: 'GitHub Actions checks passed for HEAD', passed: false, severity: 'critical', detail: 'GitHub Actions status not observable. Ensure gh is installed and authenticated.' });
      }
    }
  }

  // Calculate score and overall pass/fail
  const criticalFails = checks.filter((c) => !c.passed && c.severity === 'critical').length;
  const highFails = checks.filter((c) => !c.passed && c.severity === 'high').length;
  
  // For release mode, we require EVERYTHING to pass (critical + high).
  const passed = criticalFails === 0 && highFails === 0;

  const total = checks.length;
  const passedCount = checks.filter((c) => c.passed).length;
  const score = total > 0 ? Math.round((passedCount / total) * 100) : 0;

  let summary: string;
  if (passed) {
    summary = `Verification PASSED for mode: ${mode}. Score: ${score}%`;
  } else {
    summary = `Verification FAILED for mode: ${mode}. ${criticalFails + highFails} blocking failure(s). Score: ${score}%`;
  }

  return {
    generatedAt: new Date().toISOString(),
    mode,
    passed,
    score,
    checks,
    summary,
  };
}
