/**
 * forge0 verify — enforcement engine.
 *
 * Checks TrustReport, DoctorReport, and ReleaseReceipt against
 * strict mode-specific criteria to determine if a state is
 * "authorized" for precommit, release, or bundle.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildReleaseReceipt } from '../receipt/receipt.js';
import type { ReleaseReceipt } from '../receipt/types.js';
import type { VerifyMode, VerifyResult } from './types.js';

export function runVerify(repoRoot: string, mode: VerifyMode, cliVersion?: string): VerifyResult {
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
        const lockVersion = lock.version || lock.packages?.['']?.version;
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
  }

  // Calculate score and overall pass/fail
  const criticalFails = checks.filter((c) => !c.passed && c.severity === 'critical').length;
  const highFails = checks.filter((c) => !c.passed && c.severity === 'high').length;
  
  // For release mode, we require EVERYTHING to pass.
  // For other modes, we might be more lenient (TBD).
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
