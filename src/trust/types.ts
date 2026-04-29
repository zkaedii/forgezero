/**
 * Shared TrustReport model — the single internal representation that
 * all ForgeZero commands can read from and write to.
 *
 * Every command that produces a result should contribute signals to a
 * TrustReport rather than inventing a bespoke output shape.
 *
 * The dual structure (result + honesty bound) is load-bearing.
 * Most tools say "looks good." ForgeZero says "verified good within
 * this boundary — here is what I cannot prove."
 */

export type TrustPosture =
  | 'UNINITIALIZED'
  | 'DIRTY'
  | 'GUARDED'
  | 'RELEASABLE'
  | 'BUNDLE_SAFE'
  | 'DRIFT_DETECTED'
  | 'SECRETS_BLOCKED'
  | 'TRACE_LIMITED'
  | 'UNKNOWN';

export type TrustSignalLevel = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface TrustSignal {
  id: string;
  level: TrustSignalLevel;
  source: 'git' | 'audit' | 'risk' | 'hook' | 'share' | 'provenance' | 'trace' | 'policy' | 'build' | 'tests' | 'version';
  title: string;
  detail: string;
  verified: boolean;
}

export interface HonestyBound {
  verified: string[];
  unverified: string[];
  notObservable: string[];
  claim: string;
}

export interface TrustReport {
  generatedAt: string;
  repoRoot: string;
  version?: string;
  git?: {
    available: boolean;
    clean: boolean;
    branch?: string;
    head?: string;
    tagsAtHead: string[];
  };
  agents?: {
    present: boolean;
    path: string;
  };
  audit?: {
    available: boolean;
    clean: boolean;
    totalChanges: number;
    scope: string;
  };
  hook?: {
    installed: boolean;
    path: string;
    gates: string[];
  };
  skillDrift?: {
    detected: boolean;
    detail?: string;
  };
  build?: {
    configured: boolean;
  };
  tests?: {
    configured: boolean;
  };
  posture: TrustPosture;
  signals: TrustSignal[];
  honesty: HonestyBound;
}
