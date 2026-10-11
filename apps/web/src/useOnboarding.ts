import { useCallback, useEffect, useRef, useState } from 'react';
import { profileSchema, type PreferenceDraft } from '@hobbymaxx/shared';
import { hobbies } from '@hobbymaxx/hobby-catalog';
import { ApiError, boundedContext, errorCopy, extractPreferences, serviceStatus, streamChat } from './api.js';
import { message, newSession, type ReviewForm, type Session } from './session.js';
import { loadSession, pauseStorageWrites, resumeStorageWrites, saveSession } from './storage.js';

export type Operation = 'idle' | 'waiting' | 'generating' | 'extracting' | 'saving';
type StorageState = 'loading' | 'saving' | 'saved' | 'error' | 'session-only';
type Availability = 'checking' | 'ready' | 'warming' | 'unavailable';

function formFromDraft(draft: PreferenceDraft): ReviewForm {
  return {
    interests: draft.interests.join('\n'),
    constraints: draft.constraints.join('\n'),
    minutes: draft.minutesPerSession === null ? '' : String(draft.minutesPerSession),
    budget: draft.budget,
    environment: draft.environment,
    socialPreference: draft.socialPreference,
    excludedHobbyIds: draft.excludedHobbyIds,
  };
}

function lines(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

export function useOnboarding() {
  const [session, setSession] = useState<Session>(newSession);
  const [loaded, setLoaded] = useState(false);
  const [storage, setStorage] = useState<StorageState>('loading');
  const [operation, setOperation] = useState<Operation>('idle');
  const [availability, setAvailability] = useState<Availability>('checking');
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [partial, setPartial] = useState('');
  const [omitted, setOmitted] = useState(false);
  const [maxInputBytes, setMaxInputBytes] = useState(1000);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const active = useRef<AbortController | null>(null);
  const saveSequence = useRef(0);
  const mounted = useRef(true);
  const sessionOnly = useRef(false);
  const historyLoaded = useRef(false);
  const privacyPaused = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let alive = true;
    loadSession().then((saved) => {
      if (alive) {
        setSession(saved ?? newSession());
        historyLoaded.current = true;
        setStorage('saved');
        setLoaded(true);
      }
    }).catch(() => {
      if (alive) {
        setStorage('error');
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
      mounted.current = false;
      active.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!loaded || !historyLoaded.current || sessionOnly.current || privacyPaused.current) {
      return;
    }
    const sequence = ++saveSequence.current;
    setStorage('saving');
    Promise.resolve().then(() => saveSession(session)).then(() => {
      if (mounted.current && sequence === saveSequence.current) {
        setStorage('saved');
      }
    }).catch(() => {
      if (mounted.current && sequence === saveSequence.current) {
        setStorage('error');
      }
    });
  }, [loaded, session]);

  const checkService = useCallback(async () => {
    const controller = new AbortController();
    setAvailability('checking');
    try {
      const result = await serviceStatus(controller.signal);
      if (mounted.current) {
        setMaxInputBytes(result.limits.maxInputBytes);
        if (!result.modelState.installed) {
          setAvailability('unavailable');
        } else if (result.modelState.loaded) {
          setAvailability('ready');
        } else {
          setAvailability('warming');
        }
      }
    } catch {
      if (mounted.current) {
        setAvailability('unavailable');
      }
    }
  }, []);

  useEffect(() => {
    void checkService();
    const connected = () => {
      setOnline(true);
      void checkService();
    };
    const disconnected = () => {
      setOnline(false);
      active.current?.abort();
    };
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    return () => {
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
    };
  }, [checkService]);

  const busy = operation !== 'idle';

  function update(patch: Partial<Session>) {
    setSession((current) => ({ ...current, ...patch }));
  }

  function go(screen: Session['screen']) {
    if (active.current || operation === 'saving') {
      return;
    }
    setError('');
    setNotice('');
    update({ screen });
  }

  async function chat(content?: string) {
    if (active.current || operation === 'saving' || !session.acceptedHostedProcessing) {
      return;
    }
    if (!online) {
      setError('You are offline. You can still enter and save your preferences yourself.');
      return;
    }
    if (content !== undefined && !content.trim()) {
      return;
    }
    if (session.messages.length >= 199) {
      setError('This conversation is full. Continue to your preference review.');
      return;
    }
    const history = content
      ? [...session.messages, message('user', content.trim())]
      : session.messages;
    const complete = history.filter((item) => item.status === 'complete');
    if (complete.at(-1)?.role !== 'user') {
      return;
    }
    let context;
    try {
      context = boundedContext(complete, maxInputBytes);
    } catch (cause) {
      setError(errorCopy(cause));
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setOperation('waiting');
    setError('');
    setNotice('');
    setPartial('');
    setOmitted(context.omitted);
    update({ messages: history, composer: '' });
    let reply = '';
    let completeReply = false;
    try {
      await streamChat(context.messages, controller.signal, () => {
        if (mounted.current) {
          setOperation('generating');
        }
      }, (token) => {
        reply += token;
        if (mounted.current) {
          setPartial(reply);
        }
      });
      if (!reply.trim()) {
        throw new ApiError('INVALID_MODEL_OUTPUT');
      }
      completeReply = true;
      if (mounted.current) {
        setAvailability('ready');
        setNotice('Gemma replied. You can answer, skip this question, or review your preferences.');
      }
    } catch (cause) {
      if (mounted.current) {
        if (controller.signal.aborted) {
          setNotice('Reply stopped. Any unfinished text is marked below and will not be sent back to Gemma.');
        } else {
          setError(errorCopy(cause));
        }
      }
    } finally {
      if (mounted.current) {
        if (reply.trim()) {
          setSession((current) => ({
            ...current,
            messages: [...current.messages, message('assistant', reply, completeReply ? 'complete' : 'interrupted')],
          }));
        }
        setPartial('');
        setOperation('idle');
      }
      active.current = null;
    }
  }

  async function reviewWithGemma() {
    if (active.current || operation === 'saving' || !session.acceptedHostedProcessing) {
      return;
    }
    const users = session.messages.filter((item) => item.role === 'user' && item.status === 'complete');
    if (!users.length) {
      go('review');
      return;
    }
    if (!online) {
      setError('Profile extraction needs internet. You can enter your preferences yourself.');
      return;
    }
    let context;
    try {
      context = boundedContext(users, maxInputBytes);
    } catch (cause) {
      setError(errorCopy(cause));
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setOperation('extracting');
    setError('');
    setNotice('');
    setOmitted(context.omitted);
    try {
      const draft = await extractPreferences(context.messages, controller.signal);
      if (mounted.current) {
        update({ draft, form: formFromDraft(draft), screen: 'review', confirmedProfile: null });
        setNotice('This is Gemma’s draft from your recent answers. Check every field; unstated preferences are blank.');
      }
    } catch (cause) {
      if (mounted.current) {
        if (controller.signal.aborted) {
          setNotice('Profile extraction stopped. Your conversation and previous edits are still here.');
        } else {
          setError(errorCopy(cause));
        }
      }
    } finally {
      active.current = null;
      if (mounted.current) {
        setOperation('idle');
      }
    }
  }

  async function confirm() {
    if (busy) {
      return;
    }
    const parsed = profileSchema.safeParse({
      interests: lines(session.form.interests),
      constraints: lines(session.form.constraints),
      minutesPerSession: Number(session.form.minutes),
      budget: session.form.budget,
      environment: session.form.environment,
      socialPreference: session.form.socialPreference,
      excludedHobbyIds: session.form.excludedHobbyIds,
    });
    const errors: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]);
        errors[field] = field === 'minutesPerSession'
          ? 'Choose a whole number from 5 to 240 minutes.'
          : ['interests', 'constraints'].includes(field)
            ? `Use at most 8 lines, each no longer than ${field === 'interests' ? 100 : 160} characters.`
            : 'Choose an option before saving.';
      }
      setFieldErrors(errors);
      setError('Check the highlighted preferences before saving.');
      return;
    }
    if (parsed.data.excludedHobbyIds?.some((id) => !hobbies.some((hobby) => hobby.id === id))) {
      setError('Choose exclusions from the displayed hobby list.');
      return;
    }
    const profile = parsed.data;
    const eligible = hobbies.filter((hobby) => {
      const withinBudget = profile.budget !== 'free' || hobby.cost === 'free';
      const withinEnvironment =
        profile.environment === 'either' ||
        hobby.environment === 'either' ||
        hobby.environment === profile.environment;
      return withinBudget && withinEnvironment && !profile.excludedHobbyIds?.includes(hobby.id);
    });
    if (eligible.length < 3) {
      setError('Keep at least three eligible hobbies available. Remove some exclusions or broaden your setting or budget.');
      return;
    }
    setFieldErrors({});
    setError('');
    setOperation('saving');
    const next: Session = {
      ...session,
      confirmedProfile: parsed.data,
      draft: { ...parsed.data, excludedHobbyIds: parsed.data.excludedHobbyIds ?? [] },
      form: formFromDraft({ ...parsed.data, excludedHobbyIds: parsed.data.excludedHobbyIds ?? [] }),
      screen: 'confirmed',
      messages: session.discardConversation ? [] : session.messages,
      composer: session.discardConversation ? '' : session.composer,
    };
    try {
      if (!sessionOnly.current) {
        if (!historyLoaded.current) {
          throw new Error('History is unreadable');
        }
        await saveSession(next);
      }
      setSession(next);
      setNotice(sessionOnly.current ? 'Your profile is ready for this session only.' : 'Your profile is saved on this browser.');
    } catch {
      setStorage('error');
      setError('Your profile was not saved. Retry local saving or continue explicitly for this session only.');
    } finally {
      setOperation('idle');
    }
  }

  async function retryStorage() {
    if (busy) {
      return;
    }
    setOperation('saving');
    setStorage('loading');
    try {
      if (!historyLoaded.current) {
        const saved = await loadSession();
        setSession(saved ?? newSession());
        historyLoaded.current = true;
      } else {
        await saveSession(session);
      }
      sessionOnly.current = false;
      setStorage('saved');
    } catch {
      setStorage('error');
    } finally {
      setOperation('idle');
    }
  }

  function continueWithoutSaving() {
    sessionOnly.current = true;
    setStorage('session-only');
    setNotice('Local saving is off. This session will be lost when you close or reload the page.');
  }

  async function beginDataChange() {
    active.current?.abort();
    privacyPaused.current = true;
    saveSequence.current++;
    await pauseStorageWrites();
  }

  function finishDataChange(next?: Session | null) {
    if (next !== undefined) {
      setSession(next ?? newSession());
      historyLoaded.current = true;
      sessionOnly.current = false;
      setStorage('saved');
      setError('');
      setNotice('');
    }
    privacyPaused.current = false;
    resumeStorageWrites();
  }

  const retryChat = session.messages.filter((item) => item.status === 'complete').at(-1)?.role === 'user';
  return {
    session, loaded, storage, operation, availability, online, error, notice, partial,
    omitted, fieldErrors, busy, retryChat, update, go, chat, reviewWithGemma,
    confirm, retryStorage, continueWithoutSaving, checkService,
    beginDataChange, finishDataChange,
    cancel: () => active.current?.abort(),
  };
}
