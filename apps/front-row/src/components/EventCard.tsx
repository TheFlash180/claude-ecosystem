import { CalendarDays, MapPin, Sparkles, Ticket } from 'lucide-react';
import { F, type FrontRowEvent } from '../lib/config';
import { isNewlyListed, priceLabel, whenLabel } from '../lib/match';

const SOURCE_LABEL: Record<string, string> = {
  quicket: 'Quicket',
  montecasino: 'Montecasino',
};

export function EventCard({ event }: { event: FrontRowEvent }) {
  const fresh = isNewlyListed(event);
  const price = priceLabel(event.priceFrom);
  // Undated runs are shown with their original wording rather than hidden.
  const undated = event.startsAt === null;

  return (
    <a
      href={event.url ?? undefined}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'flex', gap: 12, textDecoration: 'none', color: 'inherit',
        background: F.surface, border: `1px solid ${fresh ? `${F.pink}55` : F.border}`,
        borderRadius: 14, padding: 12, marginBottom: 10, alignItems: 'stretch',
      }}>
      {event.imageUrl ? (
        <img
          src={event.imageUrl}
          alt=""
          loading="lazy"
          style={{
            width: 74, height: 74, objectFit: 'cover', borderRadius: 10,
            flexShrink: 0, background: F.raised,
          }}
        />
      ) : (
        <span style={{
          width: 74, height: 74, borderRadius: 10, flexShrink: 0,
          display: 'grid', placeItems: 'center',
          background: `${F.pink}14`, border: `1px solid ${F.pink}30`, color: F.pink,
        }}>
          <Ticket size={22} strokeWidth={1.8} />
        </span>
      )}

      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {fresh && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: `${F.pink}1F`, border: `1px solid ${F.pink}55`, color: F.pink,
              borderRadius: 999, padding: '1px 7px',
              fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
            }}>
              <Sparkles size={9} strokeWidth={2.6} /> Just listed
            </span>
          )}
          <span style={{ fontSize: 9.5, color: F.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {SOURCE_LABEL[event.source] ?? event.source}
          </span>
        </span>

        <span style={{
          fontFamily: F.display, fontSize: 14.5, fontWeight: 600, color: F.text,
          lineHeight: 1.25,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {event.name}
        </span>

        <span style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 12, color: undated ? F.muted : F.gold, fontWeight: 600,
        }}>
          <CalendarDays size={12} strokeWidth={2.2} /> {whenLabel(event)}
        </span>

        {event.venueName && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 11.5, color: F.sub,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            <MapPin size={11} strokeWidth={2.2} style={{ flexShrink: 0 }} />
            {event.venueName}
          </span>
        )}

        {price && (
          <span style={{ fontSize: 11.5, color: F.green, fontWeight: 600 }}>{price}</span>
        )}
      </span>
    </a>
  );
}
