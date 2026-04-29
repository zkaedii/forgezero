/**
 * Share / bundle tests — verifies bundle creation, secret gating, and integrity verification.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createBundle, verifyBundle } from '../src/share/share.js';

const TEST_DIR = resolve(import.meta.dirname, '..', '.forge0-test-temp');
const SOURCE_DIR = join(TEST_DIR, 'source');
const OUTPUT_DIR = join(TEST_DIR, 'output');

describe('Share Module', () => {
  beforeEach(() => {
    // Create temp directory structure
    mkdirSync(join(SOURCE_DIR, 'skills', 'test-skill'), { recursive: true });
    writeFileSync(
      join(SOURCE_DIR, 'skills', 'test-skill', 'SKILL.md'),
      '---\nname: test-skill\ndescription: test\n---\n# Test',
    );
    writeFileSync(
      join(SOURCE_DIR, 'README.md'),
      '# Test Bundle',
    );
    mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('creates bundle with manifest from clean source', () => {
    const result = createBundle({
      targetPath: SOURCE_DIR,
      outputDir: OUTPUT_DIR,
      tag: 'v0.1.0-test',
    });

    expect(result.success).toBe(true);
    expect(result.manifest).toBeDefined();
    expect(result.manifest!.tag).toBe('v0.1.0-test');
    expect(result.manifest!.fileCount).toBe(2); // SKILL.md + README.md
    expect(result.manifest!.secretsScrubbed).toBe(true);
    expect(Object.keys(result.manifest!.sha256Checksums)).toHaveLength(2);
  });

  it('refuses bundle when secrets detected (default behavior)', () => {
    // Add a file with secrets
    writeFileSync(
      join(SOURCE_DIR, 'config.json'),
      '{ "API_KEY": "sk-live-abc123def456ghi789jkl012" }',
    );

    const result = createBundle({
      targetPath: SOURCE_DIR,
      outputDir: OUTPUT_DIR,
      tag: 'v0.1.0-secrets',
    });

    expect(result.success).toBe(false);
    expect(result.secretsDetected.length).toBeGreaterThan(0);
    expect(result.error).toContain('secret');
  });

  it('allows bundle with secrets when --allow-secrets is set', () => {
    writeFileSync(
      join(SOURCE_DIR, 'config.json'),
      '{ "API_KEY": "sk-live-abc123def456ghi789jkl012" }',
    );

    const result = createBundle({
      targetPath: SOURCE_DIR,
      outputDir: OUTPUT_DIR,
      tag: 'v0.1.0-forced',
      allowSecrets: true,
    });

    expect(result.success).toBe(true);
    expect(result.secretsDetected.length).toBeGreaterThan(0);
    expect(result.manifest!.secretsScrubbed).toBe(false);
  });

  it('returns error for empty source directory', () => {
    const emptyDir = join(TEST_DIR, 'empty');
    mkdirSync(emptyDir, { recursive: true });

    const result = createBundle({
      targetPath: emptyDir,
      outputDir: OUTPUT_DIR,
      tag: 'v0.0.0',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No files found');
  });

  it('verifies bundle integrity', () => {
    const result = createBundle({
      targetPath: SOURCE_DIR,
      outputDir: OUTPUT_DIR,
      tag: 'v0.1.0-verify',
    });

    expect(result.success).toBe(true);

    const verification = verifyBundle(result.bundlePath!, SOURCE_DIR);
    expect(verification.valid).toBe(true);
    expect(verification.mismatches).toHaveLength(0);
  });

  it('detects tampered files in bundle', () => {
    const result = createBundle({
      targetPath: SOURCE_DIR,
      outputDir: OUTPUT_DIR,
      tag: 'v0.1.0-tamper',
    });

    expect(result.success).toBe(true);

    // Tamper with a file
    writeFileSync(
      join(SOURCE_DIR, 'README.md'),
      '# TAMPERED',
    );

    const verification = verifyBundle(result.bundlePath!, SOURCE_DIR);
    expect(verification.valid).toBe(false);
    expect(verification.mismatches.length).toBeGreaterThan(0);
  });
});
