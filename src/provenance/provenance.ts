/**
 * forge0 provenance <conversation-id> — reads brain data, produces decision lineage.
 *
 * DETECTION BOUNDARY (Phase 0.5 verified):
 *   Skills: ONLY detectable when agent called view_file on SKILL.md
 *   KIs: ONLY detectable when agent path-referenced knowledge/<slug>
 *   Artifacts: Detectable via write_to_file calls
 *   System-prompt-injected skills: NO TRACE in overview.txt
 */

import { existsSync } from 'node:fs';
import { getOverviewPath, getConversationBrainPath } from '../paths.js';
import { parseOverview, extractProvenance } from '../scanner/brain-parser.js';
import type { ProvenanceReport } from '../scanner/types.js';

/**
 * Run provenance analysis for a conversation.
 *
 * Accepts full UUID or prefix (will attempt to match).
 */
export function runProvenance(conversationId: string): ProvenanceReport {
  const overviewPath = getOverviewPath(conversationId);

  if (!existsSync(overviewPath)) {
    // Return empty report with error caveat
    return {
      conversationId,
      scannedAt: new Date().toISOString(),
      skillsLoaded: [],
      kisReferenced: [],
      artifactsProduced: [],
      totalSteps: 0,
      caveat: `Conversation brain not found at: ${overviewPath}. ` +
        'Verify the conversation ID is correct and the brain directory exists.',
    };
  }

  const steps = parseOverview(overviewPath);
  return extractProvenance(conversationId, steps);
}

/**
 * Validate that a conversation ID exists in the brain directory.
 */
export function conversationExists(conversationId: string): boolean {
  return existsSync(getConversationBrainPath(conversationId));
}
