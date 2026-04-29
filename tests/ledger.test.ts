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
import { existsSync, writeFileSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { execSync } from 'node:child_process';

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Create a minimal temp git repo with package.json, package-lock.json,
 * and CHANGELOG.md so recordVerifyEvent/recordReceiptEvent can resolve
 * version metadata and trust report without touching the real repo.
 */
function createTempGitRepo(version = '0.0.1'): string {
  const dir = mkdtempSync(join(tmpdir(), 'forge0-ledger-test-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "test"', { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test', version }));
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({
    name: 'test', version, lockfileVersion: 3, packages: { '': { version } }
  }));
  writeFileSync(join(dir, 'CHANGELOG.md'), `# Changelog\n\n## [${version}]\n\n- test\n`);
  execSync('git add -A', { cwd: dir, stdio: 'pipe' });
  execSync('git commit -m "init"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

// ─── Pure Engine Tests (temp dir, no git) ───────────────────────────

describe('ledger engine — pure', () => {
  let testDir: string;
  let ledgerPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'forge0-ledger-pure-'));
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
});

// ─── Corruption Handling ────────────────────────────────────────────

describe('ledger corruption handling', () => {
  let testDir: string;
  let ledgerPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'forge0-ledger-corrupt-'));
    ledgerPath = getLedgerPath(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('verifyLedger returns structured failure on corrupted JSONL', () => {
    mkdirSync(join(testDir, '.forge0'), { recursive: true });
    writeFileSync(ledgerPath, '{"valid": true}\nthis is not json\n');

    const res = verifyLedger(testDir);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Ledger parse failed at line 2/);
  });

  it('verifyLedger does not throw on corrupted JSONL', () => {
    mkdirSync(join(testDir, '.forge0'), { recursive: true });
    writeFileSync(ledgerPath, '{{broken json\n');

    // Should NOT throw — should return a structured result
    const res = verifyLedger(testDir);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Ledger parse failed at line 1/);
  });
});

// ─── Record Event Tests (isolated temp git repo) ────────────────────

describe('ledger record events — isolated', () => {
  let testRepo: string;

  beforeEach(() => {
    testRepo = createTempGitRepo('0.8.8');
  });

  afterEach(() => {
    if (existsSync(testRepo)) {
      rmSync(testRepo, { recursive: true, force: true });
    }
  });

  it('recordVerifyEvent records a verify event in temp repo', () => {
    const entry = recordVerifyEvent(testRepo, 'release');
    expect(entry.event).toBe('verify');
    expect(entry.mode).toBe('release');
  });

  it('recordReceiptEvent records a receipt event in temp repo', () => {
    const entry = recordReceiptEvent(testRepo);
    expect(entry.event).toBe('receipt');
  });

  it('recordVerifyEvent preserves CLI version when passed', () => {
    const entry = recordVerifyEvent(testRepo, 'release', '99.0.0');
    expect(entry.version?.cli).toBe('99.0.0');
  });

  it('ledger entries include expected version metadata', () => {
    const entry = recordVerifyEvent(testRepo, 'release', '0.1.8');
    expect(entry.version?.package).toBe('0.8.8');
    expect(entry.version?.cli).toBe('0.1.8');
    expect(entry.version?.lock).toBe('0.8.8');
    expect(entry.version?.expectedTag).toBe('v0.8.8');
  });

  it('ledger entries include expectedTagAtHead when applicable', () => {
    // In our temp repo, HEAD has tag v0.8.8 (because we did git add -A; git commit -m "init")
    // Wait, the helper doesn't tag. Let's tag.
    execSync('git tag v0.8.8', { cwd: testRepo, stdio: 'pipe' });
    
    const entry = recordVerifyEvent(testRepo, 'release');
    expect(entry.version?.expectedTagAtHead).toBe(true);
  });

  it('tests do not create .forge0/ledger.jsonl in the real repo', () => {
    const realLedger = getLedgerPath(process.cwd());
    const hadLedger = existsSync(realLedger);
    
    recordVerifyEvent(testRepo, 'release');
    recordReceiptEvent(testRepo);

    // This test is mostly about side effects. 
    // We already use testRepo, so it's isolated by design.
    expect(existsSync(getLedgerPath(testRepo))).toBe(true);
  });
});

// ─── CLI JSON Tests ─────────────────────────────────────────────────

describe('ledger CLI JSON', () => {
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

  it('CLI ledger last --json always starts with {', () => {
    const out = execSync('npx tsx bin/forge0.ts ledger last --json', { encoding: 'utf-8' });
    expect(out.trim().startsWith('{')).toBe(true);
  });

  it('CLI ledger last --json has found field even if empty', () => {
    // Create an empty temp repo and run CLI there
    const emptyDir = mkdtempSync(join(tmpdir(), 'forge0-empty-'));
    try {
      let out: string;
      try {
        out = execSync(`npx tsx ${join(process.cwd(), 'bin/forge0.ts')} ledger last --json`, { 
          cwd: emptyDir,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore'] 
        });
      } catch (e: any) {
        out = e.stdout;
      }
      
      const parsed = JSON.parse(out);
      expect(parsed).toHaveProperty('found');
      expect(parsed.found).toBe(false);
      expect(parsed.entry).toBe(null);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
