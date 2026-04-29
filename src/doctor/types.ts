/**
 * Doctor diagnostic types — named findings with evidence,
 * explanations, and exact recovery commands.
 *
 * Every finding is a scar from a real failure, not a speculative warning.
 */

export type DoctorDiagnosisId =
  | 'WORKSPACE_DIRTY'
  | 'GENERATED_ARTIFACTS_UNTRACKED'
  | 'PACKAGE_LOCK_NOISE'
  | 'VERSION_TAG_MISSING'
  | 'VERSION_TAG_NOT_AT_HEAD'
  | 'CHANGELOG_MISSING_VERSION'
  | 'HOOK_ABSENT'
  | 'HOOK_WEAK'
  | 'NO_GIT'
  | 'RELEASE_READY';

export type DoctorMode = 'all' | 'workspace' | 'release' | 'hook';

export interface DoctorFinding {
  id: DoctorDiagnosisId;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  evidence: string[];
  explanation: string;
  recommendedCommands: string[];
  safeToAutoFix: boolean;
}

export interface DoctorSummary {
  highestSeverity: DoctorFinding['severity'];
  findingCount: number;
  recommendedNextAction: string;
}

export interface DoctorReport {
  generatedAt: string;
  repoRoot: string;
  mode: DoctorMode;
  trustPosture: string;
  findings: DoctorFinding[];
  summary: DoctorSummary;
  honesty: {
    claim: string;
    verified: string[];
    notObservable: string[];
  };
}
