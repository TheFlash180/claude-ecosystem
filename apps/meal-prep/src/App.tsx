import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Bell, BellOff, BookOpen, Pencil, Search, Share, ShoppingBasket, Snowflake, Sparkles,
  Trash2, X,
} from 'lucide-react';
import {
  K, MAX_SERVES, MEAL_FILTERS, MIN_SERVES, TAG_META, TIME_FILTERS,
  type CookEntry, type MealType, type Recipe, type ShoppingRow,
} from './lib/config';
import {
  buildShoppingList, filterRecipes, pickOfTheDay, shoppingProgress, timeLabel,
  toggleTag, EMPTY_FILTER, type RecipeFilter,
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
import { FreezerPage } from './components/FreezerPage';

type Tab = 'cook' | 'freezer' | 'shop' | 'edit';

const TAB_TITLE: Record<Tab, string> = {
  cook: 'Meal Prep', freezer: 'Freezer meals', shop: 'Shopping', edit: 'Manage',
};

function sastDay(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
}

/** How often an open shopping list re-reads the shared one. Two people in
 *  one shop each tick off half the list; without this, neither phone knows
 *  what the other already has in the trolley. */
const SHOP_REFRESH_MS = 15_000;

export default function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [cookList, setCookList] = useState<CookEntry[]>([]);
  const [ticks, setTicks] = useState<ShoppingRow[]>([]);
  const [tab, setTab] = useState<Tab>('cook');
  const [filter, setFilter] = useState<RecipeFilter>(EMPTY_FILTER);
  const [open, setOpen] = useState<Recipe | null>(null);
  // Serving size for the open sheet. Resets each time a recipe is opened, so
  // last night's "cook for 12" does not follow you into the next recipe.
  const [servings, setServings] = useState(4);
  const [bell, setBell] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Writes bump this, so a background refresh that started before a tap
  // cannot land after it and flick the tick back.
  const writes = useRef(0);
  const pending = useRef(0);

  const say = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(t => (t === msg ? null : t)), 2600);
  }, []);

  const load = useCallback(async () => {
    const [r, c, t] = await Promise.all([fetchRecipes(), fetchCookList(), fetchTicks()]);
    setRecipes(r);
    setCookList(c);
    setTicks(t);
    setLoading(false);
  }, []);

  /** The shared list only — the recipes do not change while you shop. */
  const refreshList = useCallback(async () => {
    if (pending.current > 0 || document.visibilityState !== 'visible') return;
    const before = writes.current;
    const [c, t] = await Promise.all([fetchCookList(), fetchTicks()]);
    if (writes.current !== before || pending.current > 0) return;
    setCookList(c);
    setTicks(t);
  }, []);

  const write = async <T,>(fn: () => Promise<T>): Promise<T> => {
    writes.current++;
    pending.current++;
    try { return await fn(); } finally { pending.current--; }
  };

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void prepReminderStatus().then(setBell); }, []);

  // Coming back to the app (unlocking the phone, switching back from
  // WhatsApp) re-reads the list, so it shows what the other phone did.
  useEffect(() => {
    const onBack = () => { if (document.visibilityState === 'visible') void refreshList(); };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => {
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
    };
  }, [refreshList]);

  useEffect(() => {
    if (tab !== 'shop') return;
    const t = setInterval(() => void refreshList(), SHOP_REFRESH_MS);
    return () => clearInterval(t);
  }, [tab, refreshList]);

  // The recipe sheet is a history entry, so Android's back button (and the
  // back swipe) closes it instead of leaving the app.
  useEffect(() => {
    if ((history.state as { mpSheet?: boolean } | null)?.mpSheet) history.replaceState(null, '');
    const onPop = () => setOpen(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // The page behind an open sheet must not scroll under your thumb.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const byId = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes]);
  const cookSet = useMemo(() => new Set(cookList.map(c => c.recipeId)), [cookList]);
  const shown = useMemo(() => filterRecipes(recipes, filter), [recipes, filter]);
  const sections = useMemo(
    () => buildShoppingList(cookList, byId, ticks),
    [cookList, byId, ticks],
  );
  const progress = useMemo(() => shoppingProgress(sections), [sections]);
  const toBuy = progress.total - progress.done;
  const filtering = filter.meal !== 'all' || filter.maxMinutes !== null
    || filter.tags.length > 0 || filter.search.trim() !== '';

  // Same suggestion all day, so it reads as a suggestion rather than a slot
  // machine. Only from what is actually browsable right now.
  const suggestion = useMemo(
    () => pickOfTheDay(shown, sastDay()),
    [shown],
  );

  const chosen = cookList
    .map(c => ({ entry: c, recipe: byId.get(c.recipeId) }))
    .filter((x): x is { entry: CookEntry; recipe: Recipe } => Boolean(x.recipe));

  const goTo = (t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  /** Open a recipe at the size it is already on the list for, if it is. */
  const openRecipe = (r: Recipe) => {
    const entry = cookList.find(c => c.recipeId === r.id);
    setServings(entry?.servings ?? r.serves);
    setOpen(r);
    history.pushState({ mpSheet: true }, '');
  };

  const closeRecipe = () => {
    if ((history.state as { mpSheet?: boolean } | null)?.mpSheet) history.back();
    else setOpen(null);
  };

  const toggleCook = async (r: Recipe, forServings: number) => {
    const on = cookSet.has(r.id);
    // Optimistic: the sheet button should flip the instant it is tapped.
    setCookList(prev => (on
      ? prev.filter(c => c.recipeId !== r.id)
      : [...prev, { recipeId: r.id, servings: forServings }]));
    const ok = await write(() => (on
      ? cookRemove(r.id)
      : cookAdd(r.id, r.scalable ? forServings : null)));
    if (!ok) say("Couldn't save that.");
    else if (!on) say(`${r.name} is on the shopping list.`);
    await load();
  };

  const onTick = async (key: string, label: string, checked: boolean) => {
    setTicks(prev => {
      const rest = prev.filter(p => p.itemKey !== key);
      return [...rest, { itemKey: key, label, checked, custom: key.startsWith('x-') }];
    });
    if (!(await write(() => setTick(key, label, checked)))) say("Couldn't save that tick.");
  };

  const onAddExtra = async (label: string) => {
    const key = await write(() => addExtra(label));
    if (!key) { say("Couldn't add that."); return; }
    await load();
  };

  /** Freezer supplies go on the list as ordinary extras, one call each. */
  const onAddSupplies = async (labels: string[]) => {
    let added = 0;
    for (const label of labels) if (await write(() => addExtra(label))) added++;
    say(added === labels.length
      ? `Added ${added} freezer supplies to the shopping list.`
      : "Couldn't add all of them — try again.");
    await load();
  };

  const onRemoveExtra = async (key: string) => {
    setTicks(prev => prev.filter(p => p.itemKey !== key));
    await write(() => removeExtra(key));
  };

  /** Clearing empties the list on both phones, ticks and extras included, so
   *  it asks first: one stray tap mid-shop would otherwise lose the lot. */
  const onClear = async () => {
    const n = chosen.length;
    if (!window.confirm(`Start a new list? This removes ${n === 1 ? 'the recipe' : `all ${n} recipes`} and every tick, on both phones.`)) return;
    if (!(await write(() => cookClear()))) { say("Couldn't clear the list."); return; }
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
    if (ok) { setBell(true); say('On Sundays at 08:25 you will get what is on the list.'); }
    else say('Allow notifications and try again.');
  };

  return (
    <div style={{
      background: K.bg, minHeight: '100dvh', fontFamily: K.body,
      maxWidth: 620, margin: '0 auto', color: K.text,
    }}>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; background: ${K.bg}; -webkit-text-size-adjust: 100%; }
        button { touch-action: manipulation; }
        button:focus-visible, input:focus-visible, select:focus-visible,
        textarea:focus-visible { outline: 2px solid ${K.terra}; outline-offset: 2px; }
        /* iOS zooms the whole page into any field under 16px. */
        input, select, textarea { font-size: 16px !important; }
        input[type=search]::-webkit-search-cancel-button { display: none; }
        .rem-short { display: none; }
        @media (max-width: 389px) { .rem-long { display: none; } .rem-short { display: inline; } }
        .press { transition: transform 0.12s ease; }
        .press:active { transform: scale(0.97); }
        .chips { display: flex; gap: 7px; overflow-x: auto; scrollbar-width: none;
                 margin: 0 -14px; padding: 0 14px; }
        .chips::-webkit-scrollbar { display: none; }
        .sheet { animation: mp-up 0.24s cubic-bezier(0.2, 0.8, 0.2, 1); }
        .backdrop { animation: mp-fade 0.2s ease-out; }
        .skeleton { animation: mp-pulse 1.2s ease-in-out infinite; }
        @keyframes mp-up { from { transform: translateY(100%); } to { transform: none; } }
        @keyframes mp-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes mp-pulse { 50% { opacity: 0.5; } }
        @media (prefers-reduced-motion: reduce) {
          .sheet, .backdrop, .skeleton { animation: none; }
          .press:active { transform: none; }
        }
      `}</style>

      {toast && (
        <div role="status" style={{
          position: 'fixed', top: 'calc(12px + env(safe-area-inset-top))', left: '50%',
          transform: 'translateX(-50%)', zIndex: 200, maxWidth: 'calc(100% - 32px)',
          background: K.text, color: K.bg, padding: '11px 18px', borderRadius: 22,
          fontSize: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.25)', textAlign: 'center',
          pointerEvents: 'none',
        } as CSSProperties}>
          {toast}
        </div>
      )}

      <header style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'calc(16px + env(safe-area-inset-top)) 16px 12px',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            margin: 0, fontFamily: K.display, fontSize: 25, fontWeight: 600,
            color: K.text, letterSpacing: '-0.01em',
          }}>
            {TAB_TITLE[tab]}
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 13.5, color: K.muted }}>
            {tab === 'cook' && <>{recipes.length} recipes{cookList.length > 0 && <> · {cookList.length} on the list</>}</>}
            {tab === 'freezer' && 'Cook now, eat after the baby'}
            {tab === 'shop' && 'The same list on both phones'}
            {tab === 'edit' && 'Add a recipe or change one'}
          </p>
        </div>
        <button
          onClick={() => void toggleBell()}
          aria-pressed={bell}
          aria-label={bell ? 'Sunday reminder is on — tap to turn off' : 'Turn on the Sunday reminder'}
          className="press"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40,
            background: bell ? `${K.terra}14` : K.surface,
            color: bell ? K.terraDark : K.sub,
            border: `1px solid ${bell ? K.terra : K.border}`,
            borderRadius: 999, padding: '0 13px', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, fontFamily: K.body, flexShrink: 0,
          }}
        >
          {bell ? <Bell size={15} /> : <BellOff size={15} />}
          <span className="rem-long">Sunday reminder</span>
          <span className="rem-short">Sundays</span>
        </button>
      </header>

      <InstallHint />

      <main style={{ padding: '0 14px calc(96px + env(safe-area-inset-bottom))' }}>
        {loading && <Skeleton />}

        {!loading && tab === 'cook' && (
          <>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <Search size={17} color={K.muted} style={{
                position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
              }} />
              <input
                type="search"
                value={filter.search}
                onChange={e => setFilter({ ...filter, search: e.target.value })}
                placeholder="Search a dish, or what's in the fridge"
                enterKeyHint="search"
                style={{
                  width: '100%', background: K.surface, color: K.text,
                  border: `1px solid ${K.border}`, borderRadius: 14,
                  padding: '13px 42px 13px 39px', fontFamily: K.body,
                  appearance: 'none',
                }}
              />
              {filter.search && (
                <button
                  onClick={() => setFilter({ ...filter, search: '' })}
                  aria-label="Clear the search"
                  style={{
                    position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                    width: 40, height: 40, background: 'transparent', border: 'none',
                    color: K.muted, cursor: 'pointer', display: 'grid', placeItems: 'center',
                  }}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            <div className="chips" style={{ marginBottom: 8 }}>
              {MEAL_FILTERS.map(m => (
                <Chip
                  key={m.key}
                  on={filter.meal === m.key}
                  onClick={() => setFilter({ ...filter, meal: m.key as MealType | 'all' })}
                >
                  {m.label}
                </Chip>
              ))}
            </div>

            {/* Easy, high-protein and quick narrow whatever meal is chosen
                above, and tap off again — no "Any time" chip to find first.
                Easy leads, because it is the one reached for when tired. */}
            <div className="chips" style={{ marginBottom: 14 }}>
              {TAG_META.map(t => (
                <Chip
                  key={t.tag}
                  on={filter.tags.includes(t.tag)}
                  onClick={() => setFilter({ ...filter, tags: toggleTag(filter.tags, t.tag) })}
                >
                  {t.label}
                </Chip>
              ))}
              {TIME_FILTERS.filter(t => t.key !== null).map(t => (
                <Chip
                  key={String(t.key)}
                  on={filter.maxMinutes === t.key}
                  onClick={() => setFilter({ ...filter, maxMinutes: filter.maxMinutes === t.key ? null : t.key })}
                >
                  {t.label}
                </Chip>
              ))}
              {filtering && (
                <Chip on={false} onClick={() => setFilter(EMPTY_FILTER)}>
                  <X size={14} style={{ verticalAlign: '-2px' }} /> Clear
                </Chip>
              )}
            </div>

            {suggestion && !filtering && (
              <button
                onClick={() => openRecipe(suggestion)}
                className="press"
                style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer',
                  background: `${K.honey}14`, border: `1px solid ${K.honey}55`,
                  borderRadius: 16, padding: '13px 14px', marginBottom: 14,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <span style={{ fontSize: 30, lineHeight: 1 }} aria-hidden="true">{suggestion.emoji}</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5,
                    textTransform: 'uppercase', letterSpacing: '0.08em', color: K.honey, fontWeight: 700,
                  }}>
                    <Sparkles size={13} /> Can't decide? Try
                  </span>
                  <span style={{
                    display: 'block', fontFamily: K.display, fontSize: 17,
                    fontWeight: 600, color: K.text, marginTop: 2, lineHeight: 1.25,
                  }}>
                    {suggestion.name}
                  </span>
                  {suggestion.totalMinutes !== null && (
                    <span style={{ display: 'block', color: K.muted, fontSize: 13, marginTop: 2 }}>
                      {timeLabel(suggestion.totalMinutes)}
                    </span>
                  )}
                </span>
              </button>
            )}

            {filtering && (
              <p style={{ margin: '0 2px 10px', fontSize: 13, color: K.muted }}>
                {shown.length === 1 ? '1 recipe' : `${shown.length} recipes`}
              </p>
            )}

            <RecipeGrid recipes={shown} cookIds={cookSet} onOpen={openRecipe} />
          </>
        )}

        {!loading && tab === 'freezer' && (
          <FreezerPage
            recipes={recipes}
            cookIds={cookSet}
            extras={ticks.filter(t => t.custom).map(t => t.label)}
            onOpen={openRecipe}
            onAddSupplies={l => void onAddSupplies(l)}
          />
        )}

        {!loading && tab === 'shop' && (
          <>
            {chosen.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 6,
                }}>
                  <span style={{
                    fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.09em',
                    color: K.muted, fontWeight: 700,
                  }}>
                    Cooking
                  </span>
                  <button onClick={() => void onClear()} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 40,
                    background: 'transparent', border: 'none', color: K.muted, padding: '0 2px',
                    cursor: 'pointer', fontSize: 13, fontFamily: K.body,
                  }}>
                    <Trash2 size={14} /> New list
                  </button>
                </div>
                <div className="chips">
                  {chosen.map(({ entry, recipe: r }) => (
                    <button
                      key={r.id}
                      onClick={() => openRecipe(r)}
                      className="press"
                      style={{
                        background: K.surface, border: `1px solid ${K.border}`, flexShrink: 0,
                        borderRadius: 999, padding: '9px 14px', cursor: 'pointer',
                        fontSize: 14, color: K.text, fontFamily: K.body,
                      }}
                    >
                      {r.emoji} {r.name}
                      {entry.servings && entry.servings !== r.serves && (
                        <span style={{ color: K.muted }}> · for {entry.servings}</span>
                      )}
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
              onBrowse={() => goTo('cook')}
            />
          </>
        )}

        {!loading && tab === 'edit' && (
          <RecipesPage recipes={recipes} onChanged={() => void load()} onToast={say} />
        )}
      </main>

      <nav aria-label="Sections" style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40,
        background: `${K.surface}f2`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderTop: `1px solid ${K.border}`,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        <div style={{ display: 'flex', maxWidth: 620, margin: '0 auto' }}>
          {([
            { key: 'cook', label: 'Recipes', icon: BookOpen, badge: 0 },
            { key: 'freezer', label: 'Freezer', icon: Snowflake, badge: 0 },
            { key: 'shop', label: 'Shopping', icon: ShoppingBasket, badge: toBuy },
            { key: 'edit', label: 'Manage', icon: Pencil, badge: 0 },
          ] as const).map(t => {
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => goTo(t.key)}
                aria-current={on ? 'page' : undefined}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  padding: '8px 0 9px', minHeight: 60, background: 'transparent', border: 'none',
                  cursor: 'pointer', color: on ? K.terraDark : K.muted,
                  fontFamily: K.body, fontSize: 12, fontWeight: on ? 700 : 600,
                }}
              >
                <span style={{
                  position: 'relative', display: 'grid', placeItems: 'center',
                  width: 56, height: 30, borderRadius: 15,
                  background: on ? `${K.terra}1f` : 'transparent', transition: 'background 0.15s',
                }}>
                  <t.icon size={21} strokeWidth={on ? 2.3 : 2} />
                  {t.badge > 0 && (
                    <span aria-label={`${t.badge} to buy`} style={{
                      position: 'absolute', top: -3, right: 6, minWidth: 18, height: 18,
                      padding: '0 5px', borderRadius: 9, background: K.terra, color: '#fff',
                      fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center',
                      border: `2px solid ${K.surface}`,
                    }}>
                      {t.badge > 99 ? '99+' : t.badge}
                    </span>
                  )}
                </span>
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      {open && (
        <RecipeDetail
          recipe={open}
          today={sastDay()}
          inList={cookSet.has(open.id)}
          servings={servings}
          onServings={n => setServings(Math.max(MIN_SERVES, Math.min(MAX_SERVES, n)))}
          onCook={() => void toggleCook(open, servings)}
          onUncook={() => void toggleCook(open, servings)}
          onClose={closeRecipe}
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
      aria-pressed={on}
      style={{
        background: on ? K.terra : K.surface,
        color: on ? '#fff' : K.sub,
        border: `1px solid ${on ? K.terra : K.border}`,
        borderRadius: 999, padding: '9px 15px', cursor: 'pointer', flexShrink: 0,
        fontSize: 14, fontWeight: 600, fontFamily: K.body, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

/** Placeholder cards while the recipes load, so the page has its shape
 *  straight away rather than a line of text. */
function Skeleton() {
  return (
    <div aria-label="Loading" style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginTop: 4,
    }}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="skeleton" style={{
          height: 112, borderRadius: 16, background: K.raised, border: `1px solid ${K.border}`,
        }} />
      ))}
    </div>
  );
}

interface InstallPrompt extends Event { prompt: () => Promise<void> }

const HINT_KEY = 'meal-prep:install-hint';

/** One line, once, for someone opening the link in a browser: this works
 *  best from the home screen, like an app. Android gets a real Install
 *  button; iPhone has no such API, so it gets the two taps to make. Gone for
 *  good once dismissed or installed. */
function InstallHint() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(HINT_KEY) === 'off'; } catch { return false; }
  });
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (hidden || standalone || (!ios && !prompt)) return null;

  const dismiss = () => {
    setHidden(true);
    try { localStorage.setItem(HINT_KEY, 'off'); } catch { /* private mode */ }
  };

  return (
    <div style={{
      margin: '0 14px 12px', padding: '11px 8px 11px 14px', borderRadius: 14,
      background: K.surface, border: `1px solid ${K.border}`,
      display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: K.sub, lineHeight: 1.45,
    }}>
      <span style={{ flex: 1 }}>
        {ios
          ? <>Keep it on your home screen: tap <Share size={14} style={{ verticalAlign: '-2px' }} /> then <strong>Add to Home Screen</strong>.</>
          : <>Keep Meal Prep on your home screen, like an app.</>}
      </span>
      {!ios && prompt && (
        <button
          onClick={() => { void prompt.prompt().finally(dismiss); }}
          className="press"
          style={{
            background: K.terra, color: '#fff', border: 'none', borderRadius: 10,
            padding: '9px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
          }}
        >
          Install
        </button>
      )}
      <button onClick={dismiss} aria-label="Hide this" style={{
        width: 36, height: 36, flexShrink: 0, background: 'transparent', border: 'none',
        color: K.muted, cursor: 'pointer', display: 'grid', placeItems: 'center',
      }}>
        <X size={17} />
      </button>
    </div>
  );
}
