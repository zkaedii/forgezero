# Changelog

All notable changes to this project will be documented in this file.

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
