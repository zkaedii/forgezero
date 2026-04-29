/**
 * SKILL.md parser — extracts YAML frontmatter + markdown body.
 */

import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import type { ParsedSkill, SkillFrontmatter } from './types.js';

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Parse a SKILL.md file into structured form.
 */
export function parseSkillFile(filePath: string): ParsedSkill {
  const raw = readFileSync(filePath, 'utf-8');
  const hash = createHash('sha256').update(raw).digest('hex');

  const match = raw.match(FRONTMATTER_REGEX);
  let frontmatter: SkillFrontmatter;
  let body: string;

  if (match) {
    try {
      const parsed = parseYaml(match[1]) as Record<string, unknown>;
      frontmatter = {
        name: (parsed.name as string) ?? basename(dirname(filePath)),
        description: (parsed.description as string) ?? '',
        ...parsed,
      };
      body = match[2].trim();
    } catch {
      frontmatter = {
        name: basename(dirname(filePath)),
        description: '',
      };
      body = raw;
    }
  } else {
    frontmatter = {
      name: basename(dirname(filePath)),
      description: '',
    };
    body = raw;
  }

  return {
    filePath,
    frontmatter,
    bodyMarkdown: body,
    contentHash: hash,
  };
}

/**
 * Extract the skill name from a SKILL.md path.
 * Path pattern: .../skills/user/<skill-name>/SKILL.md
 */
export function extractSkillNameFromPath(skillPath: string): string {
  const normalized = skillPath.replace(/\\\\/g, '/').replace(/\\/g, '/');
  const match = normalized.match(/skills\/user\/([^/]+)\/SKILL\.md/i);
  return match ? match[1] : basename(dirname(skillPath));
}
