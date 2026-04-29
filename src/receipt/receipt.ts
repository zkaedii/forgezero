/**
 * buildReleaseReceipt — assemble a release receipt from TrustReport + DoctorReport.
 *
 * Pure function. No writes. No side effects. No mutations.
 * Answers: "What can ForgeZero prove about this release state?"
 */

import { buildTrustReport } from '../trust/status.js';
import { runDoctor } from '../doctor/doctor.js';
import type { ReleaseReceipt, ReceiptCheck } from './types.js';

export function buildReleaseReceipt(repoRoot: string): ReleaseReceipt {
  const trust = buildTrustReport(repoRoot);
  const doctor = runDoctor(repoRoot, 'all');

  const version = trust.version;
  const expectedTag = version ? `v${version}` : undefined;
  const tagsAtHead = trust.git?.tagsAtHead ?? [];
  const expectedTagAtHead = expectedTag ? tagsAtHead.includes(expectedTag) : false;
  const gitClean = trust.git?.clean ?? false;
  const branch = trust.git?.branch ?? undefined;
  const head = trust.git?.head ?? undefined;

  // Doctor analysis
  const actionableFindings = doctor.findings.filter((f) => f.severity !== 'info');
  const blockingFindings = doctor.findings
    .filter((f) => f.severity === 'high' || f.severity === 'critical')
    .map((f) => f.title);
  const releaseReady =
    gitClean &&
    expectedTagAtHead &&
    blockingFindings.length === 0 &&
    !doctor.findings.some((f) => f.id === 'CHANGELOG_MISSING_VERSION' && f.severity !== 'info');

  // Checks
  const checks: ReceiptCheck[] = [
    {
      id: 'git.clean',
      label: 'Working tree clean',
      passed: gitClean,
      detail: gitClean ? 'No uncommitted changes' : 'Working tree has uncommitted changes',
    },
    {
      id: 'tag.at_head',
      label: 'Expected version tag at HEAD',
      passed: expectedTagAtHead,
      detail: expectedTagAtHead
        ? `${expectedTag} points to ${head}`
        : expectedTag
          ? `${expectedTag} does not point to HEAD (${head})`
          : 'No version found in package.json',
    },
  ];

  // Changelog check
  const changelogFinding = doctor.findings.find((f) => f.id === 'CHANGELOG_MISSING_VERSION');
  checks.push({
    id: 'changelog.version',
    label: 'CHANGELOG mentions current version',
    passed: !changelogFinding,
    detail: changelogFinding ? changelogFinding.evidence[0] : `CHANGELOG.md contains ${version}`,
  });

  // Hook check
  const hookInstalled = trust.hook?.installed ?? false;
  checks.push({
    id: 'hook.installed',
    label: 'Pre-commit hook installed',
    passed: hookInstalled,
    detail: hookInstalled ? `At ${trust.hook?.path}` : 'No pre-commit hook found',
  });

  // Hook gates
  const hookGates = trust.hook?.gates ?? [];
  const allGates = hookGates.length >= 3;
  checks.push({
    id: 'hook.gates',
    label: 'Hook gates: typecheck, tests, audit',
    passed: allGates,
    detail: allGates
      ? `Gates: ${hookGates.join(', ')}`
      : `Missing gates. Found: ${hookGates.join(', ') || 'none'}`,
  });

  // Honesty bound present
  checks.push({
    id: 'honesty.present',
    label: 'Honesty bound present',
    passed: trust.honesty.notObservable.length > 0,
    detail: `${trust.honesty.verified.length} verified, ${trust.honesty.notObservable.length} not observable`,
  });

  // Suggested release note
  const releaseNote = generateReleaseNote(version, head, trust.posture, blockingFindings.length, trust.honesty);

  return {
    generatedAt: new Date().toISOString(),
    repoRoot,
    version,
    branch,
    head,
    tagsAtHead,
    expectedTag,
    expectedTagAtHead,
    gitClean,
    trustPosture: trust.posture,
    doctor: {
      findingCount: actionableFindings.length,
      highestSeverity: doctor.summary.highestSeverity,
      blockingFindings,
      releaseReady,
    },
    checks,
    suggestedReleaseNote: releaseNote,
    honesty: {
      claim:
        'This receipt verifies local repository state only. It does not prove remote CI completion, downstream tag consumption, hidden model context, or runtime agent behavior.',
      verified: [
        'working tree state',
        'version/tag alignment',
        'hook presence and gate detection',
        'changelog version mention',
        'doctor diagnostic findings',
      ],
      notObservable: [
        'remote CI completion',
        'downstream tag consumption',
        'hidden model context',
        'runtime agent behavior',
        'system-prompt-injected skill loads',
      ],
    },
  };
}

function generateReleaseNote(
  version: string | undefined,
  head: string | undefined,
  posture: string,
  blockingCount: number,
  honesty: { verified: string[]; notObservable: string[] }
): string {
  const v = version ? `v${version}` : 'unknown';
  const lines: string[] = [
    `ForgeZero ${v} release receipt`,
    '',
    `Commit: ${head ?? 'unknown'}`,
    `Trust posture: ${posture}`,
    `Doctor findings: ${blockingCount} blocking`,
    '',
    'Verified locally:',
    '- working tree state',
    '- version/tag alignment',
    '- hook presence and gate detection',
    '- changelog version mention',
    '',
    'Honesty bound:',
    'This receipt verifies local repository state only. It does not prove',
    'remote CI completion, downstream tag consumption, hidden model context,',
    'or runtime agent behavior.',
  ];
  return lines.join('\n');
}
