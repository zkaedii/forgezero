/**
 * Shared test helpers for creating temporary git repositories.
 * Used by ledger.test.ts, verify.test.ts, and any future integration tests.
 */

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

/**
 * Create a minimal temp git repo with package.json, package-lock.json,
 * and CHANGELOG.md so recordVerifyEvent/recordReceiptEvent can resolve
 * version metadata and trust report without touching the real repo.
 */
export function createTempGitRepo(version = '0.0.1'): string {
  const dir = mkdtempSync(join(tmpdir(), 'forge0-test-'));
  execSync('git -c init.defaultBranch=master init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "test"', { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test', version }));
  writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({
    name: 'test', version, lockfileVersion: 3, packages: { '': { version } }
  }));
  writeFileSync(join(dir, 'CHANGELOG.md'), `# Changelog\n\n## [${version}]\n\n- test\n`);
  execSync('git add -A', { cwd: dir, stdio: 'pipe' });
  execSync('git commit -m "init"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

export interface TempGitRepoWithRemote {
  repoRoot: string;
  remoteRoot: string;
  tagName: string;
  cleanup: () => void;
}

/**
 * Create a temp git repo with a bare remote and an annotated tag pushed to it.
 * Used for integration-testing runVerify with opts.remote = true.
 */
export function createTempGitRepoWithRemoteAndAnnotatedTag(
  version = '0.0.1'
): TempGitRepoWithRemote {
  const repoRoot = createTempGitRepo(version);
  const remoteRoot = mkdtempSync(join(tmpdir(), 'forge0-remote-'));
  const tagName = `v${version}`;

  // Init bare remote, push with upstream tracking
  execSync('git init --bare', { cwd: remoteRoot, stdio: 'pipe' });
  execSync(`git remote add origin "${remoteRoot}"`, { cwd: repoRoot, stdio: 'pipe' });
  execSync('git push -u origin master', { cwd: repoRoot, stdio: 'pipe' });

  // Create annotated tag and push
  execSync(`git tag -a ${tagName} -m "test annotated tag"`, { cwd: repoRoot, stdio: 'pipe' });
  execSync(`git push origin ${tagName}`, { cwd: repoRoot, stdio: 'pipe' });

  return {
    repoRoot,
    remoteRoot,
    tagName,
    cleanup: () => {
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(remoteRoot, { recursive: true, force: true });
    },
  };
}
