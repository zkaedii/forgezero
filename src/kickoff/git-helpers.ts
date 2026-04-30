import { execFileSync } from 'node:child_process';

/**
 * Git helper wrappers — pure data extraction via execFileSync.
 * execFileSync (NOT execSync) is used to prevent shell-injection
 * on policy-controlled values like default_branch_ref.
 *
 * Every function returns a result or a sentinel on error.
 * The sentinel is consumed by the observable evaluators to produce
 * verdict: 'not_observable'.
 */

const GIT_ERROR = Symbol('GIT_ERROR');
type GitResult<T> = T | typeof GIT_ERROR;

function git(repoRoot: string, args: string[]): GitResult<string> {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return GIT_ERROR;
  }
}

export function isGitError<T>(result: GitResult<T>): result is typeof GIT_ERROR {
  return result === GIT_ERROR;
}

export function getCurrentBranch(repoRoot: string): GitResult<string> {
  return git(repoRoot, ['branch', '--show-current']);
}

/**
 * Resolve the merge-base between HEAD and the configured default branch ref.
 * Falls back to origin/master if the primary ref does not resolve.
 */
function resolveMergeBase(repoRoot: string, defaultBranchRef: string): GitResult<string> {
  const primary = git(repoRoot, ['merge-base', 'HEAD', defaultBranchRef]);
  if (!isGitError(primary)) return primary;

  // Fallback to origin/master
  if (defaultBranchRef !== 'origin/master') {
    const fallback = git(repoRoot, ['merge-base', 'HEAD', 'origin/master']);
    if (!isGitError(fallback)) return fallback;
  }

  // Final fallback: HEAD~1
  return git(repoRoot, ['rev-parse', 'HEAD~1']);
}

/**
 * Get all paths touched since merge-base (committed) + uncommitted changes.
 */
export function getPathsTouched(repoRoot: string, defaultBranchRef: string): GitResult<string[]> {
  const mergeBase = resolveMergeBase(repoRoot, defaultBranchRef);
  if (isGitError(mergeBase)) return GIT_ERROR;

  const committed = git(repoRoot, ['diff', '--name-only', mergeBase]);
  const uncommittedRaw = git(repoRoot, ['status', '--porcelain']);

  const committedPaths = isGitError(committed) ? [] : committed.split('\n').filter(Boolean);
  const uncommittedPaths = isGitError(uncommittedRaw)
    ? []
    : uncommittedRaw.split('\n').filter(Boolean).map(line => line.slice(3)); // strip status prefix

  // Union and deduplicate
  const all = new Set([...committedPaths, ...uncommittedPaths]);
  return [...all];
}

/**
 * Get uncommitted paths only (from git status --porcelain).
 */
export function getUncommittedPaths(repoRoot: string): GitResult<string[]> {
  const raw = git(repoRoot, ['status', '--porcelain']);
  if (isGitError(raw)) return GIT_ERROR;
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => line.slice(3));
}

/**
 * Get commit distance from the nearest tag.
 * Returns null if no tags exist.
 */
export function getCommitDistanceFromTag(repoRoot: string): GitResult<number | null> {
  const tag = git(repoRoot, ['describe', '--tags', '--abbrev=0']);
  if (isGitError(tag)) return null; // no tags — pre-release repo

  const count = git(repoRoot, ['rev-list', '--count', `${tag}..HEAD`]);
  if (isGitError(count)) return GIT_ERROR;
  return parseInt(count, 10);
}

/**
 * Get total lines changed (additions + deletions) since merge-base plus uncommitted.
 */
export function getLinesChanged(repoRoot: string, defaultBranchRef: string): GitResult<number> {
  const mergeBase = resolveMergeBase(repoRoot, defaultBranchRef);
  if (isGitError(mergeBase)) return GIT_ERROR;

  let total = 0;

  const committedStats = git(repoRoot, ['diff', '--numstat', mergeBase]);
  if (!isGitError(committedStats) && committedStats) {
    for (const line of committedStats.split('\n').filter(Boolean)) {
      const [add, del] = line.split('\t');
      if (add !== '-') total += parseInt(add, 10) + parseInt(del, 10);
    }
  }

  const uncommittedStats = git(repoRoot, ['diff', '--numstat']);
  if (!isGitError(uncommittedStats) && uncommittedStats) {
    for (const line of uncommittedStats.split('\n').filter(Boolean)) {
      const [add, del] = line.split('\t');
      if (add !== '-') total += parseInt(add, 10) + parseInt(del, 10);
    }
  }

  return total;
}

/**
 * Check if the working tree is clean (no uncommitted changes).
 */
export function isWorkingTreeClean(repoRoot: string): GitResult<boolean> {
  const raw = git(repoRoot, ['status', '--porcelain']);
  if (isGitError(raw)) return GIT_ERROR;
  return raw === '';
}

/**
 * Check for recent CI failures via gh CLI.
 * Returns true if any of the last 5 runs failed.
 * Returns GIT_ERROR if gh is unavailable.
 */
export function hasRecentCiFailure(repoRoot: string): GitResult<boolean> {
  try {
    const raw = execFileSync('gh', ['run', 'list', '--limit', '5', '--json', 'conclusion'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      timeout: 15_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const runs = JSON.parse(raw) as Array<{ conclusion: string }>;
    return runs.some(r => r.conclusion === 'failure');
  } catch {
    return GIT_ERROR;
  }
}
