import { join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { loadPolicy, defaultPolicy } from '../src/kickoff/policy.js';

describe('Policy Loader', () => {
  const tmpDir = join(__dirname, 'tmp-policy-test');
  const forge0Dir = join(tmpDir, '.forge0');
  const policyFile = join(forge0Dir, 'policy.json');

  beforeAll(() => {
    mkdirSync(forge0Dir, { recursive: true });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  afterEach(() => {
    rmSync(policyFile, { force: true });
  });

  it('should return defaults when missing', () => {
    const { policy, sha256, honesty } = loadPolicy(tmpDir);
    expect(policy).toEqual(defaultPolicy());
    expect(sha256).toBeNull();
    expect(honesty).toContain('policy file not found; using built-in defaults');
  });

  it('should throw on malformed JSON', () => {
    writeFileSync(policyFile, '{ bad json');
    expect(() => loadPolicy(tmpDir)).toThrow(/malformed JSON/);
  });

  it('should throw on validation error', () => {
    writeFileSync(policyFile, JSON.stringify({ default_mode: 'invalid' }));
    expect(() => loadPolicy(tmpDir)).toThrow(/expected 'auto', 'full', or 'minimal'/);
  });

  it('should throw on wrong field type', () => {
    writeFileSync(policyFile, JSON.stringify({ minimal_max_lines_changed: 'not a number' }));
    expect(() => loadPolicy(tmpDir)).toThrow(/expected integer >= 0/);
  });

  it('should throw on negative integer', () => {
    writeFileSync(policyFile, JSON.stringify({ minimal_max_lines_changed: -5 }));
    expect(() => loadPolicy(tmpDir)).toThrow(/expected integer >= 0/);
  });

  it('should fill missing fields with defaults', () => {
    writeFileSync(policyFile, JSON.stringify({ default_mode: 'full' }));
    const { policy, honesty } = loadPolicy(tmpDir);
    expect(policy.default_mode).toBe('full');
    expect(policy.default_branch_ref).toBe('origin/main');
    expect(honesty).toContain("policy field 'default_branch_ref' missing; used default");
  });

  it('should successfully load a full valid policy', () => {
    const full = defaultPolicy();
    full.default_mode = 'minimal';
    writeFileSync(policyFile, JSON.stringify(full));
    const { policy, sha256, honesty } = loadPolicy(tmpDir);
    expect(policy.default_mode).toBe('minimal');
    expect(sha256).toBeTruthy();
    expect(honesty.length).toBe(0);
  });

  it('should throw on empty string in array field', () => {
    writeFileSync(policyFile, JSON.stringify({ auto_full_paths: ['valid', ''] }));
    expect(() => loadPolicy(tmpDir)).toThrow(/array of non-empty strings/);
  });

  it('should throw on null field value', () => {
    writeFileSync(policyFile, JSON.stringify({ default_branch_ref: null }));
    expect(() => loadPolicy(tmpDir)).toThrow();
  });

  it('should throw on empty default_branch_ref', () => {
    writeFileSync(policyFile, JSON.stringify({ default_branch_ref: '' }));
    expect(() => loadPolicy(tmpDir)).toThrow(/non-empty string/);
  });

  it('should produce stable hash across reads', () => {
    const full = defaultPolicy();
    writeFileSync(policyFile, JSON.stringify(full));
    const r1 = loadPolicy(tmpDir);
    const r2 = loadPolicy(tmpDir);
    expect(r1.sha256).toBe(r2.sha256);
    expect(r1.sha256).not.toBeNull();
  });
});
