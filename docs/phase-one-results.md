# Phase-one evaluation results

## Scope and status

Two real-model baseline runs completed on a local Windows CPU. These results establish that Gemma runs through the application API; they do not establish Render performance or a passed recommendation-quality gate.

After reviewing the baseline, constraint handling and model pinning were improved. The targeted post-change benchmark was interrupted. Its results, the new regression tests, final formatting/type checks, Docker execution, and Render testing are still pending user-run verification.

The user will run all further processes. Do not launch commands, tests, downloads, servers, containers, or deployments automatically.

## Evaluated model and machine

- Model: `gemma3:1b`, approximately 999.89M parameters, `Q4_K_M` quantization.
- Manifest digest: `97558784bdc9175075a72655bf360b15da17df6b3b9e5182af9f8c0c8e58ba7c`.
- Model package: 806,067,407 bytes.
- Runtime: portable Ollama `0.40.2`, CPU-only files extracted into the approved temporary directory. No system-wide installation was performed.
- CPU: Intel Core i7-10610U, four physical cores / eight logical processors.
- System memory: approximately 16 GB.
- Inference configuration: one CPU thread, 4,096-token context, 512-token output limit.
- Application queue: one active generation, up to three waiting requests, 30-second queue timeout, 120-second inference timeout.
- Benchmark rate limit: temporarily raised to 1,000 requests/hour for local evaluation; deployment default remains 20.
- Ollama URL: `http://127.0.0.1:11435`; application URL: `http://127.0.0.1:3001`.

The runtime was obtained via HTTPS release-asset byte ranges and verified against each extracted ZIP entry's CRC. The full archive SHA256 was not computed because GPU files were not downloaded. The model manifest digest is independently enforced by application code.

## Completed baseline runs

Raw reports contain synthetic fixtures only and are ignored by Git:

- Sequential: `benchmark-results/2026-10-09T23-24-44-556Z.json`.
- Three clients: `benchmark-results/2026-10-09T23-27-48-967Z.json`.

### Sequential run

| Measurement | Observed result |
| --- | --- |
| Transport/schema success | 10 of 10 requests |
| Chat completion | Approximately 9.5–13.7 seconds |
| Warm first visible chat content | Approximately 6.0–7.0 seconds |
| First cold chat content | Approximately 9.0 seconds |
| First request's model loading | Approximately 2.9 seconds |
| Recommendation completion | Approximately 51.0–69.1 seconds |
| Generated tokens/second | Approximately 4.93–6.95 across the run |
| Overall successful-request p50 / p95 | Approximately 13.7 / 69.1 seconds |

### Three-client run

| Measurement | Observed result |
| --- | --- |
| Completed requests | 3 of 10 |
| Queue timeouts | 7 of 10, at approximately 30 seconds |
| Successful chat completion | Approximately 11.1 seconds |
| Successful recommendation completion, including queue | Approximately 91.9 and 93.2 seconds |
| Queue state at end | Zero active, zero waiting |

The queue recovered correctly, but the default timeout is poorly matched to slow recommendations when several users arrive together. Increasing the timeout alone would make users wait longer, not improve throughput. A public concurrent-user claim requires testing shorter outputs, prompt/runtime changes, or more CPU capacity on the actual deployment.

### Memory evidence

Ollama reported a loaded model footprint of **880,541,695 bytes**. Node RSS was approximately **83–84 MB** after the runs. Neither number is the total peak application-plus-model working set.

Linux container current/peak memory fields were unavailable on Windows. Do not add these values together and claim a verified 2 GB deployment fit. Container memory headroom still needs measurement.

## Recommendation review

The baseline passed transport and schema checks but did not pass every quality criterion:

- Free/short-session suggestions were generally usable in the sequential run.
- The low-energy case recommended plant care with the possibility of buying a cutting despite a free budget, and did not consistently specify five-minute seated adaptations.
- A concurrent indoor-only response described observing birds in a yard or park.
- The phone-and-scrap-paper case assumed a pencil and included an incoherent adaptation about using scrap paper to take photographs.
- Solo preferences were generally respected.
- The disliked-origami baseline avoided origami, but this was prompt-based rather than enforced by a structured exclusion.

## Code changes after evaluation

- Filter eligible catalog IDs by free budget, environment, and explicit `excludedHobbyIds`.
- Restrict the model's structured-output enum to those eligible IDs.
- Validate returned IDs against that same eligibility set.
- Ask for shorter explanations, explicit session times, available supplies, indoor execution, and seated adaptations.
- Record and enforce the evaluated model digest before inference and after container model installation.
- Add regression tests for disallowed recommendations and mismatched model artifacts.
- Add `--cases` to the benchmark CLI for bounded targeted reruns.
- Match the upstream Ollama executable/library layout in the Docker image (`/usr/bin/ollama`, `/usr/lib/ollama`).

Catalog eligibility is enforceable; generated natural-language activity instructions still need review. A hobby marked `either` can still be described incorrectly by a model, so the eligibility filter alone is not proof that indoor or accessibility constraints are fully satisfied.

## Model/tier decision

Gemma 3 1B is pinned as the evaluated candidate. The one-thread baseline supports further development of a slow, single-user demo, but it misses the proposed warm-latency targets and performs poorly with three clients.

The Render `1c-2g` service remains a budget-first test candidate, not a verified final tier. If the updated model path still exceeds the desired latency or memory headroom, compare the `2c-4g` tier before sharing the demo widely. Do not infer Render results from this laptop.

## User-run handoff

First run the code checks:

```powershell
bun run format
bun run format:check
bun run typecheck
bun run test
```

Restart the API so the current source/build is used. If reusing the portable runtime on port 11435:

```powershell
$env:OLLAMA_URL = 'http://127.0.0.1:11435'
$env:PORT = '3001'
$env:RATE_LIMIT_MAX = '1000'
bun run dev
```

In another terminal, rerun the affected cases:

```powershell
bun run benchmark --url http://127.0.0.1:3001 --cases low-energy-accessibility,conflicting-preferences --save-responses
```

Inspect those synthetic responses before marking the quality gate complete. If successful, run the full sequential and three-client benchmarks against the final code, then verify Docker and the actual Render tier. Save results with the model digest and settings, and revert the public rate limit after benchmarking.

The previously started API and portable Ollama processes may still be running. Manage or stop them yourself before launching replacements; avoid binding a second server to an occupied port.
