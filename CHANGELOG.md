# Changelog

All notable changes to this project will be documented in this file.

## [0.1.12] - 2026-04-29

### Fixed
- Updated `README.md` test badge to avoid unnecessary churn.
- Removed network-dependent remote integration tests to ensure test suite remains isolated and deterministic.

## [0.1.11] - 2026-04-29

### Added
- CI-aware release verification via `verify --ci`.
- Added `--ci` flag to `forge0 ledger record --event verify`.

### Security
- Explicit CI verification fails closed when CI status cannot be observed (e.g. `gh` CLI missing or unauthenticated).

## [0.1.10] - 2026-04-29

### Fixed
- `forge0 verify --remote` now correctly blocks release authorization on upstream/remote synchronization failures.
- Updated `remote.branch_at_head` and `remote.tag_at_head` checks to `critical` severity.
- Updated `remote.branch_not_ahead`, `remote.branch_not_behind`, and `remote.sync_state` checks to `high` severity.
- Added `--remote` support to `forge0 ledger record --event verify` to properly record remote-verified trust events.

## [0.1.9] - 2026-04-29

### Added
- `forge0 verify --remote` for remote branch/tag synchronization checks.
- Remote release checks for `origin/<branch>`, expected version tag, and ahead/behind state.

### Security
- Release verification can now detect missing or divergent remote tags before a release is claimed.

## [0.1.8] - 2026-04-29

### Fixed
- Ledger tests no longer mutate the real repo `.forge0/ledger.jsonl`; all record tests use isolated temp git repos.
- `ledger last --json` now always emits `{"found": bool, "entry": ...}` instead of raw `null`.
- `ledger verify` gracefully handles corrupted JSONL instead of crashing with a stack trace.
- `recordVerifyEvent()` now receives and passes `cliVersion` for exact parity with CLI verify.
- Ledger entries now include full version metadata: `package`, `cli`, `lock`, and `expectedTag`.

### Added
- `ledger record --json` flag for CI-friendly event recording.
- Corruption detection tests for malformed JSONL.
- JSON shape tests enforcing `{found, entry}` convention.

## [0.1.7] - 2026-04-29

### Added
- `forge0 ledger` command group for durable local trust memory.
- Hash-chained JSONL ledger at `.forge0/ledger.jsonl`.
- `forge0 ledger record --event verify --mode release`.
- `forge0 ledger record --event receipt`.
- `forge0 ledger list`, `ledger last`, and `ledger verify`.
- Ledger JSON output for machine-readable history and integrity checks.

### Security
- Ledger entries include SHA-256 hash chaining for tamper-evident local history.
- Ledger honesty bounds explicitly state local-only verification limits.

### Changed
- ForgeZero lifecycle now extends to `status → doctor → verify → receipt → ledger`.

## [0.1.6] - 2026-04-29

### Added
- `forge0 verify` — the enforcement layer. Supports `release`, `precommit`, and `bundle` modes. Exits with non-zero on failure to block unsafe operations.
- `VerifyResult` and `VerifyMode` types for structured enforcement reports.

## [0.1.5] - 2026-04-29

### Fixed
- Version drift in `getBanner()` and `getCompactHeader()` — now dynamically reads from `package.json`.
- `pkgVersion` resolution in `bin/forge0.ts` now searches parent/grandparent paths to support both source and `dist` execution.
- Global installation repair — global binary now correctly resolves to `dist/bin/forge0.js`.

## [0.1.4] - 2026-04-29

### Added
- `forge0 status` — trust posture at a glance backed by shared `TrustReport` model.
- `forge0 doctor` — recovery intelligence engine with named diagnoses, evidence chains, and exact recovery commands (workspace, release, hook modes).
- `forge0 receipt` — local release attestation from `TrustReport` + `DoctorReport` with paste-ready suggested release note.
- `HOOK_GLOBAL_FIRST` diagnosis in `forge0 doctor --mode hook` to detect hooks that prefer global binary before local `node_modules/.bin/forge0`.
- `src/trust/types.ts`, `src/doctor/types.ts`, `src/receipt/types.ts` — shared type primitives for the trust spine.

### Fixed
- CLI `--version` flag now reads version from `package.json` at runtime instead of being hardcoded to `0.1.0`.
- `forge0 status` audit now correctly scopes to `.agents/` path, not the entire repo root.
- Generated `forge0 install-hook` shell script now prefers local `./node_modules/.bin/forge0` before falling back to global `forge0`.

### Architecture
The observe → recover → attest triangle is complete:
- `status` (observe) → `doctor` (recover) → `receipt` (attest)

## [0.1.2] - 2026-04-29

### Added
- `forge0 install-hook` now installs a production-safe three-gate pre-commit hook:
  - TypeScript typecheck via `npx tsc --noEmit`
  - Test suite via `npm test --silent`
  - Scoped `.agents/` governance audit via `forge0 audit --json --path .agents`
- `forge0 trace <conversation-id>` stub to define the v0.2.0 namespace.
- `forge0 audit --json` flag for CI and hook integration.
- `docs/patterns/heuristic-shadowing.md` documentation on defense-in-depth failure modes.

### Changed
- `forge0 audit` now filters unknown-surface entries from reports, enforcing the documented `.agents/` governance boundary.
- `README.md` rewritten with comprehensive exit codes and "honesty bound" preamble.

### Fixed
- Pre-commit hook temp logs now use a unique `mktemp -d` directory with `trap` cleanup.
- Repos without `.agents/` now skip the governance audit cleanly.
- `forge0 audit` duplicate call bug in CLI action.
- Banner/header pollution in `--json` mode.
