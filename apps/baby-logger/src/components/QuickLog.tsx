import React from 'react';

type LogType = 'feed' | 'sleep' | 'nappy' | 'weight';

interface Props {
  activeSleep: boolean;
  onTap: (type: LogType) => void;
}

const buttons: { type: LogType; emoji: string; label: string; color: string }[] = [
  { type: 'feed', emoji: '🍼', label: 'Feed', color: 'var(--accent-secondary)' },
  { type: 'sleep', emoji: '😴', label: 'Sleep', color: 'var(--sleep)' },
  { type: 'nappy', emoji: '🧷', label: 'Nappy', color: 'var(--nappy)' },
  { type: 'weight', emoji: '⚖️', label: 'Weight', color: 'var(--weight)' },
];

export default function QuickLog({ activeSleep, onTap }: Props) {
  return (
    <div style={styles.bar}>
      {buttons.map((b) => (
        <button
          key={b.type}
          onClick={() => onTap(b.type)}
          style={{
            ...styles.btn,
            borderColor: b.color,
            ...(b.type === 'sleep' && activeSleep ? {
              background: 'var(--sleep)',
              color: '#121018',
              animation: 'sleepPulse 2s ease-in-out infinite',
            } : {}),
          }}
        >
          <span style={{ fontSize: 22 }}>{b.emoji}</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: b.color }}>
            {b.type === 'sleep' && activeSleep ? 'Stop' : b.label}
          </span>
        </button>
      ))}
      <style>{`
        @keyframes sleepPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(123, 168, 224, 0.4); }
          50% { box-shadow: 0 0 12px 4px rgba(123, 168, 224, 0.3); }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 8,
    padding: '12px 0',
    position: 'sticky',
    bottom: 0,
    background: 'var(--bg)',
    borderTop: '1px solid var(--border)',
    paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
    zIndex: 10,
  },
  btn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    background: 'var(--surface)',
    border: '1px solid',
    borderRadius: 'var(--radius)',
    padding: '10px 4px',
    minHeight: 56,
    cursor: 'pointer',
    fontFamily: 'var(--font-display)',
  },
};
