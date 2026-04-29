# ForgeZero

Governance and provenance CLI for Antigravity `.agents/` surface.

[![tests](https://img.shields.io/badge/tests-116%2F116-green)](./tests)
[![version](https://img.shields.io/badge/version-0.1.11-blue)](./package.json)
[![license](https://img.shields.io/badge/license-MIT-yellow)](./LICENSE)

> **The honesty bound is load-bearing.** ForgeZero never claims to detect
> everything. It explicitly defines what it can prove, what it cannot,
> and where the boundary between "verified" and "not observable" lies.

> **Velocity without amnesia.** ForgeZero ledger gives high-velocity development a memory: local, append-only, hash-chained, and honesty-bound.

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
forge0 verify --remote  # enforce trust criteria for release
forge0 receipt          # generate a release attestation
forge0 ledger record --event verify --mode release --remote # record trust event
```

## Commands

| Command | Description | Exit Codes |
|---|---|---|
| `audit` | Diff `.agents/` vs `HEAD~1` | 0 = no change / 2 = changes |
| `provenance <id>` | Build decision graph for conversation | 0 = success / 1 = error |
| `share --tag <t>` | Create `.forge0` bundle for sharing | 0 = success / 1 = error |
| `sync-skill [--check]` | Push canonical SKILL.md to live agent dir | 0 = synced / 1 = error / 2 = drift (check mode) |
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
| `trace <id>` | [v0.2.0 — not implemented] | 0 (stub) |

## Lifecycle

```text
status → doctor → verify → receipt → ledger
observe → recover → enforce → attest → remember
```

`forge0 verify --mode release --remote` checks that local release truth matches `origin`. Use this after pushing the release tag to confirm `origin/master` and `origin/vX.Y.Z` point to the local release commit.

`forge0 verify --mode release --remote --ci` checks GitHub Actions status via `gh`. If `--ci` is requested and CI cannot be observed, verification fails.

## Honesty Note

The ledger records local ForgeZero observations. It is tamper-evident, not tamper-proof.
It does not prove remote CI completion, downstream tag consumption, hidden model context,
or runtime agent behavior.

## What ForgeZero will NOT do

- Log into Antigravity
- Read cookies, tokens, or auth material
- Proxy API calls to any Antigravity service
- Read `~/.antigravity/` (IDE extension binaries — not agent data)
- Read `~/.gemini/antigravity/prompting/` (internal browser-agent prompts)
- Claim detection completeness when the data on disk doesn't support it

ForgeZero only reads agent-data paths the user already owns under
`~/.gemini/antigravity/`, and only writes to `.forge0/` and bundles.

## License

[MIT](./LICENSE)

