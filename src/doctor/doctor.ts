/**
 * forge0 doctor — recovery intelligence engine.
 *
 * Consumes buildTrustReport() output and raw git/fs state to produce
 * named diagnoses with evidence, explanations, and exact recovery
 * commands.
 *
 * Every finding in this file maps to a failure that actually happened
 * during ForgeZero development. This is institutional memory encoded
 * as product.
 *
 * Pure function. No side effects. No writes.
 */

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { buildTrustReport } from '../trust/status.js';
import type { TrustReport } from '../trust/types.js';
import type { DoctorFinding, DoctorReport, DoctorMode, DoctorSummary } from './types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function exec(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

const SEVERITY_ORDER: DoctorFinding['severity'][] = ['info', 'low', 'medium', 'high', 'critical'];

function highestSeverity(findings: DoctorFinding[]): DoctorFinding['severity'] {
  let max = 0;
  for (const f of findings) {
    const idx = SEVERITY_ORDER.indexOf(f.severity);
    if (idx > max) max = idx;
  }
  return SEVERITY_ORDER[max];
}

// ─── Workspace Diagnostics ──────────────────────────────────────────

function diagnoseWorkspace(repoRoot: string, trust: TrustReport): DoctorFinding[] {
  const findings: DoctorFinding[] = [];

  // No git
  if (!trust.git?.available) {
    findings.push({
      id: 'NO_GIT',
      severity: 'high',
      title: 'Not a git repository or git is unavailable',
      evidence: ['git status returned non-zero or command not found'],
      explanation: 'ForgeZero relies on git for audit, hook installation, and release management. Without git, most commands will fail or return incomplete results.',
      recommendedCommands: ['git init', 'git add .', 'git commit -m "initial commit"'],
      safeToAutoFix: false,
    });
    return findings; // Can't do further workspace checks without git
  }

  // Dirty working tree
  if (!trust.git.clean) {
    const statusOut = exec('git status --porcelain', repoRoot);
    const lines = (statusOut ?? '').split('\n').filter(Boolean);
    const untrackedDist = lines.some((l) => l.includes('dist/'));
    const untrackedNodeMod = lines.some((l) => l.includes('node_modules/'));
    const modifiedLockfile = lines.some((l) => l.includes('package-lock.json'));

    // Check for generated artifacts specifically
    if (untrackedDist || untrackedNodeMod) {
      const artifacts: string[] = [];
      if (untrackedDist) artifacts.push('dist/');
      if (untrackedNodeMod) artifacts.push('node_modules/');
      findings.push({
        id: 'GENERATED_ARTIFACTS_UNTRACKED',
        severity: 'low',
        title: 'Generated build/install artifacts appear in git status',
        evidence: artifacts.map((a) => `Untracked: ${a}`),
        explanation:
          'These are local build or install artifacts. They should be in .gitignore and are safe to ignore for release purposes.',
        recommendedCommands: [],
        safeToAutoFix: false,
      });
    }

    // Package-lock noise
    if (modifiedLockfile) {
      const lockDiffStat = exec('git diff --stat package-lock.json', repoRoot);
      findings.push({
        id: 'PACKAGE_LOCK_NOISE',
        severity: 'low',
        title: 'package-lock.json has uncommitted changes',
        evidence: [lockDiffStat ?? 'package-lock.json modified'],
        explanation:
          'This commonly happens after npm install when metadata fields (license, resolved URLs) are updated. If the change is unintentional, restore it.',
        recommendedCommands: ['git restore package-lock.json'],
        safeToAutoFix: false,
      });
    }

    // General dirty — only if there are non-artifact, non-lockfile changes
    const substantiveChanges = lines.filter(
      (l) => !l.includes('dist/') && !l.includes('node_modules/') && !l.includes('package-lock.json')
    );
    if (substantiveChanges.length > 0) {
      findings.push({
        id: 'WORKSPACE_DIRTY',
        severity: 'high',
        title: 'Working tree has uncommitted substantive changes',
        evidence: substantiveChanges.slice(0, 10),
        explanation:
          'Uncommitted source changes mean the current state is not captured in git history. Release and share operations may produce inconsistent results.',
        recommendedCommands: ['git add .', 'git commit -m "..."'],
        safeToAutoFix: false,
      });
    }
  }

  return findings;
}

// ─── Release Diagnostics ────────────────────────────────────────────

function diagnoseRelease(repoRoot: string, trust: TrustReport): DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  if (!trust.git?.available || !trust.version) return findings;

  const version = trust.version;
  const expectedTag = `v${version}`;
  const tagsAtHead = trust.git.tagsAtHead ?? [];
  const head = trust.git.head ?? 'unknown';

  // Does the tag exist at all?
  const tagRef = exec(`git rev-parse --short ${expectedTag} 2>nul`, repoRoot);
  const tagExists = tagRef !== null && tagRef.length > 0;

  if (!tagExists) {
    // No tag for current version
    findings.push({
      id: 'VERSION_TAG_MISSING',
      severity: 'high',
      title: `Tag ${expectedTag} does not exist for package.json version ${version}`,
      evidence: [
        `package.json version: ${version}`,
        `Expected tag: ${expectedTag}`,
        `Existing tags at HEAD: ${tagsAtHead.join(', ') || 'none'}`,
      ],
      explanation:
        'The package version has been bumped but the corresponding git tag has not been created. This means npm publish and GitHub releases will not find this version.',
      recommendedCommands: [
        'npm run build',
        'npm test',
        `git tag ${expectedTag}`,
        'git push origin master',
        `git push origin ${expectedTag}`,
      ],
      safeToAutoFix: false,
    });
  } else if (!tagsAtHead.includes(expectedTag)) {
    // Tag exists but doesn't point to HEAD
    findings.push({
      id: 'VERSION_TAG_NOT_AT_HEAD',
      severity: 'high',
      title: `Tag ${expectedTag} exists but does not point to HEAD`,
      evidence: [
        `HEAD: ${head}`,
        `${expectedTag}: ${tagRef}`,
        `Tags at HEAD: ${tagsAtHead.join(', ') || 'none'}`,
      ],
      explanation:
        'The tag was created before additional commits landed. The released version does not match the current state. Either move the tag forward or bump the version.',
      recommendedCommands: [
        `git tag -f ${expectedTag}`,
        `git push origin ${expectedTag} --force`,
      ],
      safeToAutoFix: false,
    });
  }

  // Changelog check
  const changelogPath = join(repoRoot, 'CHANGELOG.md');
  if (existsSync(changelogPath)) {
    const changelog = readFileSync(changelogPath, 'utf-8');
    if (!changelog.includes(version)) {
      findings.push({
        id: 'CHANGELOG_MISSING_VERSION',
        severity: 'medium',
        title: `CHANGELOG.md does not mention version ${version}`,
        evidence: [`Searched for "${version}" in CHANGELOG.md — not found`],
        explanation:
          'Release notes should document what changed. Users and consumers rely on the changelog to understand version differences.',
        recommendedCommands: [],
        safeToAutoFix: false,
      });
    }
  } else {
    findings.push({
      id: 'CHANGELOG_MISSING_VERSION',
      severity: 'medium',
      title: 'No CHANGELOG.md found',
      evidence: ['CHANGELOG.md does not exist at repository root'],
      explanation:
        'A changelog documents release history. Without it, users cannot determine what changed between versions.',
      recommendedCommands: [],
      safeToAutoFix: false,
    });
  }

  // Positive: release ready
  if (
    tagExists &&
    tagsAtHead.includes(expectedTag) &&
    trust.git.clean &&
    existsSync(changelogPath) &&
    readFileSync(changelogPath, 'utf-8').includes(version)
  ) {
    findings.push({
      id: 'RELEASE_READY',
      severity: 'info',
      title: `Release ${expectedTag} is properly tagged, documented, and at HEAD`,
      evidence: [
        `Tag ${expectedTag} at ${head}`,
        `CHANGELOG.md contains ${version}`,
        'Working tree clean',
      ],
      explanation: 'All release prerequisites are met for the current version.',
      recommendedCommands: [
        'git push origin master',
        `git push origin ${expectedTag}`,
      ],
      safeToAutoFix: false,
    });
  }

  return findings;
}

// ─── Hook Diagnostics ───────────────────────────────────────────────

function diagnoseHook(repoRoot: string, trust: TrustReport): DoctorFinding[] {
  const findings: DoctorFinding[] = [];

  if (!trust.hook) return findings;

  if (!trust.hook.installed) {
    findings.push({
      id: 'HOOK_ABSENT',
      severity: 'medium',
      title: 'No pre-commit hook installed',
      evidence: [`Expected at: ${trust.hook.path}`, 'File does not exist'],
      explanation:
        'Without a pre-commit hook, type errors, test regressions, and governance drift can enter git history undetected. The hook is the local enforcement gate.',
      recommendedCommands: ['forge0 install-hook'],
      safeToAutoFix: false,
    });
    return findings;
  }

  // Hook exists — check quality
  const hookContent = readFileSync(trust.hook.path, 'utf-8');

  // Weak gates
  const expectedGates = ['typecheck', 'tests', 'audit'];
  const missingGates = expectedGates.filter((g) => !trust.hook!.gates.includes(g));
  if (missingGates.length > 0) {
    findings.push({
      id: 'HOOK_WEAK',
      severity: 'medium',
      title: `Pre-commit hook is missing gate(s): ${missingGates.join(', ')}`,
      evidence: [
        `Installed gates: ${trust.hook.gates.join(', ') || 'none'}`,
        `Expected: ${expectedGates.join(', ')}`,
      ],
      explanation:
        'A hook with missing gates provides partial protection. The three-gate pattern (typecheck, tests, audit) catches the most common failure classes before they enter history.',
      recommendedCommands: ['forge0 install-hook --force'],
      safeToAutoFix: false,
    });
  }

  // Check for mktemp (production safety)
  if (!hookContent.includes('mktemp')) {
    findings.push({
      id: 'HOOK_WEAK',
      severity: 'low',
      title: 'Pre-commit hook does not use unique temp directory',
      evidence: ['Hook content does not contain mktemp'],
      explanation:
        'Without mktemp, concurrent hooks in different repos or shells can collide on shared temp files. Reinstalling with the latest version adds mktemp + trap cleanup.',
      recommendedCommands: ['forge0 install-hook --force'],
      safeToAutoFix: false,
    });
  }

  // Check for trap cleanup
  if (!hookContent.includes('trap')) {
    findings.push({
      id: 'HOOK_WEAK',
      severity: 'low',
      title: 'Pre-commit hook lacks trap-based temp cleanup',
      evidence: ['Hook content does not contain trap'],
      explanation:
        'Without trap cleanup, temp files accumulate on hook failure. The production hook uses trap EXIT to ensure cleanup regardless of exit path.',
      recommendedCommands: ['forge0 install-hook --force'],
      safeToAutoFix: false,
    });
  }

  // Check .agents guard
  if (hookContent.includes('forge0 audit') && !hookContent.includes('.agents')) {
    findings.push({
      id: 'HOOK_WEAK',
      severity: 'medium',
      title: 'Pre-commit hook audit gate is not scoped to .agents/',
      evidence: ['Hook runs forge0 audit without --path .agents or .agents guard'],
      explanation:
        'Without scoping, the audit gate can block commits on unrelated source changes. The production hook checks [ -d .agents ] before running the audit gate.',
      recommendedCommands: ['forge0 install-hook --force'],
      safeToAutoFix: false,
    });
  }

  return findings;
}

// ─── Summarizer ─────────────────────────────────────────────────────

function summarizeFindings(findings: DoctorFinding[]): DoctorSummary {
  const severity = highestSeverity(findings);
  const count = findings.filter((f) => f.severity !== 'info').length;

  let nextAction: string;
  if (count === 0) {
    nextAction = 'Repository is healthy. Safe to push or release.';
  } else {
    // Recommend the first high/critical finding's command, or the first medium
    const urgent = findings.find((f) => f.severity === 'critical' || f.severity === 'high');
    const moderate = findings.find((f) => f.severity === 'medium');
    const target = urgent ?? moderate;
    if (target && target.recommendedCommands.length > 0) {
      nextAction = `Fix: ${target.recommendedCommands[0]}`;
    } else {
      nextAction = `Review ${count} finding(s) and resolve manually.`;
    }
  }

  return { highestSeverity: severity, findingCount: count, recommendedNextAction: nextAction };
}

// ─── Main ────────────────────────────────────────────────────────────

export function runDoctor(repoRoot: string, mode: DoctorMode = 'all'): DoctorReport {
  const trust = buildTrustReport(repoRoot);

  let findings: DoctorFinding[] = [];

  if (mode === 'all' || mode === 'workspace') {
    findings.push(...diagnoseWorkspace(repoRoot, trust));
  }
  if (mode === 'all' || mode === 'release') {
    findings.push(...diagnoseRelease(repoRoot, trust));
  }
  if (mode === 'all' || mode === 'hook') {
    findings.push(...diagnoseHook(repoRoot, trust));
  }

  return {
    generatedAt: new Date().toISOString(),
    repoRoot,
    mode,
    trustPosture: trust.posture,
    findings,
    summary: summarizeFindings(findings),
    honesty: {
      claim:
        'forge0 doctor diagnoses local repository, hook, and release state. Remote tag checks require network access and may be incomplete. Runtime agent behavior is not observable.',
      verified: [
        'local git status and tag state',
        'package.json version',
        'pre-commit hook file content and gate detection',
        'CHANGELOG.md version mention',
        'working tree cleanliness',
      ],
      notObservable: [
        'remote tag state (requires network)',
        'CI pipeline status',
        'downstream consumption of released tags',
        'hidden model context',
      ],
    },
  };
}
