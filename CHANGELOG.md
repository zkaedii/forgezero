# Changelog

All notable changes to this project will be documented in this file.

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
