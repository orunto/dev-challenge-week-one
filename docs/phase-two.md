# Phase two — private onboarding

## Status

The implementation is written. No commands, dependency installs, builds, tests, browsers, servers, or containers were run for phase two, following the user's execution preference. Do not treat this document as a verified exit-criterion pass.

Phase-one performance/quality and deployment gates remain open. Phase two does not establish a faster model or verified Render capacity.

## Implemented flow

1. **Welcome:** one heading, one short subtitle, one chat CTA. The info icon holds hosted-processing details and the manual-preference/data-management links.
2. **Conversation:** full-height mobile chat with a bottom composer. Gemma generates the opening question, then asks one optional question at a time. Streamed plain-text replies, concise thinking/error states, cancellation, retry/resume, and contextual utility actions replace introductory panels and cards.
3. **Profile extraction:** separate `/api/preferences` operation; only user-authored messages enter its server-owned prompt. Unstated scalar choices remain null instead of silently adopting model guesses.
4. **Review:** editable interest/constraint lines, time, budget, setting, social preference, optional known-hobby exclusions, and 7/14-day selection. Validate before confirming; preserve at least three eligible catalog options.
5. **Confirmation:** save the profile on this browser, optionally discard raw conversation/unsent answer, and resume here after reloading. No recommendation cycle starts during onboarding.

Confirmed profiles open the compact hobby utility. There is no separate congratulatory page or permanent profile-summary panel; recommendations still come from the model, and saved cycles/records remain available.

## Code map

- `apps/web/`: React/Vite workspace and development API proxy.
- `apps/web/src/styles.css`: extracted visual tokens, control states, narrow layouts, safe-area spacing, and reduced-motion behavior.
- `apps/web/src/components.tsx`: reusable buttons, labeled fields, brand mark, and geometric artwork.
- `apps/web/src/App.tsx`: welcome, conversation, review, and confirmation screens.
- `apps/web/src/useOnboarding.ts`: request lifecycle, cancellation/retry, local saves, profile review/confirmation, and offline/service states.
- `apps/web/src/api.ts`: bounded UTF-8 request context, safe error copy, strict terminal NDJSON handling, and extraction/status clients.
- `apps/web/src/session.ts`, `storage.ts`: versioned Zod-validated onboarding state and ordered IndexedDB transaction commits.
- `packages/shared/src/index.ts`: nullable preference drafts, extraction requests, confirmed profiles, and cycle-length schemas.
- `apps/server/src/prompts.ts`, `app.ts`: server-owned extraction prompt/output validation and shared inference-queue lifecycle.
- `apps/server/test/preferences.test.ts`, `static.test.ts`, `apps/web/test/onboarding.test.ts`: new regression coverage, not yet executed.

## Privacy and storage behavior

- Messages go to the same-origin API for hosted inference. Local history is not on-device inference, server encryption, or cross-device sync.
- Extraction receives user-authored recent answers; assistant suggestions are excluded from its prompt. Schema validation cannot prove that every generated fact is accurate, so review remains mandatory.
- The default model input allowance is small. The browser sends the newest complete messages that fit, up to twelve; it never truncates a newly submitted answer silently. Larger UTF-8 answers may require shortening even below the 500-character UI limit.
- Older messages remain in local history and omitted context is disclosed. Profile review lets the person restore missing older preferences.
- Completed and interrupted replies are distinguishable. Interrupted replies are excluded from future model context. Mid-stream reloads preserve the submitted answer and offer retry; uncommitted streaming text is not claimed as a complete reply.
- Onboarding history is bounded at 200 messages. Continue to review when the limit is reached.
- Profile confirmation waits for an IndexedDB transaction commit before displaying local confirmation. Writes are ordered so a stale draft does not replace the confirmed profile.
- Discarding the conversation removes messages and the unsent composer value in the same saved snapshot. The extraction draft is replaced with the confirmed preferences, removing rejected old draft fields.
- Failed/unsupported storage is visible. An unreadable record is not overwritten automatically. Explicit session-only operation is available but cannot survive a reload.
- Database schema version 1 is a foundation, not the complete migrations/export/import/clear-all feature set planned for phase five. Multi-tab conflict resolution is not implemented.
- Offline preference editing/saving works while the app is already loaded. Offline app-shell loading is not available yet; no service worker is registered.

## Build and fonts

The frontend uses self-hosted Barlow Semi Condensed 700/800 and Inter Variable. No Google Fonts request is required. The unused mono stylesheet is no longer loaded in the minimal interface; system fallbacks remain available.

The Vite development server proxies `/api` to `http://127.0.0.1:3000` by default. `API_PROXY_URL` can override that target. Production builds emit `apps/web/dist`; Fastify serves those assets from the same origin, without spending generation-rate allowances on fonts or scripts. Unknown API routes do not become HTML application responses.

The user supplied `bun.lock` after a local Bun installation. Bun 1.3.0 is now pinned for package management and Docker installation; Node remains the server/test runtime. A user-run frozen install and Docker build must verify that lockfile. The agent has not run either.

## User-run verification

### Install and checks

```powershell
bun install --frozen-lockfile
bun run format
bun run format:check
bun run typecheck
bun run test
bun run build
```

Use `bun install` when deliberately changing dependencies and review the lockfile; clean/reproducible installs use `bun install --frozen-lockfile`.

### Development

Start the API with the desired Ollama URL/port in one terminal:

```powershell
bun run dev
```

In a separate terminal:

```powershell
bun run dev:web
```

Open `http://127.0.0.1:5173`. If reusing the existing API on port 3001, set `$env:API_PROXY_URL = 'http://127.0.0.1:3001'` before starting the frontend. The existing API needs restarting on the new source to expose `/api/preferences` and status input limits.

For same-origin production serving, after building:

```powershell
bun run start
```

Manage previously started API/Ollama processes yourself before starting replacements.

### Browser and real-model checklist

- Read privacy copy before sending the first message; inspect network requests for only the intended same-origin endpoints and locally bundled fonts.
- Complete a real Gemma conversation, skip a question, cancel a reply, retry it, and extract a profile.
- Check that unstated facts remain blank, assistant suggestions do not become claimed user preferences, and explicit dislikes map only to known hobbies.
- Use enough turns to exceed the context budget; confirm the omission notice and restore an older preference during review.
- Test Unicode answers against the byte budget and reject oversized input without losing the unsent answer.
- Edit every field, choose both cycle lengths, reject invalid values, and confirm profile accuracy.
- Reload during conversation, after manual edits, after extraction, and after confirmation; verify the saved screen, answer draft, and profile.
- Confirm with conversation deletion selected; inspect IndexedDB to ensure messages/unsent text and rejected extraction fields are removed.
- Block or exhaust storage; confirm visible recovery and truthful session-only messaging rather than a false saved confirmation.
- Simulate network loss, HTTP 429/503, queue timeout, malformed/truncated streams, and model-output errors. Failed extraction must preserve conversation and existing edits.
- Inspect at 320/375px widths and desktop, 200% zoom, keyboard-only navigation, mobile keyboard opening/closing, long replies, and reduced motion.
- Verify primary/hover/active colors, field boundaries, focus indicators, error text, and screen-reader status announcements; streamed tokens must not be announced individually.
- Confirm the production root/assets load without reducing the inference allowance, and an unknown `/api` path remains a 404.

Record actual results before checking the phase-two exit criterion as complete. Real-model review and visual/browser checks are required in addition to the written synthetic tests.
