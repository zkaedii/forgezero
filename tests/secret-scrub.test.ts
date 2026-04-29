/**
 * Secret scrub tests — verifies credential detection in MCP configs and other files.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { scanFileForSecrets, DEFAULT_SECRET_PATTERNS } from '../src/share/secret-scrub.js';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');

describe('Secret Scrub Engine', () => {
  it('detects secrets in MCP config with API keys', () => {
    const detections = scanFileForSecrets(resolve(FIXTURES, 'mcp-with-secrets.json'));

    // Should find API_KEY, SECRET_TOKEN, and possibly DATABASE_URL (contains "password")
    expect(detections.length).toBeGreaterThanOrEqual(2);

    const patterns = detections.map((d) => d.matchedPattern);
    expect(patterns).toContain('api_key');
    // SECRET_TOKEN is caught by the 'secret' substring match in the denylist
    expect(patterns).toContain('secret');
  });

  it('passes clean MCP config with no secrets', () => {
    const detections = scanFileForSecrets(resolve(FIXTURES, 'mcp-clean.json'));
    expect(detections).toHaveLength(0);
  });

  it('returns empty for non-existent files', () => {
    const detections = scanFileForSecrets('/nonexistent/path/config.json');
    expect(detections).toEqual([]);
  });

  it('provides context for detected secrets', () => {
    const detections = scanFileForSecrets(resolve(FIXTURES, 'mcp-with-secrets.json'));
    for (const detection of detections) {
      expect(detection.lineNumber).toBeGreaterThan(0);
      expect(detection.context.length).toBeGreaterThan(0);
      expect(detection.filePath).toContain('mcp-with-secrets.json');
    }
  });

  it('default denylist includes critical patterns', () => {
    const critical = ['api_key', 'secret', 'token', 'password', 'authorization', 'client_secret'];
    for (const pattern of critical) {
      expect(DEFAULT_SECRET_PATTERNS).toContain(pattern);
    }
  });

  it('detects password in DATABASE_URL', () => {
    const detections = scanFileForSecrets(resolve(FIXTURES, 'mcp-with-secrets.json'));
    const passwordDetection = detections.find((d) => d.matchedPattern === 'password');
    // DATABASE_URL contains "password" in the connection string
    expect(passwordDetection).toBeDefined();
  });

  it('does NOT false-positive on prose markdown discussing tokens/secrets', () => {
    const detections = scanFileForSecrets(resolve(FIXTURES, 'skill-with-token-prose.md'));

    // This SKILL.md contains the words "token", "secret", "authorization",
    // "password", "api_key", "client_secret" in natural language prose.
    // The scrubber must NOT flag any of these as secrets because they are
    // documentation, not key-value assignments with real credential values.
    expect(detections).toHaveLength(0);
  });

  it('still catches real secrets embedded in markdown frontmatter', () => {
    // If someone puts a real secret in YAML frontmatter, it SHOULD be caught
    const { writeFileSync, unlinkSync } = require('node:fs');
    const tempPath = resolve(FIXTURES, '_temp-secret-skill.md');
    writeFileSync(tempPath, '---\nname: my-skill\napi_key: sk-live-real-credential-value-123abc\n---\n# Test\n');
    try {
      const detections = scanFileForSecrets(tempPath);
      // Should detect the api_key in YAML frontmatter
      expect(detections.length).toBeGreaterThanOrEqual(1);
      expect(detections[0].matchedPattern).toBe('api_key');
    } finally {
      unlinkSync(tempPath);
    }
  });
});
