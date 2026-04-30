import { execSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';

const CLI = 'node dist/bin/forge0.js';
const run = (args: string) => execSync(`${CLI} ${args}`, { encoding: 'utf-8', cwd: process.cwd(), timeout: 15000 });

describe('Kickoff CLI', () => {
  it('forge0 kickoff --explain --json exits 0 and emits ModeDecision JSON', () => {
    const raw = run('kickoff --explain --json');
    const parsed = JSON.parse(raw);
    expect(parsed.selected).toBeDefined();
    expect(parsed.selected_by).toBeDefined();
    expect(parsed.evidence).toBeDefined();
    expect(Array.isArray(parsed.evidence)).toBe(true);
  });

  it('forge0 kickoff --explain --mode minimal includes override info', () => {
    const raw = run('kickoff --explain --json --mode minimal');
    const parsed = JSON.parse(raw);
    expect(parsed.selected).toBeDefined();
    expect(parsed.selected_by).toBeDefined();
    // On a TS source repo, observables likely force full → cli_override_rejected
    // Or if it's clean enough, it might allow minimal → cli_override
    expect(['auto', 'cli_override'].includes(parsed.selected_by) || parsed.cli_override_rejected === true).toBe(true);
  });

  it('forge0 kickoff --json emits KickoffResult JSON', () => {
    const raw = run('kickoff --json --mode minimal');
    const parsed = JSON.parse(raw);
    expect(parsed.success).toBe(true);
    expect(parsed.session_id).toBeDefined();
    expect(parsed.mode).toBeDefined();
    expect(parsed.dump_path).toBeDefined();
    expect(parsed.mode_decision).toBeDefined();
    expect(parsed.registry_merkle).toBeDefined();
  });
});
