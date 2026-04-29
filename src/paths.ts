/**
 * OS-aware path resolution for ForgeZero.
 *
 * GROUND TRUTH (verified via Phase 0.5 filesystem walk):
 *   - Agent data lives at ~/.gemini/antigravity/ (Windows: %USERPROFILE%\.gemini\antigravity\)
 *   - ~/.antigravity/ is IDE extension binaries — ForgeZero NEVER reads this
 *   - ~/.gemini/antigravity/prompting/ is internal browser-agent prompts — ForgeZero skips
 */

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

/** Canonical agent data root — ALWAYS ~/.gemini/antigravity/ */
export function getAntigravityDataRoot(): string {
  return resolve(join(homedir(), '.gemini', 'antigravity'));
}

/** Knowledge Items directory */
export function getKnowledgePath(): string {
  return join(getAntigravityDataRoot(), 'knowledge');
}

/** Conversation brain directory */
export function getBrainPath(): string {
  return join(getAntigravityDataRoot(), 'brain');
}

/** Specific conversation brain */
export function getConversationBrainPath(conversationId: string): string {
  return join(getBrainPath(), conversationId);
}

/** Conversation overview.txt (JSONL log) */
export function getOverviewPath(conversationId: string): string {
  return join(getConversationBrainPath(conversationId), '.system_generated', 'logs', 'overview.txt');
}

/** MCP config */
export function getMcpConfigPath(): string {
  return join(getAntigravityDataRoot(), 'mcp_config.json');
}

/** ForgeZero local state directory */
export function getForgeZeroStatePath(workspaceRoot: string): string {
  return join(workspaceRoot, '.forge0');
}

/** ForgeZero config file */
export function getForgeZeroConfigPath(workspaceRoot: string): string {
  return join(getForgeZeroStatePath(workspaceRoot), 'config.json');
}

/**
 * Attempt to auto-detect the .agents/ or skills directory.
 * Checks common locations in order of precedence.
 */
export function findAgentsSurface(workspaceRoot: string): string | null {
  const candidates = [
    join(workspaceRoot, '.agents'),
    join(workspaceRoot, '.agents', 'skills'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Get the canonical path to the ForgeZero SKILL.md.
 * Handles both local checkout (src/...) and global install (dist/...).
 */
export function getCanonicalSkillPath(): string {
  // If running from src/ (dev)
  const devPath = resolve(import.meta.dirname, '../docs/skill/SKILL.md');
  if (existsSync(devPath)) return devPath;

  // If running from dist/src/ (prod globally installed)
  const prodPath = resolve(import.meta.dirname, '../../docs/skill/SKILL.md');
  if (existsSync(prodPath)) return prodPath;

  return devPath; // Fallback so errors point somewhere plausible
}

/**
 * Validate that critical ForgeZero paths exist.
 * Returns list of missing paths (empty = all good).
 */
export function validatePaths(): { path: string; label: string; exists: boolean }[] {
  return [
    {
      path: getAntigravityDataRoot(),
      label: 'Antigravity data root (~/.gemini/antigravity/)',
      exists: existsSync(getAntigravityDataRoot()),
    },
    {
      path: getKnowledgePath(),
      label: 'Knowledge Items directory',
      exists: existsSync(getKnowledgePath()),
    },
    {
      path: getBrainPath(),
      label: 'Conversation brain directory',
      exists: existsSync(getBrainPath()),
    },
  ];
}
