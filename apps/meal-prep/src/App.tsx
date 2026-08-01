import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Bell, BellOff, BookOpen, Pencil, Search, ShoppingBasket, Sparkles, Trash2 } from 'lucide-react';
import { K, MEAL_FILTERS, QUICK_MINUTES, type MealType, type Recipe, type ShoppingRow } from './lib/config';
import {
  buildShoppingList, filterRecipes, pickOfTheDay, shoppingProgress, timeLabel,
  EMPTY_FILTER, type RecipeFilter,
} from './lib/recipes';
import {
  addExtra, cookAdd, cookClear, cookRemove, fetchCookList, fetchRecipes,
  fetchTicks, removeExtra, setTick,
} from './lib/data';
import { disablePrepReminder, enablePrepReminder, prepReminderStatus } from './lib/push';
import { RecipeGrid } from './components/RecipeGrid';
import { RecipeDetail } from './components/RecipeDetail';
import { ShoppingList } from './components/ShoppingList';
import { RecipesPage } from './components/RecipesPage';

type Tab = 'cook' | 'shop' | 'edit';

function sastDay(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
}

export default function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [cookIds, setCookIds] = useState<string[]>([]);
  const [ticks, setTicks] = useState<ShoppingRow[]>([]);
  const [tab, setTab] = useState<Tab>('cook');
  const [filter, setFilter] = useState<RecipeFilter>(EMPTY_FILTER);
  const [open, setOpen] = useState<Recipe | null>(null);
  const [bell, setBell] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const say = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(t => (t === msg ? null : t)), 2400);
  }, []);

  const load = useCallback(async () => {
    const [r, c, t] = await Promise.all([fetchRecipes(), fetchCookList(), fetchTicks()]);
    setRecipes(r);
    setCookIds(c);
    setTicks(t);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void prepReminderStatus().then(setBell); }, []);

  const byId = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes]);
  const cookSet = useMemo(() => new Set(cookIds), [cookIds]);
  const shown = useMemo(() => filterRecipes(recipes, filter), [recipes, filter]);
  const sections = useMemo(
    () => buildShoppingList(cookIds, byId, ticks),
    [cookIds, byId, ticks],
  );
  const progress = useMemo(() => shoppingProgress(sections), [sections]);

  // Same suggestion all day, so it reads as a suggestion rather than a slot
  // machine. Only from what is actually browsable right now.
  const suggestion = useMemo(
    () => pickOfTheDay(shown, sastDay()),
    [shown],
  );

  const chosen = cookIds.map(id => byId.get(id)).filter((r): r is Recipe => Boolean(r));

  const toggleCook = async (r: Recipe) => {
    const on = cookSet.has(r.id);
    // Optimistic: the sheet button should flip the instant it is tapped.
    setCookIds(prev => (on ? prev.filter(id => id !== r.id) : [...prev, r.id]));
    const ok = on ? await cookRemove(r.id) : await cookAdd(r.id);
    if (!ok) { say("Couldn't save that."); }
    await load();
  };

  const onTick = async (key: string, label: string, checked: boolean) => {
    setTicks(prev => {
      const rest = prev.filter(p => p.itemKey !== key);
      return [...rest, { itemKey: key, label, checked, custom: key.startsWith('x-') }];
    });
    await setTick(key, label, checked);
  };

  const onAddExtra = async (label: string) => {
    const key = await addExtra(label);
    if (!key) { say("Couldn't add that."); return; }
    await load();
  };

  const onRemoveExtra = async (key: string) => {
    setTicks(prev => prev.filter(p => p.itemKey !== key));
    await removeExtra(key);
  };

  const onClear = async () => {
    if (!(await cookClear())) { say("Couldn't clear the list."); return; }
    say('List cleared.');
    await load();
  };

  const toggleBell = async () => {
    if (bell) {
      const ok = await disablePrepReminder();
      if (ok) { setBell(false); say('Sunday reminder off.'); }
      else say("Couldn't update the reminder.");
      return;
    }
    try {
      if ('Notification' in window && Notification.permission !== 'granted') {
        await Notification.requestPermission();
      }
    } catch { /* unsupported */ }
    const ok = await enablePrepReminder();
    if (ok) { setBell(true); say('Sunday-morning reminder is on.'); }
    else say('Allow notifications and try again.');
  };

  return (
    <div style={{
      background: K.bg, minHeight: '100vh', fontFamily: K.body,
      maxWidth: 620, margin: '0 auto', color: K.text,
    }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: ${K.bg}; }
        button:focus-visible, input:focus-visible, select:focus-visible,
        textarea:focus-visible { outline: 2px solid ${K.terra}; outline-offset: 2px; }
      `}</style>

      {toast && (
        <div role="status" style={{
          position: 'fixed', top: 'calc(14px + env(safe-area-inset-top))', left: '50%',
          transform: 'translateX(-50%)', zIndex: 200,
          background: K.text, color: K.bg, padding: '10px 18px', borderRadius: 22,
          fontSize: 13, boxShadow: '0 4px 20px rgba(0,0,0,0.25)', whiteSpace: 'nowrap',
          pointerEvents: 'none',
        } as CSSProperties}>
          {toast}
        </div>
      )}

      <header style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'calc(16px + env(safe-area-inset-top)) 16px 10px',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            margin: 0, fontFamily: K.display, fontSize: 23, fontWeight: 600,
            color: K.text, letterSpacing: '-0.01em',
          }}>
            Meal Prep
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: K.muted }}>
            {recipes.length} recipes
            {cookIds.length > 0 && <> · {cookIds.length} on the list</>}
          </p>
        </div>
        <button
          onClick={() => void toggleBell()}
          aria-label={bell ? 'Sunday reminder is on' : 'Turn on the Sunday reminder'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: bell ? `${K.terra}18` : 'transparent',
            color: bell ? K.terraDark : K.muted,
            border: `1px solid ${bell ? K.terra : K.border}`,
            borderRadius: 999, padding: '7px 12px', cursor: 'pointer',
            fontSize: 12.5, fontWeight: 600,
          }}
        >
          {bell ? <Bell size={14} /> : <BellOff size={14} />}
          {bell ? 'On' : 'Off'}
        </button>
      </header>

      <nav style={{ display: 'flex', gap: 6, padding: '0 16px 12px' }}>
        {([
          { key: 'cook', label: 'Recipes', icon: BookOpen },
          { key: 'shop', label: progress.total > 0 ? `Shopping ${progress.done}/${progress.total}` : 'Shopping', icon: ShoppingBasket },
          { key: 'edit', label: 'Manage', icon: Pencil },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: tab === t.key ? K.terra : K.surface,
              color: tab === t.key ? '#fff' : K.sub,
              border: `1px solid ${tab === t.key ? K.terra : K.border}`,
              borderRadius: 999, padding: '8px 14px', cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
            }}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </nav>

      <main style={{ padding: '0 14px 40px' }}>
        {loading && (
          <p style={{ color: K.muted, fontSize: 13.5, padding: '30px 4px' }}>Loading…</p>
        )}

        {!loading && tab === 'cook' && (
          <>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <Search size={15} color={K.muted} style={{
                position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
              }} />
              <input
                value={filter.search}
                onChange={e => setFilter({ ...filter, search: e.target.value })}
                placeholder="Search a dish, or what's in the fridge…"
                style={{
                  width: '100%', background: K.surface, color: K.text,
                  border: `1px solid ${K.border}`, borderRadius: 12,
                  padding: '11px 12px 11px 33px', fontSize: 14, fontFamily: K.body,
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {MEAL_FILTERS.map(m => (
                <Chip
                  key={m.key}
                  on={filter.meal === m.key}
                  onClick={() => setFilter({ ...filter, meal: m.key as MealType | 'all' })}
                >
                  {m.label}
                </Chip>
              ))}
              <Chip
                on={filter.quickOnly}
                onClick={() => setFilter({ ...filter, quickOnly: !filter.quickOnly })}
              >
                Under {QUICK_MINUTES} min
              </Chip>
            </div>

            {suggestion && filter.search.trim() === '' && (
              <button
                onClick={() => setOpen(suggestion)}
                style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer',
                  background: `${K.honey}14`, border: `1px solid ${K.honey}55`,
                  borderRadius: 14, padding: '12px 14px', marginBottom: 14,
                  display: 'flex', alignItems: 'center', gap: 11,
                }}
              >
                <Sparkles size={17} color={K.honey} style={{ flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{
                    display: 'block', fontSize: 11, textTransform: 'uppercase',
                    letterSpacing: '0.08em', color: K.honey, fontWeight: 700,
                  }}>
                    Can't decide?
                  </span>
                  <span style={{
                    display: 'block', fontFamily: K.display, fontSize: 15,
                    fontWeight: 600, color: K.text, marginTop: 2,
                  }}>
                    {suggestion.emoji} {suggestion.name}
                    {suggestion.totalMinutes !== null && (
                      <span style={{ color: K.muted, fontWeight: 400, fontFamily: K.body, fontSize: 13 }}>
                        {' · '}{timeLabel(suggestion.totalMinutes)}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            )}

            <RecipeGrid recipes={shown} cookIds={cookSet} onOpen={setOpen} />
          </>
        )}

        {!loading && tab === 'shop' && (
          <>
            {chosen.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 7,
                }}>
                  <span style={{
                    fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.09em',
                    color: K.muted, fontWeight: 700,
                  }}>
                    Cooking
                  </span>
                  <button onClick={() => void onClear()} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'transparent', border: 'none', color: K.muted,
                    cursor: 'pointer', fontSize: 12, fontFamily: K.body,
                  }}>
                    <Trash2 size={12} /> Clear
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {chosen.map(r => (
                    <button
                      key={r.id}
                      onClick={() => setOpen(r)}
                      style={{
                        background: K.surface, border: `1px solid ${K.border}`,
                        borderRadius: 999, padding: '6px 12px', cursor: 'pointer',
                        fontSize: 12.5, color: K.text, fontFamily: K.body,
                      }}
                    >
                      {r.emoji} {r.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <ShoppingList
              sections={sections}
              onTick={(k, l, c) => void onTick(k, l, c)}
              onAddExtra={l => void onAddExtra(l)}
              onRemoveExtra={k => void onRemoveExtra(k)}
            />
          </>
        )}

        {!loading && tab === 'edit' && (
          <RecipesPage recipes={recipes} onChanged={() => void load()} onToast={say} />
        )}
      </main>

      {open && (
        <RecipeDetail
          recipe={open}
          inList={cookSet.has(open.id)}
          onCook={() => void toggleCook(open)}
          onUncook={() => void toggleCook(open)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: {
  on: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: on ? `${K.terra}18` : K.surface,
        color: on ? K.terraDark : K.sub,
        border: `1px solid ${on ? K.terra : K.border}`,
        borderRadius: 999, padding: '7px 13px', cursor: 'pointer',
        fontSize: 12.5, fontWeight: 600, fontFamily: K.body,
      }}
    >
      {children}
    </button>
  );
}
