import { useCallback, useEffect, useMemo, useState, CSSProperties } from 'react';
import { K, type PlanSlot, type Recipe, type ShoppingRow, type Slot } from './lib/config';
import {
  addDays, buildShoppingList, fmtWeekRange, sastDay, weekStartOf,
} from './lib/plan';
import {
  addExtra, fetchPlan, fetchRecipes, fetchShopping, removeExtra, setSlot, setTick,
} from './lib/data';
import { disablePrepReminder, enablePrepReminder, prepReminderStatus } from './lib/push';
import { PlanBoard } from './components/PlanBoard';
import { RecipePicker } from './components/RecipePicker';
import { ShoppingList } from './components/ShoppingList';
import { RecipesPage } from './components/RecipesPage';

type Tab = 'plan' | 'shop' | 'recipes';

export default function App() {
  const [tab, setTab] = useState<Tab>('plan');
  const [week, setWeek] = useState(() => weekStartOf(sastDay()));
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [slots, setSlots] = useState<PlanSlot[]>([]);
  const [shopping, setShopping] = useState<ShoppingRow[]>([]);
  const [picker, setPicker] = useState<{ day: number; slot: Slot } | null>(null);
  const [bell, setBell] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const recipeMap = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes]);

  const loadRecipes = useCallback(async () => setRecipes(await fetchRecipes()), []);
  const loadWeek = useCallback(async (w: string) => {
    const [p, s] = await Promise.all([fetchPlan(w), fetchShopping(w)]);
    setSlots(p);
    setShopping(s);
  }, []);

  useEffect(() => {
    void loadRecipes();
    void prepReminderStatus().then(setBell);
  }, [loadRecipes]);
  useEffect(() => { void loadWeek(week); }, [week, loadWeek]);

  const pickRecipe = async (recipe: Recipe, leftover: { day: number; slot: Slot } | null) => {
    if (!picker) return;
    setPicker(null);
    const ok = await setSlot(week, picker.day, picker.slot, recipe.id, false);
    let ok2 = true;
    if (ok && leftover) {
      ok2 = await setSlot(week, leftover.day, leftover.slot, recipe.id, true);
    }
    if (!ok || !ok2) showToast("Couldn't save that — try again.");
    else showToast(leftover ? '♻️ Planned, leftovers included.' : `${recipe.emoji} Planned.`);
    await loadWeek(week);
  };

  const clearSlot = async (day: number, slot: Slot) => {
    await setSlot(week, day, slot, null);
    await loadWeek(week);
  };

  const tick = async (key: string, label: string, checked: boolean) => {
    // Optimistic: flip locally, then sync.
    setShopping(prev => {
      const hit = prev.find(r => r.itemKey === key);
      if (hit) return prev.map(r => (r.itemKey === key ? { ...r, checked } : r));
      return [...prev, { itemKey: key, label, checked, custom: false }];
    });
    const ok = await setTick(week, key, label, checked);
    if (!ok) { showToast("Couldn't sync that tick."); await loadWeek(week); }
  };

  const addShopExtra = async (label: string) => {
    const key = await addExtra(week, label);
    if (!key) { showToast("Couldn't add that."); return; }
    await loadWeek(week);
  };

  const removeShopExtra = async (key: string) => {
    await removeExtra(week, key);
    await loadWeek(week);
  };

  const toggleBell = async () => {
    if (bell) {
      const ok = await disablePrepReminder();
      if (ok) { setBell(false); showToast('🔕 Sunday reminder off.'); }
      else showToast("Couldn't update the reminder.");
      return;
    }
    try {
      if ('Notification' in window && Notification.permission !== 'granted') {
        await Notification.requestPermission();
      }
    } catch { /* unsupported */ }
    const ok = await enablePrepReminder();
    if (ok) { setBell(true); showToast('🔔 Sunday-morning prep reminder is on.'); }
    else showToast('Allow notifications and try again.');
  };

  const sections = useMemo(
    () => buildShoppingList(slots, recipeMap, shopping),
    [slots, recipeMap, shopping],
  );
  const thisWeek = weekStartOf(sastDay());
  const plannedCount = slots.length;

  return (
    <div style={{ background: K.bg, minHeight: '100vh', fontFamily: K.body, maxWidth: 520, margin: '0 auto' }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: ${K.bg}; }
        button:focus-visible, input:focus-visible { outline: 2px solid ${K.terra}; outline-offset: 2px; }
      `}</style>

      {toast && (
        <div style={{
          position: 'fixed', top: 'calc(14px + env(safe-area-inset-top))', left: '50%',
          transform: 'translateX(-50%)', zIndex: 999,
          background: K.text, color: K.bg, padding: '11px 20px', borderRadius: 24,
          fontSize: 13.5, fontWeight: 500, fontFamily: K.body,
          boxShadow: '0 4px 24px rgba(59,46,32,0.35)',
          whiteSpace: 'nowrap', pointerEvents: 'none',
        } as CSSProperties}>
          {toast}
        </div>
      )}

      {picker && (
        <RecipePicker
          day={picker.day}
          slot={picker.slot}
          recipes={recipes}
          slots={slots}
          onSave={(r, leftover) => void pickRecipe(r, leftover)}
          onClose={() => setPicker(null)}
        />
      )}

      {/* Header */}
      <div style={{
        padding: 'calc(18px + env(safe-area-inset-top)) 16px 0',
        borderBottom: `1px solid ${K.border}`,
        position: 'sticky', top: 0, zIndex: 10,
        background: `${K.bg}F2`,
        backdropFilter: 'blur(9px)', WebkitBackdropFilter: 'blur(9px)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: K.display, fontSize: 25, fontWeight: 700, color: K.terra, lineHeight: 1 }}>
              Meal Prep
            </div>
            <div style={{ fontSize: 11.5, color: K.muted, marginTop: 3 }}>
              What's cooking this week?
            </div>
          </div>
          <button
            onClick={() => void toggleBell()}
            aria-label={bell ? 'Sunday reminder on' : 'Sunday reminder off'}
            title="Sunday-morning prep reminder"
            style={{
              background: bell ? `${K.honey}1C` : 'transparent',
              border: `1px solid ${bell ? K.honey : K.border}`,
              borderRadius: 20, padding: '7px 13px', cursor: 'pointer',
              fontSize: 14, lineHeight: 1, color: bell ? K.honey : K.muted,
              fontWeight: 700, flexShrink: 0,
            }}>
            {bell ? '🔔 Sun' : '🔕'}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
          {([
            { key: 'plan' as Tab, label: '📅 Plan' },
            { key: 'shop' as Tab, label: '🛒 Shop' },
            { key: 'recipes' as Tab, label: '📖 Recipes' },
          ]).map(t => {
            const on = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: '9px 16px 11px', cursor: 'pointer',
                fontFamily: K.body, fontSize: 13.5, fontWeight: on ? 700 : 500,
                background: 'transparent', border: 'none',
                borderBottom: `2.5px solid ${on ? K.terra : 'transparent'}`,
                color: on ? K.terra : K.sub,
              }}>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Week nav (Plan + Shop share the selected week) */}
      {tab !== 'recipes' && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px 2px',
        }}>
          <button onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week"
            style={{ background: 'transparent', border: `1px solid ${K.border}`, borderRadius: 10, padding: '6px 12px', cursor: 'pointer', color: K.sub, fontSize: 13 }}>
            ←
          </button>
          <button
            onClick={() => setWeek(thisWeek)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'center' }}>
            <span style={{ display: 'block', fontFamily: K.display, fontSize: 15.5, fontWeight: 700, color: K.text }}>
              {week === thisWeek ? 'This week' : week === addDays(thisWeek, 7) ? 'Next week' : fmtWeekRange(week)}
            </span>
            <span style={{ fontSize: 10.5, color: K.muted }}>
              {week === thisWeek || week === addDays(thisWeek, 7) ? fmtWeekRange(week) : 'tap for this week'}
              {plannedCount > 0 ? ` · ${plannedCount} meal${plannedCount > 1 ? 's' : ''}` : ''}
            </span>
          </button>
          <button onClick={() => setWeek(addDays(week, 7))} aria-label="Next week"
            style={{ background: 'transparent', border: `1px solid ${K.border}`, borderRadius: 10, padding: '6px 12px', cursor: 'pointer', color: K.sub, fontSize: 13 }}>
            →
          </button>
        </div>
      )}

      {/* Body */}
      <div style={{ padding: '12px 14px 48px' }}>
        {tab === 'plan' && (
          <PlanBoard
            weekStart={week}
            slots={slots}
            recipes={recipeMap}
            onPick={(day, slot) => setPicker({ day, slot })}
            onClear={(day, slot) => void clearSlot(day, slot)}
          />
        )}
        {tab === 'shop' && (
          <ShoppingList
            sections={sections}
            onTick={(k, l, c) => void tick(k, l, c)}
            onAddExtra={l => void addShopExtra(l)}
            onRemoveExtra={k => void removeShopExtra(k)}
          />
        )}
        {tab === 'recipes' && (
          <RecipesPage
            recipes={recipes}
            onChanged={() => { void loadRecipes(); void loadWeek(week); }}
            onToast={showToast}
          />
        )}

        <div style={{
          marginTop: 26, paddingTop: 14, borderTop: `1px solid ${K.border}`,
          fontSize: 11, color: K.muted, lineHeight: 1.8,
        }}>
          🍳 Plan lunches and dinners, and the shopping list writes itself.
          Turn on the 🔔 for a Sunday-morning prep nudge with the week's menu.
        </div>
      </div>
    </div>
  );
}
