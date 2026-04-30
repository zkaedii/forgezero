import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { TraceResult, TraceTag } from './types.js';
import type { KickoffDump, AgentDump } from '../kickoff/types.js';
import { loadPolicy } from '../kickoff/policy.js';
import { computeRegistryMerkle } from '../kickoff/registry.js';
import { evaluatePathsTouched } from '../kickoff/observables.js';

/**
 * runTrace — audit a kickoff session against current disk state.
 *
 * Tag precedence (first match wins):
 * NOT_OBSERVED → TRACE_INTEGRITY_FAILURE → MODE_MISMATCH →
 * SCOPE_EXCEEDED_MODE → DIVERGENT_FROM_DISK → AGENT_DUMP_PARTIAL →
 * CORROBORATED_VIA_DISK → DETECTED_VIA_AGENT_REPORT
 */
export function runTrace(sessionId: string, repoRoot: string): TraceResult {
  const dumpPath = join(repoRoot, '.forge0', 'sessions', `${sessionId}.json`);
  const agentDumpPath = join(repoRoot, '.forge0', 'sessions', `${sessionId}.agent.json`);

  const honesty = {
    claim: 'Trace compares kickoff-time snapshot against current disk state.',
    verified: [] as string[],
    notObservable: [] as string[],
  };

  // ── NOT_OBSERVED ──
  if (!existsSync(dumpPath)) {
    return {
      session_id: sessionId,
      tag: 'NOT_OBSERVED',
      exit_code: 0,
      detail: `No kickoff dump found for session ${sessionId}`,
      honesty,
    };
  }

  // ── TRACE_INTEGRITY_FAILURE ──
  let dump: KickoffDump;
  try {
    const raw = readFileSync(dumpPath, 'utf-8');
    dump = JSON.parse(raw);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      session_id: sessionId,
      tag: 'TRACE_INTEGRITY_FAILURE',
      exit_code: 1,
      detail: `Dump is malformed: ${msg}`,
      honesty,
    };
  }

  if (dump.schema_version !== 1) {
    return {
      session_id: sessionId,
      tag: 'TRACE_INTEGRITY_FAILURE',
      exit_code: 1,
      detail: `Unknown schema_version: ${dump.schema_version}`,
      honesty,
    };
  }

  // Check agent dump integrity if present (full mode)
  let agentDump: AgentDump | null = null;
  const agentDumpExists = existsSync(agentDumpPath);

  if (agentDumpExists) {
    try {
      agentDump = JSON.parse(readFileSync(agentDumpPath, 'utf-8'));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        session_id: sessionId,
        tag: 'TRACE_INTEGRITY_FAILURE',
        exit_code: 1,
        detail: `Agent dump is malformed: ${msg}`,
        honesty,
      };
    }

    // Verify hash
    if (agentDump) {
      const recomputed = createHash('sha256')
        .update(agentDump.available_skills_block)
        .digest('hex');
      if (recomputed !== agentDump.available_skills_block_sha256) {
        return {
          session_id: sessionId,
          tag: 'TRACE_INTEGRITY_FAILURE',
          exit_code: 1,
          detail: `Agent dump hash mismatch: expected ${agentDump.available_skills_block_sha256}, got ${recomputed}`,
          payload: {
            expected: agentDump.available_skills_block_sha256,
            actual: recomputed,
          },
          honesty,
        };
      }
    }
  }

  honesty.verified.push('dump file parsed', 'schema_version verified');

  // ── MODE_MISMATCH ──
  // Sub-condition (a): policy_sha256 mismatch
  const { sha256: currentPolicySha256 } = loadPolicy(repoRoot);
  if (dump.mode_decision.policy_sha256 !== currentPolicySha256) {
    return {
      session_id: sessionId,
      tag: 'MODE_MISMATCH',
      exit_code: 2,
      detail: 'Policy file changed since kickoff',
      payload: {
        kickoff_policy_sha256: dump.mode_decision.policy_sha256,
        current_policy_sha256: currentPolicySha256,
      },
      honesty,
    };
  }

  // Sub-condition (b): registry merkle set_hash mismatch
  const { merkle: currentMerkle } = computeRegistryMerkle();
  if (dump.local.skill_registry_merkle.set_hash !== currentMerkle.set_hash) {
    return {
      session_id: sessionId,
      tag: 'MODE_MISMATCH',
      exit_code: 2,
      detail: 'Skill registry changed since kickoff',
      payload: {
        kickoff_set_hash: dump.local.skill_registry_merkle.set_hash,
        current_set_hash: currentMerkle.set_hash,
      },
      honesty,
    };
  }

  // TODO(v0.3.0): cross-session agent_self_id check — see kickoff-orchestrator.md §7 sub-condition (c)

  // ── SCOPE_EXCEEDED_MODE (minimal only) ──
  if (dump.mode === 'minimal') {
    const { policy } = loadPolicy(repoRoot);
    const pathSignal = evaluatePathsTouched(repoRoot, policy);
    if (pathSignal.verdict === 'high_risk') {
      const paths = Array.isArray(pathSignal.value) ? pathSignal.value : [];
      return {
        session_id: sessionId,
        tag: 'SCOPE_EXCEEDED_MODE',
        exit_code: 2,
        detail: 'Session touched paths outside its minimal-mode envelope',
        payload: {
          exceeded_paths: paths,
          rule: pathSignal.rule,
        },
        honesty,
      };
    }
  }

  // ── Full-mode agent dump analysis ──
  if (dump.mode === 'full') {
    // AGENT_DUMP_PARTIAL — agent.json missing or has partial-visibility honesty notes
    if (!agentDumpExists || !agentDump) {
      return {
        session_id: sessionId,
        tag: 'AGENT_DUMP_PARTIAL',
        exit_code: 0,
        detail: 'Agent dump file is missing on disk',
        honesty,
      };
    }

    // Check for partial-visibility phrases in honesty_notes
    const partialPhrases = [/cannot see/i, /partial/i, /restricted/i];
    if (agentDump.honesty_notes && partialPhrases.some(p => p.test(agentDump!.honesty_notes))) {
      return {
        session_id: sessionId,
        tag: 'AGENT_DUMP_PARTIAL',
        exit_code: 0,
        detail: `Agent honesty notes indicate partial visibility: "${agentDump.honesty_notes}"`,
        payload: { honesty_notes: agentDump.honesty_notes },
        honesty,
      };
    }

    // ── DIVERGENT_FROM_DISK ──
    const agentSlugs = new Set(agentDump.skill_slugs);
    const localSlugs = new Set(Object.keys(dump.local.skill_registry_merkle.slug_hashes));

    const agent_only = [...agentSlugs].filter(s => !localSlugs.has(s)).sort();
    const local_only = [...localSlugs].filter(s => !agentSlugs.has(s)).sort();
    const common = [...agentSlugs].filter(s => localSlugs.has(s)).sort();

    if (agent_only.length > 0 || local_only.length > 0) {
      return {
        session_id: sessionId,
        tag: 'DIVERGENT_FROM_DISK',
        exit_code: 2,
        detail: `Agent-reported slugs differ from local registry: ${agent_only.length} agent-only, ${local_only.length} local-only`,
        payload: { agent_only, local_only, common },
        honesty,
      };
    }

    // ── CORROBORATED_VIA_DISK ──
    honesty.verified.push('agent dump hash verified', 'slug sets match', 'registry merkle match');
    return {
      session_id: sessionId,
      tag: 'CORROBORATED_VIA_DISK',
      exit_code: 0,
      detail: 'Full-mode dump corroborated against current disk state',
      honesty,
    };
  }

  // ── Minimal mode: DETECTED_VIA_AGENT_REPORT ──
  honesty.verified.push('registry merkle match', 'no scope drift detected');
  return {
    session_id: sessionId,
    tag: 'DETECTED_VIA_AGENT_REPORT',
    exit_code: 0,
    detail: 'Minimal-mode dump exists; lower confidence (agent report only)',
    honesty,
  };
}
