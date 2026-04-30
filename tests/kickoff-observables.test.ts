import { evaluateBranch, evaluatePathsTouched, evaluateRecentCi } from '../src/kickoff/observables.js';
import { defaultPolicy } from '../src/kickoff/policy.js';
import * as gitHelpers from '../src/kickoff/git-helpers.js';
import { vi } from 'vitest';

describe('Observable Evaluators', () => {
  const policy = defaultPolicy();

  it('evaluateBranch low_risk on non-protected branch', () => {
    vi.spyOn(gitHelpers, 'getCurrentBranch').mockReturnValue('feature/typo-fix');
    const signal = evaluateBranch('/fake', policy);
    expect(signal.verdict).toBe('low_risk');
    expect(signal.signal).toBe('branch');
    expect(signal.value).toBe('feature/typo-fix');
    vi.restoreAllMocks();
  });

  it('evaluateBranch high_risk when branch matches release/*', () => {
    vi.spyOn(gitHelpers, 'getCurrentBranch').mockReturnValue('release/0.2.0');
    const signal = evaluateBranch('/fake', policy);
    expect(signal.verdict).toBe('high_risk');
    expect(signal.signal).toBe('branch');
    expect(signal.rule).toBe('auto_full_branches');
    vi.restoreAllMocks();
  });

  it('evaluatePathsTouched low_risk for empty array (vacuous truth)', () => {
    vi.spyOn(gitHelpers, 'getPathsTouched').mockReturnValue([]);
    const signal = evaluatePathsTouched('/fake', policy);
    expect(signal.verdict).toBe('low_risk');
    expect(signal.signal).toBe('paths_touched');
    expect(signal.value).toEqual([]);
    vi.restoreAllMocks();
  });

  it('evaluateRecentCi not_observable when gh unavailable', () => {
    vi.spyOn(gitHelpers, 'hasRecentCiFailure').mockImplementation(() => {
      // Simulate GIT_ERROR by using the isGitError sentinel
      // The actual function returns GIT_ERROR symbol on failure.
      // We need to simulate this at the observable level.
      throw new Error('gh not available');
    });

    // We need to mock at a lower level - mock the hasRecentCiFailure to return the sentinel
    vi.restoreAllMocks();

    // Mock the git helper to return the GIT_ERROR sentinel
    const originalHasRecentCiFailure = gitHelpers.hasRecentCiFailure;
    const mockFn = vi.fn().mockImplementation((_repoRoot: string) => {
      // Return the GIT_ERROR sentinel - need to get it from the module
      // Since GIT_ERROR is not exported, we mock execFileSync to throw
      return Symbol('GIT_ERROR');
    });
    vi.spyOn(gitHelpers, 'hasRecentCiFailure').mockImplementation(mockFn);

    // Since we can't perfectly replicate the internal sentinel,
    // test at the evaluateRecentCi level by mocking at the right layer.
    // The isGitError check won't match our mock symbol.
    // Instead, let's test this differently by using the actual execFileSync mock.
    vi.restoreAllMocks();

    // Better approach: use a spy on execFileSync via the child_process mock
    // For a clean unit test, we'll use the observable directly with a repo path
    // that we know will fail the gh call.
    const signal = evaluateRecentCi('/nonexistent-repo-path-that-definitely-does-not-exist');
    expect(signal.signal).toBe('recent_ci_failure');
    // gh CLI will fail in this non-repo context → not_observable
    expect(signal.verdict).toBe('not_observable');
  });
});
