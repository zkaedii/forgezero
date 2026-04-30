import type { ModeDecision, ModeSignal, Policy } from './types.js';
import {
  evaluateBranch,
  evaluatePathsTouched,
  evaluateUncommittedPaths,
  evaluateNearTag,
  evaluateLinesChanged,
  evaluateWorkingTreeClean,
  evaluateRecentCi,
} from './observables.js';
import { classifyIntentConsistency } from './intent-classifier.js';

export interface DecideModeOpts {
  repoRoot: string;
  policy: Policy;
  agentClaimedIntent?: string;
  cliOverride?: 'full' | 'minimal';
  /** Injection point for tests — when provided, skip live evaluation */
  observables?: ModeSignal[];
}

/**
 * decideMode — the four-phase auto-mode router.
 *
 * Phase 1: ALWAYS enumerate all observable signals (or use injected ones)
 * Phase 2: Record agent intent (NOT used in decision)
 * Phase 3: Determine mode from observables
 * Phase 4: Apply CLI override (cannot weaken auto result)
 *
 * See docs/design/auto-mode-router.md §3 for the spec this implements.
 */
export function decideMode(opts: DecideModeOpts): ModeDecision {
  // ── Phase 1: Enumerate all observable signals ──
  const signals: ModeSignal[] = opts.observables ?? [
    evaluateBranch(opts.repoRoot, opts.policy),
    evaluatePathsTouched(opts.repoRoot, opts.policy),
    evaluateUncommittedPaths(opts.repoRoot, opts.policy),
    evaluateNearTag(opts.repoRoot, opts.policy),
    evaluateLinesChanged(opts.repoRoot, opts.policy),
    evaluateWorkingTreeClean(opts.repoRoot),
    evaluateRecentCi(opts.repoRoot),
  ];

  // ── Phase 2: Record agent intent — NOT used in decision ──
  if (opts.agentClaimedIntent) {
    const intentVerdict = classifyIntentConsistency(opts.agentClaimedIntent, signals);
    signals.push({
      signal: 'agent_claimed_intent',
      value: opts.agentClaimedIntent,
      verdict: intentVerdict === 'consistent_with_observables' ? 'neutral' : 'neutral',
      rule: intentVerdict,
    });
  }

  // ── Phase 3: Determine mode from observables ──
  const hasHighRisk = signals.some(s => s.verdict === 'high_risk');

  let autoSelected: 'full' | 'minimal';
  if (hasHighRisk) {
    autoSelected = 'full';
  } else {
    // Check that ALL gating signals (1-6, excluding intent and CI) are low_risk
    const gating = signals.filter(
      s => s.signal !== 'agent_claimed_intent' && s.signal !== 'recent_ci_failure'
    );
    autoSelected = gating.every(s => s.verdict === 'low_risk') ? 'minimal' : 'full';
  }

  // ── Phase 4: Apply CLI override ──
  if (opts.cliOverride === 'full') {
    return {
      selected: 'full',
      selected_by: 'cli_override',
      evidence: signals,
      policy_path: null,
      policy_sha256: null,
    };
  }

  if (opts.cliOverride === 'minimal') {
    if (autoSelected === 'full') {
      // CLI override REJECTED — observables require full
      return {
        selected: 'full',
        selected_by: 'auto',
        cli_override_rejected: true,
        evidence: signals,
        policy_path: null,
        policy_sha256: null,
      };
    }
    return {
      selected: 'minimal',
      selected_by: 'cli_override',
      evidence: signals,
      policy_path: null,
      policy_sha256: null,
    };
  }

  // No CLI override — use auto result
  return {
    selected: autoSelected,
    selected_by: 'auto',
    evidence: signals,
    policy_path: null,
    policy_sha256: null,
  };
}
