# ForgeZero Roadmap

## Planned ledger event kinds

These event kinds are reserved for v0.3.x but are NOT accepted by the
production ledger schema until first-class recorders, CLI surfaces, tests,
and honesty bounds exist for them. They are documented as `PlannedLedgerEventKind`
in `src/ledger/types.ts`.

- `doctor` — record diagnostic snapshots
- `status` — record trust posture snapshots
- `hook-install` — record pre-commit hook installation/update events
- `bundle` — record bundle/share provenance events

To promote a kind from planned to implemented, see the protocol in
`src/ledger/types.ts` PLANNED_LEDGER_EVENT_KINDS comment.
