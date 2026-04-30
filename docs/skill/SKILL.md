---
name: forgezero
description: Governance and provenance CLI for Antigravity .agents/ surface. Use when the user is about to merge a PR touching .agents/, asks "what influenced this conversation," wants to share team configs without leaking secrets, or asks for a decision lineage for a specific session ID. Provides full lifecycle commands: status, doctor, kickoff, audit, verify, provenance, share, receipt, ledger, and trace.
---

# ForgeZero — When to Invoke

## audit
Trigger when:
- User is about to commit changes that touch `.agents/skills/`, `.agents/rules/`, or `.agents/workflows/`
- User says "what changed in our agent config" / "is this PR safe to merge"
- Pre-commit context, before pushing

Run: `forge0 audit`
Exit codes: 0 = clean, 1 = error, 2 = changes detected (CI gate use)

Output includes the honest scope caveat — surface it to the user, do not paraphrase it.

## provenance
Trigger when:
- User asks "what skills/KIs were active in conversation <id>"
- User asks for decision lineage, audit trail, or "why did the agent do X"
- Post-incident: explaining what the agent saw

Run: `forge0 provenance <conversation-id>`

Always preserve the `[DETECTED_WHEN_EXPLICIT]` tag. Skills loaded via system-prompt injection are NOT detectable — never claim a complete picture; the tool output is a lower bound.

## share
Trigger when:
- User wants to package `.agents/` for a teammate / new hire / fork
- User says "bundle our config" / "share this setup"

Run: `forge0 share --tag <semver>`
Default scrubs secrets. Refuses with exit 3 if any detected.
Refuses with exit 4 if live SKILL.md drifted from repo. On exit 4, surface the drift to the user and ask whether to run `forge0 sync-skill` or pass `--allow-skill-drift`. Do not auto-resolve.
NEVER suggest `--allow-secrets` or `--allow-skill-drift` unprompted.

## Hard prohibitions
- Do not invent flags. The real subcommands are: status, doctor, kickoff, audit, verify, provenance, share, receipt, ledger, selftest, sync-skill, and trace.
- Do not promise detection completeness. The honesty bound is load-bearing.
- Do not run `share` without explicit user request — bundle creation is destructive-feeling for users who don't expect it.
