# ForgeZero

Governance and provenance CLI for Antigravity `.agents/` surface.

[![tests](https://img.shields.io/badge/tests-passing-green)](./tests)
<!-- TODO: bump to 0.2.0 after operator tags v0.2.0 -->
[![version](https://img.shields.io/badge/version-0.1.16-blue)](./package.json)
[![license](https://img.shields.io/badge/license-MIT-yellow)](./LICENSE)

> **The honesty bound is load-bearing.** ForgeZero never claims to detect
> everything. It explicitly defines what it can prove, what it cannot,
> and where the boundary between "verified" and "not observable" lies.

> **Velocity without amnesia.** ForgeZero ledger gives high-velocity development a memory: local, append-only, hash-chained, and honesty-bound.

## Release planner

ForgeZero can preview the release checklist without executing commands:

```bash
forge0 release --bump patch --verify-remote --verify-ci --dry-run
```

The release planner follows the principle:

> Automate the checklist, not the honesty.

In v0.1.x, release execution is intentionally disabled. Use `--dry-run` to preview the manual release sequence.

## Quickstart

```bash
npm install -g .        # install locally for dev
forge0 selftest         # verify paths and git
forge0 audit            # diff .agents/ vs HEAD~1
forge0 provenance <id>  # decision lineage for conversation <id>
forge0 share --tag v1   # secret-scrub-bundle for distribution
forge0 install-hook     # install 3-gate pre-commit audit hook
forge0 status           # trust posture at a glance
forge0 doctor           # diagnose drift and release hazards
forge0 verify --mode release --remote --ci  # enforce trust criteria for release
forge0 receipt                              # generate a release attestation
forge0 ledger record --event verify --mode release --remote --ci # record trust event
```

## Commands

| Command | Description | Exit Codes |
|---|---|---|
| `audit` | Diff `.agents/` vs `HEAD~1` | 0 = no change / 2 = changes |
| `provenance <id>` | Build decision graph for conversation | 0 = success / 1 = error |
| `share --tag <t>` | Create `.forge0` bundle for sharing | 0 = success / 1 = error |
| `sync-skill [--check]` | Push canonical SKILL.md to live agent dir | 0 = synced / 1 = error / 2 = drift check mode |
| `selftest` | Validate paths, git, dependencies | 0 = pass / 1 = some checks failed |
| `install-hook` | Install production-safe 3-gate pre-commit hook | 0 = success / 1 = error / 2 = already exists |
| `status` | Trust posture at a glance | 0 = success |
| `doctor` | Diagnose workspace, release, and hook state | 0 = success |
| `verify [--mode m] [--remote] [--ci]` | Enforce criteria for precommit/release/bundle | 0 = pass / 1 = blocking failure |
| `receipt` | Generate a release attestation with honesty bound | 0 = success |
| `ledger record` | Record a hash-chained trust event | 0 = success |
| `ledger list` | Show recorded trust events | 0 = success |
| `ledger last` | Show the latest trust event | 0 = success |
| `ledger verify` | Verify ledger hash-chain integrity | 0 = pass / 1 = fail |
| `kickoff [--mode m] [--explain]` | Start a verifiable session observability lifecycle | 0 = success |
| `trace <id>` | Audit a kickoff session against current disk state | 0 = pass / 1 = integrity fail / 2 = mismatch |

## Lifecycle

```text
status → doctor → kickoff → verify → receipt → ledger → trace
```

`forge0 verify --mode release --remote` checks that local release truth matches `origin`. Use this after pushing the release tag to confirm `origin/master` and `origin/vX.Y.Z` point to the local release commit.

`forge0 verify --mode release --remote --ci` checks GitHub Actions status via `gh`. If `--ci` is requested and CI cannot be observed, verification fails.

## Honesty Note

The ledger records local ForgeZero observations. It is tamper-evident, not tamper-proof.
It does not prove remote CI completion, downstream tag consumption, hidden model context,
or runtime agent behavior.

### Kickoff downgrade-attack resistance

ForgeZero uses an auto-mode router to select between `full` and `minimal` session modes. Mode selection relies exclusively on independent, disk-based observables like branch names, paths touched, and CI status. The agent's stated intent is never the deciding signal. This fail-closed design ensures an adversarial witness cannot downgrade its observability tier by falsely claiming low-risk intent. Overrides via the CLI are rejected if the observables cannot verify safety.

## What ForgeZero will NOT do

- Log into Antigravity
- Read cookies, tokens, or auth material
- Proxy API calls to any Antigravity service
- Read `~/.antigravity/` IDE extension binaries — not agent data
- Read `~/.gemini/antigravity/prompting/` internal browser-agent prompts
- Claim detection completeness when the data on disk doesn't support it

ForgeZero only reads agent-data paths the user already owns under
`~/.gemini/antigravity/`, and only writes to `.forge0/` and bundles.

## License

[MIT](./LICENSE)
