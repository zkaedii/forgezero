# ForgeZero

Governance and provenance CLI for Antigravity `.agents/` surface.

[![tests](https://img.shields.io/badge/tests-52%2F52-green)](./tests)
[![version](https://img.shields.io/badge/version-0.1.2-blue)](./package.json)
[![license](https://img.shields.io/badge/license-MIT-yellow)](./LICENSE)

> **The honesty bound is load-bearing.** ForgeZero never claims to detect
> what it cannot see. Skills loaded via system-prompt injection leave no
> trace in `overview.txt`; provenance reports are explicitly tagged
> `[DETECTED_WHEN_EXPLICIT]` and represent a *lower bound* on agent
> influence. See [docs/v0.2.0-thesis.md](./docs/v0.2.0-thesis.md).

## Quickstart

```bash
npm install -g forgezero
forge0 selftest         # validate paths and git
forge0 audit            # diff .agents/ vs HEAD~1
forge0 provenance <id>  # decision lineage for conversation <id>
forge0 share --tag v1   # secret-scrubbed bundle for distribution
forge0 install-hook     # install 3-gate pre-commit audit hook
```

## Commands

| Command | Purpose | Exit codes |
|---|---|---|
| `audit` | Diff `.agents/` against last git commit | 0 = clean / 1 = error / 2 = changes |
| `provenance <id>` | Lower-bound skill/KI/artifact lineage | 0 = success / 1 = error |
| `share --tag <v>` | Secret-scrubbed versioned bundle | 0 = success / 1 = error / 3 = secrets / 4 = skill drift |
| `sync-skill [--check]` | Push canonical SKILL.md to live agent dir | 0 = synced / 1 = error / 2 = drift (check mode) |
| `selftest` | Validate paths, git, dependencies | 0 = pass / 1 = some checks failed |
| `install-hook` | Install production-safe 3-gate pre-commit hook | 0 = success / 1 = error / 2 = already exists |
| `trace <id>` | [v0.2.0 — not implemented] | 0 (stub) |

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

