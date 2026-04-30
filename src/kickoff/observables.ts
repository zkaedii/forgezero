import type { ModeSignal, Policy } from './types.js';
import { matchesAny } from './glob-match.js';
import {
  getCurrentBranch,
  getPathsTouched,
  getUncommittedPaths,
  getCommitDistanceFromTag,
  getLinesChanged,
  isWorkingTreeClean,
  hasRecentCiFailure,
  isGitError,
} from './git-helpers.js';

/**
 * Observable evaluators — one per signal.
 * Each returns a ModeSignal. Pure data extraction + policy matching.
 */

export function evaluateBranch(repoRoot: string, policy: Policy): ModeSignal {
  const branch = getCurrentBranch(repoRoot);
  if (isGitError(branch)) {
    return { signal: 'branch', value: null, verdict: 'not_observable' };
  }
  const isHighRisk = matchesAny(branch, policy.auto_full_branches);
  return {
    signal: 'branch',
    value: branch,
    verdict: isHighRisk ? 'high_risk' : 'low_risk',
    rule: isHighRisk ? 'auto_full_branches' : undefined,
  };
}

export function evaluatePathsTouched(repoRoot: string, policy: Policy): ModeSignal {
  const paths = getPathsTouched(repoRoot, policy.default_branch_ref);
  if (isGitError(paths)) {
    return { signal: 'paths_touched', value: null, verdict: 'not_observable' };
  }

  // Empty paths → low_risk (vacuously satisfies both conjuncts)
  if (paths.length === 0) {
    return { signal: 'paths_touched', value: [], verdict: 'low_risk' };
  }

  // Any path matching auto_full_paths → high_risk
  const fullHit = paths.find(p => matchesAny(p, policy.auto_full_paths));
  if (fullHit) {
    return {
      signal: 'paths_touched',
      value: paths,
      verdict: 'high_risk',
      rule: 'auto_full_paths',
    };
  }

  // All paths must match at least one minimal_allowed_paths
  const notAllowed = paths.find(p => !matchesAny(p, policy.minimal_allowed_paths));
  if (notAllowed) {
    return {
      signal: 'paths_touched',
      value: paths,
      verdict: 'high_risk',
      rule: 'minimal_allowed_paths',
    };
  }

  return { signal: 'paths_touched', value: paths, verdict: 'low_risk' };
}

export function evaluateUncommittedPaths(repoRoot: string, policy: Policy): ModeSignal {
  const paths = getUncommittedPaths(repoRoot);
  if (isGitError(paths)) {
    return { signal: 'uncommitted_paths', value: null, verdict: 'not_observable' };
  }

  if (paths.length === 0) {
    return { signal: 'uncommitted_paths', value: [], verdict: 'low_risk' };
  }

  const hit = paths.find(p => matchesAny(p, policy.auto_full_when_uncommitted_in_paths));
  if (hit) {
    return {
      signal: 'uncommitted_paths',
      value: paths,
      verdict: 'high_risk',
      rule: 'auto_full_when_uncommitted_in_paths',
    };
  }

  return { signal: 'uncommitted_paths', value: paths, verdict: 'low_risk' };
}

export function evaluateNearTag(repoRoot: string, policy: Policy): ModeSignal {
  const distance = getCommitDistanceFromTag(repoRoot);
  if (isGitError(distance)) {
    return { signal: 'near_tag', value: null, verdict: 'not_observable' };
  }

  // null means no tags exist → low_risk (pre-release repo)
  if (distance === null) {
    return { signal: 'near_tag', value: null, verdict: 'low_risk' };
  }

  const isClose = distance <= policy.auto_full_when_tag_within_commits;
  return {
    signal: 'near_tag',
    value: distance,
    verdict: isClose ? 'high_risk' : 'low_risk',
    rule: isClose ? 'auto_full_when_tag_within_commits' : undefined,
  };
}

export function evaluateLinesChanged(repoRoot: string, policy: Policy): ModeSignal {
  const lines = getLinesChanged(repoRoot, policy.default_branch_ref);
  if (isGitError(lines)) {
    return { signal: 'lines_changed', value: null, verdict: 'not_observable' };
  }

  const exceeds = lines > policy.minimal_max_lines_changed;
  return {
    signal: 'lines_changed',
    value: lines,
    verdict: exceeds ? 'high_risk' : 'low_risk',
    rule: exceeds ? 'minimal_max_lines_changed' : undefined,
  };
}

export function evaluateWorkingTreeClean(repoRoot: string): ModeSignal {
  const clean = isWorkingTreeClean(repoRoot);
  if (isGitError(clean)) {
    return { signal: 'working_tree_clean', value: null, verdict: 'not_observable' };
  }

  return {
    signal: 'working_tree_clean',
    value: clean,
    verdict: 'low_risk', // working_tree_clean is always low_risk — the consequences are in other signals
  };
}

export function evaluateRecentCi(repoRoot: string): ModeSignal {
  const failed = hasRecentCiFailure(repoRoot);
  if (isGitError(failed)) {
    return { signal: 'recent_ci_failure', value: null, verdict: 'not_observable' };
  }

  return {
    signal: 'recent_ci_failure',
    value: failed,
    verdict: failed ? 'high_risk' : 'low_risk',
  };
}
