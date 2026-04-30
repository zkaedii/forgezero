import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { KickoffMode, KickoffDump, KickoffResult, ModeDecision } from './types.js';
import { loadPolicy } from './policy.js';
import { computeRegistryMerkle } from './registry.js';
import { decideMode } from './router.js';
import { writeKickoffDump } from './dump.js';
import { generateKickoffPrompt } from './prompt.js';

export interface RunKickoffOpts {
  repoRoot: string;
  mode?: KickoffMode;
  intent?: string;
  explain?: boolean;
  out?: string;
}

/**
 * runKickoff — the kickoff orchestrator.
 *
 * 1. Load policy
 * 2. Compute registry merkle
 * 3. Decide mode (router or policy_default or cli_override)
 * 4. If --explain, return ModeDecision without writing anything
 * 5. Otherwise, construct and write KickoffDump
 * 6. Emit prompt to stdout (full mode only)
 * 7. Return KickoffResult
 */
export function runKickoff(opts: RunKickoffOpts): KickoffResult {
  const { repoRoot, intent, explain } = opts;

  // 1. Load policy
  const { policy, sha256: policySha256, honesty: policyHonesty } = loadPolicy(repoRoot);

  // 2. Compute registry merkle
  const { merkle: registryMerkle, honestyError: merkleError } = computeRegistryMerkle();

  // 3. Determine resolved mode
  let modeDecision: ModeDecision;

  if (!opts.mode || opts.mode === 'auto') {
    // Auto router
    modeDecision = decideMode({
      repoRoot,
      policy,
      agentClaimedIntent: intent,
    });
  } else if (opts.mode === 'full' || opts.mode === 'minimal') {
    // CLI override — still run the full router for evidence
    modeDecision = decideMode({
      repoRoot,
      policy,
      agentClaimedIntent: intent,
      cliOverride: opts.mode,
    });
  } else {
    // policy_default pass-through (when policy.default_mode is not 'auto')
    modeDecision = decideMode({
      repoRoot,
      policy,
      agentClaimedIntent: intent,
    });
  }

  // Stamp policy metadata into the decision
  modeDecision.policy_path = join(repoRoot, '.forge0', 'policy.json');
  modeDecision.policy_sha256 = policySha256;

  const sessionId = randomUUID();
  const resolvedMode = modeDecision.selected;

  // Build honesty block
  const honestyVerified: string[] = ['local repository state', 'policy file', 'skill registry'];
  const honestyNotObservable: string[] = [...policyHonesty];
  if (merkleError) honestyNotObservable.push(merkleError);

  // 4. If --explain, return early
  if (explain) {
    return {
      success: true,
      session_id: sessionId,
      mode: resolvedMode,
      dump_path: '',
      mode_decision: modeDecision,
      registry_merkle: registryMerkle,
      honesty: {
        claim: 'Kickoff explain mode — no dump written, no ledger event recorded.',
        verified: honestyVerified,
        notObservable: honestyNotObservable,
      },
    };
  }

  // 5. Construct and write dump
  const dumpPath = opts.out ?? join(repoRoot, '.forge0', 'sessions', `${sessionId}.json`);

  // Gather local git state
  let branch: string | undefined;
  let head: string | undefined;
  let dirty = false;
  let tagsAtHead: string[] = [];

  try {
    branch = execFileSync('git', ['branch', '--show-current'], { cwd: repoRoot, encoding: 'utf-8', timeout: 5000 }).trim() || undefined;
  } catch { /* not observable */ }
  try {
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf-8', timeout: 5000 }).trim() || undefined;
  } catch { /* not observable */ }
  try {
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf-8', timeout: 5000 }).trim();
    dirty = status.length > 0;
  } catch { /* not observable */ }
  try {
    const tags = execFileSync('git', ['tag', '--points-at', 'HEAD'], { cwd: repoRoot, encoding: 'utf-8', timeout: 5000 }).trim();
    tagsAtHead = tags ? tags.split('\n').filter(Boolean) : [];
  } catch { /* not observable */ }

  const dump: KickoffDump = {
    schema_version: 1,
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    mode: resolvedMode,
    mode_decision: modeDecision,
    local: {
      skill_registry_merkle: registryMerkle,
      repo_root: repoRoot,
      branch,
      head,
      dirty,
      tags_at_head: tagsAtHead,
    },
    ...(resolvedMode === 'full' ? { pending_agent_dump: true } : {}),
    honesty: {
      claim: 'Kickoff dump records the observable environment at session start.',
      verified: honestyVerified,
      notObservable: honestyNotObservable,
    },
  };

  writeKickoffDump(dump, dumpPath);

  return {
    success: true,
    session_id: sessionId,
    mode: resolvedMode,
    dump_path: dumpPath,
    mode_decision: modeDecision,
    registry_merkle: registryMerkle,
    honesty: dump.honesty,
  };
}
