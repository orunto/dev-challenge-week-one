import { useEffect, useRef, useState } from 'react';
import type { ActivityLog, CycleDays, Profile, RefreshRequest } from '@hobbymaxx/shared';
import { hobbies } from '@hobbymaxx/hobby-catalog';
import { Button } from './components.js';
import { errorCopy, requestRecommendations, requestRefresh } from './api.js';
import {
  appendActivity,
  emptyLibrary,
  isDue,
  loadLibrary,
  makeCycle,
  points,
  saveActivity,
  saveNewCycle,
  type Library,
} from './library.js';
import { ActivityForm } from './ActivityForm.js';

export function Experiments({
  profile,
  days,
  sessionOnly,
  onBusy,
}: {
  profile: Profile;
  days: CycleDays;
  sessionOnly: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [retained, setRetained] = useState('');
  const [now, setNow] = useState(Date.now);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    onBusy(busy || logging);
    return () => onBusy(false);
  }, [busy, logging, onBusy]);
  useEffect(() => {
    let alive = true;
    if (sessionOnly) {
      setLoaded(true);
    } else {
      loadLibrary()
        .then((saved) => {
          if (alive) {
            setLibrary(saved);
            setLoaded(true);
          }
        })
        .catch(() => {
          if (alive) {
            setError(
              'Your hobby history could not be opened. Existing records have not been replaced. Reload or use the privacy recovery controls.',
            );
          }
        });
    }
    return () => {
      alive = false;
      controller.current?.abort();
    };
  }, [sessionOnly]);

  useEffect(() => {
    const refreshClock = () => setNow(Date.now());
    const timer = setInterval(refreshClock, 60000);
    document.addEventListener('visibilitychange', refreshClock);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshClock);
    };
  }, []);

  const cycle = library.cycles.find((item) => item.id === library.currentCycleId);

  async function generate() {
    if (controller.current || !loaded) {
      return;
    }
    if (!navigator.onLine) {
      setError('New experiments need internet. Saved experiments remain available.');
      return;
    }
    if (cycle && !isDue(cycle)) {
      setError(
        'Your current cycle is not due for refresh yet. Keep exploring at your own pace.',
      );
      return;
    }
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError('');
    setNotice('Finding hobbies…');
    let committing = false;
    try {
      let output;
      if (cycle) {
        const feedback = cycle.recommendations.flatMap((item) => {
          const latest = library.logs
            .filter((log) => log.cycleId === cycle.id && log.hobbyId === item.hobbyId)
            .at(-1);
          return latest
            ? [
                {
                  hobbyId: item.hobbyId,
                  enjoyment: latest.enjoyment,
                  difficulty: latest.difficulty,
                  reflection: latest.reflection.slice(0, 160),
                },
              ]
            : [];
        });
        const body: RefreshRequest = {
          profile,
          previousHobbyIds: cycle.recommendations.map((item) => item.hobbyId),
          ...(retained ? { retainedHobbyId: retained } : {}),
          feedback,
        };
        // Keep ratings if the conservative default budget cannot fit optional reflections.
        if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 1000) {
          body.feedback = feedback.map(({ hobbyId, enjoyment, difficulty }) => ({
            hobbyId,
            enjoyment,
            difficulty,
          }));
        }
        output = await requestRefresh(body, request.signal);
      } else {
        output = await requestRecommendations(profile, request.signal);
      }
      if (request.signal.aborted) {
        throw request.signal.reason;
      }
      const nextCycle = makeCycle(output, profile, days);
      committing = true;
      setSaving(true);
      const next = sessionOnly
        ? {
            ...library,
            cycles: [...library.cycles, nextCycle],
            currentCycleId: nextCycle.id,
          }
        : await saveNewCycle(nextCycle, library.currentCycleId);
      setLibrary(next);
      setRetained('');
      setSelected(null);
      setNotice(
        sessionOnly
          ? 'Ready for this session.'
          : 'Hobbies saved.',
      );
    } catch (cause) {
      setError(
        committing
          ? 'The new experiments could not be saved. Your previous cycle is unchanged.'
          : request.signal.aborted
            ? 'Generation cancelled. Your previous experiments are still here.'
            : errorCopy(cause),
      );
    } finally {
      controller.current = null;
      setBusy(false);
      setSaving(false);
    }
  }

  async function logActivity(log: ActivityLog) {
    setLogging(true);
    try {
      const before = points(library.logs);
      const next = sessionOnly ? appendActivity(library, log) : await saveActivity(log);
      setLibrary(next);
      const earned = points(next.logs) - before;
      setNotice(
        `${sessionOnly ? 'Recorded for this session.' : 'Attempt saved.'} ${earned > 0 ? `+${earned} points.` : ''}`,
      );
    } finally {
      setLogging(false);
    }
  }
  return (
    <section className="experiments" aria-labelledby="experiments-heading">
      <div className="experiments-heading">
        <div>
          <h1 id="experiments-heading" data-view-heading tabIndex={-1}>Your hobbies</h1>
          <p>
            {cycle
               ? `Refresh ${new Date(cycle.dueAt).toLocaleDateString()}`
               : 'Three things to try.'}
          </p>
        </div>
        {!cycle && (
          <Button disabled={busy || !loaded} onClick={() => void generate()}>
             Find hobbies
          </Button>
        )}
        {cycle && (
          <span className="reward-badge">
            {points(library.logs)} points · {library.logs.length} attempts
          </span>
        )}
        {busy && (
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => controller.current?.abort()}
          >
             {saving ? 'Saving…' : 'Stop'}
          </Button>
        )}
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <p role="status">{notice}</p>
      {cycle && isDue(cycle, now) && (
        <details className="refresh-panel">
          <summary>Refresh hobbies</summary>
          <label htmlFor="retain-hobby">Keep a favorite?</label>
          <select
            id="retain-hobby"
            value={retained}
            disabled={busy}
            onChange={(event) => setRetained(event.target.value)}
          >
            <option value="">Three new hobbies</option>
            {cycle.recommendations.map((item) => (
              <option key={item.hobbyId} value={item.hobbyId}>
                {hobbies.find((hobby) => hobby.id === item.hobbyId)?.name}
              </option>
            ))}
          </select>
          <Button disabled={busy || !isDue(cycle, now)} onClick={() => void generate()}>
            Refresh
          </Button>
        </details>
      )}
      {cycle && (
        <div className="experiment-grid">
          {cycle.recommendations.map((item) => {
            const hobby = hobbies.find((entry) => entry.id === item.hobbyId)!;
            const minutes = Math.min(hobby.minutes, cycle.profile.minutesPerSession);
            return (
              <article className="experiment" key={item.hobbyId}>
                <header>
                  <h3>{hobby.name}</h3>
                <span className="experiment-meta">
                  {minutes} min · {hobby.cost === 'free' ? 'Free' : 'Low cost'}
                </span>
                </header>
                <p>{item.reason}</p>
                <Button
                  variant="secondary"
                  aria-expanded={selected === hobby.id}
                  onClick={() => setSelected(selected === hobby.id ? null : hobby.id)}
                >
                  {selected === hobby.id ? 'Close' : 'Try this'}
                </Button>
                {selected === hobby.id && (
                  <div className="activity-detail">
                    <p>{item.firstActivity}</p>
                    <details><summary>Supplies & adaptations</summary>
                    <p>{item.adaptation}</p>
                    <p>{hobby.accessibleActivity}</p>
                    <ul>
                      {hobby.equipment.map((equipment) => (
                        <li key={equipment}>{equipment}</li>
                      ))}
                    </ul>
                    <p className="field__hint">{hobby.estimatedCost}</p>
                    </details>
                    <ActivityForm
                      key={`${cycle.id}/${hobby.id}`}
                      cycle={cycle}
                      hobby={hobby}
                      onSave={logActivity}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {library.cycles.length > 0 && (
        <details className="history">
          <summary>Activity history</summary>
          {[...library.cycles].reverse().map((past) => (
            <section key={past.id}>
              <h3>
                {new Date(past.startedAt).toLocaleDateString()} · {past.cycleDays}-day
                cycle{past.id === cycle?.id ? ' · current' : ''}
              </h3>
              <p>
                {past.recommendations
                  .map((item) => hobbies.find((hobby) => hobby.id === item.hobbyId)?.name)
                  .join(', ')}
              </p>
              <ul>
                {library.logs
                  .filter((log) => log.cycleId === past.id)
                  .map((log) => (
                    <li key={log.id}>
                      <strong>
                        {hobbies.find((hobby) => hobby.id === log.hobbyId)?.name}
                      </strong>{' '}
                      · {log.occurredOn} · enjoyment {log.enjoyment}/5 · difficulty{' '}
                      {log.difficulty}/5 ·{' '}
                      {log.completed ? 'starter completed' : 'attempt recorded'}
                      {log.reflection && <p>{log.reflection}</p>}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </details>
      )}
    </section>
  );
}
