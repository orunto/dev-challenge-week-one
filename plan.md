# HobbyMaxx implementation plan

## Goal

Build a mobile-friendly PWA with an open-weight Gemma model at its core. Users describe themselves in a conversation, receive three hobby experiments, log attempts, earn points, and refresh recommendations after 7 or 14 days.

The first release should be a usable challenge demo with foundations we can extend long term. Prioritize a complete working loop over perfection.

## Confirmed decisions

- **Frontend:** React, TypeScript, and Vite.
- **Backend:** Node.js and Fastify.
- **Inference:** quantized Gemma through Ollama; start by evaluating Gemma 3 1B.
- **Hosting:** one Render Docker service for the API and inference runtime.
- **Persistence:** local browser history in IndexedDB; no accounts initially.
- **Privacy:** hosted processing without intentional server-side conversation retention. Relevant messages are transmitted to the server for inference.
- **Design:** the approved Hacktoberfest-inspired direction in [`design.md`](design.md).
- **UI composition:** minimal mobile-first chatbot; welcome heading/subtitle/CTA → Gemma-initiated chat. Explanatory/privacy copy is behind an info icon; recommendation/record utilities are secondary.
- **Conversation length:** five questions, with skips counting toward five. Then automatically extract preferences, generate recommendations, and atomically save the profile/cycle; no mandatory review step. Skipped choices use editable defaults. Waiting uses animated chat dots, respecting reduced motion.
- **Budget:** $50 Render credit; begin with the smallest viable service and reserve at least $10 for judging and unexpected usage.
- **Offline behavior:** saved recommendations and activity logging work offline; AI replies and recommendation refreshes require internet.

## Architecture

```text
React PWA
  ├─ Conversational onboarding and preference review
  ├─ Hobby recommendations, activities, and points
  ├─ Recommendation cycle tracking
  └─ IndexedDB: conversations, preferences, and history
           │ HTTPS with bounded context
           ▼
Fastify API
  ├─ Input and response validation
  ├─ Rate limits and a bounded inference queue
  └─ Inference adapter
           │ localhost only
           ▼
Ollama → Gemma
  └─ Persistent model files on Render
```

Fastify will serve the built frontend and API from the same origin. Ollama will not be exposed directly to the public internet. Gemma interprets preferences, selects and explains hobby experiments, and adapts future recommendations; a curated catalog grounds its decisions.

## Current status

**Phase-one implementation and local baseline evaluation are recorded; verification remains open.** Real Gemma CPU benchmarks completed: 10/10 sequential requests succeeded, while the three-client run had 3/10 successes and seven queue timeouts. Recommendation review identified constraint violations, and follow-up code now enforces catalog eligibility and the evaluated model digest. The targeted post-change rerun was interrupted; final checks, quality review, Docker execution, and Render-tier validation are pending. See [`docs/phase-one-results.md`](docs/phase-one-results.md).

**Phase two is implemented in source, with user-run verification pending.** The React/Vite onboarding flow, editable preference review, IndexedDB history/resume, and separate model profile-extraction endpoint are written. Dependencies/lockfile installation, formatting, type checks, tests, real-Gemma extraction review, and mobile/browser verification have not been run. See [`docs/phase-two.md`](docs/phase-two.md).

**All core source milestones and phase-six deployment preparation are implemented. Verification and public deployment remain open.** The core loop, privacy/data controls, migrations, exports/imports, offline PWA, Bun/Docker configuration, release checks, and deployment runbook are written. No phase exit criterion is promoted to a verified pass without user-run evidence. See [`docs/deployment.md`](docs/deployment.md).

**Execution preference:** Git inspection, staging, and explicitly approved commits are authorized. The user runs all other processes, including installs, formatting, tests, builds, benchmarks, development servers, and Docker checks. Show the exact drafted message and obtain approval before each commit; use the configured identity without overrides. Remote pushes and paid deployment require separate explicit permission.

The portable Windows Ollama runtime and existing Gemma files were relocated into ignored `.runtime/ollama/` at the user's explicit request. Local `start`/`dev` now supervise Ollama and the API together; the agent did not start or stop either service. Combined startup/shutdown remains user-run verification.

## Phase 1 — Prove hosted Gemma feasibility

### Deliverables

- [x] TypeScript workspace with shared schemas and a grounding hobby catalog.
- [x] Fastify chat endpoint with streamed responses.
- [x] Structured recommendation endpoint with schema and catalog validation.
- [x] Ollama adapter with explicit context, output, and CPU-thread limits.
- [x] One active generation at a time, bounded queue, timeouts, and cancellation.
- [x] Privacy-safe operational logging and request isolation checks.
- [x] Synthetic benchmark runner for chat and recommendations.
- [x] Docker/Render configuration for an initial deployment candidate.
- [x] Make portable CPU-only Ollama available without a system-wide installation.
- [x] Run real Gemma inference through the API.
- [x] Record local baseline cold/warm latency, throughput, model footprint, and three-client queue behavior.
- [x] Review baseline recommendation quality and identify constraint violations.
- [x] Add eligibility filtering, structured exclusions, stronger activity instructions, and regression tests.
- [x] Pin and enforce the evaluated Gemma 3 1B manifest digest.
- [ ] Run final formatting/type checks and regression tests after the latest changes (user-run).
- [ ] Complete the interrupted targeted quality rerun and review the updated responses (user-run).
- [ ] Repeat full benchmarks against the final code if the targeted review passes (user-run).
- [ ] Verify the Docker image and total container peak memory (user-run).
- [ ] Evaluate and select the actual Render tier; local timings are not Render evidence.

### Evaluation scenarios

Test limited time and budget, low energy, accessibility needs, social discomfort, conflicting preferences, and feedback about a disliked hobby. Include multi-turn onboarding and languages relevant to the intended audience.

Record time to first token, complete-response time, peak container memory, queue delays, failures, and human quality review. Transport/schema success is not a quality grade. Separate cold-start results from warm inference.

### Exit criterion

Choose a model and service tier from measured quality and performance. The reviewed recommendations must respect explicit constraints and provide useful first activities. If 1B passes quality but not performance, test a larger CPU/RAM tier; if quality is inadequate, compare a larger Gemma before spending the remaining credit.

Detailed benchmark instructions and proposed acceptance targets live in [`docs/phase-one.md`](docs/phase-one.md).

### Recorded decision and remaining gate

The pinned model is a viable development candidate for a slow single-user demo, not a verified concurrent-user deployment. Baseline recommendation completion took approximately 51–69 seconds; generated activity text still needs post-change review. Keep phase one open until that review and the required deployment evidence are available. Do not mark interrupted runs or newly written tests as passed.

## Phase 2 — Build private onboarding

### Deliverables

- [x] Scaffold the React/Vite frontend and connect it to the same-origin API.
- [x] Extract design tokens and accessible reusable controls from `design.md`.
- [x] Build welcome, conversation, preference-review, and confirmed-profile screens.
- [x] Explain hosted processing and local history before the first conversation.
- [x] Implement streamed replies with waiting, generating, cancel, retry, and unavailable states.
- [x] Let users skip questions or enter preferences without a conversation.
- [x] Add a separate, validated model operation for extracting a preference draft; unknown choices remain null.
- [x] Present an editable summary before the later recommendation-generation phase.
- [x] Let users choose a 7- or 14-day cycle without starting a cycle during onboarding.
- [x] Implement IndexedDB resume/save and optional raw-conversation removal on confirmation.
- [x] Add regression tests for extraction, stream framing/cancellation, storage ordering, and frontend serving.
- [ ] Verify the user-generated `bun.lock` with a frozen install (user-run).
- [ ] Run formatting, type checks, tests, and the production build (user-run).
- [ ] Verify real Gemma extraction quality, reload/resume, narrow layouts, and mobile-keyboard behavior (user-run).

### Exit criterion

A user can move from a personal conversation to a confirmed, locally saved profile, reload the app, and resume without losing their work. The flow works on narrow screens and with a mobile keyboard.

This exit criterion has not been verified. Written regression tests and responsive styles are implementation evidence, not a browser or real-model pass.

## Phase 3 — Deliver hobby experiments

### Deliverables

- [x] Expand catalog metadata with stable hobby/activity IDs, cost, time, equipment, environment, and accessible starter activities.
- [x] Connect confirmed profiles to Gemma's validated three-hobby selection.
- [x] Display rationale, first activity, estimated time/cost, equipment, and adaptations.
- [x] Validate output shape, distinctness, eligibility, and cycle dates before saving.
- [ ] Add a bounded repair attempt only if user-run quality evaluation justifies the extra latency; no automatic repair is currently enabled.
- [x] Show retryable failures without saving partial or invalid cycles.
- [x] Save successful cycles in a transactional IndexedDB library, preserving previous cycles.
- [ ] Run cycle regression tests and verify real-model generation, reload, and failed-save behavior (user-run).

### Exit criterion

Users receive three usable experiments consistent with their preferences, can view them after a reload, and can open a clearly defined first activity for each hobby.

## Phase 4 — Complete activities, points, and cycle refreshes

### Deliverables

- [x] Log activity, attempt date, enjoyment, difficulty, and optional reflection.
- [x] Derive **10 completion points** once per starter activity per cycle.
- [x] Keep additional attempts without duplicate point awards; deduplicate retried submission IDs.
- [x] Calculate all points from activity records rather than mutable totals.
- [x] Store start/due instants and local calendar dates; check due state on open, visibility changes, and a bounded timer.
- [x] Offer Gemma refresh after 7/14 days using current preferences and recent feedback.
- [x] Validate a retained favorite and require new alternatives for other selections.
- [x] Commit successful refreshes transactionally and preserve previous cycles/logs on failure.
- [x] Support offline logging in an already-loaded app; refresh requires internet.
- [ ] Verify duplicate submissions, date/timezone boundaries, concurrent refreshes, real-Gemma feedback quality, and offline browser behavior (user-run).

### Exit criterion

The complete loop works: conversation → experiments → attempts → points → feedback-informed refresh. Reloads, duplicate submissions, date boundaries, and failed refreshes do not corrupt history or rewards.

## Phase 5 — Harden local data, privacy, and reliability

### Deliverables

- [x] Version local records and migrate database versions 1→2→3 without erasing onboarding/history; legacy libraries default missing logs to empty.
- [x] Provide raw-conversation deletion, clear-all-local-data, and versioned JSON export/import.
- [x] Warn about personal export content; validate schema, catalog references, dates, duplicates, and import size before atomic replacement.
- [x] Show unavailable/quota-limited storage and missing-history recovery paths.
- [ ] Verify logs/network/model-disk retention behavior against real execution (user-run).
- [x] Preserve bounded request isolation, queueing, cancellation, and execution limits in model operations.
- [ ] Verify cancellation, disconnects, malformed output, unavailable inference, and saturation throughout the browser UI (user-run).
- [x] Use accurate hosted-processing/local-history privacy copy.
- [x] Add installation metadata and an asset-allowlisted offline worker; inference/health/external/write requests bypass it.
- [x] Protect clear/import from queued autosaves and stale tabs with transactional data-generation checks.
- [ ] Verify migrations, stale tabs, import rollback, storage recovery, service-worker updates, installation, offline reload, and accessibility in browsers (user-run).

### Exit criterion

Users can understand, retain, export, and erase their local data. The app has clear recovery paths for storage/network/inference failures, and the documented privacy boundary matches observable behavior.

## Phase 6 — Deploy and verify the demo

### Deliverables

- [x] Configure a frozen-lockfile Bun Docker build and managed Fastify/Ollama startup/shutdown.
- [ ] Execute final Docker build/startup/shutdown and persistent-model restart checks (user-run).
- [x] Configure model persistence, independent health/readiness, and pinned digest checks.
- [x] Configure same-origin PWA/API serving, self-hosted fonts, generated install icons, and production security headers.
- [x] Pin the evaluated candidate model and environment-controlled limits; final tier/model acceptance is pending measurements.
- [ ] Verify actual Render proxy behavior before altering forwarded-header trust/rate limiting (user-run).
- [ ] Confirm current pricing, credit eligibility/expiry, remaining runway, and shutdown procedure in the intended account (user-run).
- [ ] Obtain explicit paid-resource approval and deploy; remote push also needs separate permission.
- [x] Document setup, configuration, architecture, privacy, model choice, limitations, and release checks.
- [x] Write the open-weights challenge-explanation foundation; add actual evidence/URL/screenshots only after verification.

### Verification

- Complete onboarding and recommendation generation against real Gemma.
- Offline viewing/logging, reload persistence, export/import, and deletion.
- Duplicate point prevention and 7/14-day cycle boundaries.
- Failed refresh preserving the current cycle.
- Model output validation, queue saturation, timeouts, cancellation, and user-context isolation.
- Network/log inspection for unintended personal-data retention.
- Keyboard navigation, visible focus, color contrast, touch targets, long messages, mobile keyboards, and reduced motion.
- Bounded visual review on mobile and desktop, fixing observed defects in one batch where possible.

### Exit criterion

A public demo supports the complete core loop on inexpensive phones with internet access, uses a real open-weight model for essential personalization, and stays within the approved operating budget.

## Working conventions

- Keep model integration behind an adapter and domain schemas in shared packages.
- Use Bun 1.3.0 and `bun.lock` for dependency management; Node remains the API/test runtime.
- Format supported source/config/documentation files with `bun run format` and check them with `bun run format:check`.
- Prefer explicit blocks and readable control flow over compressed one-line statements.
- Run type checks and relevant existing tests after code changes.
- Do not treat mocked tests as evidence of model quality, actual memory use, or Render performance.
- Record unresolved product decisions rather than inventing claims or features.

## Long-term foundations

Keep room for larger/different open-weight models, optional on-device inference, optional accounts/sync, richer hobby progression, improved recommendation evaluation, and separately deployed inference as traffic grows. These are future directions, not requirements for the initial demo.
