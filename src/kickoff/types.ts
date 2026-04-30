export type KickoffMode = 'auto' | 'full' | 'minimal';

export interface KickoffDump {
  schema_version: 1;
  session_id: string;
  timestamp: string;
  mode: 'full' | 'minimal';

  mode_decision: ModeDecision;

  local: {
    skill_registry_merkle: RegistryMerkle;
    repo_root: string;
    branch?: string;
    head?: string;
    dirty: boolean;
    tags_at_head: string[];
  };

  /** true if this dump expected an agent supplement at kickoff time; informational, never mutated */
  pending_agent_dump?: boolean;

  honesty: {
    claim: string;
    verified: string[];
    notObservable: string[];
  };
}

export interface AgentDump {
  schema_version: 1;
  session_id: string;
  timestamp_iso: string;
  agent_self_id: string;
  model: string;
  conversation_id: string;
  available_skills_block: string;
  available_skills_block_sha256: string;
  skill_slugs: string[];
  honesty_notes: string;
}

export interface ModeDecision {
  selected: 'full' | 'minimal';
  selected_by: 'auto' | 'cli_override' | 'policy_default';
  cli_override_rejected?: boolean;
  evidence: ModeSignal[];
  policy_path: string | null;
  policy_sha256: string | null;
}

export interface ModeSignal {
  signal: string;
  value: unknown;
  verdict: 'low_risk' | 'high_risk' | 'neutral' | 'not_observable';
  rule?: string;
}

export interface Policy {
  default_mode: KickoffMode;
  default_branch_ref: string;
  auto_full_paths: string[];
  auto_full_branches: string[];
  auto_full_when_tag_within_commits: number;
  auto_full_when_uncommitted_in_paths: string[];
  minimal_allowed_paths: string[];
  minimal_max_lines_changed: number;
}

export interface RegistryMerkle {
  slug_hashes: Record<string, string>;
  set_hash: string | null;
  computed_at: string;
}

export interface KickoffOptions {
  mode?: KickoffMode;
  intent?: string;
  explain?: boolean;
  out?: string;
  json?: boolean;
}

export interface KickoffResult {
  success: boolean;
  session_id: string;
  mode: 'full' | 'minimal';
  dump_path: string;
  mode_decision: ModeDecision;
  registry_merkle: RegistryMerkle;
  honesty: {
    claim: string;
    verified: string[];
    notObservable: string[];
  };
}
