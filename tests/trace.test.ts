import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runTrace } from '../src/trace/trace.js';
import type { KickoffDump, AgentDump, ModeDecision, RegistryMerkle } from '../src/kickoff/types.js';
import { defaultPolicy, loadPolicy } from '../src/kickoff/policy.js';
import { computeRegistryMerkle } from '../src/kickoff/registry.js';

/**
 * Each trace tag gets its own independent fixture.
 * No fixture sharing between tests.
 */

function makeModeDecision(overrides?: Partial<ModeDecision>): ModeDecision {
  const { sha256: currentPolicySha256 } = loadPolicy(process.cwd());
  return {
    selected: 'full',
    selected_by: 'auto',
    evidence: [],
    policy_path: null,
    policy_sha256: currentPolicySha256,
    ...overrides,
  };
}

function makeMerkle(overrides?: Partial<RegistryMerkle>): RegistryMerkle {
  const { merkle } = computeRegistryMerkle();
  return { ...merkle, ...overrides };
}

function makeFullDump(sessionId: string, overrides?: Partial<KickoffDump>): KickoffDump {
  return {
    schema_version: 1,
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    mode: 'full',
    mode_decision: makeModeDecision(),
    local: {
      skill_registry_merkle: makeMerkle(),
      repo_root: '/fake',
      branch: 'main',
      head: 'abc123',
      dirty: false,
      tags_at_head: [],
    },
    pending_agent_dump: true,
    honesty: {
      claim: 'test',
      verified: [],
      notObservable: [],
    },
    ...overrides,
  };
}

function makeMinimalDump(sessionId: string, overrides?: Partial<KickoffDump>): KickoffDump {
  return {
    ...makeFullDump(sessionId),
    mode: 'minimal',
    pending_agent_dump: undefined,
    ...overrides,
  };
}

function makeAgentDump(sessionId: string, slugs: string[], skillsBlock?: string): AgentDump {
  const block = skillsBlock ?? 'mock skills block content';
  return {
    schema_version: 1,
    session_id: sessionId,
    timestamp_iso: new Date().toISOString(),
    agent_self_id: 'test-model',
    model: 'test-v1',
    conversation_id: 'conv-123',
    available_skills_block: block,
    available_skills_block_sha256: createHash('sha256').update(block).digest('hex'),
    skill_slugs: slugs,
    honesty_notes: '',
  };
}

describe('Trace — All 8 Tags', () => {
  it('NOT_OBSERVED: session dump missing', () => {
    const tmpDir = join(__dirname, 'tmp-trace-not-observed');
    mkdirSync(join(tmpDir, '.forge0', 'sessions'), { recursive: true });
    try {
      const result = runTrace('nonexistent-uuid', tmpDir);
      expect(result.tag).toBe('NOT_OBSERVED');
      expect(result.exit_code).toBe(0);
      expect(result.detail).toContain('No kickoff dump found');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('TRACE_INTEGRITY_FAILURE: malformed JSON dump', () => {
    const tmpDir = join(__dirname, 'tmp-trace-integrity');
    const sessDir = join(tmpDir, '.forge0', 'sessions');
    mkdirSync(sessDir, { recursive: true });
    const sid = 'integrity-fail-uuid';
    writeFileSync(join(sessDir, `${sid}.json`), '{ broken json <<');
    try {
      const result = runTrace(sid, tmpDir);
      expect(result.tag).toBe('TRACE_INTEGRITY_FAILURE');
      expect(result.exit_code).toBe(1);
      expect(result.detail).toContain('malformed');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('TRACE_INTEGRITY_FAILURE: wrong schema_version', () => {
    const tmpDir = join(__dirname, 'tmp-trace-schema');
    const sessDir = join(tmpDir, '.forge0', 'sessions');
    mkdirSync(sessDir, { recursive: true });
    const sid = 'schema-bad-uuid';
    const dump = makeFullDump(sid);
    (dump as Record<string, unknown>).schema_version = 99;
    writeFileSync(join(sessDir, `${sid}.json`), JSON.stringify(dump));
    try {
      const result = runTrace(sid, tmpDir);
      expect(result.tag).toBe('TRACE_INTEGRITY_FAILURE');
      expect(result.exit_code).toBe(1);
      expect(result.detail).toContain('schema_version');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('TRACE_INTEGRITY_FAILURE: agent dump hash mismatch', () => {
    const tmpDir = join(__dirname, 'tmp-trace-hash');
    const sessDir = join(tmpDir, '.forge0', 'sessions');
    mkdirSync(sessDir, { recursive: true });
    const sid = 'hash-fail-uuid';
    const dump = makeFullDump(sid);
    writeFileSync(join(sessDir, `${sid}.json`), JSON.stringify(dump));
    const agent = makeAgentDump(sid, []);
    agent.available_skills_block_sha256 = 'aaaa_deliberately_wrong_hash';
    writeFileSync(join(sessDir, `${sid}.agent.json`), JSON.stringify(agent));
    try {
      const result = runTrace(sid, tmpDir);
      expect(result.tag).toBe('TRACE_INTEGRITY_FAILURE');
      expect(result.exit_code).toBe(1);
      expect(result.payload?.expected).toBe('aaaa_deliberately_wrong_hash');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('MODE_MISMATCH: policy_sha256 differs from current', () => {
    const tmpDir = join(__dirname, 'tmp-trace-mode-mismatch');
    const sessDir = join(tmpDir, '.forge0', 'sessions');
    mkdirSync(sessDir, { recursive: true });
    const sid = 'mode-mismatch-uuid';
    const dump = makeFullDump(sid, {
      mode_decision: makeModeDecision({ policy_sha256: 'stale_policy_hash_from_kickoff' }),
    });
    writeFileSync(join(sessDir, `${sid}.json`), JSON.stringify(dump));
    try {
      const result = runTrace(sid, tmpDir);
      expect(result.tag).toBe('MODE_MISMATCH');
      expect(result.exit_code).toBe(2);
      expect(result.payload?.kickoff_policy_sha256).toBe('stale_policy_hash_from_kickoff');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('MODE_MISMATCH: registry merkle set_hash differs', () => {
    const tmpDir = join(__dirname, 'tmp-trace-merkle-mismatch');
    const sessDir = join(tmpDir, '.forge0', 'sessions');
    mkdirSync(sessDir, { recursive: true });
    const sid = 'merkle-mismatch-uuid';
    const dump = makeFullDump(sid, {
      local: {
        skill_registry_merkle: makeMerkle({ set_hash: 'stale_merkle_hash' }),
        repo_root: '/fake',
        branch: 'main',
        head: 'abc',
        dirty: false,
        tags_at_head: [],
      },
    });
    writeFileSync(join(sessDir, `${sid}.json`), JSON.stringify(dump));
    try {
      const result = runTrace(sid, tmpDir);
      expect(result.tag).toBe('MODE_MISMATCH');
      expect(result.exit_code).toBe(2);
      expect(result.payload?.kickoff_set_hash).toBe('stale_merkle_hash');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('AGENT_DUMP_PARTIAL: full-mode, agent.json missing', () => {
    const tmpDir = join(__dirname, 'tmp-trace-partial');
    const sessDir = join(tmpDir, '.forge0', 'sessions');
    mkdirSync(sessDir, { recursive: true });
    const sid = 'partial-uuid';
    const dump = makeFullDump(sid);
    writeFileSync(join(sessDir, `${sid}.json`), JSON.stringify(dump));
    // No agent dump written
    try {
      const result = runTrace(sid, tmpDir);
      expect(result.tag).toBe('AGENT_DUMP_PARTIAL');
      expect(result.exit_code).toBe(0);
      expect(result.detail).toContain('missing');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('AGENT_DUMP_PARTIAL: honesty_notes mentions partial visibility', () => {
    const tmpDir = join(__dirname, 'tmp-trace-partial-notes');
    const sessDir = join(tmpDir, '.forge0', 'sessions');
    mkdirSync(sessDir, { recursive: true });
    const sid = 'partial-notes-uuid';
    const dump = makeFullDump(sid);
    const localSlugs = Object.keys(dump.local.skill_registry_merkle.slug_hashes);
    writeFileSync(join(sessDir, `${sid}.json`), JSON.stringify(dump));
    const agent = makeAgentDump(sid, localSlugs);
    agent.honesty_notes = 'I cannot see the full skills block — partial view only';
    writeFileSync(join(sessDir, `${sid}.agent.json`), JSON.stringify(agent));
    try {
      const result = runTrace(sid, tmpDir);
      expect(result.tag).toBe('AGENT_DUMP_PARTIAL');
      expect(result.exit_code).toBe(0);
      expect(result.payload?.honesty_notes).toContain('cannot see');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('DIVERGENT_FROM_DISK: agent slugs differ from local slugs', () => {
    const tmpDir = join(__dirname, 'tmp-trace-divergent');
    const sessDir = join(tmpDir, '.forge0', 'sessions');
    mkdirSync(sessDir, { recursive: true });
    const sid = 'divergent-uuid';
    // Build a dump with known slug_hashes
    const dump = makeFullDump(sid, {
      local: {
        skill_registry_merkle: {
          slug_hashes: { a: 'hash-a', b: 'hash-b' },
          set_hash: makeMerkle().set_hash, // use current merkle hash to avoid MODE_MISMATCH
          computed_at: new Date().toISOString(),
        },
        repo_root: '/fake',
        branch: 'main',
        head: 'abc',
        dirty: false,
        tags_at_head: [],
      },
    });
    writeFileSync(join(sessDir, `${sid}.json`), JSON.stringify(dump));
    // Agent reports slugs: [a, c] — a is common, b is local-only, c is agent-only
    const agent = makeAgentDump(sid, ['a', 'c']);
    writeFileSync(join(sessDir, `${sid}.agent.json`), JSON.stringify(agent));
    try {
      const result = runTrace(sid, tmpDir);
      expect(result.tag).toBe('DIVERGENT_FROM_DISK');
      expect(result.exit_code).toBe(2);
      expect(result.payload?.agent_only).toEqual(['c']);
      expect(result.payload?.local_only).toEqual(['b']);
      expect(result.payload?.common).toEqual(['a']);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('CORROBORATED_VIA_DISK: full-mode, all checks pass', () => {
    const tmpDir = join(__dirname, 'tmp-trace-corroborated');
    const sessDir = join(tmpDir, '.forge0', 'sessions');
    mkdirSync(sessDir, { recursive: true });
    const sid = 'corroborated-uuid';
    const dump = makeFullDump(sid);
    const localSlugs = Object.keys(dump.local.skill_registry_merkle.slug_hashes);
    writeFileSync(join(sessDir, `${sid}.json`), JSON.stringify(dump));
    const agent = makeAgentDump(sid, localSlugs);
    writeFileSync(join(sessDir, `${sid}.agent.json`), JSON.stringify(agent));
    try {
      const result = runTrace(sid, tmpDir);
      expect(result.tag).toBe('CORROBORATED_VIA_DISK');
      expect(result.exit_code).toBe(0);
      expect(result.honesty.verified).toContain('agent dump hash verified');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('DETECTED_VIA_AGENT_REPORT: minimal-mode dump, no scope drift', () => {
    const tmpDir = join(__dirname, 'tmp-trace-detected');
    const sessDir = join(tmpDir, '.forge0', 'sessions');
    mkdirSync(sessDir, { recursive: true });
    const sid = 'detected-uuid';
    const dump = makeMinimalDump(sid);
    writeFileSync(join(sessDir, `${sid}.json`), JSON.stringify(dump));

    // Initialize as its own git repo so evaluatePathsTouched doesn't
    // inherit the parent forgezero repo's uncommitted changes.
    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init'], { cwd: tmpDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpDir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir });
    execFileSync('git', ['add', '.'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: tmpDir });

    try {
      const result = runTrace(sid, tmpDir);
      expect(result.tag).toBe('DETECTED_VIA_AGENT_REPORT');
      expect(result.exit_code).toBe(0);
      expect(result.honesty.verified).toContain('no scope drift detected');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Trace — Precedence Ordering', () => {
  it('TRACE_INTEGRITY_FAILURE wins over MODE_MISMATCH', () => {
    const tmpDir = join(__dirname, 'tmp-trace-precedence');
    const sessDir = join(tmpDir, '.forge0', 'sessions');
    mkdirSync(sessDir, { recursive: true });
    const sid = 'precedence-uuid';
    // Build a dump that has BOTH: wrong schema_version AND stale policy hash
    const dump = makeFullDump(sid, {
      mode_decision: makeModeDecision({ policy_sha256: 'stale_hash' }),
    });
    (dump as Record<string, unknown>).schema_version = 42;
    writeFileSync(join(sessDir, `${sid}.json`), JSON.stringify(dump));
    try {
      const result = runTrace(sid, tmpDir);
      // TRACE_INTEGRITY_FAILURE should fire first because it precedes MODE_MISMATCH
      expect(result.tag).toBe('TRACE_INTEGRITY_FAILURE');
      expect(result.exit_code).toBe(1);
      expect(result.detail).toContain('schema_version');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
