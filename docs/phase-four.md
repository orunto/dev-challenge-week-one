# Phase four — attempts, points, and refresh

Source is implemented; user-run tests, browser checks, and real-model review remain pending.

Attempts record a stable submission UUID, cycle/hobby/activity references, local attempt date, recorded timestamp/calendar date, completion flag, enjoyment/difficulty from 1–5, and an optional 500-character reflection. The IndexedDB read/modify/write is atomic. Resubmitting the same UUID is idempotent; a genuinely new attempt gets a new UUID.

Points are derived from completed `(cycleId, activityId)` pairs: 10 points once per starter per cycle. Further attempts remain in history without inflating points. No editable total is stored or imported.

Cycle due times use elapsed UTC days. Local start/recording calendar dates are preserved for validation even if the device later changes timezone; legacy records without calendar dates fall back to UTC dates. A cycle refresh becomes available at the exact due instant. Opening the app, returning to the tab, and a once-per-minute timer update the visible due state; the click handler checks the boundary again.

Refresh is explicit. `/api/refresh` receives current confirmed preferences, the previous three hobby IDs, an optional favorite, and the latest feedback per hobby. The prompt adapts new suggestions to ratings/reflections. Previous hobbies are excluded unless the person explicitly retains one; returned output must contain that favorite and obey catalog eligibility. Failed refreshes never replace the current cycle. The save checks that another tab has not already changed the active cycle.

To stay within the small default request budget, reflections are capped at 160 characters and omitted if they would exceed 1,000 bytes; ratings remain. Full notes stay in local history. If preferences/ratings alone exceed the server limit, the request fails visibly rather than silently dropping constraints. No automatic repair/retry generation loop is enabled.

The loaded app permits offline attempt logging. App-shell offline loading is a phase-five concern. The history section includes previous cycles and all attempts/reflections.

User checks: `bun run format`, `bun run typecheck`, `bun run test`, `bun run build`; then verify repeated completions, duplicate network/UI submissions, 7/14-day and timezone boundaries, offline saving, model failures, missing/invalid favorites, queue saturation, two-tab refresh conflicts, reloads, and real-Gemma feedback adherence. These checks have not been executed by the agent.
