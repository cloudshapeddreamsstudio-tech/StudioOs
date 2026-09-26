# docs/archive — history, not instruction

Nothing in this folder is authoritative. These files were true when they were
written and are kept because they explain *why* the current design looks the way
it does. They are not a description of how the system works today.

If you are an agent and you found one of these by grep: stop, and read
`../SEAM.md` and `../../AGENTS.md` instead.

| File | Was | Superseded by |
|---|---|---|
| `PLAN-phases-0-5.md` | The original build plan, phases 0 to 5 | `../PLAN-v2.md` |
| `architecture-pre-6c.html` | Architecture and status, written before Phase 6c | `../seam-map.html` |
| `status-2026-08-17.html` | A status snapshot, 2026-08-17 | `../PLAN-v2.md` |

The two HTML files predate two changes that moved the foundations: Phase 6c
removed the admin key so every request runs on the signed-in user's token, and
Phase 10f established where non-ERPNext data lives. Read them for the reasoning,
never for the shape.
