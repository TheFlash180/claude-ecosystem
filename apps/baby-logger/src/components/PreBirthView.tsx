import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Baby } from '../types';
import Settings from './Settings';

interface Props {
  baby: Baby;
  displayName: string;
  onBabyUpdate: (baby: Baby) => void;
  onSignOut: () => void;
}

// ── pregnancy week data & maths: src/lib/pregnancy.ts (unit-tested) ──
import { getPregnancyInfo, getWeekInfo } from '../lib/pregnancy';

// ── checklist (localStorage) ─────────────────────────────────────────

const CHECKLIST_KEY = 'baby-logger:checklist';

interface ChecklistItem { id: string; label: string; checked: boolean }

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: 'c1', label: 'Choose a paediatrician', checked: false },
  { id: 'c2', label: 'Set up nursery / sleeping area', checked: false },
  { id: 'c3', label: 'Buy car seat', checked: false },
  { id: 'c4', label: 'Pack hospital bag', checked: false },
  { id: 'c5', label: 'Stock up on nappies & wipes', checked: false },
  { id: 'c6', label: 'Wash baby clothes', checked: false },
  { id: 'c7', label: 'Install car seat', checked: false },
  { id: 'c8', label: 'Pre-register at hospital', checked: false },
  { id: 'c9', label: 'Prep meals for after birth', checked: false },
  { id: 'c10', label: 'Decide on a birth plan', checked: false },
];

function loadChecklist(): ChecklistItem[] {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_CHECKLIST;
  } catch {
    return DEFAULT_CHECKLIST;
  }
}

function saveChecklist(items: ChecklistItem[]) {
  try { localStorage.setItem(CHECKLIST_KEY, JSON.stringify(items)); } catch { /* */ }
}

// ── main component ───────────────────────────────────────────────────

export default function PreBirthView({ baby, displayName, onBabyUpdate, onSignOut }: Props) {
  const [, tick] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showBirthForm, setShowBirthForm] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [birthDate, setBirthDate] = useState('');
  const [babyName, setBabyName] = useState(baby.name ?? '');
  const [saving, setSaving] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(loadChecklist);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemLabel, setNewItemLabel] = useState('');

  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const preg = getPregnancyInfo(baby.due_date, baby.week_anchor);
  const weekInfo = getWeekInfo(preg.weeksPregnant);
  const babyDisplayName = baby.name || 'Baby';

  const countdown = (() => {
    const d = preg.daysUntilDue;
    if (d <= 0) return null;
    const days = Math.floor(d);
    const weeks = Math.floor(days / 7);
    const remainingDays = days % 7;
    return { weeks, days: remainingDays, total: days };
  })();

  const toggleCheck = (id: string) => {
    const next = checklist.map(c => c.id === id ? { ...c, checked: !c.checked } : c);
    setChecklist(next);
    saveChecklist(next);
  };

  const removeItem = (id: string) => {
    const next = checklist.filter(c => c.id !== id);
    setChecklist(next);
    saveChecklist(next);
  };

  const addItem = () => {
    if (!newItemLabel.trim()) return;
    const next = [...checklist, { id: `custom-${Date.now()}`, label: newItemLabel.trim(), checked: false }];
    setChecklist(next);
    saveChecklist(next);
    setNewItemLabel('');
    setAddingItem(false);
  };

  const checkedCount = checklist.filter(c => c.checked).length;

  async function handleBabyArrived() {
    if (!birthDate) return;
    setSaving(true);
    const updates: Record<string, unknown> = { birth_date: birthDate };
    if (babyName.trim()) updates.name = babyName.trim();

    const { data, error } = await supabase()
      .from('babies')
      .update(updates)
      .eq('id', baby.id)
      .select()
      .single();

    setSaving(false);
    if (data && !error) onBabyUpdate(data);
  }

  if (showSettings) {
    return (
      <Settings
        baby={baby}
        onBabyUpdate={onBabyUpdate}
        onBack={() => setShowSettings(false)}
        onSignOut={onSignOut}
      />
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <span style={styles.headerTitle}>Baby Logger</span>
        <button onClick={() => setShowSettings(true)} style={styles.settingsBtn}>Settings</button>
      </header>

      {/* Greeting */}
      <div style={styles.greeting}>
        Hi {displayName} — {preg.daysUntilDue > 0
          ? <>waiting for <span style={{ color: 'var(--accent)' }}>{babyDisplayName}</span></>
          : <><span style={{ color: 'var(--accent-secondary)' }}>{babyDisplayName}</span> could arrive any moment!</>
        }
      </div>

      {/* ── Pregnancy progress card ── */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span style={styles.cardIcon}>🤰</span>
          <span style={styles.cardTitle}>Pregnancy Progress</span>
        </div>
        <div style={styles.weekBadge}>
          <span style={styles.weekNumber}>Week {preg.weeksPregnant}</span>
          <span style={styles.weekDay}>+ {preg.daysIntoWeek} day{preg.daysIntoWeek !== 1 ? 's' : ''}</span>
        </div>
        <div style={styles.progressBarTrack}>
          <div style={{ ...styles.progressBarFill, width: `${Math.round(preg.progress * 100)}%` }} />
        </div>
        <div style={styles.progressLabels}>
          <span>Trimester {preg.trimester}</span>
          <span>{Math.round(preg.progress * 100)}%</span>
        </div>
      </div>

      {/* ── Baby size card ── */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span style={styles.cardIcon}>{weekInfo.emoji}</span>
          <span style={styles.cardTitle}>{babyDisplayName} is a {weekInfo.size.toLowerCase()} this week</span>
        </div>
        <div style={styles.sizeGrid}>
          {weekInfo.lengthCm > 0 && (
            <div style={styles.sizeItem}>
              <span style={styles.sizeValue}>{weekInfo.lengthCm}</span>
              <span style={styles.sizeUnit}>cm</span>
            </div>
          )}
          {weekInfo.weightG > 0 && (
            <div style={styles.sizeItem}>
              <span style={styles.sizeValue}>{weekInfo.weightG >= 1000 ? (weekInfo.weightG / 1000).toFixed(1) : weekInfo.weightG}</span>
              <span style={styles.sizeUnit}>{weekInfo.weightG >= 1000 ? 'kg' : 'g'}</span>
            </div>
          )}
        </div>
        <div style={styles.milestone}>{weekInfo.milestone}</div>
      </div>

      {/* ── Countdown card ── */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span style={styles.cardIcon}>📅</span>
          <span style={styles.cardTitle}>
            {countdown ? 'Countdown to Due Date' : 'Any day now!'}
          </span>
        </div>
        {countdown ? (
          <div style={styles.countdownRow}>
            <div style={styles.countdownBlock}>
              <span style={styles.countdownNum}>{countdown.total}</span>
              <span style={styles.countdownLabel}>days</span>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: '0.8rem', alignSelf: 'center' }}>=</div>
            <div style={styles.countdownBlock}>
              <span style={styles.countdownNum}>{countdown.weeks}</span>
              <span style={styles.countdownLabel}>weeks</span>
            </div>
            <div style={styles.countdownBlock}>
              <span style={styles.countdownNum}>{countdown.days}</span>
              <span style={styles.countdownLabel}>days</span>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <span style={{ fontSize: 40 }}>🎉</span>
            <div style={{ color: 'var(--accent-secondary)', fontSize: '1rem', fontWeight: 600, marginTop: 8 }}>
              Past due date — {babyDisplayName} is on their own schedule!
            </div>
          </div>
        )}
        <div style={styles.dueDate}>
          Due: {new Date(baby.due_date + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* ── Preparation checklist ── */}
      <div style={styles.card}>
        <button
          onClick={() => setChecklistOpen(!checklistOpen)}
          style={styles.checklistToggle}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={styles.cardIcon}>✅</span>
            <span style={styles.cardTitle}>Preparation Checklist</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={styles.checklistCount}>{checkedCount}/{checklist.length}</span>
            <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{checklistOpen ? '▲' : '▼'}</span>
          </div>
        </button>

        {checklistOpen && (
          <div style={{ marginTop: 12 }}>
            <div style={styles.checklistProgress}>
              <div style={{ ...styles.checklistProgressFill, width: `${checklist.length > 0 ? (checkedCount / checklist.length) * 100 : 0}%` }} />
            </div>
            {checklist.map(item => (
              <div key={item.id} style={styles.checklistItem}>
                <button
                  onClick={() => toggleCheck(item.id)}
                  style={{
                    ...styles.checkbox,
                    background: item.checked ? 'var(--accent)' : 'transparent',
                    borderColor: item.checked ? 'var(--accent)' : 'var(--border)',
                  }}
                >
                  {item.checked && <span style={{ color: '#121018', fontSize: 11, fontWeight: 800 }}>✓</span>}
                </button>
                <span style={{
                  flex: 1,
                  fontSize: '0.88rem',
                  color: item.checked ? 'var(--muted)' : 'var(--text)',
                  textDecoration: item.checked ? 'line-through' : 'none',
                }}>
                  {item.label}
                </span>
                {item.id.startsWith('custom-') && (
                  <button onClick={() => removeItem(item.id)} style={styles.removeBtn}>×</button>
                )}
              </div>
            ))}
            {addingItem ? (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input
                  value={newItemLabel}
                  onChange={e => setNewItemLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
                  placeholder="New item..."
                  style={{ ...styles.input, flex: 1, padding: '8px 10px', fontSize: '0.85rem' }}
                  autoFocus
                />
                <button onClick={addItem} style={{ ...styles.miniBtn, background: 'var(--accent)', color: '#121018' }}>Add</button>
                <button onClick={() => setAddingItem(false)} style={styles.miniBtn}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setAddingItem(true)} style={styles.addItemBtn}>+ Add item</button>
            )}
          </div>
        )}
      </div>

      {/* ── Baby arrived ── */}
      <div style={styles.arrivedSection}>
        {!showBirthForm ? (
          <button onClick={() => setShowBirthForm(true)} style={styles.arrivedBtn}>
            {babyDisplayName} has arrived!
          </button>
        ) : !confirmStep ? (
          <div style={styles.birthForm}>
            <div style={styles.birthFormTitle}>Record the arrival</div>
            <input
              type="text"
              placeholder="Baby's name (optional)"
              value={babyName}
              onChange={e => setBabyName(e.target.value)}
              style={styles.input}
            />
            <input
              type="date"
              value={birthDate}
              onChange={e => setBirthDate(e.target.value)}
              style={styles.input}
              required
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  if (!birthDate) return;
                  setConfirmStep(true);
                }}
                disabled={!birthDate}
                style={styles.confirmBtn}
              >
                Continue
              </button>
              <button onClick={() => { setShowBirthForm(false); setConfirmStep(false); }} style={styles.cancelBtn}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.birthForm}>
            <div style={styles.birthFormTitle}>Are you sure?</div>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 12px', lineHeight: 1.5 }}>
              This will switch to the post-birth tracker. Only confirm if {babyDisplayName} has actually been born.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleBabyArrived} disabled={saving} style={styles.confirmBtn}>
                {saving ? 'Saving...' : 'Yes, baby is here!'}
              </button>
              <button onClick={() => { setShowBirthForm(false); setConfirmStep(false); }} style={styles.cancelBtn}>
                Not yet
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={styles.footer}>
        Times are local. Due date is an estimate — babies arrive when they're ready.
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '0 16px 32px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'calc(16px + env(safe-area-inset-top)) 0 16px',
    borderBottom: '1px solid var(--border)',
    position: 'sticky',
    top: 0,
    background: 'var(--bg)',
    zIndex: 10,
  },
  headerTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '1.1rem',
    color: 'var(--accent)',
  },
  settingsBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--muted)',
    padding: '6px 12px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  greeting: {
    fontFamily: 'var(--font-display)',
    fontSize: '1rem',
    color: 'var(--text)',
    padding: '20px 0 4px',
    fontWeight: 500,
  },

  // Cards
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '16px',
    marginTop: 14,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardIcon: { fontSize: '1.1rem' },
  cardTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: '0.92rem',
    color: 'var(--text)',
  },

  // Progress
  weekBadge: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 10,
  },
  weekNumber: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.8rem',
    fontWeight: 700,
    color: 'var(--accent)',
    lineHeight: 1,
  },
  weekDay: {
    fontSize: '0.85rem',
    color: 'var(--muted)',
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    background: 'var(--border)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    background: 'linear-gradient(90deg, var(--accent), var(--accent-secondary))',
    transition: 'width 0.5s ease',
  },
  progressLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: 6,
    fontSize: '0.78rem',
    color: 'var(--muted)',
  },

  // Size
  sizeGrid: {
    display: 'flex',
    gap: 24,
    marginBottom: 10,
  },
  sizeItem: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 3,
  },
  sizeValue: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.6rem',
    fontWeight: 700,
    color: 'var(--text)',
    lineHeight: 1,
  },
  sizeUnit: {
    fontSize: '0.8rem',
    color: 'var(--muted)',
  },
  milestone: {
    fontSize: '0.85rem',
    color: 'var(--muted)',
    lineHeight: 1.5,
    fontStyle: 'italic',
  },

  // Countdown
  countdownRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'center',
    padding: '4px 0 8px',
  },
  countdownBlock: {
    textAlign: 'center' as const,
  },
  countdownNum: {
    fontFamily: 'var(--font-display)',
    fontSize: '2rem',
    fontWeight: 700,
    color: 'var(--accent)',
    lineHeight: 1,
    display: 'block',
  },
  countdownLabel: {
    fontSize: '0.72rem',
    color: 'var(--muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginTop: 2,
    display: 'block',
  },
  dueDate: {
    textAlign: 'center' as const,
    fontSize: '0.82rem',
    color: 'var(--muted)',
    marginTop: 4,
  },

  // Checklist
  checklistToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    color: 'inherit',
    fontFamily: 'inherit',
  },
  checklistCount: {
    background: 'var(--bg)',
    borderRadius: 12,
    padding: '2px 8px',
    fontSize: '0.78rem',
    fontWeight: 600,
    color: 'var(--accent)',
  },
  checklistProgress: {
    height: 4,
    borderRadius: 2,
    background: 'var(--border)',
    overflow: 'hidden',
    marginBottom: 10,
  },
  checklistProgressFill: {
    height: '100%',
    borderRadius: 2,
    background: 'var(--ok)',
    transition: 'width 0.3s ease',
  },
  checklistItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 0',
    borderBottom: '1px solid var(--border)',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    border: '2px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    padding: 0,
    transition: 'all 0.15s',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    fontSize: '1.1rem',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
  },
  addItemBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    fontSize: '0.82rem',
    cursor: 'pointer',
    padding: '10px 0 0',
    fontFamily: 'var(--font-body)',
  },

  // Birth form
  arrivedSection: {
    marginTop: 24,
    textAlign: 'center' as const,
  },
  arrivedBtn: {
    background: 'transparent',
    border: '1px solid var(--accent-secondary)',
    borderRadius: 'var(--radius)',
    color: 'var(--accent-secondary)',
    padding: '12px 24px',
    fontSize: '0.95rem',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  birthForm: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: 20,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
    maxWidth: 320,
    margin: '0 auto',
    textAlign: 'left' as const,
  },
  birthFormTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '1rem',
    color: 'var(--accent-secondary)',
    marginBottom: 2,
  },
  input: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    color: 'var(--text)',
    fontSize: '0.95rem',
    fontFamily: 'var(--font-body)',
    outline: 'none',
  },
  confirmBtn: {
    flex: 1,
    background: 'var(--accent-secondary)',
    color: '#121018',
    border: 'none',
    borderRadius: 'var(--radius)',
    padding: '10px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    cursor: 'pointer',
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--muted)',
    padding: '10px 16px',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: '0.9rem',
  },
  miniBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--muted)',
    padding: '8px 12px',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: '0.82rem',
    fontWeight: 600,
  },

  footer: {
    textAlign: 'center' as const,
    color: 'var(--muted)',
    fontSize: '0.72rem',
    padding: '20px 16px',
    lineHeight: 1.5,
  },
};
