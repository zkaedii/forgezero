/**
 * forge0 ledger — durable trust memory engine.
 *
 * Implements an append-only, hash-chained JSONL record of trust events.
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type {
  LedgerEntry,
  LedgerRecordInput,
  LedgerEventResult,
  LedgerVerificationResult,
} from './types.js';
import { buildTrustReport } from '../trust/status.js';
import type { TrustReport } from '../trust/types.js';
import { runVerify } from '../verify/verify.js';
import { buildReleaseReceipt } from '../receipt/receipt.js';
import type { VerifyMode, VerifyOptions } from '../verify/types.js';

// ─── Path Resolution ───────────────────────────────────────────────

export function getLedgerPath(repoRoot: string): string {
  return join(repoRoot, '.forge0', 'ledger.jsonl');
}

// ─── Hashing & Canonicalization ─────────────────────────────────────

/**
 * stableStringify — Recursively sort keys for deterministic hashing.
 * Skips undefined values to match JSON.stringify round-trip behavior.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort().filter((k) => obj[k] !== undefined);
  return `{${sortedKeys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(',')}}`;
}

function hashEntry(entryWithoutCurrentHash: Omit<LedgerEntry, 'hash'> & { hash: { previous?: string; algorithm: 'sha256' } }): string {
  return createHash('sha256').update(stableStringify(entryWithoutCurrentHash)).digest('hex');
}

function makeLedgerId(timestamp: string, sequence: number): string {
  // led_YYYYMMDDHHMMSS_XXXXXX
  const cleanTs = timestamp.replace(/[-:.TZ]/g, '').slice(0, 14);
  return `led_${cleanTs}_${String(sequence).padStart(6, '0')}`;
}

// ─── Version Metadata ──────────────────────────────────────────────

/**
 * Reads version metadata from package.json and package-lock.json.
 * Purely filesystem-based, no shell.
 */
function resolveVersionMetadata(
  repoRoot: string,
  cliVersion?: string,
  trust?: TrustReport
): LedgerEntry['version'] {
  let pkg: string | undefined;
  let lock: string | undefined;

  const pkgPath = join(repoRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try { pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')).version; } catch { /* skip */ }
  }

  const lockPath = join(repoRoot, 'package-lock.json');
  if (existsSync(lockPath)) {
    try {
      const lockData = JSON.parse(readFileSync(lockPath, 'utf-8'));
      lock = lockData.packages?.['']?.version ?? lockData.version;
    } catch { /* skip */ }
  }

  const expectedTag = pkg ? `v${pkg}` : undefined;
  const expectedTagAtHead = (expectedTag && trust?.git?.tagsAtHead?.includes(expectedTag)) || false;

  return {
    package: pkg,
    cli: cliVersion,
    lock,
    expectedTag,
    expectedTagAtHead,
  };
}

// ─── Read/Write ───────────────────────────────────────────────────

export function readLedger(repoRoot: string): LedgerEntry[] {
  const path = getLedgerPath(repoRoot);
  if (!existsSync(path)) return [];

  const content = readFileSync(path, 'utf-8');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line, idx) => {
      try {
        return JSON.parse(line) as LedgerEntry;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Ledger parse failed at line ${idx + 1}: ${msg}`);
      }
    });
}

export function getLastLedgerEntry(repoRoot: string): LedgerEntry | null {
  const entries = readLedger(repoRoot);
  return entries.length > 0 ? entries[entries.length - 1] : null;
}

export function appendLedgerEntry(repoRoot: string, input: LedgerRecordInput, cliVersion?: string): LedgerEntry {
  const ledgerDir = join(repoRoot, '.forge0');
  if (!existsSync(ledgerDir)) mkdirSync(ledgerDir, { recursive: true });

  const entries = readLedger(repoRoot);
  const previous = entries.length > 0 ? entries[entries.length - 1] : null;

  const trust = buildTrustReport(repoRoot);
  const timestamp = new Date().toISOString();
  const sequence = (previous?.sequence ?? 0) + 1;

  const versionMeta = resolveVersionMetadata(repoRoot, cliVersion, trust);

  const entryData: Omit<LedgerEntry, 'hash'> & { hash: { previous?: string; algorithm: 'sha256' } } = {
    id: makeLedgerId(timestamp, sequence),
    sequence,
    timestamp,
    event: input.event,
    mode: input.mode,
    result: input.result,
    repo: {
      root: resolve(repoRoot),
      branch: trust.git?.branch,
      head: trust.git?.head,
      tagsAtHead: trust.git?.tagsAtHead ?? [],
      dirty: !trust.git?.clean,
    },
    version: versionMeta,
    summary: input.summary,
    checks: input.checks,
    honesty: input.honesty,
    source: {
      command: input.sourceCommand,
      forgezeroVersion: versionMeta?.package,
    },
    hash: {
      previous: previous?.hash.current,
      algorithm: 'sha256',
    },
  };

  const currentHash = hashEntry(entryData);
  const fullEntry: LedgerEntry = {
    ...entryData,
    hash: { ...entryData.hash, current: currentHash },
  };

  const path = getLedgerPath(repoRoot);
  appendFileSync(path, JSON.stringify(fullEntry) + '\n');

  // Verify immediately
  const verification = verifyLedger(repoRoot);
  if (!verification.ok) {
    throw new Error(`Ledger write produced invalid chain: ${verification.reason}`);
  }

  return fullEntry;
}

// ─── Verification ──────────────────────────────────────────────────

export function verifyLedger(repoRoot: string): LedgerVerificationResult {
  let entries: LedgerEntry[];

  try {
    entries = readLedger(repoRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const lineMatch = msg.match(/line (\d+)/);
    return {
      ok: false,
      entryCount: 0,
      brokenAt: lineMatch ? Number(lineMatch[1]) : undefined,
      reason: msg,
    };
  }

  if (entries.length === 0) {
    return { ok: true, entryCount: 0 };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const previous = i > 0 ? entries[i - 1] : null;

    // Check sequence
    if (entry.sequence !== i + 1) {
      return { ok: false, entryCount: entries.length, brokenAt: entry.sequence, reason: 'Sequence mismatch' };
    }

    // Check hash chain
    if (entry.hash.previous !== previous?.hash.current) {
      return { ok: false, entryCount: entries.length, brokenAt: entry.sequence, reason: 'Previous hash mismatch' };
    }

    // Re-hash and check current
    const { hash: { current, ...restHash }, ...restEntry } = entry;
    const rehashed = hashEntry({ ...restEntry, hash: restHash });
    if (rehashed !== current) {
      return { ok: false, entryCount: entries.length, brokenAt: entry.sequence, reason: 'Current hash mismatch' };
    }
  }

  return {
    ok: true,
    entryCount: entries.length,
    headHash: entries[entries.length - 1].hash.current,
  };
}

// ─── Event Recorders ───────────────────────────────────────────────

export function recordVerifyEvent(
  repoRoot: string, 
  mode: VerifyMode, 
  cliVersion?: string,
  opts: VerifyOptions = {}
): LedgerEntry {
  const result = runVerify(repoRoot, mode, cliVersion, opts);

  const ciChecked = opts.ci === true;
  const ciPassed = ciChecked && result.checks.some(c => c.id === 'ci.status' && c.passed);
  const honesty = selectVerifyHonesty(ciChecked, ciPassed);

  return appendLedgerEntry(repoRoot, {
    event: 'verify',
    mode,
    result: result.passed ? 'pass' : 'fail',
    summary: {
      title: result.summary,
      detail: `${result.checks.filter(c => c.passed).length}/${result.checks.length} checks passed`,
      passedChecks: result.checks.filter(c => c.passed).length,
      failedChecks: result.checks.filter(c => !c.passed).length,
      warningChecks: 0,
      highestSeverity: result.checks.some(c => c.severity === 'critical' && !c.passed) ? 'critical' : 'info',
    },
    checks: result.checks.map(c => ({
      id: c.id,
      label: c.label,
      passed: c.passed,
      detail: c.detail,
      severity: c.severity,
    })),
    honesty,
    sourceCommand: `forge0 verify --mode ${mode}${opts.remote ? ' --remote' : ''}${opts.ci ? ' --ci' : ''}`,
  }, cliVersion);
}

export function recordReceiptEvent(repoRoot: string, cliVersion?: string): LedgerEntry {
  const receipt = buildReleaseReceipt(repoRoot);
  const result: LedgerEventResult = receipt.doctor.releaseReady ? 'pass' : (receipt.doctor.blockingFindings.length > 0 ? 'fail' : 'warn');

  return appendLedgerEntry(repoRoot, {
    event: 'receipt',
    result,
    summary: {
      title: 'Release attestation generated',
      detail: `Posture: ${receipt.trustPosture}, Doctor: ${receipt.doctor.blockingFindings.length} blocking`,
      passedChecks: receipt.checks.filter(c => c.passed).length,
      failedChecks: receipt.checks.filter(c => !c.passed).length,
      warningChecks: 0,
    },
    checks: receipt.checks.map(c => ({
      id: c.id,
      label: c.label,
      passed: c.passed,
      detail: c.detail,
    })),
    honesty: receipt.honesty,
    sourceCommand: 'forge0 receipt',
  }, cliVersion);
}

// ─── Honesty Bound Selection ────────────────────────────────────────

/**
 * selectVerifyHonesty — pure helper that selects the honesty bound
 * for a verify ledger event based on CI observation state.
 *
 * Keyed to ci.status check passing, NOT overall result.success.
 * When HYGIENE-008's annotated-tag check fails but CI was observed,
 * the honesty bound still reflects ci-was-checked-and-passed.
 */
export function selectVerifyHonesty(
  ciChecked: boolean,
  ciPassed: boolean
): { claim: string; verified: string[]; notObservable: string[] } {
  if (ciChecked && ciPassed) {
    return {
      claim: 'Ledger records local verification observations including remote CI status at time of check.',
      verified: ['local repository state', 'verification gates', 'remote CI status (point-in-time)'],
      notObservable: ['future CI behavior', 'runtime agent behavior'],
    };
  }
  return {
    claim: 'Ledger records local verification observations. It does not prove remote CI completion.',
    verified: ['local repository state', 'verification gates'],
    notObservable: ['remote CI', 'runtime agent behavior'],
  };
}

export function recordManualEvent(
  repoRoot: string,
  message: string,
  cliVersion?: string
): LedgerEntry {
  const truncatedTitle = message.length > 60 ? message.slice(0, 60) + '…' : message;

  return appendLedgerEntry(repoRoot, {
    event: 'manual',
    result: 'info',
    summary: {
      title: `Manual: ${truncatedTitle}`,
      detail: message,
      passedChecks: 0,
      failedChecks: 0,
      warningChecks: 0,
    },
    checks: [],
    honesty: {
      claim: 'Manual ledger entry recorded by operator.',
      verified: [],
      notObservable: ["operator's stated context", 'external state at time of recording'],
    },
    sourceCommand: 'forge0 ledger record --event manual',
  }, cliVersion);
}

export function recordKickoffEvent(
  repoRoot: string,
  opts: { mode: string; sessionId: string; policySha256: string | null; decision: string },
  cliVersion?: string
): LedgerEntry {
  return appendLedgerEntry(repoRoot, {
    event: 'kickoff',
    mode: opts.mode,
    result: 'info',
    summary: {
      title: `Kickoff session ${opts.sessionId.slice(0, 8)}`,
      detail: `Mode: ${opts.mode}, policy hash: ${opts.policySha256?.slice(0, 8) ?? 'default'}`,
      passedChecks: 0,
      failedChecks: 0,
      warningChecks: 0,
    },
    checks: [],
    honesty: {
      claim: 'Kickoff ledger event records session start with resolved mode.',
      verified: ['session mode', 'policy hash'],
      notObservable: ['agent runtime behavior', 'future session drift'],
    },
    sourceCommand: `forge0 kickoff --mode ${opts.mode}`,
  }, cliVersion);
}

export function recordTraceEvent(
  repoRoot: string,
  opts: { sessionId: string; tag: string; exitCode: number },
  cliVersion?: string
): LedgerEntry {
  const result = opts.exitCode === 0 ? 'info' as const :
                 opts.exitCode === 1 ? 'fail' as const :
                 'warn' as const;
  return appendLedgerEntry(repoRoot, {
    event: 'trace',
    result,
    summary: {
      title: `Trace ${opts.sessionId.slice(0, 8)}: ${opts.tag}`,
      detail: `Exit code: ${opts.exitCode}`,
      passedChecks: opts.exitCode === 0 ? 1 : 0,
      failedChecks: opts.exitCode > 0 ? 1 : 0,
      warningChecks: 0,
    },
    checks: [],
    honesty: {
      claim: 'Trace ledger event records session audit result.',
      verified: ['trace tag', 'session id'],
      notObservable: ['agent compliance beyond observable signals'],
    },
    sourceCommand: `forge0 trace ${opts.sessionId}`,
  }, cliVersion);
}
