import { Policy, KickoffDump, AgentDump, ModeDecision } from '../src/kickoff/types.js';

describe('Kickoff Types', () => {
  it('should compile and allow correct assignments', () => {
    const p: Policy = {
      default_mode: 'auto',
      default_branch_ref: 'origin/main',
      auto_full_paths: [],
      auto_full_branches: [],
      auto_full_when_tag_within_commits: 0,
      auto_full_when_uncommitted_in_paths: [],
      minimal_allowed_paths: [],
      minimal_max_lines_changed: 0
    };
    expect(p).toBeDefined();

    const d: ModeDecision = {
      selected: 'minimal',
      selected_by: 'policy_default',
      evidence: [],
      policy_path: null,
      policy_sha256: null
    };
    expect(d).toBeDefined();
  });
});
