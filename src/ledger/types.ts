/**
 * Ledger types — the durable memory layer.
 * Defines the schema for local, hash-chained operational trust history.
 */

export const IMPLEMENTED_LEDGER_EVENT_KINDS = [
  'verify',
  'receipt',
  'kickoff',
  'trace',
  'manual',
] as const;

export type LedgerEventKind = typeof IMPLEMENTED_LEDGER_EVENT_KINDS[number];

/**
 * Planned ledger event kinds, reserved for v0.3.x but NOT accepted by the
 * production ledger schema until first-class recorders, CLI surfaces, tests,
 * and honesty bounds exist for them.
 *
 * To promote a kind from planned to implemented:
 *   1. Implement recordXEvent() in src/ledger/ledger.ts
 *   2. Add CLI surface in bin/forge0.ts (if applicable — kickoff/trace are auto-recorders)
 *   3. Add tests in tests/ledger.test.ts
 *   4. Move the value from PLANNED_LEDGER_EVENT_KINDS to IMPLEMENTED_LEDGER_EVENT_KINDS
 */
export const PLANNED_LEDGER_EVENT_KINDS = [
  'doctor',
  'status',
  'hook-install',
  'bundle',
] as const;

export type PlannedLedgerEventKind = typeof PLANNED_LEDGER_EVENT_KINDS[number];

export type LedgerEventResult = 'pass' | 'fail' | 'warn' | 'info';

export interface LedgerCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
}

export interface LedgerEntry {
  id: string;
  sequence: number;
  timestamp: string;

  event: LedgerEventKind;
  mode?: string;
  result: LedgerEventResult;

  repo: {
    root: string;
    branch?: string;
    head?: string;
    tagsAtHead: string[];
    dirty: boolean;
  };

  version?: {
    package?: string;
    cli?: string;
    lock?: string;
    expectedTag?: string;
    expectedTagAtHead?: boolean;
  };

  summary: {
    title: string;
    detail: string;
    passedChecks: number;
    failedChecks: number;
    warningChecks: number;
    highestSeverity?: string;
  };

  checks: LedgerCheck[];

  honesty: {
    claim: string;
    verified: string[];
    notObservable: string[];
  };

  source: {
    command: string;
    forgezeroVersion?: string;
  };

  hash: {
    previous?: string;
    current: string;
    algorithm: 'sha256';
  };
}

export interface LedgerRecordInput {
  event: LedgerEventKind;
  mode?: string;
  result: LedgerEventResult;
  summary: LedgerEntry['summary'];
  checks: LedgerCheck[];
  honesty: LedgerEntry['honesty'];
  sourceCommand: string;
}

export interface LedgerVerificationResult {
  ok: boolean;
  entryCount: number;
  brokenAt?: number;
  reason?: string;
  headHash?: string;
}

export interface LedgerListResult {
  path: string;
  entries: LedgerEntry[];
}
