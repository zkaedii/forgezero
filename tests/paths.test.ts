/**
 * Path resolution tests — verifies OS-aware path derivation.
 */

import { describe, it, expect } from 'vitest';
import {
  getAntigravityDataRoot,
  getKnowledgePath,
  getBrainPath,
  getConversationBrainPath,
  getOverviewPath,
} from '../src/paths.js';
import { homedir } from 'node:os';
import { sep } from 'node:path';

describe('Path Resolution', () => {
  it('returns ~/.gemini/antigravity/ as data root', () => {
    const root = getAntigravityDataRoot();
    expect(root).toContain('.gemini');
    expect(root).toContain('antigravity');
    expect(root).toContain(homedir());
    // Must NOT contain .antigravity as a standalone directory
    // (that's IDE extensions, not agent data)
  });

  it('knowledge path is under data root', () => {
    const kp = getKnowledgePath();
    expect(kp).toContain(getAntigravityDataRoot());
    expect(kp).toContain('knowledge');
  });

  it('brain path is under data root', () => {
    const bp = getBrainPath();
    expect(bp).toContain(getAntigravityDataRoot());
    expect(bp).toContain('brain');
  });

  it('conversation brain path includes conversation ID', () => {
    const convId = 'f639e800-0f39-4add-bac7-64bb18b83e9d';
    const cp = getConversationBrainPath(convId);
    expect(cp).toContain(convId);
    expect(cp).toContain('brain');
  });

  it('overview path points to .system_generated/logs/overview.txt', () => {
    const convId = 'test-conv-id';
    const op = getOverviewPath(convId);
    expect(op).toContain('.system_generated');
    expect(op).toContain('logs');
    expect(op).toContain('overview.txt');
  });

  it('does NOT reference ~/.antigravity/ (IDE extensions)', () => {
    const root = getAntigravityDataRoot();
    // The path should be .gemini/antigravity, not just .antigravity
    const parts = root.split(sep);
    // Find the index of 'antigravity' and check the parent is '.gemini'
    const agIdx = parts.findIndex((p) => p === 'antigravity');
    if (agIdx > 0) {
      expect(parts[agIdx - 1]).toBe('.gemini');
    }
  });
});
