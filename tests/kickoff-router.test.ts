import { decideMode } from '../src/kickoff/router.js';
import { defaultPolicy } from '../src/kickoff/policy.js';
import type { ModeSignal, Policy } from '../src/kickoff/types.js';

/**
 * 12 adversarial test cases from docs/design/auto-mode-router.md §4.
 * Each case asserts THREE properties: mode, reason, and evidence.
 */

function makeSignals(overrides: Partial<Record<string, Partial<ModeSignal>>>): ModeSignal[] {
  const defaults: ModeSignal[] = [
    { signal: 'branch', value: 'feature/typo-fix', verdict: 'low_risk' },
    { signal: 'paths_touched', value: ['docs/README.md'], verdict: 'low_risk' },
    { signal: 'uncommitted_paths', value: [], verdict: 'low_risk' },
    { signal: 'near_tag', value: 100, verdict: 'low_risk' },
    { signal: 'lines_changed', value: 3, verdict: 'low_risk' },
    { signal: 'working_tree_clean', value: true, verdict: 'low_risk' },
    { signal: 'recent_ci_failure', value: false, verdict: 'low_risk' },
  ];
  return defaults.map(d => {
    const override = overrides[d.signal];
    return override ? { ...d, ...override } : d;
  });
}

describe('Auto-Mode Router — 12 Adversarial Cases', () => {
  const policy = defaultPolicy();

  it('Case 1: Clean docs-only session → minimal', () => {
    const observables = makeSignals({});
    const result = decideMode({ repoRoot: '/fake', policy, observables, agentClaimedIntent: 'fix typo' });

    expect(result.selected).toBe('minimal');
    expect(result.selected_by).toBe('auto');
    expect(result.evidence.find(s => s.signal === 'paths_touched')?.verdict).toBe('low_risk');
  });

  it('Case 2: DOWNGRADE ATTACK — agent claims "fix typo" but touches src/auth/', () => {
    const observables = makeSignals({
      paths_touched: { value: ['src/auth/login.ts'], verdict: 'high_risk', rule: 'auto_full_paths' },
      uncommitted_paths: { value: ['src/auth/login.ts'], verdict: 'high_risk', rule: 'auto_full_when_uncommitted_in_paths' },
      working_tree_clean: { value: false, verdict: 'low_risk' },
    });
    const result = decideMode({ repoRoot: '/fake', policy, observables, agentClaimedIntent: 'fix typo' });

    expect(result.selected).toBe('full');
    expect(result.selected_by).toBe('auto');
    expect(result.evidence.find(s => s.signal === 'paths_touched')?.verdict).toBe('high_risk');
  });

  it('Case 3: Dirty tree in src/scanner/, agent claims "doc fix"', () => {
    const observables = makeSignals({
      paths_touched: { value: [], verdict: 'low_risk' },
      uncommitted_paths: { value: ['src/scanner/brain-parser.ts'], verdict: 'high_risk', rule: 'auto_full_when_uncommitted_in_paths' },
      lines_changed: { value: 15, verdict: 'low_risk' },
      working_tree_clean: { value: false, verdict: 'low_risk' },
    });
    const result = decideMode({ repoRoot: '/fake', policy, observables, agentClaimedIntent: 'doc fix' });

    expect(result.selected).toBe('full');
    expect(result.selected_by).toBe('auto');
    expect(result.evidence.find(s => s.signal === 'uncommitted_paths')?.verdict).toBe('high_risk');
  });

  it('Case 4: Release branch, docs-only changes', () => {
    const observables = makeSignals({
      branch: { value: 'release/0.2.0', verdict: 'high_risk', rule: 'auto_full_branches' },
    });
    const result = decideMode({ repoRoot: '/fake', policy, observables });

    expect(result.selected).toBe('full');
    expect(result.selected_by).toBe('auto');
    expect(result.evidence.find(s => s.signal === 'branch')?.verdict).toBe('high_risk');
  });

  it('Case 5: Within 3 commits of a tag', () => {
    const observables = makeSignals({
      near_tag: { value: 2, verdict: 'high_risk', rule: 'auto_full_when_tag_within_commits' },
    });
    const result = decideMode({ repoRoot: '/fake', policy, observables });

    expect(result.selected).toBe('full');
    expect(result.selected_by).toBe('auto');
    expect(result.evidence.find(s => s.signal === 'near_tag')?.verdict).toBe('high_risk');
  });

  it('Case 6: CLI override --mode minimal on clean docs session', () => {
    const observables = makeSignals({
      lines_changed: { value: 2, verdict: 'low_risk' },
    });
    const result = decideMode({ repoRoot: '/fake', policy, cliOverride: 'minimal', observables });

    expect(result.selected).toBe('minimal');
    expect(result.selected_by).toBe('cli_override');
    expect(result.evidence.find(s => s.signal === 'paths_touched')?.verdict).toBe('low_risk');
  });

  it('Case 7: CLI override --mode minimal REJECTED — touches src/auth/', () => {
    const observables = makeSignals({
      branch: { value: 'feature/auth-fix', verdict: 'low_risk' },
      paths_touched: { value: ['src/auth/login.ts'], verdict: 'high_risk', rule: 'auto_full_paths' },
      uncommitted_paths: { value: ['src/auth/login.ts'], verdict: 'high_risk', rule: 'auto_full_when_uncommitted_in_paths' },
      lines_changed: { value: 10, verdict: 'low_risk' },
      working_tree_clean: { value: false, verdict: 'low_risk' },
    });
    const result = decideMode({ repoRoot: '/fake', policy, cliOverride: 'minimal', observables });

    expect(result.selected).toBe('full');
    expect(result.cli_override_rejected).toBe(true);
    expect(result.evidence.find(s => s.signal === 'paths_touched')?.verdict).toBe('high_risk');
  });

  it('Case 8: Missing policy file → defaults, hash is null', () => {
    // This case tests that the router works with default policy.
    // The policy hash null check is in loadPolicy, not the router.
    // Router just evaluates signals.
    const observables = makeSignals({
      branch: { value: 'feature/docs', verdict: 'low_risk' },
      lines_changed: { value: 2, verdict: 'low_risk' },
    });
    const result = decideMode({ repoRoot: '/fake', policy: defaultPolicy(), observables });

    expect(result.selected).toBe('minimal');
    expect(result.selected_by).toBe('auto');
    expect(result.policy_sha256).toBeNull();
  });

  it('Case 9: Large diff exceeds minimal_max_lines_changed', () => {
    const observables = makeSignals({
      branch: { value: 'feature/docs-rewrite', verdict: 'low_risk' },
      paths_touched: { value: ['docs/architecture.md', 'docs/design.md'], verdict: 'low_risk' },
      lines_changed: { value: 200, verdict: 'high_risk', rule: 'minimal_max_lines_changed' },
    });
    const result = decideMode({ repoRoot: '/fake', policy, observables, agentClaimedIntent: 'rewrite docs' });

    expect(result.selected).toBe('full');
    expect(result.selected_by).toBe('auto');
    expect(result.evidence.find(s => s.signal === 'lines_changed')?.verdict).toBe('high_risk');
  });

  it('Case 10: CI recently failed', () => {
    const observables = makeSignals({
      branch: { value: 'feature/docs', verdict: 'low_risk' },
      recent_ci_failure: { value: true, verdict: 'high_risk' },
    });
    const result = decideMode({ repoRoot: '/fake', policy, observables });

    expect(result.selected).toBe('full');
    expect(result.selected_by).toBe('auto');
    expect(result.evidence.find(s => s.signal === 'recent_ci_failure')?.verdict).toBe('high_risk');
  });

  it('Case 11: Novel project category — wallet key handler', () => {
    const observables = makeSignals({
      branch: { value: 'feature/wallet-keys', verdict: 'low_risk' },
      paths_touched: { value: ['src/wallet/key-derivation.ts'], verdict: 'high_risk', rule: 'auto_full_paths' },
      uncommitted_paths: { value: ['src/wallet/key-derivation.ts'], verdict: 'high_risk', rule: 'auto_full_when_uncommitted_in_paths' },
      lines_changed: { value: 30, verdict: 'low_risk' },
      working_tree_clean: { value: false, verdict: 'low_risk' },
    });
    const result = decideMode({ repoRoot: '/fake', policy, observables, agentClaimedIntent: 'add wallet support' });

    expect(result.selected).toBe('full');
    expect(result.selected_by).toBe('auto');
    expect(result.evidence.find(s => s.signal === 'paths_touched')?.verdict).toBe('high_risk');
  });

  it('Case 12: Smart contract audit — agent underreports scope', () => {
    const observables = makeSignals({
      branch: { value: 'main', verdict: 'high_risk', rule: 'auto_full_branches' },
      paths_touched: { value: ['contracts/Token.sol', 'src/auditor/analyzer.ts'], verdict: 'high_risk', rule: 'auto_full_paths' },
      uncommitted_paths: { value: ['contracts/Token.sol'], verdict: 'low_risk' },
      near_tag: { value: 1, verdict: 'high_risk', rule: 'auto_full_when_tag_within_commits' },
      lines_changed: { value: 150, verdict: 'high_risk', rule: 'minimal_max_lines_changed' },
      working_tree_clean: { value: false, verdict: 'low_risk' },
    });
    const result = decideMode({ repoRoot: '/fake', policy, observables, agentClaimedIntent: 'review code' });

    expect(result.selected).toBe('full');
    expect(result.selected_by).toBe('auto');
    expect(result.evidence.find(s => s.signal === 'branch')?.verdict).toBe('high_risk');
  });
});

describe('Auto-Mode Router — CLI override always enumerates evidence', () => {
  it('--mode full still populates evidence array', () => {
    const observables = makeSignals({});
    const result = decideMode({ repoRoot: '/fake', policy: defaultPolicy(), cliOverride: 'full', observables });

    expect(result.selected).toBe('full');
    expect(result.selected_by).toBe('cli_override');
    // Evidence must still be fully populated even though override was 'full'
    expect(result.evidence.length).toBeGreaterThanOrEqual(7);
    expect(result.evidence.find(s => s.signal === 'branch')).toBeDefined();
  });
});
