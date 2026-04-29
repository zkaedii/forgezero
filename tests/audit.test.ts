/**
 * Audit tests — git diff bridge, surface classification.
 */

import { describe, it, expect } from 'vitest';
import { classifySurface, checkGitAvailable, runAudit } from '../src/audit/audit.js';

describe('Surface Classification', () => {
  it('classifies SKILL.md files as Skill', () => {
    expect(classifySurface('.agents/skills/my-skill/SKILL.md')).toBe('Skill');
    expect(classifySurface('H:\\skills\\user\\zkaedi-prime\\SKILL.md')).toBe('Skill');
  });

  it('classifies rule files as Rule', () => {
    expect(classifySurface('.agents/rules/my-rule.md')).toBe('Rule');
    expect(classifySurface('rules/safety-rule.md')).toBe('Rule');
  });

  it('classifies workflow files as Workflow', () => {
    expect(classifySurface('.agents/workflows/deploy.md')).toBe('Workflow');
    expect(classifySurface('workflows/build-workflow.md')).toBe('Workflow');
  });

  it('classifies MCP config as MCP', () => {
    expect(classifySurface('mcp_config.json')).toBe('MCP');
    expect(classifySurface('.gemini/antigravity/mcp_config.json')).toBe('MCP');
  });

  it('classifies unknown paths as Unknown', () => {
    expect(classifySurface('README.md')).toBe('Unknown');
    expect(classifySurface('package.json')).toBe('Unknown');
  });
});

describe('Git Status Detection', () => {
  it('checkGitAvailable returns structured status', () => {
    // In the test environment, git should be available
    const status = checkGitAvailable(process.cwd());
    // Status should be one of the three valid values
    expect(['AVAILABLE', 'MISSING', 'NOT_A_REPO']).toContain(status);
  });

  it('checkGitAvailable returns NOT_A_REPO for non-git directory', () => {
    // Windows temp is not a git repo
    const status = checkGitAvailable('C:\\Windows\\Temp');
    // Could be MISSING (if git not on PATH in test context) or NOT_A_REPO
    expect(['MISSING', 'NOT_A_REPO']).toContain(status);
  });
});

describe('Audit Report Fields', () => {
  it('runAudit includes gitAvailable status', () => {
    const report = runAudit(process.cwd(), process.cwd(), 1);
    expect(typeof report.gitAvailable).toBe('boolean');
  });

  it('runAudit always includes honest scope caveat', () => {
    const report = runAudit(process.cwd(), process.cwd(), 1);
    expect(report.caveat).toContain('git-tracked');
    expect(report.caveat).toContain('Knowledge Items');
    expect(report.caveat).toContain('Model-Decision');
    expect(report.caveat).toContain('forge0 provenance');
  });
});
