import { useEffect, useState } from 'react';
import {
  Baby, Clapperboard, ChefHat, Dumbbell, Gift, Tag, Trophy, type LucideIcon,
} from 'lucide-react';
import { buildToday, type TodayCard } from '../lib/today';
import { fetchToday } from '../lib/todayData';
import { metaFor } from '../lib/appMeta';

/** Card key → icon. Deliberately keyed on the card rather than reused from the
 *  tile grid: a card is about one thing the app is saying today, so it can be
 *  more specific than the app's own icon if that ever helps. */
const ICONS: Record<string, LucideIcon> = {
  sport: Trophy,
  training: Dumbbell,
  baby: Baby,
  cook: ChefHat,
  price: Tag,
  marvel: Clapperboard,
  registry: Gift,
};

export function Today() {
  const [cards, setCards] = useState<TodayCard[] | null>(null);

  useEffect(() => {
    let live = true;
    void fetchToday()
      .then(input => { if (live) setCards(buildToday(input)); })
      .catch(() => { if (live) setCards([]); });
    return () => { live = false; };
  }, []);

  // Nothing at all to say, or still loading: render nothing rather than a row
  // of skeletons. The tiles below are the point of the page either way, and a
  // placeholder that resolves to nothing is worse than no placeholder.
  if (!cards || cards.length === 0) return null;

  return (
    <>
      <h3 className="section-label">Today</h3>
      <div className="today">
        {cards.map(card => {
          const meta = metaFor(card.slug);
          const Icon = ICONS[card.key] ?? Trophy;
          const external = card.href.startsWith('http');
          return (
            <a
              key={card.key}
              className={`today-card${card.urgent ? ' today-card--urgent' : ''}`}
              href={card.href}
              style={{ ['--tile' as string]: meta.color }}
              {...(external ? { rel: 'noreferrer' } : {})}
            >
              <span className="today-head">
                <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
                {card.label}
              </span>
              <span className="today-headline">{card.headline}</span>
              <span className="today-detail">{card.detail}</span>
            </a>
          );
        })}
      </div>
    </>
  );
}

export const TODAY_CSS = `
.today {
  display: grid; gap: 12px; margin-bottom: 4px;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
}

.today-card {
  position: relative; display: flex; flex-direction: column; gap: 3px;
  padding: 13px 15px 14px; text-decoration: none; color: inherit;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); overflow: hidden;
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}
.today-card::before {
  content: ''; position: absolute; inset: 0 auto 0 0; width: 3px;
  background: var(--tile); opacity: 0.85;
}
.today-card:hover, .today-card:focus-visible {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--tile) 55%, var(--border));
  box-shadow: 0 6px 20px -6px color-mix(in srgb, var(--tile) 40%, transparent);
}
.today-card:focus-visible { outline: 2px solid var(--tile); outline-offset: 2px; }
.today-card:active { transform: translateY(0); }

/* Happening today or tomorrow: the app's own colour comes forward so the one
   card that is time-critical is found without reading all of them. */
.today-card--urgent {
  border-color: color-mix(in srgb, var(--tile) 45%, var(--border));
  background: linear-gradient(
    180deg, color-mix(in srgb, var(--tile) 7%, var(--surface)), var(--surface));
}

.today-head {
  display: flex; align-items: center; gap: 5px;
  font-size: 0.63rem; font-weight: 700; letter-spacing: 0.11em;
  text-transform: uppercase; color: var(--tile);
}
.today-headline {
  font-size: 0.97rem; font-weight: 650; line-height: 1.3;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
/* Wraps to two lines rather than ellipsing: "Saturday · 22:00 SAST · Rugby's
   Greatest Riv…" loses exactly the part that says which match it is. */
.today-detail {
  font-size: 0.76rem; color: var(--text-dim); line-height: 1.45;
  font-family: var(--font-data);
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
`;
