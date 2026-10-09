# Phase one: hosted Gemma feasibility gate

## Goal

Establish whether self-hosted Gemma can deliver useful HobbyMaxx recommendations within the $50 Render demo budget. Keep the model central, test on real infrastructure, and do not substitute mocked responses for AI functionality.

## Implemented foundation

- Shared Zod schemas and a small curated grounding catalog.
- Streaming onboarding chat and structured recommendation generation.
- One active generation across both routes; bounded waiting queue and timeout.
- Cancellation on disconnect, output/input limits, and content-free application logs.
- Automated integration tests plus a synthetic benchmark CLI.
- Linux container supervisor and paid Render configuration.

## Remaining gate

Portable Ollama setup and two real-model baseline benchmarks are complete. The model digest is now enforced, and baseline findings led to constraint-handling changes. Evidence and limitations are in [`phase-one-results.md`](phase-one-results.md).

All remaining processes are user-run:

1. Run formatting, type checks, and the new regression tests after the latest edits.
2. Complete the interrupted targeted recommendation-quality rerun.
3. Review every updated response against its case-specific rubric. The CLI's PASS is transport/schema success, not a quality grade.
4. If that review passes, repeat full sequential/three-client measurements on the final code.
5. Build/test the Docker image on a Docker-capable machine and measure total container memory.
6. Evaluate the actual Render tier with approved spending, record costs, and decide whether it meets the demo's latency/concurrency requirements.

## Scenarios

| Scenario                 | Review focus                                                      |
| ------------------------ | ----------------------------------------------------------------- |
| Free, short sessions     | No required purchases; manageable indoor first steps              |
| Low energy/accessibility | Concrete seated adaptations; no diagnosis or inaccessible demands |
| Social discomfort        | Respect solo preferences without judgment or pressure to disclose |
| Conflicting preferences  | Current constraints take priority over general interests          |
| Disliked activity        | Adapt recommendations instead of repeating the rejected hobby     |

Also manually test multi-turn onboarding and languages relevant to the target audience. A small English fixture set does not establish multilingual quality.

## Measurements and interpretation

- **Network first token:** client-observed first visible chat content, including queue/network time.
- **Model first token:** time from the Ollama call to its first text chunk; excludes app queue time.
- **Queue time:** time waiting for the app's single generation slot.
- **Inference time:** entire upstream streaming request, including model loading.
- **Output tokens/second:** Ollama-reported generated tokens divided by generation duration.
- **Model bytes:** Ollama's reported loaded model footprint, not total service memory.
- **Container current/peak:** Linux cgroup memory for all container processes where available. Peak is container-lifetime peak, not a per-request measurement. Restart for clean tier/model comparisons.
- **Node RSS:** API process memory only; never label it total Gemma memory.

The first generation may load a cold model. Subsequent calls keep it resident. Separate cold-start results from warm ones when comparing tiers. Missing metrics should be treated as unavailable, not zero-memory usage.

## Proposed acceptance targets (not measured claims)

- All five synthetic profiles yield distinct, valid, useful hobby experiments after human review.
- No violated explicit budget/accessibility constraint in the reviewed set.
- Warm first visible chat response within approximately 5 seconds and typical completion within 30 seconds, or an explicitly accepted slower demo experience.
- Stay below approximately 80% of service RAM under the three-client test, leaving operating headroom.
- Queued, saturated, cancelled, and timed-out requests have understandable terminal outcomes; no stalled queue or mixed conversation context.

If 1B passes quality but fails speed/memory, test the 2 CPU / 4 GB tier. If 1B fails quality, briefly compare a larger Gemma on a suitably sized service. More RAM alone does not establish faster CPU inference.

## Runtime limits

Defaults: 4,096-token context, 512 output tokens, one CPU thread, 1,000 UTF-8 bytes of submitted user data, three waiting requests, 30-second queue timeout, 120-second generation timeout, 20 generation requests/hour per connection IP.

The context guard uses a conservative UTF-8-byte upper bound plus template allowance. It includes system/catalog text and reserves output space; long messages are rejected rather than silently trimmed. Exact model token counting and conversation summarization are future improvements. Lowering context can reject structured recommendation requests because the grounding catalog also occupies context.

JSON Schema guides the model, but Zod/catalog validation remains authoritative. Duplicated/unknown hobby IDs, malformed output, truncated streams, and token-limit completion are rejected. The API does not persist previous cycles, so preservation on a failed refresh is a responsibility for the upcoming local-data/UI phase.

Free-budget, environment, and explicit excluded-hobby eligibility now constrain both the supplied catalog and the structured-output IDs. These controls do not guarantee that generated activity prose respects every constraint; quality review remains required. Changing models requires updating `OLLAMA_MODEL` and the matching `MODEL_DIGEST` together.

## Budget

At the pricing checked during planning: 1 CPU / 2 GB compute $25/month; 2 GB disk $0.50/month. Approximate total $25.50/month before overages. One day is about $0.85 on a 30-day-month estimate. Prices, credit eligibility, and expiry must be checked in the actual Render workspace before deployment. Reserve at least $10 for judging and unexpected usage.

## Next milestone

After this gate, scaffold React/Vite, extract `design.md` tokens, implement private onboarding/profile review, and connect the real streaming API. Add versioned IndexedDB history, then activity logging, points, cycles, and offline PWA behavior.

## References

- [Render pricing](https://render.com/pricing)
- [Render disk limitations and snapshots](https://render.com/docs/disks)
- [Ollama chat API](https://docs.ollama.com/api/chat)
- [Ollama running-model metrics](https://docs.ollama.com/api/ps)
- [Gemma 3 1B model package](https://ollama.com/library/gemma3:1b)
- [Community case study: small-model context and output validation](https://dev.to/shyamala_u/my-commit-message-said-youve-hit-your-session-limit-2abn)
