/**
 * Ledger types — the durable memory layer.
 * Defines the schema for local, hash-chained operational trust history.
 */

export type LedgerEventKind =
  | 'verify'
  | 'receipt'
  | 'doctor'
  | 'status'
  | 'hook-install'
  | 'bundle'
  | 'kickoff'
  | 'trace'
  | 'manual';

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
