/**
 * forge0 audit — diffs .agents/ (or Skills directory) against last git commit.
 * Surfaces which Skills/Rules/Workflows changed with semantic classification.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import type { AuditEntry, AuditReport, ChangeType } from '../scanner/types.js';
import { parseSkillFile } from '../scanner/skill-parser.js';

/** Audit scope caveat — symmetric with provenance caveat */
const AUDIT_CAVEAT =
  'Audit covers git-tracked .agents/ surfaces only. Knowledge Items auto-generate ' +
  'from conversations and drift outside git. Model-Decision rules can change agent ' +
  'behavior without any file change. Run `forge0 provenance` for runtime evidence.';

export type GitStatus = 'AVAILABLE' | 'MISSING' | 'NOT_A_REPO';

/**
 * Check git availability and whether the workspace is a git repo.
 * Returns structured status instead of boolean.
 */
export function checkGitAvailable(workspaceRoot: string): GitStatus {
  // 1. Is git on PATH?
  try {
    execSync(process.platform === 'win32' ? 'where git' : 'which git', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return 'MISSING';
  }

  // 2. Is this a git repo?
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: workspaceRoot,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return 'AVAILABLE';
  } catch {
    return 'NOT_A_REPO';
  }
}

/**
 * Classify a file path into its surface type.
 */
export function classifySurface(
  filePath: string,
): AuditEntry['surfaceType'] {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();

  if (normalized.includes('docs/skill/skill.md') || normalized.includes('forgezero/skill.md')) {
    return 'Skill [META]';
  }
  if (normalized.includes('skill.md') || normalized.includes('/skills/')) {
    return 'Skill';
  }
  if (normalized.includes('/rules/') || normalized.includes('rule')) {
    return 'Rule';
  }
  if (normalized.includes('/workflows/') || normalized.includes('workflow')) {
    return 'Workflow';
  }
  if (normalized.includes('mcp_config') || normalized.includes('mcp')) {
    return 'MCP';
  }
  if (normalized.includes('permission')) {
    return 'Permission';
  }

  return 'Unknown';
}

/**
 * Map git status letter to ChangeType.
 */
function parseGitStatus(status: string): ChangeType {
  switch (status.trim().charAt(0)) {
    case 'A':
      return 'Added';
    case 'M':
      return 'Modified';
    case 'D':
      return 'Deleted';
    case 'R':
      return 'Renamed';
    default:
      return 'Modified';
  }
}

/**
 * Run git diff to find changed files in a directory.
 * Caller MUST check checkGitAvailable() first — this function
 * returns [] on any git failure, which is indistinguishable from
 * "no changes" without the git status gate.
 */
export function getGitChanges(
  workspaceRoot: string,
  targetPath: string,
  depth: number = 1,
): { status: string; filePath: string }[] {
  try {
    const relativePath = relative(workspaceRoot, targetPath) || '.';
    const cmd = `git diff --name-status HEAD~${depth} -- "${relativePath}"`;
    const output = execSync(cmd, {
      cwd: workspaceRoot,
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return output
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const parts = line.split('\t');
        return {
          status: parts[0] ?? 'M',
          filePath: parts[parts.length - 1] ?? '',
        };
      });
  } catch {
    // Not a git repo or no commits — return empty
    return [];
  }
}

/**
 * Generate semantic diff description for SKILL.md changes.
 */
function generateSkillSemanticDiff(
  workspaceRoot: string,
  filePath: string,
): string | undefined {
  const fullPath = resolve(workspaceRoot, filePath);
  if (!existsSync(fullPath) || !filePath.toLowerCase().endsWith('skill.md')) {
    return undefined;
  }

  try {
    // Get previous version from git
    const oldContent = execSync(`git show HEAD~1:"${filePath}"`, {
      cwd: workspaceRoot,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const newSkill = parseSkillFile(fullPath);
    const oldFrontmatter = extractYamlFrontmatter(oldContent);

    const diffs: string[] = [];

    if (oldFrontmatter.name !== newSkill.frontmatter.name) {
      diffs.push(`name: "${oldFrontmatter.name}" → "${newSkill.frontmatter.name}"`);
    }
    if (oldFrontmatter.description !== newSkill.frontmatter.description) {
      diffs.push(`description changed`);
    }

    const oldHash = createHash('sha256').update(oldContent).digest('hex');
    if (oldHash !== newSkill.contentHash) {
      diffs.push('content body modified');
    }

    return diffs.length > 0 ? diffs.join('; ') : 'metadata or whitespace change';
  } catch {
    return undefined;
  }
}

function extractYamlFrontmatter(content: string): { name: string; description: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { name: '', description: '' };

  try {
    // Simple extraction without full yaml parse (avoid dependency in diff path)
    const nameMatch = match[1].match(/name:\s*(.+)/);
    const descMatch = match[1].match(/description:\s*(.+)/);
    return {
      name: nameMatch?.[1]?.trim() ?? '',
      description: descMatch?.[1]?.trim() ?? '',
    };
  } catch {
    return { name: '', description: '' };
  }
}

/**
 * Main audit entry point.
 *
 * @param workspaceRoot - Root of the git workspace
 * @param targetPath - Path to .agents/ or skills directory
 * @param depth - Number of commits to diff against (default 1)
 * @returns AuditReport with all detected changes, git status, and scope caveat
 */
export function runAudit(
  workspaceRoot: string,
  targetPath: string,
  depth: number = 1,
): AuditReport {
  const gitStatus = checkGitAvailable(workspaceRoot);

  if (gitStatus !== 'AVAILABLE') {
    return {
      scannedAt: new Date().toISOString(),
      gitRef: `HEAD~${depth}`,
      entries: [],
      totalChanges: 0,
      gitAvailable: false,
      caveat: AUDIT_CAVEAT,
    };
  }

  const changes = getGitChanges(workspaceRoot, targetPath, depth);

  const entries: AuditEntry[] = changes.map((change) => ({
    filePath: change.filePath,
    changeType: parseGitStatus(change.status),
    surfaceType: classifySurface(change.filePath),
    semanticDiff: generateSkillSemanticDiff(workspaceRoot, change.filePath),
  }));

  return {
    scannedAt: new Date().toISOString(),
    gitRef: `HEAD~${depth}`,
    entries,
    totalChanges: entries.length,
    gitAvailable: true,
    caveat: AUDIT_CAVEAT,
  };
}
