import type { ModeSignal } from './types.js';

/**
 * Classify agent-claimed intent consistency against observable signals.
 * Per spec §7 of auto-mode-router.md: if any non-intent signal returned
 * high_risk, classify as inconsistent regardless of content.
 */
export function classifyIntentConsistency(
  _intent: string,
  signals: ModeSignal[]
): 'consistent_with_observables' | 'inconsistent_with_observables' {
  const hasHighRisk = signals.some(
    s => s.signal !== 'agent_claimed_intent' && s.verdict === 'high_risk'
  );
  return hasHighRisk ? 'inconsistent_with_observables' : 'consistent_with_observables';
}
