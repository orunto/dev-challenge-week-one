import { useRef, useState } from 'react';
import { activityLogSchema, type ActivityLog, type Cycle } from '@hobbymaxx/shared';
import type { Hobby } from '@hobbymaxx/hobby-catalog';
import { Button, Field } from './components.js';
import { localDay } from './library.js';

export function ActivityForm({
  cycle,
  hobby,
  onSave,
}: {
  cycle: Cycle;
  hobby: Hobby;
  onSave: (log: ActivityLog) => Promise<void>;
}) {
  const [date, setDate] = useState(localDay());
  const [completed, setCompleted] = useState(true);
  const [enjoyment, setEnjoyment] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [reflection, setReflection] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submission = useRef(crypto.randomUUID());
  const saving = useRef(false);
  async function submit() {
    if (saving.current) {
      return;
    }
    const result = activityLogSchema.safeParse({
      id: submission.current,
      cycleId: cycle.id,
      hobbyId: hobby.id,
      activityId: hobby.activityId,
      occurredOn: date,
      recordedAt: new Date().toISOString(),
      recordedOn: localDay(),
      completed,
      enjoyment: Number(enjoyment),
      difficulty: Number(difficulty),
      reflection,
    });
    if (
      !result.success ||
      date < (cycle.startedOn ?? cycle.startedAt.slice(0, 10)) ||
      date > localDay()
    ) {
      setError(
        'Choose an attempt date during this cycle and not in the future, and rate enjoyment and difficulty.',
      );
      return;
    }
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await onSave(result.data);
      submission.current = crypto.randomUUID();
      setReflection('');
    } catch {
      setError(
        'Your attempt was not saved. Try again; retrying this submission will not duplicate it.',
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const prefix = `${cycle.id}-${hobby.id}`;
  return (
    <form
      className="activity-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h4>How did it go?</h4>
      <p className="field__hint">
        A completed starter earns 10 points once per hobby per cycle. Further attempts
        still count as exploration.
      </p>
      {error && (
        <p role="alert" className="error-banner">
          Error: {error}
        </p>
      )}
      <Field id={`${prefix}-date`} label="Attempt date">
        <input
          id={`${prefix}-date`}
          type="date"
          min={cycle.startedOn ?? cycle.startedAt.slice(0, 10)}
          max={localDay()}
          value={date}
          disabled={busy}
          onChange={(event) => setDate(event.target.value)}
        />
      </Field>
      <Field id={`${prefix}-enjoyment`} label="Enjoyment">
        <select
          id={`${prefix}-enjoyment`}
          value={enjoyment}
          disabled={busy}
          onChange={(event) => setEnjoyment(event.target.value)}
        >
          <option value="">Choose a rating</option>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value} ·{' '}
              {value === 1 ? 'Not for me' : value === 5 ? 'Loved it' : 'In between'}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`${prefix}-difficulty`} label="Difficulty">
        <select
          id={`${prefix}-difficulty`}
          value={difficulty}
          disabled={busy}
          onChange={(event) => setDifficulty(event.target.value)}
        >
          <option value="">Choose a rating</option>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value} ·{' '}
              {value === 1 ? 'Easy' : value === 5 ? 'Very difficult' : 'In between'}
            </option>
          ))}
        </select>
      </Field>
      <Field
        id={`${prefix}-reflection`}
        label="Anything to remember?"
        hint="Optional, up to 500 characters."
      >
        <textarea
          id={`${prefix}-reflection`}
          rows={3}
          maxLength={500}
          value={reflection}
          disabled={busy}
          onChange={(event) => setReflection(event.target.value)}
        />
      </Field>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={completed}
          disabled={busy}
          onChange={(event) => setCompleted(event.target.checked)}
        />
        <span>I completed the starter activity.</span>
      </label>
      <Button type="submit" disabled={busy}>
        {busy ? 'Saving attempt…' : 'Save my attempt'}
      </Button>
    </form>
  );
}
