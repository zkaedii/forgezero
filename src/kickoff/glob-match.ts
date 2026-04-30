import { minimatch } from 'minimatch';

/**
 * matchesAny — test if a path matches any pattern in a list.
 * Uses minimatch with { dot: true } to match dotfiles.
 * Single abstraction point over the minimatch dependency.
 */
export function matchesAny(path: string, patterns: string[]): boolean {
  return patterns.some(pattern => minimatch(path, pattern, { dot: true }));
}
