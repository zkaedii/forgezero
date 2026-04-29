/**
 * KI metadata.json parser.
 *
 * Ground truth format (from Phase 0.5 verification):
 * {
 *   "title": "...",
 *   "summary": "...",
 *   "createdAt": "2026-03-30T21:23:00Z",
 *   "updatedAt": "2026-03-30T21:23:00Z",
 *   "references": ["path1", "path2"],
 *   "artifacts": ["artifacts/file.md"]
 * }
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import type { ParsedKI, KIMetadata } from './types.js';

/**
 * Parse a single KI directory (contains metadata.json).
 */
export function parseKIDirectory(dirPath: string): ParsedKI | null {
  const metadataPath = join(dirPath, 'metadata.json');
  if (!existsSync(metadataPath)) {
    return null;
  }

  try {
    const raw = readFileSync(metadataPath, 'utf-8');
    const hash = createHash('sha256').update(raw).digest('hex');
    const parsed = JSON.parse(raw) as KIMetadata;

    return {
      dirPath,
      slug: basename(dirPath),
      metadata: {
        title: parsed.title ?? '',
        summary: parsed.summary ?? '',
        createdAt: parsed.createdAt ?? '',
        updatedAt: parsed.updatedAt ?? '',
        references: parsed.references ?? [],
        artifacts: parsed.artifacts ?? [],
      },
      contentHash: hash,
    };
  } catch {
    return null;
  }
}

/**
 * Scan the entire knowledge directory and parse all KIs.
 */
export function scanAllKIs(knowledgePath: string): ParsedKI[] {
  if (!existsSync(knowledgePath)) {
    return [];
  }

  const entries = readdirSync(knowledgePath, { withFileTypes: true });
  const kis: ParsedKI[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const parsed = parseKIDirectory(join(knowledgePath, entry.name));
      if (parsed) {
        kis.push(parsed);
      }
    }
  }

  return kis;
}
