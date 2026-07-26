import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { BellRing, Car, Pencil, Plus, UserRound } from 'lucide-react';
import { G, type Person, type Vehicle } from './lib/config';
import { dueItems, fmtDate, sastDay } from './lib/due';
import {
  deletePerson, deleteVehicle, fetchAll, registerPush, savePerson, saveVehicle,
} from './lib/store';
import { DueCard } from './components/DueCard';
import { VehicleForm, emptyVehicle, type VehicleDraft } from './components/VehicleForm';
import { PersonForm, emptyPerson, type PersonDraft } from './components/PersonForm';

export default function App() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicleDraft, setVehicleDraft] = useState<VehicleDraft | null>(null);
  const [personDraft, setPersonDraft] = useState<PersonDraft | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const refresh = useCallback(async () => {
    const data = await fetchAll();
    if (data) {
      setVehicles(data.vehicles);
      setPeople(data.people);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const items = dueItems(vehicles, people, sastDay());

  // Permission is asked for on the first save rather than on load: a browser
  // that prompts the moment a page opens gets denied out of reflex.
  const ensurePush = async () => {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    } catch { /* unsupported */ }
    await registerPush();
  };

  const onSaveVehicle = async (v: VehicleDraft) => {
    setVehicleDraft(null);
    await ensurePush();
    if (!(await saveVehicle(v))) return showToast("Couldn't save — try again.");
    await refresh();
    showToast(v.id ? 'Vehicle updated' : 'Vehicle added');
  };

  const onSavePerson = async (p: PersonDraft) => {
    setPersonDraft(null);
    await ensurePush();
    if (!(await savePerson(p))) return showToast("Couldn't save — try again.");
    await refresh();
    showToast(p.id ? 'Driver updated' : 'Driver added');
  };

  const onDeleteVehicle = async (id: string) => {
    setVehicleDraft(null);
    if (!(await deleteVehicle(id))) return showToast("Couldn't delete — try again.");
    await refresh();
    showToast('Vehicle deleted');
  };

  const onDeletePerson = async (id: string) => {
    setPersonDraft(null);
    if (!(await deletePerson(id))) return showToast("Couldn't delete — try again.");
    await refresh();
    showToast('Driver deleted');
  };

  return (
    <div style={{
      background: G.bg, minHeight: '100vh', fontFamily: G.body,
      maxWidth: 560, margin: '0 auto', color: G.text,
    }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: ${G.bg}; }
        button:focus-visible, input:focus-visible { outline: 2px solid ${G.blue}; outline-offset: 2px; }
        input[type="date"] { color-scheme: dark; }
      `}</style>

      {toast && (
        <div style={{
          position: 'fixed', top: 'calc(14px + env(safe-area-inset-top))', left: '50%',
          transform: 'translateX(-50%)', zIndex: 200,
          background: '#0E1726', border: `1px solid ${G.blue}`, color: G.text,
          padding: '11px 20px', borderRadius: 24, fontSize: 13.5, fontWeight: 500,
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)', whiteSpace: 'nowrap', pointerEvents: 'none',
        } as CSSProperties}>
          {toast}
        </div>
      )}

      {vehicleDraft && (
        <VehicleForm
          initial={vehicleDraft}
          onSave={v => void onSaveVehicle(v)}
          onDelete={vehicleDraft.id ? () => void onDeleteVehicle(vehicleDraft.id!) : undefined}
          onClose={() => setVehicleDraft(null)}
        />
      )}
      {personDraft && (
        <PersonForm
          initial={personDraft}
          onSave={p => void onSavePerson(p)}
          onDelete={personDraft.id ? () => void onDeletePerson(personDraft.id!) : undefined}
          onClose={() => setPersonDraft(null)}
        />
      )}

      {/* Header */}
      <header style={{
        padding: 'calc(18px + env(safe-area-inset-top)) 16px 14px',
        borderBottom: `1px solid ${G.border}`,
        position: 'sticky', top: 0, zIndex: 10,
        background: `${G.bg}F2`, backdropFilter: 'blur(9px)', WebkitBackdropFilter: 'blur(9px)',
      }}>
        <div style={{
          fontFamily: G.display, fontSize: 30, lineHeight: 1,
          letterSpacing: '0.05em', textTransform: 'uppercase', color: G.text,
        }}>
          Glove<span style={{ color: G.blue }}>box</span>
        </div>
        <div style={{ fontSize: 11.5, color: G.muted, marginTop: 4 }}>
          Discs, licences &amp; services — before they catch you out
        </div>
      </header>

      <main style={{ padding: '16px 14px 44px' }}>
        {loading ? (
          <p style={{ color: G.sub, fontSize: 13, textAlign: 'center', padding: 40 }}>
            Opening the glovebox…
          </p>
        ) : (
          <>
            <SectionLabel text="Coming up" />
            {items.length === 0 ? (
              <EmptyState hasRecords={vehicles.length > 0 || people.length > 0} />
            ) : (
              items.map(item => <DueCard key={item.key} item={item} />)
            )}

            <SectionLabel text="Vehicles" />
            {vehicles.map(v => (
              <RecordRow
                key={v.id}
                icon={<Car size={17} strokeWidth={2} />}
                title={v.name}
                detail={[v.makeModel, v.reg].filter(Boolean).join(' · ') || 'No details yet'}
                onEdit={() => setVehicleDraft({ ...v, id: v.id })}
              />
            ))}
            <AddButton label="Add vehicle" onClick={() => setVehicleDraft(emptyVehicle())} />

            <SectionLabel text="Drivers" />
            {people.map(p => (
              <RecordRow
                key={p.id}
                icon={<UserRound size={17} strokeWidth={2} />}
                title={p.name}
                detail={p.licenceExpiry ? `Licence to ${fmtDate(p.licenceExpiry)}` : 'No licence date yet'}
                onEdit={() => setPersonDraft({ ...p, id: p.id })}
              />
            ))}
            <AddButton label="Add driver" onClick={() => setPersonDraft(emptyPerson())} />

            <footer style={{
              marginTop: 26, paddingTop: 14, borderTop: `1px solid ${G.border}`,
              fontSize: 11, color: G.muted, lineHeight: 1.75,
            }}>
              <BellRing size={11} style={{ verticalAlign: -1 }} /> Reminders push to
              this device once a day, even with the app closed. Service dates marked
              “est.” are projected from your interval and odometer — update the reading
              now and then to keep them sharp.
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontFamily: G.display, fontSize: 17, letterSpacing: '0.09em',
      textTransform: 'uppercase', color: G.sub, margin: '22px 0 10px',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      {text}
      <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${G.border}, transparent)` }} />
    </div>
  );
}

function EmptyState({ hasRecords }: { hasRecords: boolean }) {
  return (
    <div style={{
      background: G.surface, border: `1px dashed ${G.border}`, borderRadius: 13,
      padding: '18px 16px', color: G.sub, fontSize: 13, lineHeight: 1.6,
    }}>
      {hasRecords
        ? 'Nothing tracked yet — open a vehicle or driver and fill in a disc expiry, licence date or service interval.'
        : 'Add a vehicle and a driver to start tracking licence discs, driver’s licences and services.'}
    </div>
  );
}

function RecordRow({ icon, title, detail, onEdit }: {
  icon: React.ReactNode; title: string; detail: string; onEdit: () => void;
}) {
  return (
    <button
      onClick={onEdit}
      aria-label={`Edit ${title}`}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 12,
        background: G.surface, border: `1px solid ${G.border}`,
        borderRadius: 12, padding: '12px 13px', marginBottom: 8, color: 'inherit',
      }}>
      <span style={{
        flexShrink: 0, width: 34, height: 34, borderRadius: 9,
        display: 'grid', placeItems: 'center',
        color: G.blue, background: `${G.blue}16`, border: `1px solid ${G.blue}33`,
      }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: 13.5, fontWeight: 600, color: G.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </span>
        <span style={{
          display: 'block', fontSize: 11.5, color: G.muted, marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {detail}
        </span>
      </span>
      <Pencil size={14} strokeWidth={2} color={G.muted} style={{ flexShrink: 0 }} />
    </button>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', cursor: 'pointer', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', gap: 7,
        background: 'transparent', border: `1px dashed ${G.border}`,
        borderRadius: 12, padding: '12px 0', color: G.sub,
        fontFamily: G.body, fontSize: 13, fontWeight: 600,
      }}>
      <Plus size={15} strokeWidth={2.4} /> {label}
    </button>
  );
}
