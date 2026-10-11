import { useEffect, useRef, useState, type RefObject } from 'react';
import { hobbies } from '@hobbymaxx/hobby-catalog';
import type { CycleDays } from '@hobbymaxx/shared';
import { BrandMark, Button, Field, WelcomeArtwork } from './components.js';
import type { ReviewForm } from './session.js';
import { useOnboarding } from './useOnboarding.js';
import { Experiments } from './Experiments.js';
import { PrivacyPanel } from './PrivacyPanel.js';

type Onboarding = ReturnType<typeof useOnboarding>;

export function App() {
  const onboarding = useOnboarding();
  const { session, loaded, storage, busy } = onboarding;
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [productBusy, setProductBusy] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (loaded) {
      heading.current?.focus();
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [session.screen, loaded, privacyOpen]);
  useEffect(() => {
    const ready = () => setOfflineReady(true);
    const available = (event: Event) => setUpdate((event as CustomEvent<ServiceWorkerRegistration>).detail);
    window.addEventListener('hobbymaxx-offline-ready', ready);
    window.addEventListener('hobbymaxx-update', available);
    return () => {
      window.removeEventListener('hobbymaxx-offline-ready', ready);
      window.removeEventListener('hobbymaxx-update', available);
    };
  }, []);

  const phase = session.screen === 'welcome' ? 0 : session.screen === 'conversation' ? 1 : 2;
  return (
    <div className={`app app--${session.screen}`}>
      <a className="skip-link" href="#main">Skip to main content</a>
      <header className="app-header">
        <div className="brand"><BrandMark /><span>HobbyMaxx</span></div>
        <span className="save-label" role="status">
          {storage === 'loading' ? 'Opening local history…' : storage === 'saving' ? 'Saving on this browser…' : storage === 'saved' ? 'Saved on this browser' : storage === 'session-only' ? 'Session only · not saved' : 'Local saving unavailable'}
        </span>
        <Button variant="quiet" disabled={!loaded || busy || productBusy} onClick={() => setPrivacyOpen(true)}>Privacy & data</Button>
      </header>
      <main id="main">
        {update && <div className="connection-banner"><p>A new app version is ready. Reloading interrupts active requests.</p><Button variant="secondary" disabled={busy || storage === 'saving'} onClick={() => {
          if (productBusy) {
            return;
          }
          navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
          update.waiting?.postMessage('activate-update');
        }}>Update and reload</Button></div>}
        {!loaded ? (
          <div className="loading-screen"><h1 ref={heading} tabIndex={-1}>A little room to explore.</h1><p>Opening your saved preferences…</p></div>
        ) : (
          <>
            {storage === 'error' && (
              <section className="storage-warning" aria-label="Local storage problem">
                <h2>Local history needs your attention.</h2>
                <p>We could not read or save your history. Existing unreadable data has not been replaced. Retry, or continue knowing this session will not survive a reload.</p>
                <div className="actions">
                  <Button variant="secondary" disabled={busy} onClick={() => void onboarding.retryStorage()}>Retry local saving</Button>
                  <Button variant="quiet" disabled={busy} onClick={onboarding.continueWithoutSaving}>Continue without saving</Button>
                </div>
              </section>
            )}
            {!privacyOpen && session.screen !== 'welcome' && (
              <nav className="steps" aria-label="Onboarding progress">
                <ol>
                  <li className="step--done">Welcome <span className="sr-only">completed</span></li>
                  <li aria-current={phase === 1 ? 'step' : undefined} className={phase === 1 ? 'step--current' : 'step--done'}>Conversation {phase === 2 && <span className="sr-only">completed or skipped</span>}</li>
                  <li aria-current={phase === 2 ? 'step' : undefined} className={phase === 2 ? 'step--current' : ''}>Your preferences</li>
                </ol>
              </nav>
            )}
            {!onboarding.online && <p className="connection-banner">You’re offline. You can edit and save preferences locally; Gemma needs internet.</p>}
            {privacyOpen ? <PrivacyPanel session={session} sessionOnly={storage === 'session-only'} onBegin={onboarding.beginDataChange} onChanged={onboarding.finishDataChange} onBack={() => setPrivacyOpen(false)} /> : <>
              {session.screen === 'welcome' && <Welcome onboarding={onboarding} heading={heading} />}
              {session.screen === 'conversation' && <Conversation onboarding={onboarding} heading={heading} />}
              {session.screen === 'review' && <Review onboarding={onboarding} heading={heading} />}
              {session.screen === 'confirmed' && <Confirmed onboarding={onboarding} heading={heading} productBusy={productBusy} onProductBusy={setProductBusy} />}
            </>}
          </>
        )}
      </main>
      <footer className="app-footer"><span>Try things. Keep what fits.</span><span>{offlineReady ? 'App ready offline · AI needs internet' : 'No accounts. No streaks. Your pace.'}</span></footer>
    </div>
  );
}

type ScreenProps = {
  onboarding: Onboarding;
  heading: RefObject<HTMLHeadingElement | null>;
};

function Welcome({ onboarding, heading }: ScreenProps) {
  return (
    <>
      <section className="welcome-hero">
        <div className="welcome-copy">
          <h1 ref={heading} tabIndex={-1}>Find your<br />next thing.</h1>
          <p>A little conversation. A few new possibilities. Make room for hobbies that fit the life you actually have.</p>
          <Button disabled={onboarding.busy} onClick={() => onboarding.update({ acceptedHostedProcessing: true, screen: 'conversation' })}>Start a conversation <svg className="button-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" /></svg></Button>
          <span className="welcome-caption">Share a little. Skip anything.</span>
        </div>
        <WelcomeArtwork />
      </section>
      <section className="welcome-details" aria-labelledby="privacy-heading">
        <div>
          <h2 id="privacy-heading">Your pace. Your boundaries.</h2>
          <p>Gemma asks about interests and practical limits, one question at a time. Every answer is optional. You can also enter your preferences yourself.</p>
          <Button variant="quiet" onClick={() => onboarding.go('review')}>Enter preferences without a conversation</Button>
        </div>
        <div className="privacy-note">
          <h2>Before you share</h2>
          <p>When you send a message, recent conversation content goes to the HobbyMaxx server for Gemma to process. The application does not intentionally retain conversations on the server.</p>
          <p>History is saved in this browser, not synced across devices. Hosted processing is not on-device inference or end-to-end encryption. You can discard the raw conversation when saving your profile.</p>
        </div>
      </section>
    </>
  );
}

function Feedback({ onboarding }: { onboarding: Onboarding }) {
  return (
    <>
      {onboarding.error && <p className="error-banner" role="alert">Error: {onboarding.error}</p>}
      <p className="operation-status" role="status" aria-live="polite">
        {onboarding.operation === 'waiting' ? 'Waiting for Gemma. The hosted CPU can be slow; you can cancel at any time.' : onboarding.operation === 'generating' ? 'Gemma is writing a reply…' : onboarding.operation === 'extracting' ? 'Gemma is drafting your preferences. This can take a minute or more…' : onboarding.operation === 'saving' ? 'Saving your confirmed preferences…' : onboarding.notice}
      </p>
      {onboarding.omitted && <p className="context-note">Only recent answers fit in this model’s request limit. Earlier messages remain in your local history. Add any missing details during review.</p>}
    </>
  );
}

function Conversation({ onboarding, heading }: ScreenProps) {
  const { session, busy } = onboarding;
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    if (follow.current && log.current) {
      log.current.scrollTop = log.current.scrollHeight;
    }
  }, [session.messages.length, onboarding.partial]);

  return (
    <section className="conversation-layout">
      <div className="conversation-intro">
        <h1 ref={heading} tabIndex={-1}>What makes you curious?</h1>
        <p>There are no right answers. Start with something you enjoy, something you miss, or what a good afternoon looks like.</p>
        <div className="conversation-meta">
          <span>Open-weight Gemma · hosted processing</span>
          <Button variant="quiet" disabled={busy || !onboarding.online} onClick={() => void onboarding.checkService()}>
            {onboarding.availability === 'checking' ? 'Checking Gemma…' : onboarding.availability === 'ready' ? 'Gemma ready · recheck' : onboarding.availability === 'warming' ? 'Gemma may need to warm up · recheck' : 'Gemma unavailable · recheck'}
          </Button>
        </div>
      </div>
      <div className="conversation-workspace">
        <div className="message-log" ref={log} role="log" aria-label="Conversation with Gemma" aria-live="off" onScroll={() => {
          const element = log.current;
          if (element) {
            follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          }
        }}>
          {!session.messages.length && <div className="conversation-empty"><span className="speaker">HobbyMaxx</span><p>What’s something you’ve enjoyed lately—even if you haven’t had much time for it?</p><p className="field__hint">This opening question is provided by the app. Gemma replies after you send an answer.</p></div>}
          {session.messages.map((item) => <article className={`message message--${item.role}`} key={item.id}>
            <span className="speaker">{item.role === 'user' ? 'You' : 'Gemma'}{item.status === 'interrupted' ? ' · unfinished' : ''}</span>
            <p>{item.content}</p>
          </article>)}
          {onboarding.partial && <article className="message message--assistant"><span className="speaker">Gemma · writing</span><p>{onboarding.partial}</p></article>}
        </div>
        <Feedback onboarding={onboarding} />
        <form className="composer" onSubmit={(event) => {
          event.preventDefault();
          if (session.composer.trim()) {
            follow.current = true;
            void onboarding.chat(session.composer);
          }
        }}>
          <Field id="message" label="Your answer" hint="Share only what feels useful. Enter makes a new line; use Send to submit.">
            <textarea id="message" rows={3} maxLength={500} value={session.composer} disabled={busy} aria-describedby="message-hint" onChange={(event) => onboarding.update({ composer: event.target.value })} />
          </Field>
          <div className="composer-actions">
            <span className="character-count">{session.composer.length}/500 characters</span>
            {busy ? <Button variant="secondary" onClick={onboarding.cancel} disabled={onboarding.operation === 'saving'}>Cancel request</Button> : <Button type="submit" disabled={!session.composer.trim() || !onboarding.online}>Send answer</Button>}
          </div>
        </form>
        <div className="conversation-actions">
          {onboarding.retryChat && !busy && <Button variant="secondary" disabled={!onboarding.online} onClick={() => void onboarding.chat()}>Retry reply</Button>}
          <Button variant="quiet" disabled={busy || !onboarding.online || !session.messages.length} onClick={() => void onboarding.chat('I would like to skip this question. Please move on.')}>Skip this question</Button>
          <Button variant="secondary" disabled={busy || !onboarding.online} onClick={() => void onboarding.reviewWithGemma()}>Draft my preferences</Button>
          <Button variant="quiet" disabled={busy} onClick={() => onboarding.go('review')}>Enter preferences myself</Button>
        </div>
      </div>
    </section>
  );
}

function Review({ onboarding, heading }: ScreenProps) {
  const { session, fieldErrors, busy } = onboarding;
  const form = session.form;
  function change<K extends keyof ReviewForm>(key: K, value: ReviewForm[K]) {
    onboarding.update({ form: { ...form, [key]: value }, confirmedProfile: null });
  }
  function described(id: string, field: string) {
    return `${id}-hint${fieldErrors[field] ? ` ${id}-error` : ''}`;
  }
  return (
    <section className="review-layout">
      <div className="review-intro">
        <h1 ref={heading} tabIndex={-1}>Make it fit your life.</h1>
        <p>Your preferences, in your words. Check the details before saving. Blank choices have not been inferred for you.</p>
        <div className="review-aside"><h2>Small is a good start.</h2><p>You don’t need a big budget or a whole free weekend. Leave interests and notes empty if you prefer. Practical choices help keep the next experiments realistic.</p></div>
        <Button variant="quiet" disabled={busy} onClick={() => onboarding.go(session.acceptedHostedProcessing ? 'conversation' : 'welcome')}>Back to {session.acceptedHostedProcessing ? 'conversation' : 'welcome'}</Button>
      </div>
      <form className="review-form" noValidate onSubmit={(event) => { event.preventDefault(); void onboarding.confirm(); }}>
        <Feedback onboarding={onboarding} />
        <Field id="interests" label="Things you’re curious about" hint="Optional. One interest per line, up to 8; 100 characters each." error={fieldErrors.interests}>
          <textarea id="interests" rows={3} maxLength={808} value={form.interests} disabled={busy} aria-invalid={Boolean(fieldErrors.interests)} aria-describedby={described('interests', 'interests')} onChange={(event) => change('interests', event.target.value)} />
        </Field>
        <Field id="constraints" label="What should your hobbies work around?" hint="Optional. Time, supplies, energy, access, or anything else. Up to 8 lines; 160 characters each." error={fieldErrors.constraints}>
          <textarea id="constraints" rows={3} maxLength={1288} value={form.constraints} disabled={busy} aria-invalid={Boolean(fieldErrors.constraints)} aria-describedby={described('constraints', 'constraints')} onChange={(event) => change('constraints', event.target.value)} />
        </Field>
        <div className="field-grid">
          <Field id="minutes" label="Minutes per session" hint="A whole number from 5 to 240." error={fieldErrors.minutesPerSession}>
            <input id="minutes" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} value={form.minutes} disabled={busy} aria-invalid={Boolean(fieldErrors.minutesPerSession)} aria-describedby={described('minutes', 'minutesPerSession')} onChange={(event) => change('minutes', event.target.value)} />
          </Field>
          <Field id="budget" label="Budget" hint="Use what you have, or leave room to spend." error={fieldErrors.budget}>
            <select id="budget" value={form.budget ?? ''} disabled={busy} aria-invalid={Boolean(fieldErrors.budget)} aria-describedby={described('budget', 'budget')} onChange={(event) => change('budget', (event.target.value || null) as ReviewForm['budget'])}>
              <option value="">Choose a budget</option><option value="free">Free · no purchases</option><option value="low">Low · small purchases are okay</option><option value="flexible">Flexible</option>
            </select>
          </Field>
          <Field id="environment" label="Where would you like to try things?" hint="Choose the setting that works for you." error={fieldErrors.environment}>
            <select id="environment" value={form.environment ?? ''} disabled={busy} aria-invalid={Boolean(fieldErrors.environment)} aria-describedby={described('environment', 'environment')} onChange={(event) => change('environment', (event.target.value || null) as ReviewForm['environment'])}>
              <option value="">Choose a setting</option><option value="indoor">Indoors</option><option value="outdoor">Outdoors</option><option value="either">Either is fine</option>
            </select>
          </Field>
          <Field id="socialPreference" label="Company or your own space?" hint="There’s no wrong choice." error={fieldErrors.socialPreference}>
            <select id="socialPreference" value={form.socialPreference ?? ''} disabled={busy} aria-invalid={Boolean(fieldErrors.socialPreference)} aria-describedby={described('socialPreference', 'socialPreference')} onChange={(event) => change('socialPreference', (event.target.value || null) as ReviewForm['socialPreference'])}>
              <option value="">Choose a preference</option><option value="solo">On my own</option><option value="social">With other people</option><option value="either">Either is fine</option>
            </select>
          </Field>
        </div>
        <details className="exclusions"><summary>Anything you’d rather not try?</summary><p>Optional. These choices will be excluded from hobby selection.</p><div className="checkbox-grid">{hobbies.map((hobby) => <label className="checkbox-label" key={hobby.id}><input type="checkbox" disabled={busy} checked={form.excludedHobbyIds.includes(hobby.id)} onChange={(event) => change('excludedHobbyIds', event.target.checked ? [...form.excludedHobbyIds, hobby.id] : form.excludedHobbyIds.filter((id) => id !== hobby.id))} /><span>{hobby.name}</span></label>)}</div></details>
        <fieldset className="cycle-picker" disabled={busy}>
          <legend>How long should an experiment last?</legend>
          <p className="field__hint">A pace for your future hobby cycles. No deadline starts during onboarding.</p>
          <div className="cycle-options">{([7, 14] as CycleDays[]).map((days) => <label className={session.cycleDays === days ? 'cycle-option cycle-option--selected' : 'cycle-option'} key={days}><input type="radio" name="cycle" value={days} checked={session.cycleDays === days} onChange={() => onboarding.update({ cycleDays: days })} /><span><strong>{days} days</strong><span>{days === 7 ? 'A short first experiment' : 'A little more breathing room'}</span></span></label>)}</div>
        </fieldset>
        <label className="checkbox-label discard-option"><input type="checkbox" disabled={busy} checked={session.discardConversation} onChange={(event) => onboarding.update({ discardConversation: event.target.checked })} /><span>Discard my raw conversation after saving.<small>Your confirmed preferences stay. Conversation messages and the unsent answer are removed from this browser.</small></span></label>
        <div className="review-submit"><p>Saving this profile is local. It does not send these edits to Gemma.</p><Button type="submit" disabled={busy}>{onboarding.storage === 'session-only' ? 'Confirm for this session' : 'Save my preferences'}</Button></div>
      </form>
    </section>
  );
}

function Confirmed({ onboarding, heading, productBusy, onProductBusy }: ScreenProps & { productBusy: boolean; onProductBusy: (busy: boolean) => void }) {
  const { session } = onboarding;
  const profile = session.confirmedProfile;
  if (!profile) {
    return null;
  }
  const budget = { free: 'Free · no purchases', low: 'Low budget', flexible: 'Flexible budget' };
  const environment = { indoor: 'Indoors', outdoor: 'Outdoors', either: 'Indoors or outdoors' };
  const company = { solo: 'On your own', social: 'With other people', either: 'Solo or social' };
  return (
    <>
    <section className="confirmed-layout">
      <div className="confirmed-heading">
        <div className="confirmation-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48">
            <path d="m12 25 8 8 17-18" fill="none" stroke="currentColor" strokeWidth="4" />
          </svg>
        </div>
        <h1 ref={heading} tabIndex={-1}>A starting point<br />that’s yours.</h1>
        <p>
          {onboarding.storage === 'session-only'
            ? 'Your profile is ready for this session. Reloading will lose it.'
            : 'Your confirmed profile is saved on this browser. You can reload and pick up here.'}
        </p>
      </div>
      <div className="confirmed-summary">
        <h2>Your preferences</h2>
        <dl>
          <div>
            <dt>Curiosity</dt>
            <dd>{profile.interests.length ? profile.interests.join(', ') : 'Open to exploring'}</dd>
          </div>
          <div>
            <dt>Time & pace</dt>
            <dd>{profile.minutesPerSession} minutes per session · {session.cycleDays}-day cycles</dd>
          </div>
          <div><dt>Budget</dt><dd>{budget[profile.budget]}</dd></div>
          <div>
            <dt>Setting</dt>
            <dd>{environment[profile.environment]} · {company[profile.socialPreference]}</dd>
          </div>
          {profile.constraints.length > 0 && (
            <div>
              <dt>Keep in mind</dt>
              <dd><ul>{profile.constraints.map((item, index) => <li key={index}>{item}</li>)}</ul></dd>
            </div>
          )}
          {Boolean(profile.excludedHobbyIds?.length) && (
            <div>
              <dt>Rather not try</dt>
              <dd>
                {profile.excludedHobbyIds?.map((id) =>
                  hobbies.find((hobby) => hobby.id === id)?.name ?? id,
                ).join(', ')}
              </dd>
            </div>
          )}
        </dl>
        <p className="profile-next">
          Your confirmed profile guides Gemma’s next suggestions. A cycle starts only after
          a complete, validated set of experiments is saved.
        </p>
        <Button variant="secondary" disabled={onboarding.busy || productBusy} onClick={() => onboarding.go('review')}>
          Edit my preferences
        </Button>
        {session.messages.length > 0 && (
          <Button variant="quiet" disabled={onboarding.busy || productBusy} onClick={() => onboarding.go('conversation')}>
            Return to conversation
          </Button>
        )}
      </div>
    </section>
    <Experiments profile={profile} days={session.cycleDays} sessionOnly={onboarding.storage === 'session-only'} onBusy={onProductBusy} />
    </>
  );
}
