/**
 * Release receipt types — the attestation artifact that proves
 * what ForgeZero can verify about a release state.
 *
 * A receipt is not a signature. It is a structured honesty-bound
 * snapshot: what passed, what failed, what cannot be proven.
 */

export interface ReceiptCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ReleaseReceipt {
  generatedAt: string;
  repoRoot: string;
  version?: string;
  branch?: string;
  head?: string;
  tagsAtHead: string[];
  expectedTag?: string;
  expectedTagAtHead: boolean;
  gitClean: boolean;
  trustPosture: string;
  doctor: {
    findingCount: number;
    highestSeverity: string;
    blockingFindings: string[];
    releaseReady: boolean;
  };
  checks: ReceiptCheck[];
  suggestedReleaseNote: string;
  honesty: {
    claim: string;
    verified: string[];
    notObservable: string[];
  };
}
