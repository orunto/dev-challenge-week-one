# HobbyMaxx

An open-weight Gemma-powered hobby discovery app. Tell the agent about yourself, try three personalized hobby experiments, log attempts, earn points, and refresh recommendations every 7 or 14 days.

## Current status: core loop and privacy/PWA source implemented; verification pending

Implemented: TypeScript workspace, Fastify API, Ollama streaming adapter, grounded structured recommendations, bounded queue, cancellation/timeouts, privacy-safe operational logging, a synthetic benchmark runner, automated tests, and Render container configuration.

Phase two adds a React/Vite welcome, conversation, editable preference review, and confirmed-profile flow; IndexedDB local history/resume; a separate validated Gemma preference-extraction operation; and same-origin frontend serving. The agent has not built, tested, or visually reviewed these changes; user-run verification results have not been recorded. See [`docs/phase-two.md`](docs/phase-two.md).

Phases three through five add grounded experiment cards, saved cycles, activity/reflection logging, derived points, feedback-informed refreshes with an optional retained favorite, history, privacy controls, validated JSON export/import, and offline app-shell/PWA source. These additions are also unverified. The full roadmap is in [`plan.md`](plan.md), and the approved UI specification is in [`design.md`](design.md).

The interface is chat-first and mobile-first: Gemma asks five questions (interests, time, budget, setting, company). Answers and skips advance once; after answer five, preferences are extracted and three hobbies are generated automatically, without a review/generate click. Waiting uses an animated three-dot chat bubble with a reduced-motion fallback. Preference edits, privacy, and records remain secondary utilities. This revision still needs user-run verification.

**Real Gemma CPU baseline benchmarks are recorded, but phase-one verification is still open.** Sequential requests completed 10/10; the three-client run completed 3/10 and timed out seven queued requests. Baseline review identified constraint violations, prompting eligibility filtering and model-digest enforcement. The post-change rerun was interrupted, so final checks and updated quality review are pending. Docker/Render performance and total container peak memory remain unverified. See [`docs/phase-one-results.md`](docs/phase-one-results.md) and [`docs/phase-one.md`](docs/phase-one.md).

Git inspection, staging, and individually approved commits are authorized. The user runs all other processes, including installs, formatting, tests, builds, benchmarks, servers, and Docker checks. Each exact commit message requires approval; remote pushes and paid deployment require separate permission.

## Requirements

- Node.js 22.12+ (development baseline was verified on Node 24).
- Bun 1.3.0 for package management/scripts; Node remains the server and test runtime.
- Ollama for real local inference, or Docker for the complete Linux deployment container.
- Review the [Gemma license](https://ai.google.dev/gemma/terms) for model use and redistribution.

## Local development

```powershell
bun install --frozen-lockfile
```

The project now uses the user-generated `bun.lock`. Frozen installs must match the manifests; when changing dependencies, run `bun install` yourself and review the resulting lockfile. The Docker build uses pinned Bun 1.3.0 for installation and Node 24 for the production API. The Bun migration has not been executed or verified by the agent.

Create `.env` using `.env.example`. The existing portable Windows runtime and downloaded Gemma model have been moved into `.runtime/ollama/`. This directory is local-only and excluded from Git, formatting, and Docker build uploads.

One command now starts Ollama and the API together:

```powershell
bun run start
```

This rebuilds the API, starts `.runtime/ollama/ollama.exe`, reuses `.runtime/ollama/models`, and starts the API under one supervisor. `OLLAMA_HOST` is derived from the same `OLLAMA_URL` used by the API, so their ports agree. `.env` and existing environment variables can still configure `PORT` and the local inference URL. Ctrl+C stops the owned processes; Windows shutdown includes Ollama's owned runner process tree. Stop earlier separately launched instances before using the managed command to avoid occupied ports.

For API source watching, use `bun run dev`; it also manages Ollama. The frontend Vite server remains a separate optional hot-reload terminal:

The API defaults to `http://127.0.0.1:3000`. In a separate terminal, run the frontend:

```powershell
bun run dev:web
```

Open `http://127.0.0.1:5173`. The Vite proxy forwards `/api` to port 3000 without a cross-origin browser request. If your API uses another port, set `API_PROXY_URL` in the frontend terminal first. For example: `$env:API_PROXY_URL = 'http://127.0.0.1:3001'`.

For compiled same-origin execution:

```powershell
bun run build
bun run start
```

The build includes self-hosted fonts and the React app in `apps/web/dist`; Fastify serves it at `/` when that directory exists. The local launcher loads `.env`; existing environment variables take precedence. Restart the stack after changing configuration. `bun run dev` watches server sources; rebuild shared packages after editing schemas/catalog. `bun run build:server` builds only shared packages and the API. `bun run start:api` starts only the compiled API when managing an inference runtime separately.

The portable runtime is Windows-specific and is not shipped with the repository. On another machine, supply a compatible local Ollama runtime or use Docker, which retains its own image-provided Ollama and persistent model disk. The combined local launcher and shutdown behavior require user-run verification; the relocation itself is complete.

## Checks

```powershell
bun run format:check
bun run typecheck
bun run test
bun run build
```

Format supported source files, configurations, tests, scripts, and Markdown with `bun run format`. Prettier uses two-space indentation, single quotes, and a 90-column code width. Use explicit blocks for control flow so review and debugging remain straightforward. Generated output, benchmark reports, environment files, and the dependency lockfile are excluded.

Tests use synthetic inference clients and `fake-indexeddb`; they never install a model or send personal information to a provider. Some integration tests start local fixture APIs and remove temporary reports or frontend fixture files afterward. These are user-run processes.

`bun run verify` runs format-check, type checks, tests, and the production build in order, stopping on failure. See [`docs/deployment.md`](docs/deployment.md) for Docker, model, browser, budget, and deployment gates. Code checks alone do not establish a verified public demo.

## Benchmark

With a real model and the API running:

```powershell
bun run benchmark --save-responses
```

This uses five synthetic scenarios, each tested against chat and recommendations. Reports go to ignored `benchmark-results/`. Responses are excluded unless `--save-responses` is specified; enabling it is useful for reviewing these synthetic fixtures. Do not replace fixtures with real users' conversations.

```powershell
bun run benchmark --url https://YOUR-SERVICE.onrender.com --concurrency 3 --save-responses
```

For repeated benchmarks, temporarily increase `RATE_LIMIT_MAX` on the benchmark deployment to avoid exhausting the default 20-generation-per-hour limit. Revert it before sharing publicly.

Use `--cases` to rerun specific synthetic scenarios:

```powershell
bun run benchmark --cases low-energy-accessibility,conflicting-preferences --save-responses
```

## API

| Endpoint                    | Purpose                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /health`               | API liveness; does not require a model                                                       |
| `GET /ready`                | Ollama reachable and configured model installed; reports whether currently loaded            |
| `GET /api/status`           | Model digest, model footprint, queue, runtime settings, and container memory where available |
| `POST /api/chat`            | Onboarding replies as newline-delimited JSON events                                          |
| `POST /api/preferences`     | Validated preference draft from user-supplied conversation; unstated choices stay null       |
| `POST /api/recommendations` | Validated three-hobby recommendations with timing metrics                                    |
| `POST /api/refresh`         | Validated new-cycle recommendations from profile/feedback, with optional retained favorite   |

Chat request:

```json
{
  "messages": [
    {
      "role": "user",
      "content": "I enjoy drawing and have ten minutes at home, with no budget."
    }
  ]
}
```

Chat events are `started`, `token`, and then `done` **or** `error`. HTTP 200 alone does not mean a streamed generation succeeded. Do not save partial responses as complete replies after a terminal error. Model roles/instructions are controlled by the server; clients may submit only user/assistant messages.

The opening turn uses `{ "messages": [], "opening": true, "questionIndex": 0 }`. Only an empty opening request is accepted; the server supplies the instruction. Subsequent onboarding questions use indices 1–4, and their output ends at the first question mark. Index 5 is rejected. No synthetic user message is saved/displayed. After the fifth answer the browser calls preference extraction and recommendations, rather than asking another question. Legacy unnumbered API requests remain supported for the benchmark.

All five topic-labeled answers are sent for extraction. Per-answer UTF-8/JSON limits keep them within the configured input budget instead of dropping earlier preferences. Unspecified/skipped scalar fields use documented defaults: 15 minutes, free, either setting, and either company preference. The successful profile and first cycle are committed in one IndexedDB transaction; failures/cancellation retain answers for retry. Defaults remain editable from the info menu.

Preference extraction uses the same `{ "messages": [...] }` request shape, but permits the last message to be from the assistant. Only user messages enter the extraction prompt. The result is `{ "profile": {...}, "metrics": {...} }`; unknown scalar preferences are `null`, and unknown lists are empty. Shape and known hobby exclusions are enforced; the person must review factual accuracy before confirmation.

The browser keeps the full bounded local history but sends only recent complete messages that fit the advertised input budget. It discloses omissions. Local profile confirmation is not a model request. Unfinished replies remain marked as interrupted and are not reused as inference context.

Recommendation request:

```json
{
  "profile": {
    "interests": ["drawing", "stories"],
    "constraints": ["No purchases"],
    "minutesPerSession": 10,
    "budget": "free",
    "environment": "indoor",
    "socialPreference": "solo"
  }
}
```

The response contains `recommendations` (three distinct catalog IDs, rationale, first activity, adaptation) and `metrics`. The API restricts catalog choices by free budget, environment, and optional `excludedHobbyIds`, and validates returned IDs against that eligibility set. Generated activity prose still needs review for appropriateness, available supplies, time, and accessibility. There is no automatic repair retry yet, to keep initial latency measurements comparable.

## Render

[`render.yaml`](render.yaml) describes one paid Docker service with a 2 GB persistent model disk, initially on the `1c-2g` compute tier. This file alone does not provision anything. Deployment, spending, commits, and pushes require separate approval.

The container is configured to build and serve the React PWA alongside the API and local-only Ollama, download the model if missing, and keep model files under `/var/data/models`. `/health` stays available during installation; `/ready` distinguishes model availability. This updated container configuration has not been built or tested. The offline worker is generated during production builds and registered only in production on a secure origin (or localhost).

Runtime images are version-pinned. Gemma 3 1B is pinned to the evaluated manifest digest in the shared model metadata, environment example, and Render configuration. Model status verification rejects a mismatched artifact before inference; the container supervisor checks it after installation. Changing the model requires a matching `MODEL_DIGEST`. Existing model files are reused instead of repulled on every restart.

Docker example (requires Docker installed and running):

```powershell
docker build -t hobbymaxx .
docker run --rm -p 3000:10000 -v hobbymaxx-models:/var/data hobbymaxx
```

The Ollama port is not published. Review costs before deploying. Paid instances bill while idle; credit is not a spending cap. Disk-backed services cannot horizontally scale or deploy with zero downtime.

## Privacy boundary

This demo is designed for hosted processing with local user history. The phase-one server has no conversation database and does not intentionally persist request content, model replies, or profiles. Operational logs contain allowlisted event names, request IDs, durations, and public error codes only. Upstream Ollama logs are suppressed in the container.

Messages still reach the server in plaintext after TLS termination. This is not on-device inference or end-to-end encrypted inference, and application controls are not a guarantee about all infrastructure behavior. Ollama may retain transient model caches in memory; a request-isolation test verifies supplied context, not secure memory erasure.

Only model files belong on the persistent disk, which Render snapshots. Browser IndexedDB stores onboarding, preferences, cycles, and attempts. Points derive from unique completed starters, not an editable total. Privacy controls can remove raw conversations, atomically replace history from a validated export, or clear all local records. Transactional generation checks reject stale tabs trying to restore pre-clear data; reload other tabs after clear/import. Unsupported/corrupt history is preserved rather than silently overwritten, and storage failures offer explicit session-only operation. No analytics, external inference provider, or accounts are included.

Production app-shell caching is limited to built static assets and the root HTML. `/api`, health/readiness, external URLs, and non-GET requests bypass the worker. Visit online once to prepare offline loading; saved cycles and activity logging then work offline. New model operations require internet. Downloaded exports can contain personal information and are unaffected by local deletion.

Rate limiting currently uses the immediate connection IP and does not trust forwarded headers. On Render this may conservatively group users behind the same proxy. Validate Render's trusted proxy topology before changing that setting; do not blindly trust arbitrary client-supplied forwarding headers.
