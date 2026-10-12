import { onboardingQuestionCount, onboardingTopics, profileSchema, type ChatMessage, type PreferenceDraft, type Profile } from '@hobbymaxx/shared';
import type { Session } from './session.js';
import { ApiError } from './api.js';

export function answersFor(session: Session): string[] {
  return session.questionAnswers ?? session.messages
    .filter((item) => item.role === 'user' && item.status === 'complete')
    .slice(0, onboardingQuestionCount)
    .map((item) => item.content);
}

export function onboardingFinished(session: Session): boolean {
  return session.onboardingFinished ?? session.confirmedProfile !== null;
}

export function answerContext(answers: string[]): ChatMessage[] {
  return answers.map((answer, index) => ({ role: 'user', content: `${onboardingTopics[index]}: ${answer}` }));
}

export function validateAnswer(answer: string, index: number, maxInputBytes: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= onboardingQuestionCount || !answer.trim()) {
    throw new ApiError('INVALID_REQUEST');
  }
  const perAnswer = Math.floor((maxInputBytes - onboardingQuestionCount - 1) / onboardingQuestionCount);
  const payload = { role: 'user', content: `${onboardingTopics[index]}: ${answer.trim()}` };
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > perAnswer) {
    throw new ApiError('INPUT_LIMIT');
  }
}

export function profileFromAnswers(draft: PreferenceDraft): Profile {
  // Skipped/unresolved choices use practical defaults, never fabricated user facts.
  return profileSchema.parse({
    ...draft,
    minutesPerSession: draft.minutesPerSession ?? 15,
    budget: draft.budget ?? 'free',
    environment: draft.environment ?? 'either',
    socialPreference: draft.socialPreference ?? 'either',
  });
}
