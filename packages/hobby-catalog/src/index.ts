export interface Hobby {
  id: string;
  name: string;
  cost: 'free' | 'low';
  minutes: number;
  environment: 'indoor' | 'outdoor' | 'either';
  activity: string;
  activityId: string;
  equipment: readonly string[];
  accessibleActivity: string;
  estimatedCost: string;
}

// A small grounding catalog for phase-one quality evaluation, not an exhaustive list.
const seeds: readonly Omit<
  Hobby,
  'activityId' | 'equipment' | 'accessibleActivity' | 'estimatedCost'
>[] = [
  {
    id: 'sketching',
    name: 'Sketching',
    cost: 'free',
    minutes: 10,
    environment: 'either',
    activity: 'Sketch an everyday object using paper and a pencil you already have.',
  },
  {
    id: 'creative-writing',
    name: 'Creative writing',
    cost: 'free',
    minutes: 10,
    environment: 'indoor',
    activity: 'Write a short scene inspired by something you noticed today.',
  },
  {
    id: 'birdwatching',
    name: 'Birdwatching',
    cost: 'free',
    minutes: 15,
    environment: 'either',
    activity:
      'Observe birds from a window or a safe nearby outdoor spot; no binoculars needed.',
  },
  {
    id: 'walking',
    name: 'Exploration walks',
    cost: 'free',
    minutes: 15,
    environment: 'outdoor',
    activity:
      'Explore a familiar safe route and notice three new details; adapt the route to your mobility.',
  },
  {
    id: 'phone-photography',
    name: 'Phone photography',
    cost: 'free',
    minutes: 10,
    environment: 'either',
    activity: 'Use your existing phone to photograph three interesting textures.',
  },
  {
    id: 'origami',
    name: 'Origami',
    cost: 'free',
    minutes: 15,
    environment: 'indoor',
    activity: 'Fold a simple shape using scrap paper.',
  },
  {
    id: 'singing',
    name: 'Singing',
    cost: 'free',
    minutes: 10,
    environment: 'indoor',
    activity: 'Practice a favorite song quietly in a comfortable place.',
  },
  {
    id: 'stretching',
    name: 'Gentle movement',
    cost: 'free',
    minutes: 5,
    environment: 'indoor',
    activity:
      'Try comfortable seated or standing movement within your limits; stop if it hurts.',
  },
  {
    id: 'plant-care',
    name: 'Plant care',
    cost: 'low',
    minutes: 10,
    environment: 'either',
    activity:
      'Learn the care needs of a plant you already own or an inexpensive cutting.',
  },
  {
    id: 'cooking',
    name: 'Creative cooking',
    cost: 'low',
    minutes: 20,
    environment: 'indoor',
    activity:
      'Try a small variation of a familiar meal using ingredients and tools you already have.',
  },
];

const equipment: Record<string, string[]> = {
  sketching: ['Existing paper and pencil, or a drawing app'],
  'creative-writing': ['Existing paper and pen, or a notes app'],
  birdwatching: ['An accessible window or safe viewing spot'],
  walking: ['A familiar accessible route'],
  'phone-photography': ['An existing camera phone'],
  origami: ['Scrap paper'],
  singing: ['A comfortable place; no equipment'],
  stretching: ['A comfortable seat or standing space'],
  'plant-care': ['A plant you already own; optional low-cost supplies'],
  cooking: ['Existing ingredients and kitchen tools'],
};

const accessibleActivities: Record<string, string> = {
  sketching:
    'Draw one simple shape while seated, using a digital tool if gripping a pencil is uncomfortable.',
  'creative-writing':
    'Dictate three sentences into an existing phone instead of handwriting.',
  birdwatching:
    'Observe birds through an accessible window, without travel or specialist equipment.',
  walking:
    'Explore an accessible familiar route at your own pace; if travel is unsuitable, choose an indoor hobby instead.',
  'phone-photography':
    'Photograph three nearby textures from a comfortable seated position.',
  origami:
    'Try one simple fold with large paper; choose another hobby if folding is uncomfortable.',
  singing:
    'Hum a short familiar melody at a comfortable volume; take breaks whenever needed.',
  stretching:
    'Choose comfortable seated movement within your limits; skip any movement that hurts.',
  'plant-care':
    'Observe a plant within easy reach and learn one care fact without lifting pots.',
  cooking:
    'Plan a simple ingredient variation while seated; avoid heat or sharp tools if unsuitable.',
};

export const hobbies: readonly Hobby[] = seeds.map((hobby) => ({
  ...hobby,
  activityId: `${hobby.id}:starter:v1`,
  equipment: equipment[hobby.id] ?? [],
  accessibleActivity: accessibleActivities[hobby.id] ?? hobby.activity,
  estimatedCost:
    hobby.cost === 'free'
      ? 'No purchases; use existing supplies'
      : 'Use existing supplies, or optional small purchases',
}));

export const hobbyIds = new Set(hobbies.map((hobby) => hobby.id));
