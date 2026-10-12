import { useCallback, useEffect, useRef, useState } from 'react';
import { onboardingQuestionCount, profileSchema, type PreferenceDraft } from '@hobbymaxx/shared';
import { hobbies } from '@hobbymaxx/hobby-catalog';
import {
  ApiError,
  boundedContext,
  errorCopy,
  extractPreferences,
  serviceStatus,
  streamChat,
  requestRecommendations,
  requestRefresh,
} from './api.js';
import { answerContext, answersFor, onboardingFinished, profileFromAnswers, validateAnswer } from './onboarding.js';
import { appendActivity, emptyLibrary, isDue, librarySchema, loadLibrary, makeCycle, points, saveOnboardingResult, saveReflectionResult, type Library } from './library.js';
import { message, newSession, utilityMessage, type ReviewForm, type Session } from './session.js';
import { addMessages, historyMessage, recommendationMessages } from './chat-hobbies.js';
import { advanceReflection, reflectionChoices, reflectionLog, reflectionPrompt, startReflection, type Reflection } from './reflection.js';
import {
  loadSession,
  pauseStorageWrites,
  resumeStorageWrites,
  saveSession,
} from './storage.js';

export type Operation = 'idle' | 'waiting' | 'generating' | 'extracting' | 'recommending' | 'saving';
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
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function useOnboarding(chatVisible = true) {
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
  const [generatedLibrary, setGeneratedLibrary] = useState<Library | null>(null);
  const [dataRevision, setDataRevision] = useState(0);
  const active = useRef<AbortController | null>(null);
  const saveSequence = useRef(0);
  const mounted = useRef(true);
  const sessionOnly = useRef(false);
  const historyLoaded = useRef(false);
  const privacyPaused = useRef(false);
  const openingAttempted = useRef(false);
  const recommendationAttempted = useRef(false);
  const utilityBusy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let alive = true;
    loadSession()
      .then((saved) => {
        if (alive) {
          const current = saved ?? newSession();
          setSession({ ...current, questionAnswers: answersFor(current), onboardingFinished: onboardingFinished(current) });
          historyLoaded.current = true;
          setStorage('saved');
          setLoaded(true);
        }
      })
      .catch(() => {
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
    if (
      !loaded ||
      !historyLoaded.current ||
      sessionOnly.current ||
      privacyPaused.current
    ) {
      return;
    }
    const sequence = ++saveSequence.current;
    setStorage('saving');
    Promise.resolve()
      .then(() => saveSession(session))
      .then(() => {
        if (mounted.current && sequence === saveSequence.current) {
          setStorage('saved');
        }
      })
      .catch(() => {
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

  async function chat(content?: string, opening = false) {
    if (active.current || operation === 'saving' || !session.acceptedHostedProcessing) {
      return;
    }
    if (!online) {
      setError(
        'You are offline. You can still enter and save your preferences yourself.',
      );
      return;
    }
    if (content !== undefined && !content.trim()) {
      return;
    }
    if (onboardingFinished(session)) {
      return;
    }
    const currentAnswers = answersFor(session);
    if (currentAnswers.length >= onboardingQuestionCount) {
      await recommendAutomatically(session);
      return;
    }
    if (content !== undefined) {
      if (session.messages.filter((item) => item.status === 'complete').at(-1)?.role !== 'assistant') {
        return;
      }
      try {
        validateAnswer(content, currentAnswers.length, maxInputBytes);
      } catch (cause) {
        setError(errorCopy(cause));
        return;
      }
    }
    const nextAnswers = content ? [...currentAnswers, content.trim()] : currentAnswers;
    if (session.messages.length >= 199) {
      setError('This conversation is full. Continue to your preference review.');
      return;
    }
    const history = content
      ? [...session.messages, message('user', content.trim())]
      : session.messages;
    const nextSession = { ...session, messages: history, composer: '', questionAnswers: nextAnswers };
    if (nextAnswers.length >= onboardingQuestionCount) {
      setSession(nextSession);
      await recommendAutomatically(nextSession);
      return;
    }
    const complete = history.filter((item) => item.status === 'complete');
    if (!opening && complete.at(-1)?.role !== 'user') {
      return;
    }
    if (opening && complete.length > 0) {
      return;
    }
    let context;
    try {
      context = opening
        ? { messages: [], omitted: false }
        : boundedContext(complete, maxInputBytes);
    } catch (cause) {
      setError(errorCopy(cause));
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    if (opening) {
      openingAttempted.current = true;
    }
    setOperation('waiting');
    setError('');
    setNotice('');
    setPartial('');
    setOmitted(context.omitted);
    setSession(nextSession);
    let reply = '';
    let completeReply = false;
    try {
      await streamChat(
        context.messages,
        controller.signal,
        () => {
          if (mounted.current) {
            setOperation('generating');
          }
        },
        (token) => {
          reply += token;
          if (mounted.current) {
            setPartial(reply);
          }
        },
        opening,
        nextAnswers.length,
      );
      if (!reply.trim()) {
        throw new ApiError('INVALID_MODEL_OUTPUT');
      }
      completeReply = true;
      if (mounted.current) {
        setAvailability('ready');
        setNotice('Gemma replied.');
      }
    } catch (cause) {
      if (mounted.current) {
        if (controller.signal.aborted) {
          setNotice('Stopped.');
        } else {
          setError(errorCopy(cause));
        }
      }
    } finally {
      if (mounted.current) {
        if (reply.trim()) {
          setSession((current) => ({
            ...current,
            messages: [
              ...current.messages,
              message('assistant', reply, completeReply ? 'complete' : 'interrupted'),
            ],
          }));
        }
        setPartial('');
        setOperation('idle');
      }
      active.current = null;
    }
  }

  useEffect(() => {
    if (
      loaded &&
      chatVisible &&
      online &&
      session.screen === 'conversation' &&
      session.acceptedHostedProcessing &&
      session.messages.length === 0 &&
      !openingAttempted.current &&
      !active.current
    ) {
      if (!onboardingFinished(session)) {
        void chat(undefined, true);
      }
    }
  }, [
    loaded,
    chatVisible,
    online,
    session.screen,
    session.acceptedHostedProcessing,
    session.messages.length,
  ]);

  useEffect(() => {
    if (loaded && chatVisible && online && session.screen === 'conversation' &&
      answersFor(session).length >= onboardingQuestionCount && !onboardingFinished(session) &&
      !recommendationAttempted.current && !active.current) {
      void recommendAutomatically(session);
    }
  }, [loaded, chatVisible, online, session.screen, session.questionAnswers, session.onboardingFinished]);

  async function recommendAutomatically(current: Session) {
    if (active.current || !online || onboardingFinished(current)) {
      return;
    }
    const answers = answersFor(current);
    if (answers.length !== onboardingQuestionCount) {
      return;
    }
    const context = answerContext(answers);
    if (new TextEncoder().encode(JSON.stringify(context)).byteLength > maxInputBytes) {
      recommendationAttempted.current = true;
      setError('These answers exceed the model limit. Edit preferences from the info menu.');
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    recommendationAttempted.current = true;
    setOperation('extracting');
    setError('');
    setNotice('');
    setOmitted(false);
    let reading = true;
    let committing = false;
    try {
      if (!historyLoaded.current && !sessionOnly.current) {
        throw new Error('Local history unavailable');
      }
      const previous = sessionOnly.current ? generatedLibrary ?? emptyLibrary() : await loadLibrary();
      reading = false;
      const draft = await extractPreferences(context, controller.signal);
      const profile = profileFromAnswers(draft);
      setSession((value) => ({ ...value, draft, form: formFromDraft(draft) }));
      setOperation('recommending');
      const output = await requestRecommendations(profile, controller.signal);
      controller.signal.throwIfAborted();
      const cycle = makeCycle(output, profile, current.cycleDays);
      const next: Session = {
        ...current, draft: { ...profile, excludedHobbyIds: profile.excludedHobbyIds ?? [] },
        form: formFromDraft({ ...profile, excludedHobbyIds: profile.excludedHobbyIds ?? [] }),
        confirmedProfile: profile, onboardingFinished: true, screen: 'conversation', composer: '',
        messages: addMessages(current.discardConversation ? [] : current.messages, ...recommendationMessages(cycle)),
        questionAnswers: current.discardConversation ? [] : answers,
      };
      privacyPaused.current = true;
      saveSequence.current++;
      committing = true;
      setOperation('saving');
      const saved = sessionOnly.current
        ? librarySchema.parse({ ...previous, cycles: [...previous.cycles, cycle], currentCycleId: cycle.id })
        : await saveOnboardingResult(next, cycle, previous.currentCycleId);
      if (mounted.current) {
        setGeneratedLibrary(saved);
        setSession(next);
        setStorage(sessionOnly.current ? 'session-only' : 'saved');
        setNotice('Hobbies ready.');
      }
    } catch (cause) {
      if (mounted.current) {
        if (controller.signal.aborted && !committing) {
          setNotice('Stopped.');
        } else if (reading || committing) {
          setStorage('error');
          setError('Couldn’t save your hobbies. Retry saving from the info menu, then retry here.');
        } else {
          setError(errorCopy(cause));
        }
      }
    } finally {
      privacyPaused.current = false;
      active.current = null;
      if (mounted.current) {
        setOperation('idle');
      }
    }
  }

  function startConversation() {
    if (!busy) {
      if (!session.messages.some((item) => item.status === 'complete')) {
        openingAttempted.current = false;
      }
      setError('');
      setNotice('');
      update({ acceptedHostedProcessing: true, screen: 'conversation' });
    }
  }

  useEffect(() => {
    if (!loaded || !chatVisible || !session.confirmedProfile || !onboardingFinished(session)) {
      return;
    }
    let alive = true;
    const attach = (library: Library) => {
      if (!alive) {
        return;
      }
      setGeneratedLibrary(library);
      const cycle = library.cycles.find((item) => item.id === library.currentCycleId);
      if (cycle) {
        setSession((current) => {
          const missing = recommendationMessages(cycle).filter((entry) =>
            !current.messages.some((item) => item.recommendation?.cycleId === cycle.id && item.recommendation.hobbyId === entry.recommendation?.hobbyId));
          return missing.length ? { ...current, messages: addMessages(current.messages, ...missing) } : current;
        });
      }
    };
    if (sessionOnly.current) {
      attach(generatedLibrary ?? emptyLibrary());
    } else {
      void loadLibrary().then(attach).catch(() => {
        if (alive) {
          setError('Couldn’t open saved hobbies. Reload or check saved data from the info menu.');
        }
      });
    }
    return () => { alive = false; };
  }, [loaded, chatVisible, session.confirmedProfile, dataRevision]);

  function beginReflection(cycleId: string, hobbyId: string) {
    if (busy || session.reflection || utilityBusy.current) {
      return;
    }
    const cycle = generatedLibrary?.cycles.find((item) => item.id === cycleId);
    if (!cycle) {
      setError('This hobby could not be opened. Reload your saved history.');
      return;
    }
    const draft = startReflection(cycle, hobbyId);
    const name = hobbies.find((item) => item.id === hobbyId)?.name ?? hobbyId;
    setError('');
    setNotice(reflectionPrompt(draft));
    update({ screen: 'conversation', composer: '', reflection: draft, refreshChoice: false,
      messages: addMessages(session.messages, utilityMessage('user', `I tried ${name}.`), utilityMessage('assistant', reflectionPrompt(draft))) });
  }

  function showHobbyDetails(cycleId: string, hobbyId: string) {
    const cycle = generatedLibrary?.cycles.find((item) => item.id === cycleId);
    const hobby = hobbies.find((item) => item.id === hobbyId);
    if (!busy && !session.reflection && hobby && cycle?.recommendations.some((item) => item.hobbyId === hobbyId)) {
      update({ messages: addMessages(session.messages, utilityMessage('user', `Show supplies for ${hobby.name}.`), utilityMessage('assistant', `Supplies: ${hobby.equipment.join(', ')}.\n\n${hobby.estimatedCost}.\n\nAlternative: ${hobby.accessibleActivity}`)) });
    }
  }

  async function answerReflection(reply: string, skipNote = false) {
    if (busy || utilityBusy.current || !session.reflection) {
      return;
    }
    const cycle = generatedLibrary?.cycles.find((item) => item.id === session.reflection?.cycleId);
    if (!cycle) {
      setError('This activity is missing from saved history. Cancel this rating or reload.');
      return;
    }
    let draft: Reflection;
    try {
      draft = advanceReflection(session.reflection, reply, cycle, skipNote);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Choose one of the replies below.');
      return;
    }
    const choices = reflectionChoices(session.reflection);
    const text = skipNote ? 'Skip note' : choices.find((choice) => choice.value === reply)?.label ?? reply.trim();
    const next: Session = { ...session, composer: '', reflection: draft,
      messages: addMessages(session.messages, utilityMessage('user', text), ...(draft.step === 'save' ? [] : [utilityMessage('assistant', reflectionPrompt(draft))])) };
    setSession(next);
    setError('');
    setNotice(draft.step === 'save' ? 'Saving your attempt.' : reflectionPrompt(draft));
    if (draft.step === 'save') {
      await commitReflection(next);
    }
  }

  async function commitReflection(current: Session) {
    if (!current.reflection || utilityBusy.current || active.current) {
      return;
    }
    utilityBusy.current = true;
    setOperation('saving');
    setError('');
    privacyPaused.current = true;
    saveSequence.current++;
    try {
      const log = reflectionLog(current.reflection);
      const previous = sessionOnly.current ? generatedLibrary ?? emptyLibrary() : await loadLibrary();
      const projected = appendActivity(previous, log);
      const earned = points(projected.logs) - points(previous.logs);
      const receipt = `Saved. Enjoyment ${log.enjoyment}/5, difficulty ${log.difficulty}/5.${earned ? ` +${earned} points.` : ''}${sessionOnly.current ? ' This session only.' : ''}`;
      const next: Session = { ...current, reflection: null, composer: '', messages: addMessages(current.messages, utilityMessage('assistant', receipt)) };
      const saved = sessionOnly.current ? projected : await saveReflectionResult(next, log);
      setGeneratedLibrary(saved);
      setSession(next);
      setStorage(sessionOnly.current ? 'session-only' : 'saved');
      setNotice(receipt);
    } catch {
      setError('Couldn’t save this rating. Retry; the same attempt won’t be counted twice.');
    } finally {
      privacyPaused.current = false;
      utilityBusy.current = false;
      setOperation('idle');
    }
  }

  function cancelReflection() {
    if (!busy && session.reflection) {
      update({ reflection: null, composer: '', messages: addMessages(session.messages, utilityMessage('assistant', 'Rating cancelled. No attempt was saved.')) });
      setError('');
      setNotice('Rating cancelled.');
    }
  }

  function showHistory(older = false) {
    if (!busy && !session.reflection && generatedLibrary) {
      const offset = older ? session.historyOffset ?? 0 : 0;
      update({ screen: 'conversation', historyOffset: Math.min(offset + 2, generatedLibrary.logs.length), messages: addMessages(session.messages, utilityMessage('user', older ? 'Show earlier attempts.' : 'Show my activity history.'), utilityMessage('assistant', historyMessage(generatedLibrary, offset))) });
    }
  }

  function beginRefresh() {
    if (!generatedLibrary) {
      setError('Saved hobbies are still loading. Try again shortly.');
      return;
    }
    const cycle = generatedLibrary?.cycles.find((item) => item.id === generatedLibrary.currentCycleId);
    if (busy || session.reflection) {
      return;
    }
    if (cycle && !isDue(cycle)) {
      setError(`Refresh is available ${new Date(cycle.dueAt).toLocaleDateString()}.`);
      return;
    }
    setError('');
    update({ refreshChoice: true, refreshPending: false, pendingRefresh: null, messages: addMessages(session.messages, utilityMessage('user', 'Find new hobbies.'), utilityMessage('assistant', cycle ? 'Would you like to keep a favorite, or try three new hobbies?' : 'Ready to find your three hobbies?')) });
  }

  async function refreshHobbies(retained = '') {
    if (busy || active.current || utilityBusy.current || !session.confirmedProfile) {
      return;
    }
    const requestSession: Session = { ...session, composer: '', refreshChoice: false, refreshPending: true, pendingRefresh: retained || null,
      messages: session.refreshPending ? session.messages : addMessages(session.messages, utilityMessage('user', retained ? `Keep ${hobbies.find((item) => item.id === retained)?.name ?? retained}.` : 'Try three new hobbies.')) };
    setSession(requestSession);
    if (!online) {
      setError('New hobbies need internet. Your saved hobbies are still here.');
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setOperation('recommending');
    setError('');
    let committing = false;
    try {
      const previous = sessionOnly.current ? generatedLibrary ?? emptyLibrary() : await loadLibrary();
      const cycle = previous.cycles.find((item) => item.id === previous.currentCycleId);
      if (cycle && !isDue(cycle)) {
        throw new ApiError('INVALID_REQUEST');
      }
      let output;
      if (cycle) {
        const feedback = cycle.recommendations.flatMap((item) => {
          const log = previous.logs.filter((entry) => entry.cycleId === cycle.id && entry.hobbyId === item.hobbyId).at(-1);
          return log ? [{ hobbyId: item.hobbyId, enjoyment: log.enjoyment, difficulty: log.difficulty, reflection: log.reflection.slice(0, 160) }] : [];
        });
        const body = { profile: session.confirmedProfile, previousHobbyIds: cycle.recommendations.map((item) => item.hobbyId), ...(retained ? { retainedHobbyId: retained } : {}), feedback };
        if (new TextEncoder().encode(JSON.stringify(body)).byteLength > maxInputBytes) {
          body.feedback = feedback.map(({ hobbyId, enjoyment, difficulty }) => ({ hobbyId, enjoyment, difficulty, reflection: '' }));
        }
        output = await requestRefresh(body, controller.signal);
      } else {
        output = await requestRecommendations(session.confirmedProfile, controller.signal);
      }
      controller.signal.throwIfAborted();
      const nextCycle = makeCycle(output, session.confirmedProfile, session.cycleDays);
      const next: Session = { ...requestSession, screen: 'conversation', refreshChoice: false, refreshPending: false, pendingRefresh: null,
        messages: addMessages(requestSession.messages, ...recommendationMessages(nextCycle)) };
      privacyPaused.current = true;
      saveSequence.current++;
      committing = true;
      setOperation('saving');
      const saved = sessionOnly.current ? librarySchema.parse({ ...previous, cycles: [...previous.cycles, nextCycle], currentCycleId: nextCycle.id }) : await saveOnboardingResult(next, nextCycle, previous.currentCycleId, false);
      setGeneratedLibrary(saved);
      setSession(next);
      setNotice('Hobbies ready.');
    } catch (cause) {
      setError(committing ? 'Couldn’t save new hobbies. Your previous cycle is unchanged.' : controller.signal.aborted ? 'Stopped.' : errorCopy(cause));
    } finally {
      privacyPaused.current = false;
      active.current = null;
      setOperation('idle');
    }
  }

  async function sendChatMessage(text: string) {
    if (!onboardingFinished(session)) {
      await chat(text);
    } else if (session.reflection) {
      await answerReflection(text);
    } else if (session.refreshChoice) {
      const cycle = generatedLibrary?.cycles.find((item) => item.id === generatedLibrary?.currentCycleId);
      const favorite = cycle?.recommendations.find((item) => item.hobbyId === text.trim() || hobbies.find((hobby) => hobby.id === item.hobbyId)?.name.toLowerCase() === text.trim().toLowerCase());
      if (favorite || /^(none|new|three new hobbies|find hobbies)$/i.test(text.trim())) {
        await refreshHobbies(favorite?.hobbyId ?? '');
      } else {
        setError('Choose a favorite below, or reply “none”.');
      }
    } else if (/^(more history|older records)$/i.test(text.trim())) {
      showHistory(true);
      update({ composer: '' });
    } else if (/^(history|records)$/i.test(text.trim())) {
      showHistory();
      update({ composer: '' });
    } else if (/^(refresh|new hobbies)$/i.test(text.trim())) {
      beginRefresh();
      update({ composer: '' });
    } else {
      const target = generatedLibrary?.cycles.find((item) => item.id === generatedLibrary?.currentCycleId);
      const name = text.replace(/^(rate|i tried)\s+/i, '').trim().toLowerCase();
      const hobby = target?.recommendations.find((item) => item.hobbyId === name || hobbies.find((entry) => entry.id === item.hobbyId)?.name.toLowerCase() === name);
      if (target && hobby) {
        beginReflection(target.id, hobby.hobbyId);
      } else {
        update({ composer: '', messages: addMessages(session.messages, utilityMessage('user', text.trim()), utilityMessage('assistant', 'Tap “Rate activity” under a hobby, or ask for “history” or “refresh”.')) });
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
        errors[field] =
          field === 'minutesPerSession'
            ? 'Choose a whole number from 5 to 240 minutes.'
            : ['interests', 'constraints'].includes(field)
              ? `Use at most 8 lines, each no longer than ${field === 'interests' ? 100 : 160} characters.`
              : 'Choose an option before saving.';
      }
      setFieldErrors(errors);
      setError('Check the highlighted preferences before saving.');
      return;
    }
    if (
      parsed.data.excludedHobbyIds?.some(
        (id) => !hobbies.some((hobby) => hobby.id === id),
      )
    ) {
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
      return (
        withinBudget && withinEnvironment && !profile.excludedHobbyIds?.includes(hobby.id)
      );
    });
    if (eligible.length < 3) {
      setError(
        'Keep at least three eligible hobbies available. Remove some exclusions or broaden your setting or budget.',
      );
      return;
    }
    setFieldErrors({});
    setError('');
    setOperation('saving');
    const next: Session = {
      ...session,
      confirmedProfile: parsed.data,
      onboardingFinished: true,
      draft: { ...parsed.data, excludedHobbyIds: parsed.data.excludedHobbyIds ?? [] },
      form: formFromDraft({
        ...parsed.data,
        excludedHobbyIds: parsed.data.excludedHobbyIds ?? [],
      }),
      screen: 'conversation',
      messages: session.discardConversation ? [] : session.messages,
      questionAnswers: session.discardConversation ? [] : answersFor(session),
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
      setNotice(
        sessionOnly.current
          ? 'Your profile is ready for this session only.'
          : 'Your profile is saved on this browser.',
      );
    } catch {
      setStorage('error');
      setError(
        'Your profile was not saved. Retry local saving or continue explicitly for this session only.',
      );
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
    setNotice(
      'Local saving is off. This session will be lost when you close or reload the page.',
    );
  }

  async function beginDataChange() {
    active.current?.abort();
    privacyPaused.current = true;
    saveSequence.current++;
    await pauseStorageWrites();
  }

  function finishDataChange(next?: Session | null) {
    if (next !== undefined) {
      const current = next ?? newSession();
      setSession({ ...current, questionAnswers: answersFor(current), onboardingFinished: onboardingFinished(current) });
      setGeneratedLibrary(null);
      historyLoaded.current = true;
      sessionOnly.current = false;
      setStorage('saved');
      setError('');
      setNotice('');
      openingAttempted.current = false;
      recommendationAttempted.current = false;
      setDataRevision((value) => value + 1);
    }
    privacyPaused.current = false;
    resumeStorageWrites();
  }

  const finished = onboardingFinished(session);
  const answeredCount = finished ? onboardingQuestionCount : answersFor(session).length;
  const questionReady = !finished && answeredCount < onboardingQuestionCount &&
    session.messages.filter((item) => item.status === 'complete').at(-1)?.role === 'assistant';
  const retryChat = !finished && session.messages.filter((item) => item.status === 'complete').at(-1)?.role === 'user';
  const currentCycle = generatedLibrary?.cycles.find((item) => item.id === generatedLibrary?.currentCycleId);
  return {
    session,
    loaded,
    storage,
    operation,
    availability,
    online,
    error,
    notice,
    partial,
    omitted,
    fieldErrors,
    busy,
    retryChat,
    answeredCount,
    questionsComplete: answeredCount >= onboardingQuestionCount,
    questionReady,
    onboardingFinished: finished,
    generatedLibrary,
    beginReflection,
    showHobbyDetails,
    answerReflection,
    cancelReflection,
    showHistory,
    beginRefresh,
    refreshHobbies,
    sendChatMessage,
    quickReplies: session.reflection ? reflectionChoices(session.reflection) : session.refreshChoice
      ? [{ label: currentCycle ? 'Three new hobbies' : 'Find hobbies', value: '' }, ...(currentCycle?.recommendations.map((item) => ({ label: hobbies.find((hobby) => hobby.id === item.hobbyId)?.name ?? item.hobbyId, value: item.hobbyId })) ?? [])]
      : [],
    currentCycle,
    canRefresh: Boolean(generatedLibrary) && !session.reflection && (!currentCycle || isDue(currentCycle)),
    retryUtility: () => session.reflection?.step === 'save' ? commitReflection(session) : session.refreshPending ? refreshHobbies(session.pendingRefresh ?? '') : Promise.resolve(),
    update,
    go,
    chat,
    startConversation,
    retryReply: () =>
      chat(undefined, !session.messages.some((item) => item.status === 'complete')),
    confirm,
    retryStorage,
    continueWithoutSaving,
    checkService,
    beginDataChange,
    finishDataChange,
    cancel: () => active.current?.abort(),
  };
}
