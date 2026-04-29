#!/usr/bin/env node

/**
 * forge0 — ForgeZero CLI entry point.
 *
 * Commands:
 *   forge0 audit          — Diff .agents/ against last git commit
 *   forge0 provenance <id> — Trace decision lineage for a conversation
 *   forge0 share           — Package .agents/ for team distribution
 *   forge0 selftest        — Validate ForgeZero paths and dependencies
 *   forge0 sync-skill      — Synchronize canonical SKILL.md to live directory
 */

import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  runAudit,
  runProvenance,
  createBundle,
  validatePaths,
  checkGitAvailable,
  getAntigravityDataRoot,
  getBanner,
  getCompactHeader,
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

program
  .name('forge0')
  .description('ForgeZero — Governance & Provenance for Antigravity .agents/')
  .version('0.1.0')
  .hook('preAction', () => {
    if (isFirstRun()) {
      console.log(getBanner());
      markFirstRunComplete();
    } else {
      console.log(getCompactHeader());
    }
    console.log();
  });

// ─── forge0 audit ───────────────────────────────────────────────────

program
  .command('audit')
  .description('Diff .agents/ against last git commit, surface Skills/Rules/Workflow changes')
  .option('-d, --depth <n>', 'Number of commits to diff against', '1')
  .option('-p, --path <path>', 'Path to .agents/ or Skills directory')
  .action((opts) => {
    const workspaceRoot = process.cwd();
    const targetPath = opts.path ? resolve(opts.path) : workspaceRoot;
    const depth = parseInt(opts.depth, 10) || 1;

    console.log(sectionHeader('AUDIT REPORT'));
    console.log(fmt.dim(`  Workspace: ${workspaceRoot}`));
    console.log(fmt.dim(`  Target:    ${targetPath}`));
    console.log(fmt.dim(`  Depth:     HEAD~${depth}`));
    console.log();

    const report = runAudit(workspaceRoot, targetPath, depth);

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
        const surface = fmt.cyan(`[${entry.surfaceType}]`);
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
  .action((opts) => {
    console.log(sectionHeader('SHARE — BUNDLE CREATION'));

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
  .action(() => {
    console.log(sectionHeader('SYNC SKILL'));
    console.log();

    const sourcePath = resolve(import.meta.dirname, '../docs/skill/SKILL.md');
    const targetDir = join(getAntigravityDataRoot(), 'skills', 'forgezero');
    const targetPath = join(targetDir, 'SKILL.md');

    if (!existsSync(sourcePath)) {
      console.log(fmt.red(`  ✗ Canonical SKILL.md not found at:\n    ${sourcePath}`));
      console.log(fmt.dim('    This command must be run from an environment containing the docs/ directory.'));
      process.exit(1);
    }

    try {
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }
      
      const content = readFileSync(sourcePath, 'utf-8');
      writeFileSync(targetPath, content, 'utf-8');
      
      console.log(fmt.green(`  ✓ Skill synchronized successfully.`));
      console.log(fmt.dim(`    Source: ${sourcePath}`));
      console.log(fmt.dim(`    Target: ${targetPath}`));
    } catch (e: any) {
      console.log(fmt.red(`  ✗ Failed to synchronize skill: ${e.message}`));
      process.exit(1);
    }
  });

// ─── Parse ──────────────────────────────────────────────────────────

program.parse();
