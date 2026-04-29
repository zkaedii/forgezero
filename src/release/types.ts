export type BumpType = 'patch' | 'minor' | 'major' | 'none';

export interface ReleasePlanOptions {
  versionType: BumpType;
  verifyRemote: boolean;
  verifyCi: boolean;
  dryRun: boolean;
}

export interface ReleasePlanStep {
  name: string;
  command: string;
  description: string;
  critical: boolean;
}

export interface ReleasePlan {
  currentVersion: string;
  targetVersion: string;
  steps: ReleasePlanStep[];
}
