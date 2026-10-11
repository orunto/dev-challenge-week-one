import type { Profile } from '../packages/shared/dist/index.js';

export interface BenchmarkCase {
  id: string;
  message: string;
  profile: Profile;
  review: string;
}

// Synthetic fixtures only. Do not replace these with real personal conversations.
export const benchmarkCases: BenchmarkCase[] = [
  {
    id: 'free-short-sessions',
    message:
      'I enjoy stories and drawing. I have ten minutes at home and no money to spend. What should I try?',
    profile: {
      interests: ['stories', 'drawing'],
      constraints: ['No purchases'],
      minutesPerSession: 10,
      budget: 'free',
      environment: 'indoor',
      socialPreference: 'solo',
    },
    review: 'Three free indoor experiments; no equipment purchases; short first steps.',
  },
  {
    id: 'low-energy-accessibility',
    message:
      'I want something creative, but I get tired easily and cannot stand for long. I prefer five-minute activities.',
    profile: {
      interests: ['creativity', 'nature'],
      constraints: ['Cannot stand for long', 'Low energy; seated activities'],
      minutesPerSession: 5,
      budget: 'free',
      environment: 'indoor',
      socialPreference: 'solo',
    },
    review:
      'Concrete seated five-minute adaptations; no diagnosis, pressure, or inaccessible tasks.',
  },
  {
    id: 'social-discomfort',
    message:
      'I would like to meet people eventually, but groups feel overwhelming right now. I like music and observing nature.',
    profile: {
      interests: ['music', 'nature'],
      constraints: ['Avoid group activities for now'],
      minutesPerSession: 15,
      budget: 'free',
      environment: 'either',
      socialPreference: 'solo',
    },
    review:
      'Respect solo preference without judgment; no demand for deeper personal disclosure.',
  },
  {
    id: 'conflicting-preferences',
    message:
      'I like exploring outdoors, but this week I must stay indoors. I have only my phone and scrap paper.',
    profile: {
      interests: ['exploring outdoors', 'photography'],
      constraints: ['Must stay indoors this week', 'Only phone and scrap paper'],
      minutesPerSession: 10,
      budget: 'free',
      environment: 'indoor',
      socialPreference: 'solo',
    },
    review:
      'Current constraints outrank general interests; no required outdoor walk or new supplies.',
  },
  {
    id: 'disliked-activity',
    message:
      'I tried origami and found the precise folding frustrating. I still want something creative and inexpensive.',
    profile: {
      interests: ['creativity'],
      constraints: ['Disliked origami; avoid precise folding'],
      excludedHobbyIds: ['origami'],
      minutesPerSession: 15,
      budget: 'low',
      environment: 'either',
      socialPreference: 'either',
    },
    review: 'Do not recommend origami again; explain a different creative direction.',
  },
];
