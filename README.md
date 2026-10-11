# HobbyMaxx

An open-weight Gemma-powered hobby discovery app. Tell the agent about yourself, try three personalized hobby experiments, log attempts, earn points, and refresh recommendations every 7 or 14 days.

## Current status: phase two source implemented; verification pending

Implemented: TypeScript workspace, Fastify API, Ollama streaming adapter, grounded structured recommendations, bounded queue, cancellation/timeouts, privacy-safe operational logging, a synthetic benchmark runner, automated tests, and Render container configuration.

Phase two adds a React/Vite welcome, conversation, editable preference review, and confirmed-profile flow; IndexedDB local history/resume; a separate validated Gemma preference-extraction operation; and same-origin frontend serving. These changes have not been installed, built, tested, or visually reviewed yet. See [`docs/phase-two.md`](docs/phase-two.md).

Hobby experiments, activity logging, points, active cycles, and PWA/offline app-shell caching remain later milestones. The full roadmap is in [`plan.md`](plan.md), and the approved UI specification is in [`design.md`](design.md).

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

Create `.env` using the values in `.env.example`. With Ollama installed, start `ollama serve` if it is not already running, then:

```powershell
ollama pull gemma3:1b
bun run dev
```

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

The build includes self-hosted fonts and the React app in `apps/web/dist`; Fastify serves it at `/` when that directory exists. `.env` is loaded automatically by the API; existing environment variables take precedence. Restart the API after changing configuration. `bun run dev` watches server sources; rebuild shared packages after editing their schemas/catalog. `bun run build:server` builds only shared packages and the API.

## Checks

```powershell
bun run format:check
bun run typecheck
bun run test
```

Format supported source files, configurations, tests, scripts, and Markdown with `bun run format`. Prettier uses two-space indentation, single quotes, and a 90-column code width. Use explicit blocks for control flow so review and debugging remain straightforward. Generated output, benchmark reports, environment files, and the dependency lockfile are excluded.

Tests use synthetic inference clients and `fake-indexeddb`; they never install a model or send personal information to a provider. Some integration tests start local fixture APIs and remove temporary reports or frontend fixture files afterward. These are user-run processes.

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
| `POST /api/preferences`     | Validated preference draft from user-supplied conversation; unstated choices stay null        |
| `POST /api/recommendations` | Validated three-hobby recommendations with timing metrics                                    |

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

The container is configured to build and serve the React frontend alongside the API and local-only Ollama, download the model if missing, and keep model files under `/var/data/models`. `/health` stays available during installation; `/ready` distinguishes model availability. This updated container configuration has not been built or tested. The frontend does not yet have a service worker or installation metadata.

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

Only model files belong on the persistent disk, which Render snapshots. The browser now stores onboarding messages, the unsent answer, preference edits, the confirmed profile, and cycle-length choice in a versioned IndexedDB record. Confirmation can discard raw messages and the unsent answer. Unsupported/corrupt history is preserved rather than silently overwritten; storage failures offer explicit session-only operation. No analytics, external inference provider, or accounts are included.

Rate limiting currently uses the immediate connection IP and does not trust forwarded headers. On Render this may conservatively group users behind the same proxy. Validate Render's trusted proxy topology before changing that setting; do not blindly trust arbitrary client-supplied forwarding headers.
