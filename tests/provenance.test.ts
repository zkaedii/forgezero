/**
 * Provenance tests — brain parser, provenance extraction.
 *
 * Uses synthetic overview.jsonl fixture with known signals:
 *   - 2 skill loads (zkaedi-prime, zkaedi-compiler-forge)
 *   - 1 KI reference (test_ki)
 *   - 1 artifact write (D:\project\src\main.ts)
 */

import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'node:path';
import { parseOverview, extractProvenance } from '../src/scanner/brain-parser.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readdirSync: (path: import('node:fs').PathLike, options: any) => {
      if (typeof path === 'string' && path.includes('knowledge')) {
        return [
          { name: 'test_ki', isDirectory: () => true },
        ];
      }
      return actual.readdirSync(path, options);
    }
  };
});

const FIXTURES = resolve(import.meta.dirname, 'fixtures');
const OVERVIEW_PATH = resolve(FIXTURES, 'sample-overview.jsonl');

describe('Brain Parser', () => {
  it('parses overview JSONL into structured steps', () => {
    const steps = parseOverview(OVERVIEW_PATH);
    expect(steps).toHaveLength(6);
    expect(steps[0].source).toBe('USER_EXPLICIT');
    expect(steps[0].type).toBe('USER_INPUT');
    expect(steps[1].tool_calls).toBeDefined();
    expect(steps[1].tool_calls).toHaveLength(1);
  });

  it('returns empty array for non-existent file', () => {
    const steps = parseOverview('/nonexistent/path/overview.txt');
    expect(steps).toEqual([]);
  });
});

describe('Provenance Extraction', () => {
  it('detects skill loads from view_file calls', () => {
    const steps = parseOverview(OVERVIEW_PATH);
    const report = extractProvenance('test-conv-id', steps);

    expect(report.skillsLoaded).toHaveLength(2);
    expect(report.skillsLoaded[0].skillName).toBe('zkaedi-prime');
    expect(report.skillsLoaded[1].skillName).toBe('zkaedi-compiler-forge');

    // Verify confidence tagging
    for (const skill of report.skillsLoaded) {
      expect(skill.confidence).toBe('DETECTED_WHEN_EXPLICIT');
    }
  });

  it('detects KI references from path segments', () => {
    const steps = parseOverview(OVERVIEW_PATH);
    // HYGIENE-FORGE-007: inject test KI set to avoid CI host-filesystem dependency
    const report = extractProvenance('test-conv-id', steps, new Set(['test_ki']));

    expect(report.kisReferenced).toHaveLength(1);
    expect(report.kisReferenced[0].kiSlug).toBe('test_ki');
    expect(report.kisReferenced[0].confidence).toBe('DETECTED_WHEN_EXPLICIT');
  });

  it('detects artifact production from write_to_file calls', () => {
    const steps = parseOverview(OVERVIEW_PATH);
    const report = extractProvenance('test-conv-id', steps);

    expect(report.artifactsProduced).toHaveLength(1);
    expect(report.artifactsProduced[0].artifactPath).toContain('main.ts');
  });

  it('includes honest caveat about detection boundaries', () => {
    const steps = parseOverview(OVERVIEW_PATH);
    const report = extractProvenance('test-conv-id', steps);

    expect(report.caveat).toContain('LOWER BOUND');
    expect(report.caveat).toContain('system prompt injection');
    expect(report.caveat).toContain('NO detectable trace');
  });

  it('deduplicates skill loads', () => {
    // If the same skill is loaded twice, should only appear once
    const steps = parseOverview(OVERVIEW_PATH);
    const report = extractProvenance('test-conv-id', steps);

    const skillNames = report.skillsLoaded.map((s) => s.skillName);
    const uniqueNames = [...new Set(skillNames)];
    expect(skillNames.length).toBe(uniqueNames.length);
  });

  it('records correct step indices and timestamps', () => {
    const steps = parseOverview(OVERVIEW_PATH);
    const report = extractProvenance('test-conv-id', steps);

    // First skill load should be at step 1
    expect(report.skillsLoaded[0].stepIndex).toBe(1);
    expect(report.skillsLoaded[0].timestamp).toBe('2026-04-01T10:00:05Z');
  });
});
