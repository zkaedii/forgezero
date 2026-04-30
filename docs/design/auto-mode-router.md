# Auto-Mode Router — Design Document

**Version:** 0.2.0  
**Status:** Draft r2 — revised per operator audit, pending re-approval  
**Criticality:** This is the load-bearing architectural piece that determines whether ForgeZero v0.2.0 is honest or theatrical.

---

## 1. Design Principle

The auto-mode router determines whether a session gets `full` or `minimal` observability capture. The router must be:

1. **Fail-closed**: Default is `full`. Downgrade to `minimal` requires affirmative evidence from every observable signal.
2. **Observable-derived**: Every signal the router consults must be independently verifiable from disk state.
3. **Agent-intent-resistant**: The agent's self-reported intent is recorded but never used as the deciding signal.
4. **Auditable**: The complete decision is recorded in `mode_decision` and can be replayed.
5. **Policy-driven**: Rules are externalized to `.forge0/policy.json`, version-controlled, and hash-pinned.

---

## 2. Signal Table

| # | Signal Name | Source Command | Observable Type | Low-risk Verdict Criteria |
|---|-------------|---------------|-----------------|---------------------------|
| 1 | `branch` | `git branch --show-current` | `string` | Branch name does NOT match any pattern in `policy.auto_full_branches` |
| 2 | `paths_touched` | `git diff --name-only $(git merge-base HEAD <default_branch_ref>)` ∪ `git status --porcelain` | `string[]` | Every path matches at least one `policy.minimal_allowed_paths` glob AND no path matches any `policy.auto_full_paths` glob. **Footnote:** Empty paths array → `low_risk` (vacuously satisfies both conjuncts). This is the intended behavior for clean trees at session start; the branch and near_tag signals still independently gate mode selection. |
| 3 | `uncommitted_paths` | `git status --porcelain` (unstaged + staged) | `string[]` | No path matches any `policy.auto_full_when_uncommitted_in_paths` glob. If array is empty → `low_risk`. |
| 4 | `near_tag` | `git describe --tags --abbrev=0` → distance via `git rev-list --count <tag>..HEAD` | `number` (commit distance) | Distance > `policy.auto_full_when_tag_within_commits`. If no tags exist → `low_risk` (pre-release repo). |
| 5 | `lines_changed` | `git diff --numstat $(git merge-base HEAD <default_branch_ref>)` sum + uncommitted numstat | `number` | Total ≤ `policy.minimal_max_lines_changed` |
| 6 | `working_tree_clean` | `git status --porcelain` is empty | `boolean` | `true`. Note: a clean tree is not sufficient for minimal — it just means signal 2/3 are vacuously satisfied. When the tree is clean, signals 2/3 become `low_risk` because there are no paths to evaluate. But the branch and near_tag signals still apply. |
| 7 | `recent_ci_failure` | `gh run list --limit 5 --json conclusion` | `boolean` | No recent conclusion=`failure`. If `gh` CLI is unavailable → `not_observable`. A `not_observable` result is treated as `neutral`: it alone does not force `full`, but it cannot contribute to a `minimal` downgrade either. |
| 8 | `agent_claimed_intent` | `--intent "..."` CLI flag or `FORGE0_INTENT` env var | `string \| null` | **Not evaluated for mode decision.** Recorded in `evidence[]` with verdict `consistent_with_observables` or `inconsistent_with_observables` based on textual comparison to other signals. This is a witness statement for the audit trail, not evidence for the router. |

The diff base for committed changes (signals 2 and 5) is `git merge-base HEAD <default_branch_ref>`, where `default_branch_ref` is configurable via `policy.default_branch_ref` (default: `origin/main`, falling back to `origin/master`). This captures all changes on the current branch since divergence.

---

## 3. Decision Algorithm (Pseudocode)

```
function decideMode(opts):
  // ── Phase 1: ALWAYS enumerate all observable signals ──
  signals = []
  signals.push(evaluateBranch(opts.repoRoot, policy))
  signals.push(evaluatePathsTouched(opts.repoRoot, policy))
  signals.push(evaluateUncommittedPaths(opts.repoRoot, policy))
  signals.push(evaluateNearTag(opts.repoRoot, policy))
  signals.push(evaluateLinesChanged(opts.repoRoot, policy))
  signals.push(evaluateWorkingTreeClean(opts.repoRoot))
  signals.push(evaluateRecentCi(opts.repoRoot))

  // ── Phase 2: Record agent intent (signal 8) — NOT used in decision ──
  if opts.agentClaimedIntent:
    signals.push({
      signal: 'agent_claimed_intent',
      value: opts.agentClaimedIntent,
      verdict: classifyIntentConsistency(opts.agentClaimedIntent, signals)
    })

  // ── Phase 3: Determine mode from observables ──
  has_high_risk = signals.any(s => s.verdict == 'high_risk')

  if has_high_risk:
    // At least one observable forced full.
    // This covers ALL high_risk signals including CI (no separate CI check needed —
    // the high_risk verdict from evaluateRecentCi is caught here uniformly).
    auto_selected = 'full'
  else:
    // Check that ALL gating signals (1-6, excluding intent and CI) are low_risk
    gating = signals.filter(s => s.signal != 'agent_claimed_intent'
                               && s.signal != 'recent_ci_failure')
    if gating.all(s => s.verdict == 'low_risk'):
      auto_selected = 'minimal'  // All clear — minimal is earned
    else:
      auto_selected = 'full'     // Some gating signals not low_risk → stay full

  // ── Phase 4: Apply CLI override (cannot weaken auto result) ──
  if opts.cliOverride == 'full':
    return { selected: 'full', selected_by: 'cli_override', evidence: signals }

  if opts.cliOverride == 'minimal':
    if auto_selected == 'full':
      // CLI override REJECTED — observables require full
      return { selected: 'full', selected_by: 'auto',
               cli_override_rejected: true, evidence: signals }
    else:
      return { selected: 'minimal', selected_by: 'cli_override', evidence: signals }

  // No CLI override — use auto result
  return { selected: auto_selected, selected_by: 'auto', evidence: signals }
```

Key properties:
- Signals 1–7 are ALWAYS enumerated first, before any override logic runs. The `evidence[]` array is fully populated regardless of CLI override.
- The loop starts at `full` and can only move to `minimal`
- Any single `high_risk` signal prevents downgrade (this uniformly covers CI failures — no separate CI check is needed after the `has_high_risk` gate)
- `not_observable` signals (from CI) are `neutral` — they don't force full by themselves but don't contribute to minimal either
- `agent_claimed_intent` is excluded from the gating signal set entirely
- CLI override `--mode minimal` is rejected if observables don't support it (`cli_override_rejected: true`)
- CLI override `--mode full` always succeeds (you can always request *more* capture)

---

## 4. Adversarial Test Matrix

These are the mandatory test cases. Each represents a real-world adversarial or edge scenario.

All cases assume the merge-base diff base from §2: `working_tree_clean: true` does not imply `paths_touched: []`, because committed changes since merge-base populate `paths_touched` independently of the working tree state.

### Case 1: Clean docs-only session → `minimal`
```
branch: feature/typo-fix
paths_touched: [docs/README.md]  (committed since merge-base)
uncommitted_paths: []
near_tag: 100 (far)
lines_changed: 3
working_tree_clean: true
recent_ci_failure: false
agent_claimed_intent: "fix typo"
→ EXPECTED: minimal, selected_by: auto
```

### Case 2: DOWNGRADE ATTACK — agent claims "fix typo" but touches src/auth/
```
branch: feature/typo-fix
paths_touched: [src/auth/login.ts]
uncommitted_paths: [src/auth/login.ts]
near_tag: 100
lines_changed: 3
working_tree_clean: false
recent_ci_failure: false
agent_claimed_intent: "fix typo"
→ EXPECTED: full, selected_by: auto
   evidence includes: paths_touched verdict=high_risk
   evidence includes: agent_claimed_intent verdict=inconsistent_with_observables
```
**Why:** `src/auth/**` matches `auto_full_paths`. The agent's claim is irrelevant. The path observable overrides.

### Case 3: Dirty tree in src/scanner/, agent claims "doc fix"
```
branch: feature/doc-fix
paths_touched: []
uncommitted_paths: [src/scanner/brain-parser.ts]
near_tag: 100
lines_changed: 15
working_tree_clean: false
recent_ci_failure: false
agent_claimed_intent: "doc fix"
→ EXPECTED: full, selected_by: auto
   evidence includes: uncommitted_paths verdict=high_risk
   evidence includes: agent_claimed_intent verdict=inconsistent_with_observables
```

### Case 4: Release branch, docs-only changes
```
branch: release/0.2.0
paths_touched: [docs/CHANGELOG.md]  (committed since merge-base with origin/main)
uncommitted_paths: []
near_tag: 100
lines_changed: 5
working_tree_clean: true
recent_ci_failure: false
agent_claimed_intent: null
→ EXPECTED: full, selected_by: auto
   evidence includes: branch verdict=high_risk (matches release/*)
```
**Why:** The branch name matches `auto_full_branches` regardless of the benign file paths. Note: `paths_touched` contains `docs/CHANGELOG.md` because it was committed on the `release/0.2.0` branch since `merge-base HEAD origin/main`. The tree is clean because there are no uncommitted changes.

### Case 5: Within 3 commits of a tag
```
branch: feature/minor-fix
paths_touched: [docs/README.md]
uncommitted_paths: []
near_tag: 2 (within threshold of 5)
lines_changed: 3
working_tree_clean: true
recent_ci_failure: false
agent_claimed_intent: null
→ EXPECTED: full, selected_by: auto
   evidence includes: near_tag verdict=high_risk
```

### Case 6: CLI override --mode minimal on clean docs session
```
cliOverride: 'minimal'
branch: feature/typo
paths_touched: [docs/README.md]
uncommitted_paths: []
near_tag: 100
lines_changed: 2
working_tree_clean: true
recent_ci_failure: false
→ EXPECTED: minimal, selected_by: cli_override
```

### Case 7: CLI override --mode minimal REJECTED — touches src/auth/
```
cliOverride: 'minimal'
branch: feature/auth-fix
paths_touched: [src/auth/login.ts]
uncommitted_paths: [src/auth/login.ts]
near_tag: 100
lines_changed: 10
working_tree_clean: false
recent_ci_failure: false
→ EXPECTED: full, selected_by: auto, cli_override_rejected: true
   evidence includes: paths_touched verdict=high_risk
```
**Why:** CLI override CANNOT downgrade past invariant 2. Observables always win.

### Case 8: Missing policy file → defaults, hash is null
```
policy file: ABSENT
branch: feature/docs
paths_touched: [docs/README.md]
uncommitted_paths: []
near_tag: 100
lines_changed: 2
working_tree_clean: true
→ EXPECTED: minimal (default policy allows docs/**), selected_by: auto
   policy_sha256: null
   honesty.notObservable includes "policy file not found; using built-in defaults"
```

### Case 9: Large diff exceeds minimal_max_lines_changed
```
branch: feature/docs-rewrite
paths_touched: [docs/architecture.md, docs/design.md]
uncommitted_paths: []
near_tag: 100
lines_changed: 200 (exceeds default 50)
working_tree_clean: true
recent_ci_failure: false
agent_claimed_intent: "rewrite docs"
→ EXPECTED: full, selected_by: auto
   evidence includes: lines_changed verdict=high_risk
```
**Why:** Even though the paths are all docs, the volume of change exceeds the threshold. Large rewrites deserve full traceability.

### Case 10: CI recently failed
```
branch: feature/docs
paths_touched: [docs/README.md]
uncommitted_paths: []
near_tag: 100
lines_changed: 3
working_tree_clean: true
recent_ci_failure: true
agent_claimed_intent: null
→ EXPECTED: full, selected_by: auto
   evidence includes: recent_ci_failure verdict=high_risk
```
**Why:** A recent CI failure indicates the repo is in a potentially unstable state. Full traceability is warranted regardless of file paths.

### Case 11: Novel project category — wallet key handler (denylist blindspot)
```
branch: feature/wallet-keys
paths_touched: [src/wallet/key-derivation.ts]
uncommitted_paths: [src/wallet/key-derivation.ts]
near_tag: 100
lines_changed: 30
working_tree_clean: false
recent_ci_failure: false
agent_claimed_intent: "add wallet support"
→ EXPECTED: full, selected_by: auto
   evidence includes: paths_touched verdict=high_risk (matches auto_full_paths src/**)
```
**Why:** The default policy's `auto_full_paths: ["src/**"]` catches this even though "wallet" is not in any keyword list. This is the inverted-polarity advantage: new categories don't need to be anticipated.

### Case 12: Smart contract audit — agent underreports scope
```
branch: main
paths_touched: [contracts/Token.sol, src/auditor/analyzer.ts]
uncommitted_paths: [contracts/Token.sol]
near_tag: 1
lines_changed: 150
working_tree_clean: false
recent_ci_failure: false
agent_claimed_intent: "review code"
→ EXPECTED: full, selected_by: auto
   evidence includes: branch verdict=high_risk (main), near_tag verdict=high_risk, lines_changed verdict=high_risk
```
**Why:** Three independent signals fire. Even if the agent's "review code" claim sounds benign, the branch, proximity, and diff size all override.

---

## 5. Policy File Format — Field-by-Field Semantics

```json
{
  "default_mode": "auto",
```
- **`default_mode`**: `"auto"` | `"full"` | `"minimal"`. If `"full"` or `"minimal"`, the router is bypassed entirely and the specified mode is used (recorded as `selected_by: "policy_default"`). If `"auto"`, the router runs.

```json
  "default_branch_ref": "origin/main",
```
- **`default_branch_ref`**: `string`. The git ref used as the diff base for committed changes. `git merge-base HEAD <default_branch_ref>` determines which commits are "on this branch." Default: `"origin/main"`, falling back to `"origin/master"` if the configured ref does not resolve. Must be a non-empty string.

```json
  "auto_full_paths": ["src/**", ".github/**", "bin/**"],
```
- **`auto_full_paths`**: Array of glob patterns. If ANY touched path (committed or uncommitted) matches ANY pattern, the router forces `full` regardless of all other signals. This is the primary defense against downgrade attacks.

```json
  "auto_full_branches": ["main", "master", "release/*", "hotfix/*"],
```
- **`auto_full_branches`**: Array of glob patterns. If the current branch matches ANY pattern, the router forces `full`. Rationale: work on protected branches is inherently consequential.

```json
  "auto_full_when_tag_within_commits": 5,
```
- **`auto_full_when_tag_within_commits`**: Integer ≥ 0. If HEAD is within this many commits of the nearest tag, the router forces `full`. Rationale: sessions near a release boundary deserve full traceability.

```json
  "auto_full_when_uncommitted_in_paths": ["src/**", "bin/**"],
```
- **`auto_full_when_uncommitted_in_paths`**: Array of glob patterns. If any uncommitted change (from `git status --porcelain`) matches any pattern, the router forces `full`. This is separate from `auto_full_paths` to allow different rules for committed vs uncommitted changes.

```json
  "minimal_allowed_paths": ["docs/**", "*.md", "tests/fixtures/**"],
```
- **`minimal_allowed_paths`**: Array of glob patterns. For `minimal` to be possible, ALL touched paths must match at least one of these patterns. If any path fails to match → `full`. This is the whitelist complement to the `auto_full_paths` blacklist.

```json
  "minimal_max_lines_changed": 50
```
- **`minimal_max_lines_changed`**: Integer ≥ 0. Maximum total lines changed (additions + deletions) for `minimal` mode. Exceeding this forces `full` on the theory that large changes warrant full traceability even in safe paths. Value of 0 means any change at all forces full.

---

## 6. Glob Matching

Implementation uses the `minimatch` npm package (~7KB, well-tested, zero transitive dependencies). This is the single new dependency added for v0.2.0; it is approved by the operator per audit finding 7.

Supported features (via minimatch defaults):
- `*` matches any characters except `/`
- `**` matches any characters including `/` (when used as a path segment)
- `?` matches any single character
- Brace expansion (`{a,b}`)
- Character classes (`[abc]`)

All glob matches use `{ dot: true }` to match dotfiles (e.g., `.github/**`).

---

## 7. Agent Intent Classification

When `agent_claimed_intent` is provided, the router classifies it as:
- `consistent_with_observables` — the claim is plausible given what the disk shows (e.g., "fix typo" when only docs are touched)
- `inconsistent_with_observables` — the claim conflicts with observables (e.g., "fix typo" when `src/auth/` is touched)

Classification is heuristic and intentionally simple: if any signal returned `high_risk`, the agent's claim is automatically `inconsistent_with_observables` regardless of content. This prevents sophisticated framing from influencing the audit trail.

The classification result is recorded in `mode_decision.evidence` for future forensic review. It is never used in the mode selection algorithm itself.

---

## 8. Error Handling

| Error | Behavior |
|-------|----------|
| Policy file is malformed JSON | `loadPolicy()` throws with a friendly error message citing the file path and parse error. Kickoff fails with exit 1. |
| Policy file has unknown fields | Unknown fields are silently ignored (forward-compatible). |
| Policy file has missing required fields | `loadPolicy()` fills in defaults for missing fields and emits a honesty bound noting which fields used defaults. |
| Policy field has wrong type | `loadPolicy()` throws citing the field name, expected type, and actual value. |
| `default_branch_ref` does not resolve | Falls back to `origin/master`. If neither resolves, `paths_touched` uses HEAD~1 as diff base and emits a honesty bound. |
| `git` not available | All git-derived signals return `not_observable`. Router defaults to `full` because no observable evidence supports minimal. |
| `gh` not available | Signal 7 returns `not_observable` with verdict `neutral`. Does not force full by itself. |
| Skill registry directory unreadable | Merkle is computed with empty `slug_hashes`. Honesty bound notes the failure. |
