/**
 * buildTrustReport — assemble a TrustReport from live repo state.
 *
 * Deliberately synchronous and side-effect free: inspects the filesystem
 * and runs read-only git queries. Never writes to disk.
 *
 * Each section is guarded so a missing capability (no git, no .agents/)
 * produces a SIGNAL rather than a crash.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import type { TrustReport, TrustSignal, TrustPosture } from './types.js';
import { getCanonicalSkillPath, getAntigravityDataRoot } from '../paths.js';
import { checkGitAvailable, runAudit } from '../audit/audit.js';

// ─── Helpers ────────────────────────────────────────────────────────

function exec(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

function detectHookGates(hookContent: string): string[] {
  const gates: string[] = [];
  if (hookContent.includes('tsc --noEmit')) gates.push('typecheck');
  if (hookContent.includes('npm test')) gates.push('tests');
  if (hookContent.includes('forge0 audit')) gates.push('audit');
  return gates;
}

function derivePosture(signals: TrustSignal[]): TrustPosture {
  const levels = signals.map((s) => s.level);
  if (levels.includes('critical')) return 'DIRTY';
  if (levels.includes('high')) return 'DIRTY';
  if (levels.includes('medium')) return 'GUARDED';

  // No critical/high/medium signals — check if positively releasable
  const hasGit = signals.some((s) => s.id === 'git.clean' && s.verified);
  const hasHook = signals.some((s) => s.id === 'hook.installed' && s.verified);

  if (hasGit && hasHook) return 'RELEASABLE';
  if (hasGit) return 'GUARDED';
  return 'UNKNOWN';
}

// ─── Main ────────────────────────────────────────────────────────────

export function buildTrustReport(repoRoot: string): TrustReport {
  const signals: TrustSignal[] = [];

  // ── Version ──
  let version: string | undefined;
  const pkgPath = join(repoRoot, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      version = pkg.version ?? undefined;
    } catch {
      /* ignore malformed package.json */
    }
  }

  // ── Git ──
  const gitStatus = checkGitAvailable(repoRoot);
  const gitAvailable = gitStatus === 'AVAILABLE';
  let git: TrustReport['git'] | undefined;

  if (gitAvailable) {
    const statusOut = exec('git status --porcelain', repoRoot);
    const clean = statusOut === '';
    const branch = exec('git rev-parse --abbrev-ref HEAD', repoRoot) ?? undefined;
    const head = exec('git rev-parse HEAD', repoRoot) ?? undefined;
    const tagLine = exec('git tag --points-at HEAD', repoRoot);
    const tagsAtHead = tagLine ? tagLine.split('\n').filter(Boolean) : [];

    git = { available: true, clean, branch, head, tagsAtHead };

    if (!clean) {
      signals.push({
        id: 'git.dirty',
        level: 'high',
        source: 'git',
        title: 'Working tree has uncommitted changes',
        detail: 'Run `git status` for details.',
        verified: true,
      });
    } else {
      signals.push({
        id: 'git.clean',
        level: 'info',
        source: 'git',
        title: 'Working tree clean',
        detail: `HEAD: ${head ?? 'unknown'}, branch: ${branch ?? 'unknown'}`,
        verified: true,
      });
    }
  } else {
    signals.push({
      id: 'git.unavailable',
      level: 'medium',
      source: 'git',
      title: 'git not available or not a git repository',
      detail: `Status: ${gitStatus}`,
      verified: true,
    });
  }

  // ── .agents/ ──
  const agentsPath = join(repoRoot, '.agents');
  const agentsPresent = existsSync(agentsPath);
  const agents: TrustReport['agents'] = { present: agentsPresent, path: agentsPath };

  // ── Audit ──
  let audit: TrustReport['audit'] | undefined;
  if (gitAvailable && agentsPresent) {
    try {
      const report = runAudit(repoRoot, agentsPath, 1);
      const clean = report.entries.length === 0;
      audit = { available: true, clean, totalChanges: report.totalChanges, scope: '.agents' };
      if (!clean) {
        signals.push({
          id: 'audit.dirty',
          level: 'medium',
          source: 'audit',
          title: `${report.totalChanges} governed .agents/ change(s) detected`,
          detail: 'Run `forge0 audit` to review.',
          verified: true,
        });
      } else {
        signals.push({
          id: 'audit.clean',
          level: 'info',
          source: 'audit',
          title: 'Governed .agents/ surface is clean',
          detail: 'No changes vs HEAD~1.',
          verified: true,
        });
      }
    } catch {
      audit = { available: false, clean: false, totalChanges: 0, scope: '.agents' };
    }
  } else if (!agentsPresent) {
    audit = { available: false, clean: true, totalChanges: 0, scope: '.agents' };
    signals.push({
      id: 'agents.absent',
      level: 'info',
      source: 'audit',
      title: '.agents/ directory not present',
      detail: 'Governance audit skipped.',
      verified: true,
    });
  }

  // ── Pre-commit hook ──
  const hookPath = join(repoRoot, '.git', 'hooks', 'pre-commit');
  let hook: TrustReport['hook'] | undefined;
  if (existsSync(hookPath)) {
    const hookContent = readFileSync(hookPath, 'utf-8');
    const gates = detectHookGates(hookContent);
    hook = { installed: true, path: hookPath, gates };
    signals.push({
      id: 'hook.installed',
      level: 'info',
      source: 'hook',
      title: 'Pre-commit hook installed',
      detail: `Gates: ${gates.join(', ') || 'none detected'}`,
      verified: true,
    });
    if (gates.length < 3) {
      signals.push({
        id: 'hook.weak',
        level: 'medium',
        source: 'hook',
        title: 'Pre-commit hook is missing some gates',
        detail: 'Run `forge0 install-hook --force` to reinstall with full three-gate protection.',
        verified: true,
      });
    }
  } else {
    hook = { installed: false, path: hookPath, gates: [] };
    signals.push({
      id: 'hook.absent',
      level: 'low',
      source: 'hook',
      title: 'No pre-commit hook installed',
      detail: 'Run `forge0 install-hook` to add commit-time gating.',
      verified: true,
    });
  }

  // ── Skill drift ──
  let skillDrift: TrustReport['skillDrift'] | undefined;
  try {
    const canonicalPath = getCanonicalSkillPath();
    const livePath = join(getAntigravityDataRoot(), 'skills', 'forgezero', 'SKILL.md');
    if (existsSync(canonicalPath) && existsSync(livePath)) {
      const canonical = readFileSync(canonicalPath, 'utf-8');
      const live = readFileSync(livePath, 'utf-8');
      const drifted = canonical !== live;
      skillDrift = { detected: drifted, detail: drifted ? `${canonical.length}B canonical vs ${live.length}B live` : undefined };
      if (drifted) {
        signals.push({
          id: 'skill.drift',
          level: 'medium',
          source: 'share',
          title: 'SKILL.md drift detected',
          detail: 'Run `forge0 sync-skill` to synchronize.',
          verified: true,
        });
      }
    }
  } catch {
    /* skill drift check is best-effort */
  }

  // ── Build / tests configured ──
  const buildConfigured = existsSync(join(repoRoot, 'tsconfig.json'));
  const testsConfigured = (() => {
    try {
      if (!existsSync(pkgPath)) return false;
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      return Boolean(pkg?.scripts?.test);
    } catch {
      return false;
    }
  })();

  // ── Derive posture ──
  const posture = derivePosture(signals);

  return {
    generatedAt: new Date().toISOString(),
    repoRoot: resolve(repoRoot),
    version,
    git,
    agents,
    audit,
    hook,
    skillDrift,
    build: { configured: buildConfigured },
    tests: { configured: testsConfigured },
    posture,
    signals,
    honesty: {
      verified: [
        'local git state',
        'package version',
        'pre-commit hook file presence and gate detection',
        'governed .agents/ audit scope (HEAD~1)',
        'SKILL.md canonical vs live comparison',
      ],
      unverified: [
        'npm test result (would require running tests)',
        'npm run build result (would require building)',
      ],
      notObservable: [
        'hidden model context during agent sessions',
        'system-prompt-injected skill loads',
        'runtime UI-only state',
        'external Antigravity service state',
      ],
      claim:
        'forge0 status verifies local repository state only. It does not prove runtime agent behavior or model reasoning.',
    },
  };
}
