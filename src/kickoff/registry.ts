import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { getAntigravityDataRoot } from '../paths.js';
import type { RegistryMerkle } from './types.js';

export function computeRegistryMerkle(overrideSkillsDir?: string): { merkle: RegistryMerkle, honestyError: string | null } {
  let skillsDir = overrideSkillsDir;
  if (!skillsDir) {
    const root = getAntigravityDataRoot();
    skillsDir = join(root, 'skills');
  }
  const slug_hashes: Record<string, string> = {};
  
  try {
    const entries = readdirSync(skillsDir);
    for (const entry of entries) {
      const fullPath = join(skillsDir, entry);
      if (statSync(fullPath).isDirectory()) {
        const mdPath = join(fullPath, 'SKILL.md');
        try {
          if (statSync(mdPath).isFile()) {
            const content = readFileSync(mdPath, 'utf-8');
            slug_hashes[entry] = createHash('sha256').update(content).digest('hex');
          }
        } catch {
          // Ignore missing or unreadable SKILL.md within a skill directory
        }
      }
    }
  } catch {
    const ts = new Date().toISOString();
    return {
      merkle: {
        slug_hashes: {},
        set_hash: null,
        computed_at: ts
      },
      honestyError: `skill registry not readable at ${skillsDir}`
    };
  }

  // Sort keys lexicographically
  const sorted: Record<string, string> = {};
  Object.keys(slug_hashes).sort().forEach(k => {
    sorted[k] = slug_hashes[k];
  });

  const set_hash = createHash('sha256').update(JSON.stringify(sorted)).digest('hex');

  return {
    merkle: {
      slug_hashes: sorted,
      set_hash,
      computed_at: new Date().toISOString()
    },
    honestyError: null
  };
}
