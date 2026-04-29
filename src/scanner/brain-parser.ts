/**
 * Conversation brain overview.txt parser.
 *
 * Format (verified Phase 0.5): JSONL — one JSON object per line.
 * Each line has: step_index, source, type, status, created_at, content?, tool_calls?
 *
 * Provenance signals detected:
 *   - view_file calls with SKILL.md paths → [DETECTED_WHEN_EXPLICIT]
 *   - path references to knowledge/ → [DETECTED_WHEN_EXPLICIT]
 *   - write_to_file calls → artifact production
 */

import { readFileSync, existsSync } from 'node:fs';
import type {
  OverviewStep,
  ProvenanceSkillRef,
  ProvenanceKIRef,
  ProvenanceArtifactRef,
  ProvenanceReport,
} from './types.js';
import { extractSkillNameFromPath } from './skill-parser.js';

/**
 * Parse overview.txt into structured steps.
 * Tolerant of malformed lines (skips them).
 */
export function parseOverview(overviewPath: string): OverviewStep[] {
  if (!existsSync(overviewPath)) {
    return [];
  }

  const raw = readFileSync(overviewPath, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const steps: OverviewStep[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as OverviewStep;
      if (typeof parsed.step_index === 'number') {
        steps.push(parsed);
      }
    } catch {
      // Malformed line — skip silently
    }
  }

  return steps;
}

// Regex to detect SKILL.md load via view_file
// Matches JSON-escaped paths: skills\\\\user\\\\<name>\\\\SKILL.md
// and also forward-slash paths: skills/user/<name>/SKILL.md
const SKILL_PATH_REGEX = /skills[/\\]{1,4}user[/\\]{1,4}([a-zA-Z0-9_-]+)[/\\]{1,4}SKILL\.md/i;

// Regex to detect KI reference via knowledge directory path
const KI_PATH_REGEX = /knowledge[/\\]{1,4}([a-zA-Z0-9_-]+)/i;

/**
 * Extract provenance signals from parsed overview steps.
 */
export function extractProvenance(
  conversationId: string,
  steps: OverviewStep[],
): ProvenanceReport {
  const skillsLoaded: ProvenanceSkillRef[] = [];
  const kisReferenced: ProvenanceKIRef[] = [];
  const artifactsProduced: ProvenanceArtifactRef[] = [];

  const seenSkills = new Set<string>();
  const seenKIs = new Set<string>();

  for (const step of steps) {
    if (!step.tool_calls) continue;

    for (const call of step.tool_calls) {
      const argsStr = JSON.stringify(call.args);

      // Detect Skill loads: view_file on SKILL.md
      if (call.name === 'view_file') {
        const absPath = call.args?.AbsolutePath ?? call.args?.absolutePath ?? '';
        const skillMatch = absPath.match(SKILL_PATH_REGEX) ?? argsStr.match(SKILL_PATH_REGEX);
        if (skillMatch) {
          const skillName = skillMatch[1];
          if (!seenSkills.has(skillName)) {
            seenSkills.add(skillName);
            skillsLoaded.push({
              skillName,
              skillPath: absPath || `(extracted from args: ${skillName})`,
              stepIndex: step.step_index,
              timestamp: step.created_at,
              confidence: 'DETECTED_WHEN_EXPLICIT',
            });
          }
        }
      }

      // Detect KI references: any tool call referencing knowledge/<slug>
      const kiMatch = argsStr.match(KI_PATH_REGEX);
      if (kiMatch) {
        const kiSlug = kiMatch[1];
        // Skip the generic "artifacts" subdirectory — it's not a KI slug
        if (kiSlug !== 'artifacts' && !seenKIs.has(kiSlug)) {
          seenKIs.add(kiSlug);
          kisReferenced.push({
            kiSlug,
            kiPath: `knowledge/${kiSlug}`,
            stepIndex: step.step_index,
            timestamp: step.created_at,
            confidence: 'DETECTED_WHEN_EXPLICIT',
          });
        }
      }

      // Detect artifact production: write_to_file calls
      if (call.name === 'write_to_file') {
        const targetFile = call.args?.TargetFile ?? call.args?.targetFile ?? '';
        if (targetFile) {
          artifactsProduced.push({
            artifactPath: targetFile,
            stepIndex: step.step_index,
            timestamp: step.created_at,
          });
        }
      }
    }
  }

  return {
    conversationId,
    scannedAt: new Date().toISOString(),
    skillsLoaded,
    kisReferenced,
    artifactsProduced,
    totalSteps: steps.length,
    caveat:
      'This report shows Skills and KIs the agent explicitly loaded via tool calls ' +
      '(view_file on SKILL.md, path references to knowledge/). Skills that were available ' +
      'via system prompt injection but never explicitly read leave NO detectable trace in ' +
      'overview.txt. This report represents a LOWER BOUND on agent influence, not a complete picture.',
  };
}
