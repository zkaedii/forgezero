import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  readLedger, 
  appendLedgerEntry, 
  verifyLedger, 
  getLastLedgerEntry,
  getLedgerPath,
  stableStringify,
  recordVerifyEvent,
  recordReceiptEvent
} from '../src/ledger/ledger.js';
import { existsSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { execSync } from 'node:child_process';

describe('ledger engine', () => {
  let testDir: string;
  let ledgerPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'forge0-ledger-test-'));
    ledgerPath = getLedgerPath(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('getLedgerPath returns .forge0/ledger.jsonl', () => {
    expect(ledgerPath).toContain(join('.forge0', 'ledger.jsonl'));
  });

  it('readLedger returns empty array when no ledger exists', () => {
    expect(readLedger(testDir)).toEqual([]);
  });

  it('appendLedgerEntry creates .forge0/ledger.jsonl', () => {
    appendLedgerEntry(testDir, {
      event: 'manual',
      result: 'info',
      summary: { title: 'Test', detail: 'Test', passedChecks: 1, failedChecks: 0, warningChecks: 0 },
      checks: [],
      honesty: { claim: 'Test', verified: [], notObservable: [] },
      sourceCommand: 'test',
    });
    expect(existsSync(ledgerPath)).toBe(true);
  });

  it('appended entry has sequence 1', () => {
    const entry = appendLedgerEntry(testDir, {
      event: 'manual',
      result: 'info',
      summary: { title: 'Test', detail: 'Test', passedChecks: 1, failedChecks: 0, warningChecks: 0 },
      checks: [],
      honesty: { claim: 'Test', verified: [], notObservable: [] },
      sourceCommand: 'test',
    });
    expect(entry.sequence).toBe(1);
  });

  it('second entry hash.previous equals first entry hash.current', () => {
    const e1 = appendLedgerEntry(testDir, {
      event: 'manual',
      result: 'info',
      summary: { title: 'E1', detail: 'E1', passedChecks: 1, failedChecks: 0, warningChecks: 0 },
      checks: [],
      honesty: { claim: 'E1', verified: [], notObservable: [] },
      sourceCommand: 'test',
    });
    const e2 = appendLedgerEntry(testDir, {
      event: 'manual',
      result: 'info',
      summary: { title: 'E2', detail: 'E2', passedChecks: 1, failedChecks: 0, warningChecks: 0 },
      checks: [],
      honesty: { claim: 'E2', verified: [], notObservable: [] },
      sourceCommand: 'test',
    });
    expect(e2.sequence).toBe(2);
    expect(e2.hash.previous).toBe(e1.hash.current);
  });

  it('verifyLedger passes for intact ledger', () => {
    appendLedgerEntry(testDir, {
      event: 'manual',
      result: 'info',
      summary: { title: 'E1', detail: 'E1', passedChecks: 1, failedChecks: 0, warningChecks: 0 },
      checks: [],
      honesty: { claim: 'E1', verified: [], notObservable: [] },
      sourceCommand: 'test',
    });
    const res = verifyLedger(testDir);
    expect(res.ok).toBe(true);
    expect(res.entryCount).toBe(1);
  });

  it('verifyLedger fails after tampering with an entry', () => {
    appendLedgerEntry(testDir, {
      event: 'manual',
      result: 'info',
      summary: { title: 'E1', detail: 'E1', passedChecks: 1, failedChecks: 0, warningChecks: 0 },
      checks: [],
      honesty: { claim: 'E1', verified: [], notObservable: [] },
      sourceCommand: 'test',
    });
    
    const lines = readFileSync(ledgerPath, 'utf-8').trim().split('\n');
    const first = JSON.parse(lines[0]);
    first.summary.title = 'tampered';
    lines[0] = JSON.stringify(first);
    writeFileSync(ledgerPath, lines.join('\n') + '\n');

    const res = verifyLedger(testDir);
    expect(res.ok).toBe(false);
    expect(res.brokenAt).toBe(1);
    expect(res.reason).toBe('Current hash mismatch');
  });

  it('getLastLedgerEntry returns the newest entry', () => {
    appendLedgerEntry(testDir, {
      event: 'manual',
      result: 'info',
      summary: { title: 'E1', detail: 'E1', passedChecks: 1, failedChecks: 0, warningChecks: 0 },
      checks: [],
      honesty: { claim: 'E1', verified: [], notObservable: [] },
      sourceCommand: 'test',
    });
    const e2 = appendLedgerEntry(testDir, {
      event: 'manual',
      result: 'info',
      summary: { title: 'E2', detail: 'E2', passedChecks: 1, failedChecks: 0, warningChecks: 0 },
      checks: [],
      honesty: { claim: 'E2', verified: [], notObservable: [] },
      sourceCommand: 'test',
    });
    const last = getLastLedgerEntry(testDir);
    expect(last?.id).toBe(e2.id);
  });

  it('stableStringify is deterministic', () => {
    const o1 = { b: 1, a: 2, c: { e: 3, d: 4 } };
    const o2 = { a: 2, b: 1, c: { d: 4, e: 3 } };
    expect(stableStringify(o1)).toBe(stableStringify(o2));
    expect(stableStringify(o1)).toBe('{"a":2,"b":1,"c":{"d":4,"e":3}}');
  });

  it('stableStringify skips undefined values', () => {
    const o1 = { a: 1, b: undefined };
    expect(stableStringify(o1)).toBe('{"a":1}');
  });

  it('recordVerifyEvent records a verify event', () => {
    const entry = recordVerifyEvent(process.cwd(), 'release');
    expect(entry.event).toBe('verify');
    expect(entry.mode).toBe('release');
  });

  it('recordReceiptEvent records a receipt event', () => {
    const entry = recordReceiptEvent(process.cwd());
    expect(entry.event).toBe('receipt');
  });

  it('CLI ledger verify --json emits valid JSON', () => {
    const out = execSync('npx tsx bin/forge0.ts ledger verify --json', { encoding: 'utf-8' });
    const parsed = JSON.parse(out);
    expect(parsed).toHaveProperty('ok');
  });

  it('CLI ledger list --json emits valid JSON', () => {
    const out = execSync('npx tsx bin/forge0.ts ledger list --json', { encoding: 'utf-8' });
    const parsed = JSON.parse(out);
    expect(parsed).toHaveProperty('entries');
  });

  it('CLI JSON output has no banner pollution', () => {
    const out = execSync('npx tsx bin/forge0.ts ledger last --json', { encoding: 'utf-8' });
    expect(out.trim().startsWith('{') || out.trim().startsWith('[')).toBe(true);
  });
});
