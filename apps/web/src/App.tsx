import { useEffect, useRef, useState } from 'react';
import type { CycleDays } from '@hobbymaxx/shared';
import { hobbies } from '@hobbymaxx/hobby-catalog';
import { BrandMark, Button, Field, Icon } from './components.js';
import type { ReviewForm } from './session.js';
import { useOnboarding } from './useOnboarding.js';
import { Experiments } from './Experiments.js';
import { PrivacyPanel } from './PrivacyPanel.js';

type Onboarding = ReturnType<typeof useOnboarding>;

export function App() {
  const onboarding = useOnboarding();
  const { session, loaded, busy, storage } = onboarding;
  const [infoOpen, setInfoOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [productBusy, setProductBusy] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [offlineFailed, setOfflineFailed] = useState(false);
  const [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);
  const app = useRef<HTMLDivElement>(null);
  const view = privacyOpen ? 'privacy' : session.screen;

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }
    const resize = () => {
      if (app.current) {
        app.current.style.height = `${Math.round(viewport.height)}px`;
      }
    };
    resize();
    viewport.addEventListener('resize', resize);
    return () => viewport.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    app.current?.querySelector<HTMLElement>('[data-view-heading]')?.focus();
  }, [view, loaded]);

  useEffect(() => {
    const ready = () => setOfflineReady(true);
    const failed = () => setOfflineFailed(true);
    const available = (event: Event) =>
      setUpdate((event as CustomEvent<ServiceWorkerRegistration>).detail);
    window.addEventListener('hobbymaxx-offline-ready', ready);
    window.addEventListener('hobbymaxx-offline-failed', failed);
    window.addEventListener('hobbymaxx-update', available);
    return () => {
      window.removeEventListener('hobbymaxx-offline-ready', ready);
      window.removeEventListener('hobbymaxx-offline-failed', failed);
      window.removeEventListener('hobbymaxx-update', available);
    };
  }, []);

  function back() {
    if (privacyOpen) {
      setPrivacyOpen(false);
    } else {
      if (session.screen === 'conversation') {
        onboarding.go('welcome');
      } else {
        onboarding.startConversation();
      }
    }
  }

  return (
    <div className={`app app--${view}`} ref={app}>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="app-header">
        <div className="header-brand">
          {view !== 'welcome' && (
            <button className="icon-button" aria-label="Go back" disabled={busy || productBusy} onClick={back}>
              <Icon name="back" />
            </button>
          )}
          <span className="brand"><BrandMark />HobbyMaxx</span>
        </div>
        <div className="header-actions">
          {storage === 'session-only' && <span className="session-label">Not saved</span>}
          {session.confirmedProfile && view === 'conversation' && (
            <button className="icon-button" aria-label="Hobbies and records" disabled={busy} onClick={() => onboarding.go('confirmed')}>
              <Icon name="book" />
            </button>
          )}
          <button className="icon-button" aria-label="Information and privacy" aria-haspopup="dialog" onClick={() => setInfoOpen(true)}>
            <Icon name="info" />
          </button>
        </div>
      </header>

      <main id="main">
        {!loaded ? <p className="loading-status" role="status">Loading…</p> : (
          <>
            {storage === 'error' && (
              <div className="inline-warning" role="status">
                <span>History isn’t saving.</span>
                <button className="text-action" onClick={() => setInfoOpen(true)}>Fix</button>
              </div>
            )}
            {privacyOpen ? (
              <PrivacyPanel session={session} sessionOnly={storage === 'session-only'} onBegin={onboarding.beginDataChange} onChanged={onboarding.finishDataChange} onBack={() => setPrivacyOpen(false)} />
            ) : session.screen === 'welcome' ? (
              <section className="welcome">
                <div>
                  <h1 data-view-heading tabIndex={-1}>Find your<br />next thing.</h1>
                  <p>Chat with Gemma. Discover hobbies that fit your life.</p>
                </div>
                <Button className="welcome-cta" onClick={onboarding.startConversation}>Let’s chat <Icon name="send" /></Button>
              </section>
            ) : session.screen === 'conversation' ? (
              <Conversation onboarding={onboarding} />
            ) : session.screen === 'review' ? (
              <Review onboarding={onboarding} />
            ) : session.confirmedProfile ? (
              <section className="utility-view">
                <Experiments profile={session.confirmedProfile} days={session.cycleDays} sessionOnly={storage === 'session-only'} onBusy={setProductBusy} />
                <button className="text-action utility-edit" disabled={productBusy} onClick={() => onboarding.go('review')}>Edit preferences</button>
              </section>
            ) : null}
          </>
        )}
      </main>

      {infoOpen && (
        <Info onboarding={onboarding} offlineReady={offlineReady} offlineFailed={offlineFailed} update={update} productBusy={productBusy} onClose={() => setInfoOpen(false)} onPrivacy={() => { setInfoOpen(false); setPrivacyOpen(true); }} />
      )}
    </div>
  );
}

function Conversation({ onboarding }: { onboarding: Onboarding }) {
  const { session, busy, operation } = onboarding;
  const log = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const follow = useRef(true);
  const hasAnswers = session.messages.some((item) => item.role === 'user');
  const needsOpening = !session.messages.some((item) => item.status === 'complete');

  useEffect(() => {
    if (follow.current && log.current) {
      log.current.scrollTop = log.current.scrollHeight;
    }
  }, [session.messages.length, onboarding.partial, operation, onboarding.error]);

  useEffect(() => {
    const element = composer.current;
    if (element) {
      element.style.height = '0px';
      element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
    }
  }, [session.composer]);

  return (
    <section className="chat" aria-label="Chat with Gemma">
      <h1 className="sr-only" data-view-heading tabIndex={-1}>Chat with Gemma</h1>
      <div className="message-log" ref={log} role="log" aria-label="Messages" aria-live="off" onScroll={() => {
        const element = log.current;
        if (element) {
          follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }
      }}>
        {session.messages.map((item) => (
          <article className={`message message--${item.role}`} key={item.id}>
            <span className="sr-only">{item.role === 'user' ? 'You' : 'Gemma'}:</span>
            <p>{item.content}</p>
            {item.status === 'interrupted' && <span className="message-note">Stopped</span>}
          </article>
        ))}
        {onboarding.partial && <article className="message message--assistant"><span className="sr-only">Gemma:</span><p>{onboarding.partial}</p></article>}
        {(operation === 'waiting' || operation === 'generating') && !onboarding.partial && <p className="typing-status" role="status">Gemma is thinking<span aria-hidden="true">…</span></p>}
        {operation === 'extracting' && <p className="typing-status" role="status">Finding your preferences…</p>}
        {onboarding.error && <p className="error-banner" role="alert">{onboarding.error}</p>}
        {!busy && (onboarding.retryChat || (needsOpening && (session.messages.length > 0 || onboarding.error || onboarding.notice === 'Stopped.'))) && (
          <button className="text-action" disabled={!onboarding.online} onClick={() => void onboarding.retryReply()}>Retry</button>
        )}
      </div>
      <span className="sr-only" role="status">{!busy ? onboarding.notice : ''}</span>
      {!onboarding.online && <p className="chat-status" role="status">Offline</p>}
      {!needsOpening && (
        <div className="chat-tools">
          <button className="text-action" disabled={busy || !onboarding.online} onClick={() => void onboarding.chat('Skip this question, please.')}>Skip question</button>
          {hasAnswers && <button className="text-action" disabled={busy || !onboarding.online} onClick={() => void onboarding.reviewWithGemma()}>Find hobbies <Icon name="send" /></button>}
        </div>
      )}
      <form className="composer" onSubmit={(event) => {
        event.preventDefault();
        if (session.composer.trim() && !busy && !needsOpening) {
          follow.current = true;
          void onboarding.chat(session.composer);
        }
      }}>
        <label className="sr-only" htmlFor="message">Message Gemma</label>
        <textarea id="message" ref={composer} rows={1} maxLength={500} value={session.composer} placeholder="Message Gemma…" disabled={busy || needsOpening} onChange={(event) => onboarding.update({ composer: event.target.value })} />
        {busy ? (
          <button className="icon-button composer-send" type="button" aria-label="Stop reply" onClick={onboarding.cancel}><Icon name="stop" /></button>
        ) : (
          <button className="icon-button composer-send" type="submit" aria-label="Send message" disabled={needsOpening || !session.composer.trim() || !onboarding.online}><Icon name="send" /></button>
        )}
      </form>
    </section>
  );
}

function Info({ onboarding, offlineReady, offlineFailed, update, productBusy, onClose, onPrivacy }: {
  onboarding: Onboarding; offlineReady: boolean; offlineFailed: boolean;
  update: ServiceWorkerRegistration | null; productBusy: boolean;
  onClose: () => void; onPrivacy: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { busy, storage } = onboarding;
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); trigger?.focus(); };
  }, []);
  return (
    <dialog className="info-dialog" ref={dialog} aria-labelledby="info-heading" onClose={() => { if (!dialog.current?.open) { onClose(); } }} onClick={(event) => { if (event.target === event.currentTarget) { onClose(); } }}>
      <div className="info-content">
        <header><h2 id="info-heading">About HobbyMaxx</h2><button className="icon-button" aria-label="Close information" onClick={onClose}><Icon name="close" /></button></header>
        <p>Gemma helps you find hobbies. Try them, record how they went, and get new suggestions every 7 or 14 days.</p>
        <details open><summary>Privacy & history</summary><p>Messages go to the app’s server for Gemma to process. The application does not intentionally retain conversations there. History is saved in this browser, without accounts or device sync.</p><p>Hosted processing is not on-device inference or end-to-end encryption. Refreshes use your preferences and recent ratings/reflections. You can export or erase saved data.</p></details>
        <details><summary>Connection & storage</summary><p>{onboarding.online ? 'Online.' : 'Offline.'} {offlineReady ? 'The app is ready to reopen offline.' : offlineFailed ? 'Offline setup failed; reopen with an internet connection.' : 'Visit online to prepare offline access.'} AI replies need internet.</p><p>{storage === 'session-only' ? 'This session is not saved and will be lost on reload.' : storage === 'error' ? 'Local storage is unavailable. Existing records have not been overwritten.' : storage === 'saving' ? 'Saving your work…' : 'History is saved on this browser.'}</p>{onboarding.omitted && <p>Only recent messages fit in Gemma’s request limit. Earlier messages stay in your history; add missing details during review.</p>}<button className="text-action" disabled={busy || !onboarding.online} onClick={() => void onboarding.checkService()}>Check Gemma</button><p className="field__hint">{onboarding.availability === 'ready' ? 'Ready' : onboarding.availability === 'warming' ? 'Warming up' : onboarding.availability === 'checking' ? 'Checking…' : 'Unavailable'}</p></details>
        {storage === 'error' && <div className="info-actions"><Button variant="secondary" disabled={busy} onClick={() => void onboarding.retryStorage()}>Retry saving</Button><button className="text-action" disabled={busy} onClick={onboarding.continueWithoutSaving}>Continue without saving</button></div>}
        {update && <Button variant="secondary" disabled={busy || productBusy || storage === 'saving'} onClick={() => { navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true }); update.waiting?.postMessage('activate-update'); }}>Update app</Button>}
        <div className="info-actions"><Button variant="secondary" disabled={busy || productBusy} onClick={onPrivacy}>Manage saved data</Button><button className="text-action" disabled={busy || productBusy} onClick={() => { onClose(); onboarding.go('review'); }}>Edit preferences</button></div>
      </div>
    </dialog>
  );
}

function Review({ onboarding }: { onboarding: Onboarding }) {
  const { session, fieldErrors, busy } = onboarding;
  const form = session.form;
  function change<K extends keyof ReviewForm>(key: K, value: ReviewForm[K]) {
    onboarding.update({ form: { ...form, [key]: value }, confirmedProfile: null });
  }
  const selects = [
    { id: 'budget', label: 'Budget', options: [['free', 'Free'], ['low', 'Low'], ['flexible', 'Flexible']] },
    { id: 'environment', label: 'Setting', options: [['indoor', 'Indoors'], ['outdoor', 'Outdoors'], ['either', 'Either']] },
    { id: 'socialPreference', label: 'Company', options: [['solo', 'Solo'], ['social', 'With others'], ['either', 'Either']] },
  ] as const;
  return (
    <section className="review-view">
      <h1 data-view-heading tabIndex={-1}>Your preferences</h1>
      <form className="review-form" noValidate onSubmit={(event) => { event.preventDefault(); void onboarding.confirm(); }}>
        {onboarding.error && <p className="error-banner" role="alert">{onboarding.error}</p>}
        <Field id="interests" label="Interests" error={fieldErrors.interests}><textarea id="interests" rows={2} maxLength={808} value={form.interests} disabled={busy} placeholder="One per line, optional" aria-invalid={Boolean(fieldErrors.interests)} aria-describedby={fieldErrors.interests ? 'interests-error' : undefined} onChange={(event) => change('interests', event.target.value)} /></Field>
        <Field id="constraints" label="Practical limits" error={fieldErrors.constraints}><textarea id="constraints" rows={2} maxLength={1288} value={form.constraints} disabled={busy} placeholder="Time, supplies, access… optional" aria-invalid={Boolean(fieldErrors.constraints)} aria-describedby={fieldErrors.constraints ? 'constraints-error' : undefined} onChange={(event) => change('constraints', event.target.value)} /></Field>
        <div className="field-grid">
          <Field id="minutes" label="Minutes per session" error={fieldErrors.minutesPerSession}><input id="minutes" inputMode="numeric" maxLength={3} value={form.minutes} disabled={busy} placeholder="5–240" aria-invalid={Boolean(fieldErrors.minutesPerSession)} aria-describedby={fieldErrors.minutesPerSession ? 'minutes-error' : undefined} onChange={(event) => change('minutes', event.target.value)} /></Field>
          {selects.map(({ id, label, options }) => <Field key={id} id={id} label={label} error={fieldErrors[id]}><select id={id} value={form[id] ?? ''} disabled={busy} aria-invalid={Boolean(fieldErrors[id])} aria-describedby={fieldErrors[id] ? `${id}-error` : undefined} onChange={(event) => change(id, (event.target.value || null) as ReviewForm[typeof id])}><option value="">Choose</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field>)}
        </div>
        <fieldset className="cycle-picker" disabled={busy}><legend>Cycle length</legend><div className="cycle-options">{([7, 14] as CycleDays[]).map((days) => <label key={days} className={session.cycleDays === days ? 'cycle-option is-selected' : 'cycle-option'}><input type="radio" name="cycle" checked={session.cycleDays === days} onChange={() => onboarding.update({ cycleDays: days })} /><span>{days} days</span></label>)}</div></fieldset>
        <details className="exclusions"><summary>Hobbies to avoid</summary><div className="checkbox-grid">{hobbies.map((hobby) => <label className="checkbox-label" key={hobby.id}><input type="checkbox" disabled={busy} checked={form.excludedHobbyIds.includes(hobby.id)} onChange={(event) => change('excludedHobbyIds', event.target.checked ? [...form.excludedHobbyIds, hobby.id] : form.excludedHobbyIds.filter((id) => id !== hobby.id))} /><span>{hobby.name}</span></label>)}</div></details>
        <label className="checkbox-label"><input type="checkbox" checked={session.discardConversation} disabled={busy} onChange={(event) => onboarding.update({ discardConversation: event.target.checked })} /><span>Delete conversation after saving</span></label>
        <Button className="review-submit" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Use these preferences'}</Button>
      </form>
    </section>
  );
}
