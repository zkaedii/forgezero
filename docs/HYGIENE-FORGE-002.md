# HYGIENE-FORGE-002: Meta-Governance Audit Tags

## Context
Changes to `docs/skill/SKILL.md` (the ForgeZero skill itself) are fundamentally different from changes to other `.agents/` surface artifacts. When you change `forgezero/SKILL.md`, you are altering the activation triggers and behavior of the tool that performs the auditing itself.

Currently, `forge0 audit` treats a change to `docs/skill/SKILL.md` as just another `[Skill]` modification. 

## Issue
`forge0 audit` fails to highlight the self-reflexive severity of changes to the governance tool's own activation criteria. The audit report is structurally blind to the meta-consequences of modifying the ForgeZero SKILL.md.

## Required Fix (v0.1.1)
Update `src/audit/audit.ts` to implement a special `[META]` tag for the `forgezero/SKILL.md` file. 
When generating the audit report, if the `filePath` matches `docs/skill/SKILL.md` (or any configured tool-governing surface), the `surfaceType` should be overridden to `[META]` or appended as `[Skill] [META]`, and visually emphasized.

This ensures that pre-commit reviews explicitly flag that the governance tool itself is being modified.
