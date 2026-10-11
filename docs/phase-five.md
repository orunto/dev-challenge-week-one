# Phase five — local data, privacy, and offline reliability

Implementation is written. Browser/network/disk inspection, tests, and installation/offline verification remain user-run and pending.

## Local schema and recovery

IndexedDB migrations preserve existing stores: version 1 onboarding; version 2 adds the cycle/activity library; version 3 adds a metadata generation counter. Library records without activity logs normalize to an empty list. Record schemas bound conversation length, cycles, logs, fields, and IDs; unsupported/corrupt data is not silently overwritten.

Versioned JSON exports include an atomic snapshot of onboarding and the library. Exports may contain personal conversations, constraints, profiles, and reflections. Import accepts at most 5 MB and validates envelope version, strict record shape, UUID uniqueness, cycle dates, catalog eligibility, activity references, and attempt dates before touching storage. Rewards are recomputed, never imported as a total.

Import and clear-all replace both stores in one transaction. A failure cannot commit only half of the replacement. The UI explains consequences and requires explicit confirmation. Raw-conversation deletion preserves preferences, cycles, and attempts. Previously downloaded exports and other devices are outside local deletion's scope.

Before destructive replacement, queued autosaves are invalidated/drained and active model requests are cancelled. Library writes carry a local write token. A transactionally incremented database generation also rejects old writes from other tabs, preventing erased content from reappearing. Other tabs should reload after clear/import. Normal multi-tab preference editing is last-committed-write behavior, not collaborative conflict resolution.

Storage failures are visible and permit explicit session-only operation. Existing unreadable records remain intact until the person chooses clear or a validated replacement.

## Offline app shell

The build generates a versioned worker using only an explicit list of built HTML/JS/CSS/font/image assets plus the manifest/icon. It never handles inference/health requests, external origins, non-GET requests, or unlisted paths. Production registration requires HTTPS or localhost. A first online visit must successfully install/cache the shell before offline reload is available.

Root navigation is network-first with a cached shell fallback. Listed versioned assets are cache-first. New workers wait; the UI offers an explicit update/reload action, and activation removes obsolete HobbyMaxx shell caches. No model response, profile, export, conversation, or activity record belongs in Cache Storage.

The manifest uses the project-authored SVG app icon. Browser installation/icon support, mobile behavior, cache install/update failures, and offline cold navigation require user verification; metadata alone is not an installability pass.

## User checks

Run `bun run format`, `bun run typecheck`, `bun run test`, and `bun run build`. Use the production build for service-worker checks. Test 1→3 migration, corrupt/unsupported records, quota failures, valid/invalid exports, atomic replacement failures, two-tab clear/import, stale background saves, offline startup/logging, updates while editing, cancellation/saturation, and keyboard/screen-reader/contrast checks.

Inspect server logs and model disk during real requests to establish the privacy boundary in operation. Written mocked tests and the worker's allowlist are not substitutes for those observations.
