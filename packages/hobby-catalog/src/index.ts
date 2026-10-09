export interface Hobby {
  id: string;
  name: string;
  cost: 'free' | 'low';
  minutes: number;
  environment: 'indoor' | 'outdoor' | 'either';
  activity: string;
}

// A small grounding catalog for phase-one quality evaluation, not an exhaustive list.
export const hobbies: readonly Hobby[] = [
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

export const hobbyIds = new Set(hobbies.map((hobby) => hobby.id));
