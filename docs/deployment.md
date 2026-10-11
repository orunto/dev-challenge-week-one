# Deployment and final verification

## Status and permissions

All core implementation milestones are written. Local checks, real-model quality/performance review, Docker execution, Render proxy/memory testing, credit/pricing confirmation, and public deployment remain pending.

The agent is authorized to run Git commands and individually approved commits only. You run every install, formatter, test, build, server, benchmark, and container. No remote push or paid deployment is authorized by the build request alone. This file does not claim a deployed or verified demo.

## Local release checks

Use Bun 1.3.0 and Node 22.12+ (the Docker runtime is pinned to Node 24.18.0):

```powershell
bun install --frozen-lockfile
bun run format
bun run verify
```

`verify` runs format-check, type checks, synthetic tests, and the production build in sequence, stopping at the first failure. Tests exercise local fixture servers; they do not install or use a real model. Share complete failing output so defects can be fixed in a separately approved commit.

Run the built same-origin app with `bun run start`. With the portable Ollama runtime, configure its actual URL first. Confirm the root HTML, hashed assets, locally hosted fonts, manifest, and worker load. The production CSP permits only same-origin scripts/fonts/workers/connections; it must be browser-checked along with export downloads, offline install, and updates.

## Docker candidate

```powershell
docker build -t hobbymaxx .
docker run --name hobbymaxx-check --rm -p 3000:10000 -v hobbymaxx-models:/var/data hobbymaxx
```

In another terminal:

```powershell
Invoke-RestMethod 'http://127.0.0.1:3000/health'
Invoke-RestMethod 'http://127.0.0.1:3000/ready'
Invoke-RestMethod 'http://127.0.0.1:3000/api/status'
```

The supervisor starts Fastify and local-only Ollama together. Liveness remains independent of installation; readiness requires the pinned model digest. A missing model is pulled once into `/var/data/models`; existing matching model files are reused. Upstream logs are suppressed. Shutdown signals terminate both processes and impose a bounded forced-stop fallback.

Check actual startup, download failure, digest mismatch, restart/model reuse, SIGTERM handling, memory headroom, and disk contents. Do not expose port 11434 publicly. Stop the test container with `docker stop hobbymaxx-check` before starting a replacement.

## Model and capacity gates

Run the targeted post-change quality cases first, then a full sequential and three-client benchmark:

```powershell
bun run benchmark --url http://127.0.0.1:3000 --cases low-energy-accessibility,conflicting-preferences --save-responses
bun run benchmark --url http://127.0.0.1:3000 --save-responses
bun run benchmark --url http://127.0.0.1:3000 --concurrency 3 --save-responses
```

Temporarily raise the benchmark deployment's generation allowance; restore it before public sharing. Only synthetic fixtures should be saved. These benchmarks cover the existing chat/recommendation scenarios; extraction and feedback refresh also need a real-model browser walkthrough.

Earlier laptop results showed 51–69-second recommendations and seven queue timeouts out of ten three-client requests. The Render `1c-2g` tier is a candidate, not a verified capacity choice. Measure actual deployed latency, queue behavior, total/peak container memory, and quality before accepting it; review a larger tier only with spending approval.

## Render approval and budget

Before deployment, confirm in your Render account:

- The intended team/project and Git repository/branch.
- Current compute and persistent-disk prices, actual credit balance, eligibility/expiry, and billing behavior.
- A projected spend that preserves at least $10 of the original $50 credit for judging and unexpected usage.
- A clear service-stop/delete procedure; credit is not a hard spending cap and idle paid services still incur charges.

The old approximately $25.50/month estimate for compute plus a 2 GB disk is historical planning evidence, not a current price confirmation. No account/billing state has been inspected by the agent.

`render.yaml` disables automatic deployment and pins the model/configuration. A Blueprint still creates paid resources when applied; obtain explicit permission before applying it. Request separate permission before pushing the approved commits. Keep `trustProxy: false` until the actual Render proxy topology is verified; current per-IP limits may group users behind the platform proxy.

## Release walkthrough

Record pass/fail and evidence for:

1. Privacy explanation → real Gemma conversation → extracted draft → corrected/confirmed profile.
2. Three distinct usable experiments, correct supplies/time/budget/accessibility, and reload persistence.
3. Completion/attempt logging, once-only 10-point rewards, repeat submissions, and historical records.
4. Seven/fourteen-day boundaries, retained favorites, feedback adherence, failed refresh preservation, and two-tab conflicts.
5. Offline cold load after installation, viewing/logging without network, online-only AI actions, and worker updates.
6. Valid/invalid exports/imports, quota/corrupt storage, atomic replacement, raw-conversation deletion, clear-all, and stale tabs.
7. Queue saturation, cancellation/disconnects, output truncation/malformed JSON, unavailable/mismatched model, and rate limits.
8. Network/log/model-disk inspection for personal data retention and inference caching.
9. Mobile/desktop, 320px width, 200% zoom, keyboard/mobile keyboard, screen readers, focus/contrast, long text, and reduced motion.
10. Restart/persistent model reuse, health versus readiness, proxy behavior, total memory, cost/runway, and shutdown.

Synthetic test success is not a quality, privacy-in-operation, accessibility, or Render-performance pass. Keep the plan's verification boxes open until actual evidence exists.

## Challenge explanation foundation

Gemma is essential to onboarding interpretation, preference extraction, hobby selection, rationales/adaptations, and feedback-informed refreshes. The catalog grounds IDs and practical metadata; it does not replace inference with a static recommendation carousel. Open weights allow the project to pin an inspectable model artifact, control prompts/runtime limits, self-host inference, and evaluate or replace the model independently of a closed inference API. Describe hosted processing accurately and disclose that local history does not mean on-device or end-to-end encrypted inference.

Add actual deployment URL, final model/tier results, screenshots, and measured limitations only after verification. No submission or publication has been performed.
