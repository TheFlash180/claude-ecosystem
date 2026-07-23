import { UtensilsCrossed } from 'lucide-react';
import { W, type Goal } from '../lib/config';
import type { Targets } from '../lib/fitness';

const GOAL_NOTE: Record<Goal, string> = {
  recomp: 'Gentle deficit — lose fat while you build. Protein is king.',
  cut: 'Leaning out. Keep protein high to hold your muscle.',
  build: 'Slight surplus to add lean muscle. Eat, train, repeat.',
};

export function EatCard({ targets, goal, mealPrepUrl }: {
  targets: Targets | null; goal: Goal; mealPrepUrl: string;
}) {
  if (!targets) {
    return (
      <div style={card}>
        <div style={{ color: W.sub, fontSize: 13 }}>Add your stats on the profile to see daily eating targets.</div>
      </div>
    );
  }
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <span style={{ fontFamily: W.display, fontSize: 15, letterSpacing: '0.08em', color: W.volt, textTransform: 'uppercase' }}>
          Fuel
        </span>
        <span style={{ fontSize: 11, color: W.muted }}>maintenance ≈ {targets.maintenance} kcal</span>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <Stat big label="kcal / day" value={String(targets.calories)} accent />
        <Stat big label="protein" value={`${targets.protein} g`} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <Stat label="carbs" value={`${targets.carbs} g`} />
        <Stat label="fat" value={`${targets.fat} g`} />
      </div>

      <div style={{ fontSize: 12, color: W.sub, lineHeight: 1.55, margin: '11px 0 10px' }}>
        {GOAL_NOTE[goal]} Protein at every meal, veg + water, and lean on your prepped recipes.
      </div>
      <a href={mealPrepUrl} style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none',
        background: 'transparent', border: `1px solid ${W.border}`, borderRadius: 10,
        padding: '9px 13px', color: W.text, fontFamily: W.body, fontSize: 13, fontWeight: 600,
      }}>
        <UtensilsCrossed size={15} color={W.volt} /> Open Meal Prep
      </a>
    </div>
  );
}

function Stat({ label, value, big, accent }: { label: string; value: string; big?: boolean; accent?: boolean }) {
  return (
    <div style={{ flex: 1, background: W.bg, border: `1px solid ${W.border}`, borderRadius: 11, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: W.muted }}>{label}</div>
      <div style={{ fontFamily: W.display, fontSize: big ? 26 : 20, color: accent ? W.volt : W.text, marginTop: 2, letterSpacing: '0.02em' }}>
        {value}
      </div>
    </div>
  );
}

const card = {
  background: W.surface, border: `1px solid ${W.border}`, borderRadius: 14, padding: 14, marginBottom: 12,
} as const;
