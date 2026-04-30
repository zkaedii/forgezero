import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Policy } from './types.js';

export function defaultPolicy(): Policy {
  return {
    default_mode: 'auto',
    default_branch_ref: 'origin/main',
    auto_full_paths: [
      'src/**', '.github/**', 'bin/**',
      '*.config.js', '*.config.ts',
      'package.json', 'package-lock.json',
      'tsconfig.json'
    ],
    auto_full_branches: [
      'main', 'master', 'release/*', 'hotfix/*'
    ],
    auto_full_when_tag_within_commits: 5,
    auto_full_when_uncommitted_in_paths: ['src/**', 'bin/**'],
    minimal_allowed_paths: [
      'docs/**', '*.md', 'tests/fixtures/**',
      '.forge0/**', 'LICENSE', '.gitignore'
    ],
    minimal_max_lines_changed: 50
  };
}

export function validatePolicy(data: unknown, filePath: string, honesty: string[]): Policy {
  if (!data || typeof data !== 'object') {
    throw new Error(`Policy file ${filePath} is malformed: not a JSON object`);
  }
  
  const obj = data as Record<string, unknown>;
  const def = defaultPolicy();
  const result: Partial<Policy> = {};

  const assertString = (field: string, val: unknown) => {
    if (val === undefined) {
      honesty.push(`policy field '${field}' missing; used default`);
      return (def as any)[field];
    }
    if (typeof val !== 'string') throw new Error(`Policy file ${filePath} field '${field}' expected string, got ${typeof val}`);
    return val;
  };

  const assertStringArray = (field: string, val: unknown) => {
    if (val === undefined) {
      honesty.push(`policy field '${field}' missing; used default`);
      return (def as any)[field];
    }
    if (!Array.isArray(val) || !val.every(x => typeof x === 'string' && x.length > 0)) {
      throw new Error(`Policy file ${filePath} field '${field}' expected array of non-empty strings`);
    }
    return val;
  };

  const assertNumber = (field: string, val: unknown) => {
    if (val === undefined) {
      honesty.push(`policy field '${field}' missing; used default`);
      return (def as any)[field];
    }
    if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) {
      throw new Error(`Policy file ${filePath} field '${field}' expected integer >= 0`);
    }
    return val;
  };

  const mode = assertString('default_mode', obj.default_mode);
  if (mode !== 'auto' && mode !== 'full' && mode !== 'minimal') {
    throw new Error(`Policy file ${filePath} field 'default_mode' expected 'auto', 'full', or 'minimal', got ${mode}`);
  }
  result.default_mode = mode;

  const branchRef = assertString('default_branch_ref', obj.default_branch_ref);
  if (!branchRef) throw new Error(`Policy file ${filePath} field 'default_branch_ref' expected non-empty string`);
  result.default_branch_ref = branchRef;

  result.auto_full_paths = assertStringArray('auto_full_paths', obj.auto_full_paths);
  result.auto_full_branches = assertStringArray('auto_full_branches', obj.auto_full_branches);
  result.auto_full_when_tag_within_commits = assertNumber('auto_full_when_tag_within_commits', obj.auto_full_when_tag_within_commits);
  result.auto_full_when_uncommitted_in_paths = assertStringArray('auto_full_when_uncommitted_in_paths', obj.auto_full_when_uncommitted_in_paths);
  result.minimal_allowed_paths = assertStringArray('minimal_allowed_paths', obj.minimal_allowed_paths);
  result.minimal_max_lines_changed = assertNumber('minimal_max_lines_changed', obj.minimal_max_lines_changed);

  return result as Policy;
}

export function loadPolicy(repoRoot: string): { policy: Policy, sha256: string | null, honesty: string[] } {
  const p = join(repoRoot, '.forge0', 'policy.json');
  const honesty: string[] = [];
  
  if (!existsSync(p)) {
    honesty.push('policy file not found; using built-in defaults');
    return { policy: defaultPolicy(), sha256: null, honesty };
  }

  try {
    const raw = readFileSync(p, 'utf-8');
    const hash = createHash('sha256').update(raw).digest('hex');
    const parsed = JSON.parse(raw);
    const policy = validatePolicy(parsed, p, honesty);
    return { policy, sha256: hash, honesty };
  } catch (e: any) {
    if (e instanceof SyntaxError) {
      throw new Error(`Policy file ${p} is malformed JSON: ${e.message}`);
    }
    throw e;
  }
}
