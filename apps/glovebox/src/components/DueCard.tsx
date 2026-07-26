import { AlertTriangle, CalendarClock, CircleCheck, Disc, IdCard, Wrench } from 'lucide-react';
import { G } from '../lib/config';
import { countdownLabel, fmtDate, type DueItem, type DueStatus } from '../lib/due';

const KIND_ICON = { disc: Disc, service: Wrench, licence: IdCard };

const STATUS: Record<DueStatus, { color: string; Icon: typeof CircleCheck }> = {
  overdue: { color: G.red,   Icon: AlertTriangle },
  due:     { color: G.amber, Icon: CalendarClock },
  soon:    { color: G.blue,  Icon: CalendarClock },
  ok:      { color: G.green, Icon: CircleCheck },
};

/** One renewal, coloured by urgency. The countdown leads because that is the
 *  thing you act on; the exact date is the supporting detail. */
export function DueCard({ item }: { item: DueItem }) {
  const { color, Icon } = STATUS[item.status];
  const KindIcon = KIND_ICON[item.kind];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 13,
      background: G.surface, border: `1px solid ${G.border}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 13, padding: '13px 14px', marginBottom: 9,
    }}>
      <span style={{
        flexShrink: 0, width: 38, height: 38, borderRadius: 10,
        display: 'grid', placeItems: 'center', color,
        background: `${color}1A`, border: `1px solid ${color}44`,
      }}>
        <KindIcon size={18} strokeWidth={2} />
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: G.body, fontSize: 14, fontWeight: 600, color: G.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.subject}
        </div>
        <div style={{ fontFamily: G.body, fontSize: 12, color: G.sub, marginTop: 2 }}>
          {item.label}
          <span style={{ color: G.muted }}> · {fmtDate(item.date)}</span>
          {item.projected && (
            <span style={{ color: G.muted }} title="Estimated from your interval and odometer"> · est.</span>
          )}
        </div>
      </div>

      <span style={{
        flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
        color, fontFamily: G.body, fontSize: 12, fontWeight: 700,
        background: `${color}14`, border: `1px solid ${color}3A`,
        borderRadius: 999, padding: '6px 11px', whiteSpace: 'nowrap',
      }}>
        <Icon size={13} strokeWidth={2.4} />
        {countdownLabel(item.daysLeft)}
      </span>
    </div>
  );
}
