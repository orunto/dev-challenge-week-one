import { useEffect, useRef, useState } from 'react';
import { Button } from './components.js';
import {
  deleteRawConversation,
  exportBackup,
  parseBackup,
  replaceLocalData,
  type Backup,
} from './privacy.js';
import type { Session } from './session.js';

export function PrivacyPanel({
  session,
  sessionOnly,
  onBegin,
  onChanged,
  onBack,
}: {
  session: Session;
  sessionOnly: boolean;
  onBegin: () => Promise<void>;
  onChanged: (session?: Session | null) => void;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [candidate, setCandidate] = useState<Backup | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const fileSelection = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  async function exportFile() {
    setBusy(true);
    setError('');
    try {
      const backup = await exportBackup();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `hobbymaxx-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        'Export created. It can contain personal conversations and reflections; keep it somewhere private.',
      );
    } catch {
      setError(
        'The local records could not be exported. Existing data has not been changed.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function replace(backup: Backup | null) {
    setBusy(true);
    setError('');
    try {
      await onBegin();
      const next = await replaceLocalData(backup);
      onChanged(next);
      setCandidate(null);
      setConfirmClear(false);
      setConfirmImport(false);
      setNotice(
        backup
          ? 'Import committed. Your local profile and history have been replaced.'
          : 'Local conversations, profiles, cycles, attempts, and points have been cleared. Downloaded exports are unaffected.',
      );
    } catch {
      onChanged();
      setError(
        'The change could not be committed. Your previous data has not been partially replaced.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function discardConversation() {
    setBusy(true);
    setError('');
    try {
      await onBegin();
      const next = await deleteRawConversation();
      onChanged(next);
      setNotice(
        'Raw conversation and the unsent answer were removed. Preferences, cycles, and activity history remain.',
      );
    } catch {
      onChanged();
      setError('The conversation could not be removed. No data was changed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="privacy-panel">
      <h1 ref={heading} tabIndex={-1}>
        Your history. Your choice.
      </h1>
      <p>
        Messages and profiles go to the server only for hosted model operations. History
        is saved on this browser; there is no account or device sync. Local storage is not
        on-device inference or end-to-end encryption.
      </p>
      {sessionOnly && (
        <p className="connection-banner">
          You are using session-only mode. Export/import controls operate on persisted
          browser records, not this unsaved session.
        </p>
      )}
      {error && (
        <p className="error-banner" role="alert">
          Error: {error}
        </p>
      )}
      <p role="status">{notice}</p>
      <section>
        <h2>Keep a copy</h2>
        <p>
          Exports may contain personal messages, constraints, and reflections. Download
          only to a location you trust.
        </p>
        <Button disabled={busy || sessionOnly} onClick={() => void exportFile()}>
          Export local history
        </Button>
      </section>
      <section>
        <h2>Restore an export</h2>
        <p>
          A validated import replaces the current local profile, conversations, cycles,
          and attempts. Export first if you want to keep the current history.
        </p>
        <label htmlFor="history-import">Choose a HobbyMaxx JSON export</label>
        <input
          id="history-import"
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            const selection = ++fileSelection.current;
            setCandidate(null);
            setConfirmImport(false);
            setError('');
            if (!file) {
              return;
            }
            if (file.size > 5 * 1024 * 1024) {
              setError('Choose an export smaller than 5 MB.');
              return;
            }
            void file
              .text()
              .then((text) => {
                const backup = parseBackup(text);
                if (selection === fileSelection.current) {
                  setCandidate(backup);
                }
              })
              .catch(() => {
                if (selection === fileSelection.current) {
                  setError(
                    'This export is unsupported or contains invalid records. No local data was changed.',
                  );
                }
              });
          }}
        />
        {candidate && (
          <>
            <p>
              Validated: {candidate.library.cycles.length} cycles and{' '}
              {candidate.library.logs.length} attempts.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={confirmImport}
                disabled={busy}
                onChange={(event) => setConfirmImport(event.target.checked)}
              />
              <span>I understand this replaces my current local history.</span>
            </label>
            <Button
              disabled={busy || !confirmImport}
              onClick={() => void replace(candidate)}
            >
              Replace history with this export
            </Button>
          </>
        )}
      </section>
      <section>
        <h2>Remove a conversation</h2>
        <p>
          Delete raw messages and the unsent answer while keeping preferences, cycles, and
          activity history.
        </p>
        <Button
          variant="secondary"
          disabled={
            busy || sessionOnly || (!session.messages.length && !session.composer)
          }
          onClick={() => void discardConversation()}
        >
          Delete raw conversation
        </Button>
      </section>
      <section>
        <h2>Clear this browser</h2>
        <p>
          This deletes all HobbyMaxx profiles, conversations, cycles, attempts, and
          derived points from this browser. It cannot delete copies you previously
          exported or data on another device.
        </p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={confirmClear}
            disabled={busy}
            onChange={(event) => setConfirmClear(event.target.checked)}
          />
          <span>I understand this clears all local HobbyMaxx history.</span>
        </label>
        <Button
          variant="secondary"
          disabled={busy || !confirmClear}
          onClick={() => void replace(null)}
        >
          Clear all local data
        </Button>
      </section>
      <Button variant="quiet" disabled={busy} onClick={onBack}>
        Back to HobbyMaxx
      </Button>
    </section>
  );
}
