# Phase three — grounded hobby experiments

Source implementation is complete; tests, builds, real-Gemma review, and browser verification are user-run and remain unverified.

The confirmed-profile screen now invokes Gemma to select three distinct eligible hobbies. Both API and browser validate shape/catalog eligibility. Cards show rationale, an expandable first activity, catalog supplies, an accessible alternative, and time/cost estimates. Estimates are catalog bounds; model-generated activity prose still requires human review for suitability.

The grounding catalog has stable starter-activity IDs (`hobby-id:starter:v1`). IndexedDB database version 2 adds a library store without deleting onboarding records. Each cycle stores a profile snapshot, recommendations, UUID, UTC start/due instants, and 7/14-day duration. Dates use elapsed UTC days (86,400,000 milliseconds), avoiding local DST arithmetic; presentation uses local dates.

Cycle generation is explicit, never automatic on page load. A cycle is saved only after complete valid output. The library update reads/modifies/writes inside one transaction, preserves history, and rejects duplicate IDs. The previous cycle survives generation, validation, or transaction failures. Session-only operation is labeled and does not claim reload persistence.

No repair loop is enabled: model quality/latency evidence has not justified another inference request. A user can retry the failed initial generation; no invalid cycle is retained.

User checks: `bun run format`, `bun run typecheck`, `bun run test`, and `bun run build`; then generate with real Gemma, reload, test cancellation/network loss/storage failure, inspect narrow screens and keyboard access, and review every activity against the confirmed constraints. Nothing in this document marks those checks as passed.
