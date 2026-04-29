/**
 * Verification types — the enforcement layer.
 * Defines the criteria for a "pass" in various modes.
 */

export type VerifyMode = 'precommit' | 'release' | 'bundle';

export interface VerifyOptions {
  remote?: boolean;
}

export interface VerifyResult {
  generatedAt: string;
  mode: VerifyMode;
  passed: boolean;
  score: number; // 0 to 100
  checks: {
    id: string;
    label: string;
    passed: boolean;
    severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
    detail: string;
  }[];
  summary: string;
}
