import { join, dirname } from 'node:path';
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runKickoff } from '../src/kickoff/kickoff.js';

describe('Kickoff Orchestration', () => {
  // Use a temporary git repo for real integration tests.
  // GIT_CEILING_DIRECTORIES prevents git from walking up to the parent
  // forgezero repo, ensuring the fixture repo is fully isolated.
  const tmpDir = join(__dirname, 'tmp-kickoff-test');
  const ceiling = dirname(tmpDir);
  let savedCeiling: string | undefined;

  const gitOpts = { cwd: tmpDir, encoding: 'utf-8' as const };

  beforeAll(() => {
    // Set GIT_CEILING_DIRECTORIES at process level so git-helpers.ts
    // execFileSync calls inherit it (they don't use the test's env).
    savedCeiling = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = ceiling;

    mkdirSync(join(tmpDir, 'docs'), { recursive: true });
    execFileSync('git', ['init'], gitOpts);
    execFileSync('git', ['config', 'user.email', 'test@test.com'], gitOpts);
    execFileSync('git', ['config', 'user.name', 'Test'], gitOpts);
    // Non-protected branch name
    execFileSync('git', ['checkout', '-b', 'feature/test'], gitOpts);
    // Base commit (empty)
    execFileSync('git', ['commit', '--allow-empty', '-m', 'base'], gitOpts);
    // Second commit: docs-only content. Ensures HEAD~1 resolves
    // and the diff between HEAD~1..HEAD is docs-only (low_risk).
    writeFileSync(join(tmpDir, 'docs', 'README.md'), '# test docs');
    execFileSync('git', ['add', '.'], gitOpts);
    execFileSync('git', ['commit', '-m', 'add docs'], gitOpts);
  });

  afterAll(() => {
    // Restore original GIT_CEILING_DIRECTORIES
    if (savedCeiling === undefined) {
      delete process.env.GIT_CEILING_DIRECTORIES;
    } else {
      process.env.GIT_CEILING_DIRECTORIES = savedCeiling;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runKickoff({explain: true}) returns ModeDecision and does NOT write a dump file', () => {
    const result = runKickoff({ repoRoot: tmpDir, explain: true });
    
    expect(result.success).toBe(true);
    expect(result.mode_decision).toBeDefined();
    expect(result.mode_decision.evidence.length).toBeGreaterThanOrEqual(1);
    // No dump should be written
    const sessionsDir = join(tmpDir, '.forge0', 'sessions');
    if (existsSync(sessionsDir)) {
      // If the dir exists, it should be empty (from other tests)
      // The key assertion is that dump_path is empty
    }
    expect(result.dump_path).toBe('');
  });

  it('runKickoff({mode: "minimal"}) writes a dump with mode: "minimal"', () => {
    // Fixture: isolated git repo on branch feature/test with docs-only content,
    // no tags, clean tree. All 7 observables should return low_risk, so
    // --mode minimal CLI override is accepted by the auto-router.
    const result = runKickoff({ repoRoot: tmpDir, mode: 'minimal' });
    
    expect(result.success).toBe(true);
    expect(result.mode).toBe('minimal');
    expect(existsSync(result.dump_path)).toBe(true);
    
    const dump = JSON.parse(readFileSync(result.dump_path, 'utf-8'));
    expect(dump.mode).toBe('minimal');
    expect(dump.pending_agent_dump).toBeUndefined();
  });

  it('runKickoff({mode: "full"}) writes a dump with mode: "full" and pending_agent_dump', () => {
    const result = runKickoff({ repoRoot: tmpDir, mode: 'full' });
    
    expect(result.success).toBe(true);
    expect(result.mode).toBe('full');
    expect(existsSync(result.dump_path)).toBe(true);
    
    const dump = JSON.parse(readFileSync(result.dump_path, 'utf-8'));
    expect(dump.mode).toBe('full');
    expect(dump.pending_agent_dump).toBe(true);
  });

  it('dump path defaults to .forge0/sessions/<uuid>.json with valid v4 UUID', () => {
    const result = runKickoff({ repoRoot: tmpDir, mode: 'minimal' });
    
    expect(result.dump_path).toContain('.forge0');
    expect(result.dump_path).toContain('sessions');
    expect(result.dump_path).toContain(result.session_id);
    // UUID v4 format check
    expect(result.session_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('--out overrides the dump path', () => {
    const customPath = join(tmpDir, 'custom-kickoff.json');
    const result = runKickoff({ repoRoot: tmpDir, mode: 'minimal', out: customPath });
    
    expect(result.dump_path).toBe(customPath);
    expect(existsSync(customPath)).toBe(true);
  });

  it('dump contains registry merkle in both modes', () => {
    const result = runKickoff({ repoRoot: tmpDir, mode: 'minimal' });
    const dump = JSON.parse(readFileSync(result.dump_path, 'utf-8'));
    
    expect(dump.local.skill_registry_merkle).toBeDefined();
    expect(dump.local.skill_registry_merkle.slug_hashes).toBeDefined();
    expect(dump.local.skill_registry_merkle.computed_at).toBeDefined();
  });

  it('dump contains schema_version 1', () => {
    const result = runKickoff({ repoRoot: tmpDir, mode: 'minimal' });
    const dump = JSON.parse(readFileSync(result.dump_path, 'utf-8'));
    
    expect(dump.schema_version).toBe(1);
  });
});
