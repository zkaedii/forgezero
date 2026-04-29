#!/usr/bin/env node

/**
 * forge0 — ForgeZero CLI entry point.
 *
 * Commands:
 *   forge0 status          — Trust posture at a glance
 *   forge0 audit           — Diff .agents/ against last git commit
 *   forge0 provenance <id> — Trace decision lineage for a conversation
 *   forge0 share           — Package .agents/ for team distribution
 *   forge0 selftest        — Validate ForgeZero paths and dependencies
 *   forge0 sync-skill      — Synchronize canonical SKILL.md to live directory
 *   forge0 install-hook    — Install git hook for pre-commit auditing
 */

import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  buildTrustReport,
  runDoctor,
  buildReleaseReceipt,
  runAudit,
  runProvenance,
  runVerify,
  createBundle,
  validatePaths,
  checkGitAvailable,
  getAntigravityDataRoot,
  getCanonicalSkillPath,
  getBanner,
  getCompactHeader,
  getLedgerPath,
  readLedger,
  verifyLedger,
  getLastLedgerEntry,
  recordVerifyEvent,
  recordReceiptEvent,
  planRelease,
  fmt,
  sectionHeader,
  formatChangeType,
  formatConfidence,
} from '../src/index.js';

const program = new Command();

// ─── Config / First Run ─────────────────────────────────────────────

function getConfigPath(): string {
  return join(process.cwd(), '.forge0', 'config.json');
}

function isFirstRun(): boolean {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return true;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return !config.firstRunComplete;
  } catch {
    return true;
  }
}

function markFirstRunComplete(): void {
  const configDir = join(process.cwd(), '.forge0');
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
  const configPath = getConfigPath();
  const config = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, 'utf-8'))
    : {};
  config.firstRunComplete = true;
  config.createdAt = new Date().toISOString();
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// ─── Program Setup ──────────────────────────────────────────────────

// Read version from package.json so CLI --version always matches the release
const pkgVersion = (() => {
  const tryPaths = [
    new URL('../package.json', import.meta.url),
    new URL('../../package.json', import.meta.url),
  ];

  for (const pkgPath of tryPaths) {
    try {
      if (existsSync(pkgPath)) {
        return JSON.parse(readFileSync(pkgPath, 'utf-8')).version ?? '0.0.0';
      }
    } catch {
      // Continue to next path
    }
  }
  return '0.0.0';
})();

program
  .name('forge0')
  .description('ForgeZero — Governance & Provenance for Antigravity .agents/')
  .version(pkgVersion)
  .hook('preAction', () => {
    if (process.argv.includes('--json')) return;

    if (isFirstRun()) {
      console.log(getBanner(pkgVersion));
      markFirstRunComplete();
    } else {
      console.log(getCompactHeader(pkgVersion));
    }
    console.log();
  });

// ─── forge0 audit ───────────────────────────────────────────────────

program
  .command('audit')
  .description('Diff .agents/ against last git commit, surface Skills/Rules/Workflow changes')
  .option('-d, --depth <n>', 'Number of commits to check back', '1')
  .option('-p, --path <path>', 'Path to workspace root (defaults to cwd)')
  .option('--json', 'Emit JSON instead of formatted text')
  .action((opts) => {
    const workspaceRoot = process.cwd();
    const targetPath = opts.path ? resolve(opts.path) : workspaceRoot;
    const depth = parseInt(opts.depth, 10) || 1;

    const report = runAudit(workspaceRoot, targetPath, depth);

    // JSON mode: emit and exit before any pretty-printing
    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      if (!report.gitAvailable) process.exit(1);
      process.exit(report.entries.length > 0 ? 2 : 0);
    }

    console.log(sectionHeader('AUDIT REPORT'));
    console.log(fmt.dim(`  Workspace: ${workspaceRoot}`));
    console.log(fmt.dim(`  Target:    ${targetPath}`));
    console.log(fmt.dim(`  Depth:     HEAD~${depth}`));
    console.log();

    // Gate: refuse to run if git is not available
    if (!report.gitAvailable) {
      console.log(fmt.redBold('  ✗ git is not available or this is not a git repository.'));
      console.log(fmt.dim('    forge0 audit requires git to diff .agents/ surfaces.'));
      console.log(fmt.dim('    Run `forge0 selftest` for diagnostics.'));
      process.exit(1);
    }

    if (report.entries.length === 0) {
      console.log(fmt.green('  ✓ No changes detected in .agents/ surface.'));
    } else {
      console.log(fmt.bold(`  ${report.totalChanges} change(s) detected:\n`));

      for (const entry of report.entries) {
        const change = formatChangeType(entry.changeType);
        const surfaceText = `[${entry.surfaceType}]`;
        const surface = entry.surfaceType.includes('[META]')
          ? fmt.magentaBold(surfaceText)
          : fmt.cyan(surfaceText);
        console.log(`  ${change} ${surface} ${entry.filePath}`);
        if (entry.semanticDiff) {
          console.log(fmt.dim(`           ${entry.semanticDiff}`));
        }
      }
    }

    console.log();
    console.log(fmt.dim(`  Scanned at: ${report.scannedAt}`));

    // Honest scope caveat — symmetric with provenance
    console.log();
    console.log(fmt.yellow('  ⚠  Audit Scope:'));
    console.log(fmt.dim(`     ${report.caveat}`));

    // Exit code 2 = changes detected (useful for CI gates), 0 = clean
    process.exit(report.entries.length > 0 ? 2 : 0);
  });

// ─── forge0 provenance ──────────────────────────────────────────────

program
  .command('provenance <conversation-id>')
  .description('Trace decision lineage for a conversation (Skills, KIs, Artifacts)')
  .action((conversationId: string) => {
    console.log(sectionHeader('PROVENANCE REPORT'));
    console.log(fmt.dim(`  Conversation: ${conversationId}`));
    console.log();

    const report = runProvenance(conversationId);

    // Skills loaded
    console.log(fmt.cyanBold('  Skills Loaded:'));
    if (report.skillsLoaded.length === 0) {
      console.log(fmt.dim('    (none detected via explicit view_file calls)'));
    } else {
      for (const skill of report.skillsLoaded) {
        console.log(`    ${fmt.green('◆')} ${fmt.bold(skill.skillName)} ${formatConfidence(skill.confidence)}`);
        console.log(fmt.dim(`      Step ${skill.stepIndex} at ${skill.timestamp}`));
      }
    }
    console.log();

    // KIs referenced
    console.log(fmt.cyanBold('  Knowledge Items Referenced:'));
    if (report.kisReferenced.length === 0) {
      console.log(fmt.dim('    (none detected via path references)'));
    } else {
      for (const ki of report.kisReferenced) {
        console.log(`    ${fmt.magenta('◆')} ${fmt.bold(ki.kiSlug)} ${formatConfidence(ki.confidence)}`);
        console.log(fmt.dim(`      Step ${ki.stepIndex} at ${ki.timestamp}`));
      }
    }
    console.log();

    // Artifacts produced
    console.log(fmt.cyanBold('  Artifacts Produced:'));
    if (report.artifactsProduced.length === 0) {
      console.log(fmt.dim('    (none detected)'));
    } else {
      for (const art of report.artifactsProduced) {
        console.log(`    ${fmt.yellow('◆')} ${art.artifactPath}`);
        console.log(fmt.dim(`      Step ${art.stepIndex} at ${art.timestamp}`));
      }
    }
    console.log();

    // Stats
    console.log(fmt.dim(`  Total steps analyzed: ${report.totalSteps}`));
    console.log(fmt.dim(`  Scanned at: ${report.scannedAt}`));
    console.log();

    // Caveat
    console.log(fmt.yellow('  ⚠  Detection Boundary:'));
    console.log(fmt.dim(`     ${report.caveat}`));
  });

// ─── forge0 share ───────────────────────────────────────────────────

program
  .command('share')
  .description('Package .agents/ for team distribution as a versioned bundle')
  .option('-t, --tag <tag>', 'Version tag for the bundle', 'v0.1.0')
  .option('-p, --path <path>', 'Path to .agents/ or Skills directory')
  .option('-o, --output <dir>', 'Output directory for the bundle', '.forge0/bundles')
  .option('--include-mcp', 'Include mcp_config.json in bundle')
  .option('--allow-secrets', 'Allow secrets in bundle (DANGEROUS)')
  .option('--allow-skill-drift', 'Allow bundle creation even if live SKILL.md has drifted from repo')
  .action((opts) => {
    console.log(sectionHeader('SHARE — BUNDLE CREATION'));

    // Structural enforcement: prevent bundle creation on SKILL.md drift
    const canonicalSkillPath = getCanonicalSkillPath();
    const liveSkillPath = join(getAntigravityDataRoot(), 'skills', 'forgezero', 'SKILL.md');

    if (existsSync(canonicalSkillPath) && existsSync(liveSkillPath)) {
      const canonicalContent = readFileSync(canonicalSkillPath, 'utf-8');
      const liveContent = readFileSync(liveSkillPath, 'utf-8');
      if (canonicalContent !== liveContent && !opts.allowSkillDrift) {
        console.log(fmt.redBold(`  ✗ SKILL DRIFT DETECTED — bundle creation refused.`));
        console.log(fmt.dim(`    The live agent SKILL.md has diverged from the canonical repo copy.`));
        console.log(fmt.dim(`    Run \`forge0 sync-skill --check\` to see the diff, or \`forge0 sync-skill\` to overwrite.`));
        console.log(fmt.yellow('\n  To override: forge0 share --allow-skill-drift'));
        process.exit(4); // Exit code 4 = skill drift detected
      }
    }

    const targetPath = opts.path ? resolve(opts.path) : process.cwd();
    const outputDir = resolve(opts.output);
    const additionalFiles: string[] = [];

    if (opts.includeMcp) {
      const mcpPath = join(getAntigravityDataRoot(), 'mcp_config.json');
      additionalFiles.push(mcpPath);
    }

    console.log(fmt.dim(`  Source:  ${targetPath}`));
    console.log(fmt.dim(`  Output:  ${outputDir}`));
    console.log(fmt.dim(`  Tag:     ${opts.tag}`));
    console.log(fmt.dim(`  Secrets: ${opts.allowSecrets ? fmt.redBold('ALLOWED (⚠)') : fmt.green('scrub enabled')}`));
    console.log();

    const result = createBundle({
      targetPath,
      outputDir,
      tag: opts.tag,
      additionalFiles,
      allowSecrets: !!opts.allowSecrets,
    });

    if (!result.success) {
      if (result.secretsDetected.length > 0) {
        console.log(fmt.redBold(`  ✗ SECRETS DETECTED — bundle creation refused.\n`));
        for (const secret of result.secretsDetected) {
          console.log(fmt.red(`    Line ${secret.lineNumber}: [${secret.matchedPattern}]`));
          console.log(fmt.dim(`    ${secret.context}`));
          console.log(fmt.dim(`    File: ${secret.filePath}`));
          console.log();
        }
        console.log(fmt.yellow('  To override: forge0 share --allow-secrets'));
        process.exit(3); // Exit code 3 = secrets detected
      } else {
        console.log(fmt.red(`  ✗ ${result.error}`));
        process.exit(1);
      }
    } else {
      console.log(fmt.green(`  ✓ Bundle created successfully.`));
      console.log(fmt.dim(`  Manifest: ${result.manifestPath}`));
      console.log(fmt.dim(`  Bundle:   ${result.bundlePath}`));
      console.log(fmt.dim(`  Files:    ${result.manifest!.fileCount}`));
      console.log(fmt.dim(`  Secrets:  ${result.manifest!.secretsScrubbed ? 'none detected' : 'PRESENT (allowed)'}`));
    }
  });

// ─── forge0 selftest ────────────────────────────────────────────────

program
  .command('selftest')
  .description('Validate ForgeZero paths and dependencies')
  .action(() => {
    console.log(sectionHeader('SELFTEST'));
    console.log();

    const paths = validatePaths();
    let allGood = true;

    for (const p of paths) {
      const status = p.exists ? fmt.green('✓') : fmt.red('✗');
      console.log(`  ${status} ${p.label}`);
      console.log(fmt.dim(`    ${p.path}`));
      if (!p.exists) allGood = false;
    }

    // Check git — structured status
    console.log();
    const gitStatus = checkGitAvailable(process.cwd());
    switch (gitStatus) {
      case 'AVAILABLE':
        console.log(`  ${fmt.green('✓')} git: AVAILABLE`);
        break;
      case 'MISSING':
        console.log(`  ${fmt.red('✗')} git: MISSING (not found on PATH)`);
        console.log(fmt.dim('    Install git to enable forge0 audit.'));
        allGood = false;
        break;
      case 'NOT_A_REPO':
        console.log(`  ${fmt.yellow('⚠')} git: NOT_A_REPO (git found, but cwd is not a git repository)`);
        console.log(fmt.dim('    forge0 audit will not work until this directory is git-initialized.'));
        allGood = false;
        break;
    }

    console.log();
    if (allGood) {
      console.log(fmt.green('  All checks passed. ForgeZero is ready.'));
    } else {
      console.log(fmt.yellow('  Some checks failed. ForgeZero may have limited functionality.'));
    }
  });

// ─── forge0 sync-skill ──────────────────────────────────────────────

program
  .command('sync-skill')
  .description('Synchronize the canonical repo SKILL.md to the live Antigravity agents directory')
  .option('--check', 'Check for divergence without modifying files (exits 2 if divergent)')
  .action((opts) => {
    console.log(sectionHeader('SYNC SKILL'));
    console.log();

    const sourcePath = getCanonicalSkillPath();
    const targetDir = join(getAntigravityDataRoot(), 'skills', 'forgezero');
    const targetPath = join(targetDir, 'SKILL.md');

    if (!existsSync(sourcePath)) {
      console.log(fmt.red(`  ✗ Canonical SKILL.md not found at:\n    ${sourcePath}`));
      console.log(fmt.dim('    This command must be run from an environment containing the docs/ directory.'));
      process.exit(1);
    }

    try {
      const sourceContent = readFileSync(sourcePath, 'utf-8');
      const targetExists = existsSync(targetPath);
      const targetContent = targetExists ? readFileSync(targetPath, 'utf-8') : null;

      if (opts.check) {
        if (sourceContent !== targetContent) {
          console.log(fmt.redBold(`  ✗ Drift detected.`));
          console.log(fmt.dim(`    The canonical repo SKILL.md differs from the live agent copy.`));
          // Simple string length diff as a proxy for printing a full diff, which might be long.
          if (targetExists) {
            console.log(fmt.dim(`    Canonical: ${sourceContent.length} bytes`));
            console.log(fmt.dim(`    Live:      ${targetContent!.length} bytes`));
          } else {
            console.log(fmt.dim(`    Live copy does not exist.`));
          }
          process.exit(2);
        } else {
          console.log(fmt.green(`  ✓ In sync.`));
          console.log(fmt.dim(`    The live agent SKILL.md matches the canonical repo copy.`));
          process.exit(0);
        }
      }

      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }

      writeFileSync(targetPath, sourceContent, 'utf-8');

      console.log(fmt.green(`  ✓ Skill synchronized successfully.`));
      console.log(fmt.dim(`    Source: ${sourcePath}`));
      console.log(fmt.dim(`    Target: ${targetPath}`));
    } catch (e: any) {
      console.log(fmt.red(`  ✗ Failed to synchronize skill: ${e.message}`));
      process.exit(1);
    }
  });

// ─── forge0 trace (v0.2.0 Stub) ──────────────────────────────────────

program
  .command('trace <conversation-id>')
  .description('[v0.2.0 — NOT IMPLEMENTED] Capture system-prompt-injected skill loads')
  .action((conversationId: string) => {
    console.log(sectionHeader('TRACE — NOT IMPLEMENTED'));
    console.log();
    console.log(fmt.yellow('  ⚠ forge0 trace is reserved for v0.2.0 and not yet implemented.'));
    console.log();
    console.log(fmt.dim('  The v0.2.0 thesis ([VERIFIED] via session 4cc0e9e2) states:'));
    console.log(fmt.dim('  "Antigravity skill-load events are not durably recorded in any'));
    console.log(fmt.dim('   user-readable file. Every governance tool built on this surface'));
    console.log(fmt.dim('   produces lower-bound provenance reports until the trace problem'));
    console.log(fmt.dim('   is solved."'));
    console.log();
    console.log(fmt.dim('  See: docs/v0.2.0-thesis.md'));
    console.log(fmt.dim('  Until v0.2.0 ships, use:'));
    console.log(`     ${fmt.cyan(`forge0 provenance ${conversationId}`)}`);
    console.log(fmt.dim('  for the v0.1.x [DETECTED_WHEN_EXPLICIT] lower bound.'));
    process.exit(0);
  });

// ─── forge0 install-hook ────────────────────────────────────────────

program
  .command('install-hook')
  .description('Install git pre-commit hook that runs forge0 audit')
  .option('--force', 'Overwrite existing pre-commit hook')
  .action((opts) => {
    const hookPath = join(process.cwd(), '.git', 'hooks', 'pre-commit');

    if (!existsSync(join(process.cwd(), '.git'))) {
      console.log(fmt.red('  ✗ Not a git repository.'));
      process.exit(1);
    }

    if (existsSync(hookPath) && !opts.force) {
      console.log(fmt.yellow('  ⚠ pre-commit hook already exists.'));
      console.log(fmt.dim(`    ${hookPath}`));
      console.log(fmt.dim('    Pass --force to overwrite, or merge manually.'));
      process.exit(2);
    }

    const hookContent = `#!/bin/sh
# Installed by forge0 install-hook
# Three gates: typecheck \u2192 tests \u2192 .agents/ audit. All must pass.

set -u

tmpdir="\$(mktemp -d "\${TMPDIR:-/tmp}/forge0.XXXXXX")"
trap 'rm -rf "$tmpdir"' EXIT

run_forge0() {
  if [ -x ./node_modules/.bin/forge0 ]; then
    ./node_modules/.bin/forge0 "$@"
  elif command -v forge0 >/dev/null 2>&1; then
    forge0 "$@"
  else
    echo "\u2717 forge0 is not available in ./node_modules/.bin or on PATH"
    exit 1
  fi
}

# Gate 1: TypeScript typecheck.
if [ -f tsconfig.json ]; then
  npx tsc --noEmit > "$tmpdir/forge0-tsc.log" 2>&1
  if [ $? -ne 0 ]; then
    echo "\u2717 tsc --noEmit failed:"
    cat "$tmpdir/forge0-tsc.log"
    exit 1
  fi
fi

# Gate 2: Tests.
if [ -f package.json ] && node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts.test ? 0 : 1)" >/dev/null 2>&1; then
  npm test --silent > "$tmpdir/forge0-test.log" 2>&1
  if [ $? -ne 0 ]; then
    echo "\u2717 npm test failed:"
    tail -30 "$tmpdir/forge0-test.log"
    exit 1
  fi
fi

# Gate 3: .agents/ audit.
if [ -d .agents ]; then
  run_forge0 audit --json --path .agents > "$tmpdir/forge0-audit.log" 2>&1
  result=$?
  case $result in
    0) exit 0 ;;
    2) echo "\u2717 forge0 audit detected .agents/ changes \u2014 re-run 'forge0 audit --path .agents' to review."
       exit 1 ;;
    *) echo "\u2717 forge0 audit failed with exit $result:"
       tail -10 "$tmpdir/forge0-audit.log"
       exit 1 ;;
  esac
fi

exit 0
`;

    writeFileSync(hookPath, hookContent, { mode: 0o755 });
    console.log(fmt.green('  ✓ Installed pre-commit hook.'));
    console.log(fmt.dim(`    ${hookPath}`));
    console.log(fmt.dim('    The hook will block commits with .agents/ changes until reviewed.'));
  });

// ─── forge0 doctor ──────────────────────────────────────────────────

program
  .command('doctor')
  .description('Diagnose drift, release hazards, hook problems, and trust posture regressions')
  .option('--json', 'Emit JSON instead of formatted text')
  .option('--mode <mode>', 'Focus: all, workspace, release, hook', 'all')
  .action((opts) => {
    const validModes = ['all', 'workspace', 'release', 'hook'] as const;
    const mode = validModes.includes(opts.mode) ? opts.mode : 'all';
    const report = runDoctor(process.cwd(), mode);

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      process.exit(0);
    }

    console.log(sectionHeader('FORGEZERO DOCTOR'));
    console.log();
    console.log(`  ${fmt.bold('Trust posture:')} ${report.trustPosture}`);
    console.log(`  ${fmt.bold('Mode:')}           ${report.mode}`);

    const actionable = report.findings.filter((f) => f.severity !== 'info');
    const infoFindings = report.findings.filter((f) => f.severity === 'info');

    if (actionable.length === 0 && infoFindings.length === 0) {
      console.log();
      console.log(fmt.green('  ✓ No findings. Repository is healthy.'));
    }

    // Show actionable findings first
    if (actionable.length > 0) {
      console.log();
      console.log(fmt.bold(`  ${actionable.length} finding(s):`));
      for (const f of actionable) {
        console.log();
        const icon =
          f.severity === 'critical' || f.severity === 'high'
            ? fmt.redBold('✗')
            : f.severity === 'medium'
              ? fmt.yellow('⚠')
              : fmt.dim('○');
        const sev =
          f.severity === 'critical' || f.severity === 'high'
            ? fmt.redBold(f.severity.toUpperCase())
            : f.severity === 'medium'
              ? fmt.yellow(f.severity.toUpperCase())
              : fmt.dim(f.severity.toUpperCase());
        console.log(`  ${icon} ${sev} ${f.title}`);
        for (const e of f.evidence) {
          console.log(fmt.dim(`    ${e}`));
        }
        if (f.explanation) {
          console.log();
          console.log(fmt.dim(`    ${f.explanation}`));
        }
        if (f.recommendedCommands.length > 0) {
          console.log();
          console.log(fmt.dim('    Fix:'));
          for (const cmd of f.recommendedCommands) {
            console.log(`      ${fmt.cyan(cmd)}`);
          }
        }
      }
    }

    // Show info findings concisely
    if (infoFindings.length > 0) {
      console.log();
      for (const f of infoFindings) {
        console.log(`  ${fmt.green('✓')} ${fmt.dim(f.title)}`);
      }
    }

    // Summary
    console.log();
    console.log(fmt.dim(`  Next: ${report.summary.recommendedNextAction}`));

    // Honesty bound
    console.log();
    console.log(fmt.dim('  Honesty bound:'));
    for (const v of report.honesty.verified) {
      console.log(fmt.dim(`    ✓ ${v}`));
    }
    for (const n of report.honesty.notObservable) {
      console.log(fmt.dim(`    ⚠ (not observable) ${n}`));
    }

    process.exit(0);
  });

// ─── forge0 receipt ─────────────────────────────────────────────────

program
  .command('receipt')
  .description('Generate a local release receipt with trust posture and honesty bound')
  .option('--json', 'Emit JSON instead of formatted text')
  .action((opts) => {
    const receipt = buildReleaseReceipt(process.cwd());

    if (opts.json) {
      process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
      process.exit(0);
    }

    console.log(sectionHeader('FORGEZERO RELEASE RECEIPT'));
    console.log();

    const row = (label: string, value: string) =>
      console.log(`  ${fmt.dim(label.padEnd(16))} ${value}`);

    row('Version:', receipt.version ? fmt.bold(receipt.version) : fmt.dim('unknown'));
    row('Branch:', fmt.dim(receipt.branch ?? 'unknown'));
    row('Commit:', fmt.dim(receipt.head ?? 'unknown'));
    row('Expected tag:', receipt.expectedTag ? fmt.cyan(receipt.expectedTag) : fmt.dim('none'));
    row('Tags at HEAD:', receipt.tagsAtHead.length > 0 ? fmt.cyan(receipt.tagsAtHead.join(', ')) : fmt.dim('none'));
    row('Git:', receipt.gitClean ? fmt.green('clean') : fmt.redBold('dirty'));
    row('Trust posture:', receipt.trustPosture === 'RELEASABLE' ? fmt.green(receipt.trustPosture) : fmt.yellow(receipt.trustPosture));
    row('Doctor:', receipt.doctor.blockingFindings.length === 0 ? fmt.green('0 blocking finding(s)') : fmt.redBold(`${receipt.doctor.blockingFindings.length} blocking finding(s)`));

    // Checks
    console.log();
    console.log(fmt.bold('  Checks:'));
    for (const check of receipt.checks) {
      const icon = check.passed ? fmt.green('✓') : fmt.redBold('✗');
      console.log(`  ${icon} ${check.label}`);
    }

    // Blocking findings
    if (receipt.doctor.blockingFindings.length > 0) {
      console.log();
      console.log(fmt.bold('  Blocking findings:'));
      for (const f of receipt.doctor.blockingFindings) {
        console.log(`  ${fmt.redBold('✗')} ${f}`);
      }
    }

    // Suggested release note
    console.log();
    console.log(fmt.bold('  Suggested release note:'));
    console.log();
    for (const line of receipt.suggestedReleaseNote.split('\n')) {
      console.log(fmt.dim(`  ${line}`));
    }

    // Honesty bound
    console.log();
    console.log(fmt.dim('  Honesty bound:'));
    for (const v of receipt.honesty.verified) {
      console.log(fmt.dim(`    ✓ ${v}`));
    }
    for (const n of receipt.honesty.notObservable) {
      console.log(fmt.dim(`    ⚠ (not observable) ${n}`));
    }

    process.exit(0);
  });

// ─── forge0 ledger ──────────────────────────────────────────────────
const ledger = program
  .command('ledger')
  .description('Durable trust memory — record, list, last, verify');

ledger
  .command('record')
  .description('Record a trust event to the ledger')
  .requiredOption('-e, --event <event>', 'Event kind (verify|receipt)')
  .option('-m, --mode <mode>', 'Mode (for verify event)', 'release')
  .option('--remote', 'Include remote checks when recording verify event')
  .option('--ci', 'Include GitHub Actions CI checks when recording verify event')
  .option('--json', 'Emit JSON instead of formatted text')
  .action((opts) => {
    const repoRoot = process.cwd();
    let entry;

    if (opts.event === 'verify') {
      entry = recordVerifyEvent(repoRoot, opts.mode as any, pkgVersion, { remote: !!opts.remote, ci: !!opts.ci });
    } else if (opts.event === 'receipt') {
      entry = recordReceiptEvent(repoRoot, pkgVersion);
    } else {
      console.error(fmt.redBold(`\u2717 Unknown event kind: ${opts.event}`));
      process.exit(1);
    }

    if (opts.json) {
      process.stdout.write(JSON.stringify(entry, null, 2) + '\n');
      process.exit(0);
    }

    console.log(sectionHeader('FORGEZERO LEDGER'));
    console.log();
    console.log(`${fmt.green('\u2713')} Recorded ${opts.event} event`);
    console.log();
    console.log(`  ${fmt.dim('ID:')}       ${entry.id}`);
    console.log(`  ${fmt.dim('Seq:')}      ${entry.sequence}`);
    console.log(`  ${fmt.dim('Event:')}    ${entry.event}`);
    if (entry.mode) console.log(`  ${fmt.dim('Mode:')}     ${entry.mode}`);
    console.log(`  ${fmt.dim('Result:')}   ${entry.result === 'pass' ? fmt.green(entry.result) : fmt.redBold(entry.result)}`);
    console.log(`  ${fmt.dim('Commit:')}   ${fmt.dim(entry.repo.head?.slice(0, 7) ?? 'unknown')}`);
    console.log(`  ${fmt.dim('Version:')}  ${entry.version?.package ?? 'unknown'}`);
    console.log(`  ${fmt.dim('Hash:')}     ${fmt.dim(entry.hash.current.slice(0, 8))}...`);
    console.log();
    console.log(`  ${fmt.dim('Ledger:')}`);
    console.log(`    ${getLedgerPath(repoRoot)}`);
  });

ledger
  .command('list')
  .description('List ledger entries')
  .option('--json', 'Emit JSON instead of formatted text')
  .action((opts) => {
    const repoRoot = process.cwd();
    const entries = readLedger(repoRoot);

    if (opts.json) {
      process.stdout.write(JSON.stringify({ path: getLedgerPath(repoRoot), entries }, null, 2) + '\n');
      process.exit(0);
    }

    console.log(sectionHeader('FORGEZERO LEDGER'));
    console.log();
    console.log(`  ${fmt.dim('Path:')} ${getLedgerPath(repoRoot)}`);
    console.log(`  ${fmt.dim('Entries:')} ${entries.length}`);
    console.log();

    if (entries.length === 0) {
      console.log(fmt.dim('  (Empty ledger)'));
      process.exit(0);
    }

    console.log(`  ${fmt.dim('Seq  Result  Event    Mode      Version  Commit   Time')}`);
    for (const e of entries) {
      const res = e.result === 'pass' ? fmt.green('pass') : fmt.redBold(e.result.padEnd(4));
      const event = e.event.padEnd(8);
      const mode = (e.mode ?? '-').padEnd(8);
      const ver = (e.version?.package ?? 'unknown').padEnd(8);
      const commit = (e.repo.head?.slice(0, 7) ?? 'unknown').padEnd(8);
      const time = e.timestamp.split('T')[0];
      console.log(`  ${String(e.sequence).padEnd(3)}  ${res}    ${event} ${mode}  ${ver} ${commit} ${time}`);
    }
  });

ledger
  .command('last')
  .description('Show the latest ledger entry')
  .option('--json', 'Emit JSON instead of formatted text')
  .action((opts) => {
    const repoRoot = process.cwd();
    const entry = getLastLedgerEntry(repoRoot);

    if (opts.json) {
      process.stdout.write(JSON.stringify({ found: !!entry, entry }, null, 2) + '\n');
      process.exit(entry ? 0 : 2);
    }

    if (!entry) {
      console.log(fmt.dim('No ledger entries found.'));
      process.exit(0);
    }

    console.log(sectionHeader('FORGEZERO LEDGER \u2014 LAST ENTRY'));
    console.log();
    console.log(`  ${fmt.dim('ID:')}       ${entry.id}`);
    console.log(`  ${fmt.dim('Seq:')}      ${entry.sequence}`);
    console.log(`  ${fmt.dim('Event:')}    ${entry.event}`);
    if (entry.mode) console.log(`  ${fmt.dim('Mode:')}     ${entry.mode}`);
    console.log(`  ${fmt.dim('Result:')}   ${entry.result === 'pass' ? fmt.green(entry.result) : fmt.redBold(entry.result)}`);
    console.log(`  ${fmt.dim('Commit:')}   ${fmt.dim(entry.repo.head ?? 'unknown')}`);
    console.log(`  ${fmt.dim('Version:')}  ${entry.version?.package ?? 'unknown'}`);
    console.log();

    console.log(`  ${fmt.bold('Checks:')}`);
    for (const c of entry.checks) {
      const icon = c.passed ? fmt.green('\u2713') : fmt.redBold('\u2717');
      console.log(`    ${icon} ${c.label}`);
    }

    console.log();
    console.log(`  ${fmt.dim('Honesty bound:')}`);
    for (const v of entry.honesty.verified) {
      console.log(`    ${fmt.green('\u2713')} ${fmt.dim(v)}`);
    }
    for (const n of entry.honesty.notObservable) {
      console.log(`    ${fmt.yellow('\u26a0')} ${fmt.dim(`(not observable) ${n}`)}`);
    }
  });

ledger
  .command('verify')
  .description('Verify ledger hash-chain integrity')
  .option('--json', 'Emit JSON instead of formatted text')
  .action((opts) => {
    const repoRoot = process.cwd();
    const result = verifyLedger(repoRoot);

    if (opts.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(result.ok ? 0 : 1);
    }

    console.log(sectionHeader('FORGEZERO LEDGER VERIFY'));
    console.log();

    if (result.ok) {
      console.log(`  ${fmt.green('\u2713')} Ledger hash chain intact`);
      console.log(`  ${fmt.dim('Entries:')} ${result.entryCount}`);
      console.log(`  ${fmt.dim('Head hash:')} ${fmt.dim(result.headHash ?? 'n/a')}`);
    } else {
      console.log(`  ${fmt.redBold('\u2717')} Ledger hash chain broken`);
      console.log(`  ${fmt.dim('Broken at sequence:')} ${result.brokenAt}`);
      console.log(`  ${fmt.dim('Reason:')} ${fmt.redBold(result.reason ?? 'unknown')}`);
      process.exit(1);
    }
  });

// ─── forge0 verify ──────────────────────────────────────────────────
program
  .command('verify')
  .description('Enforce trust criteria — precommit, release, or bundle modes')
  .option('-m, --mode <mode>', 'Verification mode (precommit|release|bundle)', 'release')
  .option('--remote', 'Include origin branch/tag synchronization checks')
  .option('--ci', 'Include GitHub Actions CI checks')
  .option('--json', 'Emit JSON instead of formatted text')
  .action((opts) => {
    const mode = opts.mode as any;
    const report = runVerify(process.cwd(), mode, pkgVersion, { remote: !!opts.remote, ci: !!opts.ci });

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      process.exit(report.passed ? 0 : 1);
    }

    console.log(sectionHeader(`VERIFY: ${mode.toUpperCase()}`));
    console.log();

    const statusIcon = report.passed ? fmt.green('PASSED') : fmt.redBold('FAILED');
    console.log(`  ${fmt.bold('Status:')} ${statusIcon} (${report.score}%)`);
    console.log(`  ${fmt.dim(report.summary)}`);
    console.log();

    for (const check of report.checks) {
      const icon = check.passed ? fmt.green('✓') : check.severity === 'critical' ? fmt.redBold('✗') : fmt.red('✗');
      const label = check.passed ? fmt.dim(check.label) : fmt.bold(check.label);
      console.log(`  ${icon} ${label}`);
      if (!check.passed) {
        console.log(`    ${fmt.red(check.detail)}`);
      }
    }

    console.log();
    if (report.passed) {
      console.log(fmt.green(`  ✓ Repository is authorized for ${mode}.`));
    } else {
      console.log(fmt.redBold(`  ✗ Repository is NOT authorized for ${mode}.`));
    }

    process.exit(report.passed ? 0 : 1);
  });

// ─── forge0 status ──────────────────────────────────────────────────

program
  .command('status')
  .description('Trust posture at a glance — git, hook, audit, skill drift')
  .option('--json', 'Emit JSON instead of formatted text')
  .action((opts) => {
    const report = buildTrustReport(process.cwd());

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      process.exit(0);
    }

    // ── Header ──
    console.log(sectionHeader('FORGEZERO STATUS'));
    console.log();

    // ── Core fields ──
    const row = (label: string, value: string) =>
      console.log(`  ${fmt.dim(label.padEnd(16))} ${value}`);

    row('Version:', report.version ? fmt.bold(report.version) : fmt.dim('unknown'));

    if (report.git?.available) {
      const g = report.git;
      row('Git:', g.clean ? fmt.green('clean') : fmt.redBold('dirty'));
      row('Branch:', fmt.dim(g.branch ?? 'unknown'));
      row('HEAD:', fmt.dim(g.head ?? 'unknown'));
      row('Tag at HEAD:', g.tagsAtHead.length > 0 ? fmt.cyan(g.tagsAtHead.join(', ')) : fmt.dim('none'));
    } else {
      row('Git:', fmt.redBold('unavailable'));
    }

    console.log();

    row('Hook:', report.hook?.installed ? fmt.green('installed') : fmt.yellow('not installed'));
    if (report.hook?.installed) {
      row('Hook gates:', fmt.dim(report.hook.gates.join(', ') || 'none detected'));
    }

    row('Agents dir:', report.agents?.present ? fmt.green('present') : fmt.dim('absent'));

    if (report.audit) {
      row('Audit:', report.audit.clean ? fmt.green('clean') : fmt.yellow(`${report.audit.totalChanges} change(s)`));
    }

    if (report.skillDrift) {
      row('Skill drift:', report.skillDrift.detected ? fmt.yellow('detected') : fmt.green('none'));
    }

    row('Build:', report.build?.configured ? fmt.dim('configured') : fmt.dim('not configured'));
    row('Tests:', report.tests?.configured ? fmt.dim('configured') : fmt.dim('not configured'));

    // ── Trust posture ──
    console.log();
    const postureColors: Record<string, (s: string) => string> = {
      RELEASABLE: fmt.green,
      GUARDED: fmt.yellow,
      DIRTY: fmt.redBold,
      BUNDLE_SAFE: fmt.green,
      DRIFT_DETECTED: fmt.yellow,
      SECRETS_BLOCKED: fmt.redBold,
      UNINITIALIZED: fmt.dim,
      TRACE_LIMITED: fmt.dim,
      UNKNOWN: fmt.dim,
    };
    const postureColor = postureColors[report.posture] ?? fmt.dim;
    console.log(`  ${fmt.bold('Trust posture:')} ${postureColor(report.posture)}`);

    // ── Signals (non-info only in human mode) ──
    const notable = report.signals.filter((s) => s.level !== 'info');
    if (notable.length > 0) {
      console.log();
      for (const sig of notable) {
        const icon = sig.level === 'critical' || sig.level === 'high' ? fmt.redBold('✗') : fmt.yellow('⚠');
        console.log(`  ${icon} ${sig.title}`);
        console.log(`    ${fmt.dim(sig.detail)}`);
      }
    }

    // ── Honesty bound ──
    console.log();
    console.log(fmt.dim('  Honesty bound:'));
    for (const v of report.honesty.verified) {
      console.log(fmt.dim(`    ✓ ${v}`));
    }
    for (const n of report.honesty.notObservable) {
      console.log(fmt.dim(`    ⚠ (not observable) ${n}`));
    }

    process.exit(0);
  });

// ─── forge0 release ───────────────────────────────────────────────────

program
  .command('release')
  .description('Safely orchestrate the release checklist and seal the trust loop')
  .option('--bump <type>', 'Version bump type (patch, minor, major, none)', 'none')
  .option('--verify-remote', 'Include remote origin synchronization check')
  .option('--verify-ci', 'Include GitHub Actions CI check')
  .option('--dry-run', 'Plan and preview the release without executing commands')
  .option('--json', 'Emit JSON instead of formatted text')
  .action((opts) => {
    const validBumps = ['patch', 'minor', 'major', 'none'] as const;
    const bumpType = validBumps.includes(opts.bump) ? opts.bump : 'none';

    const plan = planRelease(process.cwd(), {
      versionType: bumpType as any,
      verifyRemote: !!opts.verifyRemote,
      verifyCi: !!opts.verifyCi,
      dryRun: !!opts.dryRun,
    });

    if (opts.json) {
      process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
      process.exit(0);
    }

    console.log(sectionHeader('FORGEZERO RELEASE'));
    console.log();
    console.log(fmt.dim('  Automate the checklist, not the honesty.'));
    console.log();
    console.log(`  ${fmt.dim('Current version:')} ${fmt.bold(plan.currentVersion)}`);
    console.log(`  ${fmt.dim('Target version:')}  ${fmt.green(plan.targetVersion)}`);
    console.log();

    if (opts.dryRun) {
      console.log(fmt.yellow('  [DRY RUN] Release Sequence Plan:'));
      console.log();
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        console.log(`  ${fmt.cyan((i + 1).toString().padStart(2, '0') + '.')} ${fmt.bold(step.name)}`);
        console.log(fmt.dim(`      ${step.description}`));
        console.log(fmt.dim(`      > ${step.command}`));
        console.log();
      }
      
      console.log(fmt.dim('  Dry run complete. No commands were executed.'));
      process.exit(0);
    } else {
      console.log(fmt.redBold('  ✗ Execution mode is not yet implemented in v0.1.x.'));
      console.log(fmt.dim('    Please use --dry-run to preview the manual release checklist.'));
      process.exit(1);
    }
  });

// ─── Parse ──────────────────────────────────────────────────────────

program.parse();
