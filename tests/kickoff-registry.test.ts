import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { computeRegistryMerkle } from '../src/kickoff/registry.js';
import { createHash } from 'node:crypto';

describe('Registry Merkle Baseline', () => {
  const tmpDir = join(__dirname, 'tmp-registry-test');

  beforeAll(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should handle unreadable/missing directory', () => {
    const badDir = join(tmpDir, 'does-not-exist');
    const { merkle, honestyError } = computeRegistryMerkle(badDir);
    expect(honestyError).toMatch(/skill registry not readable at/);
    expect(merkle.slug_hashes).toEqual({});
    expect(merkle.set_hash).toBeNull();
  });

  it('should compute merkle for valid skills directory', () => {
    const validDir = join(tmpDir, 'skills-valid');
    mkdirSync(join(validDir, 'skill-a'), { recursive: true });
    mkdirSync(join(validDir, 'skill-b'), { recursive: true });
    
    writeFileSync(join(validDir, 'skill-a', 'SKILL.md'), 'hello a');
    writeFileSync(join(validDir, 'skill-b', 'SKILL.md'), 'hello b');
    
    const { merkle, honestyError } = computeRegistryMerkle(validDir);
    expect(honestyError).toBeNull();
    expect(Object.keys(merkle.slug_hashes)).toEqual(['skill-a', 'skill-b']);
    
    const expectedHash = createHash('sha256').update(JSON.stringify(merkle.slug_hashes)).digest('hex');
    expect(merkle.set_hash).toBe(expectedHash);
  });

  it('should handle empty directory correctly', () => {
    const emptyDir = join(tmpDir, 'skills-empty');
    mkdirSync(emptyDir, { recursive: true });
    
    const { merkle, honestyError } = computeRegistryMerkle(emptyDir);
    expect(honestyError).toBeNull();
    expect(Object.keys(merkle.slug_hashes)).toEqual([]);
    expect(merkle.set_hash).toBe(createHash('sha256').update('{}').digest('hex'));
  });

  it('should skip directories without SKILL.md', () => {
    const mixedDir = join(tmpDir, 'skills-mixed');
    mkdirSync(join(mixedDir, 'has-skill'), { recursive: true });
    mkdirSync(join(mixedDir, 'no-skill'), { recursive: true });
    writeFileSync(join(mixedDir, 'has-skill', 'SKILL.md'), 'content');
    
    const { merkle, honestyError } = computeRegistryMerkle(mixedDir);
    expect(honestyError).toBeNull();
    expect(Object.keys(merkle.slug_hashes)).toEqual(['has-skill']);
  });
});
