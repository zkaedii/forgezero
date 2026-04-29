import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BumpType, ReleasePlan, ReleasePlanOptions, ReleasePlanStep } from './types.js';

function getPackageVersion(repoRoot: string): string {
  const pkgPath = join(repoRoot, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new Error('package.json not found in repository root');
  }
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf-8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function calculateNextVersion(current: string, bump: BumpType): string {
  if (bump === 'none') return current;
  const parts = current.split('.');
  if (parts.length !== 3) return current;

  let major = parseInt(parts[0], 10) || 0;
  let minor = parseInt(parts[1], 10) || 0;
  let patch = parseInt(parts[2], 10) || 0;

  if (bump === 'major') {
    major++;
    minor = 0;
    patch = 0;
  } else if (bump === 'minor') {
    minor++;
    patch = 0;
  } else if (bump === 'patch') {
    patch++;
  }

  return `${major}.${minor}.${patch}`;
}

export function planRelease(repoRoot: string, opts: ReleasePlanOptions): ReleasePlan {
  const currentVersion = getPackageVersion(repoRoot);
  const targetVersion = calculateNextVersion(currentVersion, opts.versionType);

  const steps: ReleasePlanStep[] = [];

  // 1. Preflight
  steps.push({
    name: 'Preflight Checks',
    command: 'forge0 status',
    description: 'Verify current trust posture before initiating release sequence.',
    critical: true,
  });

  if (opts.versionType !== 'none') {
    steps.push({
      name: 'Version Bump',
      command: `npm version ${opts.versionType} --no-git-tag-version`,
      description: `Bumps package version from ${currentVersion} to ${targetVersion} without committing.`,
      critical: true,
    });

    steps.push({
      name: 'Build and Test',
      command: 'npm run build && npm test',
      description: 'Ensure the new version builds and passes all tests before committing.',
      critical: true,
    });

    steps.push({
      name: 'Commit and Tag',
      command: `git add package.json package-lock.json CHANGELOG.md && git commit -m "chore: release v${targetVersion}" && git tag v${targetVersion}`,
      description: 'Commit the version bump and create the release tag.',
      critical: true,
    });

    steps.push({
      name: 'Push Commits & Tags',
      command: `git push origin master && git push origin v${targetVersion}`,
      description: 'Push version bump commit and tag to origin.',
      critical: true,
    });
  }

  // Verification
  let verifyCmd = 'forge0 verify --mode release';
  let verifyDesc = 'Enforce local release gates (tree clean, tests pass, audit green).';
  if (opts.verifyRemote) {
    verifyCmd += ' --remote';
    verifyDesc = 'Confirm origin has synchronized the release commit and tag.';
  }
  if (opts.verifyCi) {
    verifyCmd += ' --ci';
    verifyDesc = 'Confirm origin has synchronized the release commit and tag and wait for CI.';
  }

  steps.push({
    name: 'Verification',
    command: verifyCmd,
    description: verifyDesc,
    critical: true,
  });

  // Ledger Planning
  const ledgerMode = opts.verifyCi && opts.verifyRemote ? '--mode release --remote --ci' :
                     opts.verifyRemote ? '--mode release --remote' :
                     '--mode release';

  steps.push({
    name: 'Record Verification',
    command: `forge0 ledger record --event verify ${ledgerMode}`,
    description: 'Durably commit the verify event to the ledger hash chain.',
    critical: true,
  });

  steps.push({
    name: 'Record Receipt',
    command: `forge0 ledger record --event receipt`,
    description: 'Durably commit the receipt generation event to the ledger.',
    critical: true,
  });

  steps.push({
    name: 'Verify Ledger',
    command: 'forge0 ledger verify',
    description: 'Check ledger hash chain integrity to finalize the seal.',
    critical: true,
  });

  return {
    currentVersion,
    targetVersion,
    steps,
  };
}
