import { useEffect, useRef, useState } from 'react';
import type { CycleDays, Profile } from '@hobbymaxx/shared';
import { hobbies } from '@hobbymaxx/hobby-catalog';
import { Button } from './components.js';
import { errorCopy, requestRecommendations } from './api.js';
import { emptyLibrary, loadLibrary, makeCycle, saveNewCycle, type Library } from './library.js';

export function Experiments({ profile, days, sessionOnly }: { profile: Profile; days: CycleDays; sessionOnly: boolean }) {
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    let alive = true;
    if (sessionOnly) {
      setLoaded(true);
    } else {
      loadLibrary().then((saved) => {
        if (alive) {
          setLibrary(saved);
          setLoaded(true);
        }
      }).catch(() => {
        if (alive) {
          setError('Your hobby history could not be opened. Existing records have not been replaced. Reload or use the privacy recovery controls.');
        }
      });
    }
    return () => {
      alive = false;
      controller.current?.abort();
    };
  }, [sessionOnly]);

  async function generate() {
    if (controller.current || !loaded) {
      return;
    }
    if (!navigator.onLine) {
      setError('New experiments need internet. Saved experiments remain available.');
      return;
    }
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError('');
    setNotice('Gemma is finding three experiments. This can take a minute or more.');
    let committing = false;
    try {
      const output = await requestRecommendations(profile, request.signal);
      if (request.signal.aborted) {
        throw request.signal.reason;
      }
      const cycle = makeCycle(output, profile, days);
      committing = true;
      setSaving(true);
      const next = sessionOnly
        ? { ...library, cycles: [...library.cycles, cycle], currentCycleId: cycle.id }
        : await saveNewCycle(cycle);
      setLibrary(next);
      setNotice(sessionOnly ? 'Your experiments are ready for this session only.' : 'Your experiments are saved on this browser.');
    } catch (cause) {
      setError(committing ? 'The new experiments could not be saved. Your previous cycle is unchanged.' : request.signal.aborted ? 'Generation cancelled. Your previous experiments are still here.' : errorCopy(cause));
    } finally {
      controller.current = null;
      setBusy(false);
      setSaving(false);
    }
  }

  const cycle = library.cycles.find((item) => item.id === library.currentCycleId);
  return (
    <section className="experiments" aria-labelledby="experiments-heading">
      <div className="experiments-heading">
        <div><h2 id="experiments-heading">A few things to try.</h2><p>{cycle ? `Your ${cycle.cycleDays}-day experiment · next refresh ${new Date(cycle.dueAt).toLocaleDateString()}` : 'Gemma will choose three distinct hobbies from the grounded catalog using your confirmed preferences.'}</p></div>
        {!cycle && <Button disabled={busy || !loaded} onClick={() => void generate()}>Find my hobbies</Button>}
        {busy && <Button variant="secondary" disabled={saving} onClick={() => controller.current?.abort()}>{saving ? 'Saving experiments…' : 'Cancel generation'}</Button>}
      </div>
      {error && <p className="error-banner" role="alert">Error: {error}</p>}
      <p role="status">{notice}</p>
      {cycle && <div className="experiment-grid">{cycle.recommendations.map((item) => {
        const hobby = hobbies.find((entry) => entry.id === item.hobbyId)!;
        const minutes = Math.min(hobby.minutes, cycle.profile.minutesPerSession);
        return <article className="experiment" key={item.hobbyId}>
          <span className="experiment-meta">Up to {minutes} min · {hobby.cost === 'free' ? 'No purchases' : 'Low cost'}</span>
          <h3>{hobby.name}</h3><p>{item.reason}</p>
          <Button variant="secondary" aria-expanded={selected === hobby.id} onClick={() => setSelected(selected === hobby.id ? null : hobby.id)}>{selected === hobby.id ? 'Close activity' : 'Open first activity'}</Button>
          {selected === hobby.id && <div className="activity-detail"><h4>Your first experiment</h4><p>{item.firstActivity}</p><h4>Make it work for you</h4><p>{item.adaptation}</p><p>{hobby.accessibleActivity}</p><h4>What you’ll need</h4><ul>{hobby.equipment.map((equipment) => <li key={equipment}>{equipment}</li>)}</ul><p className="field__hint">{hobby.estimatedCost}. Check the activity before trying it; skip anything unsuitable.</p></div>}
        </article>;
      })}</div>}
    </section>
  );
}
