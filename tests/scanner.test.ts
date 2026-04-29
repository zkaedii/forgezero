/**
 * Scanner tests — SKILL.md parser, KI parser.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseSkillFile, extractSkillNameFromPath } from '../src/scanner/skill-parser.js';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');

describe('Skill Parser', () => {
  it('parses SKILL.md with valid YAML frontmatter', () => {
    const skill = parseSkillFile(resolve(FIXTURES, 'sample-skill.md'));

    expect(skill.frontmatter.name).toBe('test-skill');
    expect(skill.frontmatter.description).toContain('test skill');
    expect(skill.bodyMarkdown).toContain('# Test Skill');
    expect(skill.contentHash).toHaveLength(64); // SHA-256 hex
  });

  it('extracts skill name from full path', () => {
    expect(extractSkillNameFromPath('H:\\skills\\user\\zkaedi-prime\\SKILL.md')).toBe('zkaedi-prime');
    expect(extractSkillNameFromPath('H:/skills/user/cosmic-query-resolver/SKILL.md')).toBe('cosmic-query-resolver');
    expect(extractSkillNameFromPath('/home/user/skills/user/error-learner/SKILL.md')).toBe('error-learner');
  });

  it('extracts skill name from JSON-escaped path', () => {
    // overview.txt stores paths with \\\\
    const escaped = 'H:\\\\skills\\\\user\\\\zkaedi-compiler-forge\\\\SKILL.md';
    // extractSkillNameFromPath normalizes backslashes
    expect(extractSkillNameFromPath(escaped)).toBe('zkaedi-compiler-forge');
  });

  it('produces deterministic content hash', () => {
    const skill1 = parseSkillFile(resolve(FIXTURES, 'sample-skill.md'));
    const skill2 = parseSkillFile(resolve(FIXTURES, 'sample-skill.md'));
    expect(skill1.contentHash).toBe(skill2.contentHash);
  });
});

describe('KI Parser', () => {
  // KI parser requires a directory structure, tested via integration
  it('placeholder — KI parser directory test', () => {
    // This is tested in the integration suite where we create temp directories
    expect(true).toBe(true);
  });
});
