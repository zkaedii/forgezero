# Changelog

All notable changes to this project will be documented in this file.

## [0.2.2] - 2026-04-30

### Fixed

- **HYGIENE-FORGE-006** — Kickoff and trace ledger entries now include the full session UUID in `summary.title` rather than truncating to the first 8 characters. Cross-event correlation in `forge0 ledger list` no longer requires manual UUID expansion.
- **HYGIENE-FORGE-007** — Three `opts.* as any` casts in `bin/forge0.ts` replaced with commander's `.choices()` validation pattern at parse time. Typed helpers `asVerifyMode()` and `asBumpType()` narrow commander's string output to the relevant union types. Invalid `--mode` and `--bump` values now error at parse time with a clear error message.
- **HYGIENE-FORGE-011** — Integration test for `runVerify --remote` against an annotated tag, locking in both halves of v0.2.1's HYGIENE-008 fix (the `parseLsRemoteHash` peeled-ref preference AND the dual-pattern `git ls-remote` command). Future regressions to either fix will fail the integration test.

### Changed

- **HYGIENE-FORGE-012** — `LedgerEventKind` partitioned into `IMPLEMENTED_LEDGER_EVENT_KINDS` (`verify`, `receipt`, `kickoff`, `trace`, `manual`) and `PLANNED_LEDGER_EVENT_KINDS` (`doctor`, `status`, `hook-install`, `bundle`). The four planned kinds had no recorders or CLI surfaces; they are now documented in `docs/roadmap.md` as v0.3.x reservations and not accepted by the production ledger schema until first-class implementations exist.

### Added

- New shared test helper module `tests/helpers/temp-git-repo.ts` containing `createTempGitRepo` (migrated from `tests/ledger.test.ts`) and `createTempGitRepoWithRemoteAndAnnotatedTag` for integration tests needing a full git remote setup.
- New `docs/roadmap.md` documenting planned ledger event kinds and the promotion protocol.

### Behavior change

- `forge0 ledger record --event manual --mode invalid` (or with any irrelevant `--mode` value) now errors at parse time instead of silently ignoring the flag. Same applies to other verify-mode and bump-type validations. This is a strictness-over-backward-compat trade-off for cleaner CLI semantics.

### Notes

- 202/202 tests passing (192 existing + 10 new).
- No new dependencies.
- Hygiene tickets HYGIENE-FORGE-013 (temp-git-repo helper error handling for partial-failure cleanup) and HYGIENE-FORGE-014 (audit `runVerify` for `process.cwd()` leaks into integration tests) filed for v0.3.0.

## [0.2.1] - 2026-04-30

### Fixed

- **HYGIENE-FORGE-008** — `forge0 verify --mode release --remote` now correctly handles annotated tags. `parseLsRemoteHash` prefers the peeled ref `^{}` commit SHA over the tag-object SHA. The remote tag check command also passes both `<tagName>` and `<tagName>^{}` as patterns, since `git ls-remote --tags origin <exact-tag>` does not emit the peeled line.
- **HYGIENE-FORGE-010** — `recordVerifyEvent` honesty bound is now conditional on whether CI was successfully observed. When `--ci` was used and `ci.status` check passed, the bound asserts the observation rather than denying it. `selectVerifyHonesty` extracted as a directly-testable helper.

### Added

- **HYGIENE-FORGE-009** — `forge0 ledger record --event manual --message <text>` CLI surface. The `'manual'` event kind was already in `LedgerEventKind` but had no CLI path.

### Notes

- 192/192 tests passing (186 existing + 6 new).
- No new dependencies.
- Receipt's honesty bound is unchanged; receipt does not observe CI, so its existing text is truthful as-is.

## [0.2.0] - 2026-04-30

### Added

- `forge0 kickoff` command with an auto-mode router, verbatim prompt template generation, and atomic dump writing.
- `forge0 trace` command supporting all 8 trace tags with explicit precedence evaluation (NOT_OBSERVED, TRACE_INTEGRITY_FAILURE, MODE_MISMATCH, etc.).
- Fail-closed adversarial intent classifier and policy file substrate (`.forge0/policy.json`).
- Universal skill registry merkle baseline integration.
- `kickoff` and `trace` trust events integrated into the hash-chained `forge0 ledger`.

## [0.1.16] - 2026-04-29

### Added

- Added `forge0 release --dry-run` planner for safe release orchestration.
- Added `--bump` support for patch, minor, major, and none release plans.
- Added release plans that include optional remote and CI verification steps.

### Security

- Release execution remains intentionally disabled in v0.1.x; the planner previews commands without mutating Git state.

## [0.1.15] - 2026-04-29

### Fixed

- Fixed CI test failures by replacing `npx tsx` with a direct Node execution of the local `tsx` CLI binary in tests (`node_modules/tsx/dist/cli.mjs`). This prevents `npx` from interactively prompting for package installation when tests run in an empty temporary directory (`/tmp`) on CI runners where `tsx` is not globally installed.

## [0.1.14] - 2026-04-29

### Fixed

- Fixed a bug where `forge0 verify` in WSL/bash environments would create a literal file named `nul` (due to `2>nul` redirect), causing the repository to be marked dirty and failing release authorization.
- `exec` helper now uses proper Node.js `stdio: ['pipe', 'pipe', 'pipe']` to suppress stderr across all OS environments instead of relying on shell redirects.

## [0.1.13] - 2026-04-29

### Fixed

- Fixed `ledger last --json` CLI test to validate empty-ledger JSON output even when the command exits with code 2.
- Kept ledger CLI JSON tests deterministic by running empty-ledger assertions in an isolated temp directory.

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
