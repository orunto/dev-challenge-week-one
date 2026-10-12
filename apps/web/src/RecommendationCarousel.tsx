import { useRef, useState } from 'react';
import type { Cycle } from '@hobbymaxx/shared';
import { hobbies } from '@hobbymaxx/hobby-catalog';
import { Button, Icon } from './components.js';

export function RecommendationCarousel({ cycle, hobbyIds, ratedIds, disabled, onRate, onDetails }: {
  cycle: Cycle; hobbyIds: string[]; ratedIds: Set<string>; disabled: boolean;
  onRate: (cycleId: string, hobbyId: string) => void;
  onDetails: (cycleId: string, hobbyId: string) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const items = cycle.recommendations.filter((item) => hobbyIds.includes(item.hobbyId));

  function go(next: number) {
    const target = Math.max(0, Math.min(items.length - 1, next));
    const card = track.current?.children[target] as HTMLElement | undefined;
    if (card) {
      track.current?.scrollTo({ left: card.offsetLeft, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      setIndex(target);
    }
  }

  function syncIndex() {
    const element = track.current;
    if (!element) {
      return;
    }
    const cards = Array.from(element.children) as HTMLElement[];
    let closest = 0;
    cards.forEach((card, position) => {
      if (Math.abs(card.offsetLeft - element.scrollLeft) < Math.abs((cards[closest]?.offsetLeft ?? 0) - element.scrollLeft)) {
        closest = position;
      }
    });
    setIndex(closest);
  }

  return (
    <section className="recommendation-carousel" aria-label="Recommended hobbies" aria-roledescription="carousel">
      <div className="carousel-track" ref={track} tabIndex={0} aria-label="Swipe or use arrow keys to browse hobbies" onScroll={syncIndex} onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
          event.preventDefault();
          go(index + (event.key === 'ArrowRight' ? 1 : -1));
        }
      }}>
        {items.map((item, position) => {
          const hobby = hobbies.find((entry) => entry.id === item.hobbyId)!;
          const rated = ratedIds.has(item.hobbyId);
          return (
            <article className="hobby-card" key={item.hobbyId} role="group" aria-roledescription="slide" aria-label={`${position + 1} of ${items.length}: ${hobby.name}`}>
              <div className="hobby-card-meta"><span>Up to {Math.min(hobby.minutes, cycle.profile.minutesPerSession)} min · {hobby.cost === 'free' ? 'Free' : 'Low cost'}</span>{rated && <span>Rated</span>}</div>
              <h2>{hobby.name}</h2>
              <p>{item.reason}</p>
              <div className="hobby-card-starter"><strong>Try this</strong><p>{item.firstActivity}</p></div>
              <details><summary>Adaptation</summary><p>{item.adaptation}</p></details>
              <div className="hobby-card-actions"><Button disabled={disabled} onClick={() => onRate(cycle.id, item.hobbyId)}>{rated ? 'Rate another attempt' : 'Rate activity'}</Button><button className="text-action" disabled={disabled} onClick={() => onDetails(cycle.id, item.hobbyId)}>Supplies & alternatives</button></div>
            </article>
          );
        })}
      </div>
      {items.length > 1 && (
        <div className="carousel-controls">
          <button className="icon-button" type="button" aria-label="Previous hobby" disabled={index === 0} onClick={() => go(index - 1)}><Icon name="back" /></button>
          <span aria-live="polite" aria-atomic="true">{index + 1} / {items.length}</span>
          <button className="icon-button carousel-next" type="button" aria-label="Next hobby" disabled={index >= items.length - 1} onClick={() => go(index + 1)}><Icon name="back" /></button>
        </div>
      )}
    </section>
  );
}
