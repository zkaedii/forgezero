import { writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import type { KickoffDump } from './types.js';

/**
 * writeKickoffDump — atomic dump writer.
 * Writes JSON to <dumpPath>.tmp then fs.renameSync to final path.
 * Creates parent directory if missing. Throws on filesystem error.
 */
export function writeKickoffDump(dump: KickoffDump, dumpPath: string): void {
  const dir = dirname(dumpPath);
  mkdirSync(dir, { recursive: true });

  const tmpPath = dumpPath + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(dump, null, 2), 'utf-8');
  renameSync(tmpPath, dumpPath);
}
