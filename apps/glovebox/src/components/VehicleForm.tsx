import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import {
  DEFAULT_DISC_LEADS, DEFAULT_SERVICE_LEADS, G, LEAD_OPTIONS, type Vehicle,
} from '../lib/config';
import { countdownLabel, daysUntil, fmtDate, projectServiceDue } from '../lib/due';
import { Field, LeadPicker, Row, inputStyle } from './Field';

const num = (s: string): number | null => {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const str = (s: string): string | null => (s.trim() === '' ? null : s.trim());

/** `id` must be omitted before being re-added as nullable: intersecting with
 *  `{ id: string | null }` alone would narrow straight back to `string`. */
export type VehicleDraft = Omit<Vehicle, 'serviceDue' | 'id'> & { id: string | null };

export function emptyVehicle(): VehicleDraft {
  return {
    id: null, name: '', makeModel: null, reg: null, discExpiry: null,
    serviceIntervalKm: 15000, serviceIntervalMonths: 12,
    lastServiceDate: null, lastServiceKm: null,
    odometer: null, odometerAt: null,
    discLeads: DEFAULT_DISC_LEADS, serviceLeads: DEFAULT_SERVICE_LEADS,
  };
}

export function VehicleForm({ initial, onSave, onDelete, onClose }: {
  initial: VehicleDraft;
  onSave: (v: VehicleDraft) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<VehicleDraft>(initial);
  const set = (patch: Partial<VehicleDraft>) => setD(prev => ({ ...prev, ...patch }));

  // Live preview of the projection, so the effect of an odometer reading is
  // visible before saving rather than a surprise on the home screen.
  const projected = projectServiceDue(d);

  return (
    <Sheet title={initial.id ? 'Edit vehicle' : 'Add vehicle'} onClose={onClose}>
      <Field label="Name" hint="what you call it">
        <input style={inputStyle} value={d.name} placeholder="Polo"
          onChange={e => set({ name: e.target.value })} />
      </Field>

      <Row>
        <Field label="Make & model" hint="optional">
          <input style={inputStyle} value={d.makeModel ?? ''} placeholder="VW Polo 1.0 TSI"
            onChange={e => set({ makeModel: str(e.target.value) })} />
        </Field>
        <Field label="Registration" hint="optional">
          <input style={inputStyle} value={d.reg ?? ''} placeholder="CA 123-456"
            onChange={e => set({ reg: str(e.target.value) })} />
        </Field>
      </Row>

      <SectionTitle>Licence disc</SectionTitle>
      <Field label="Expiry date" hint="printed on the disc">
        <input type="date" style={inputStyle} value={d.discExpiry ?? ''}
          onChange={e => set({ discExpiry: str(e.target.value) })} />
      </Field>
      <Field label="Remind me">
        <LeadPicker value={d.discLeads} options={LEAD_OPTIONS}
          onChange={discLeads => set({ discLeads })} />
      </Field>

      <SectionTitle>Service</SectionTitle>
      <Row>
        <Field label="Every (km)">
          <input type="number" inputMode="numeric" style={inputStyle}
            value={d.serviceIntervalKm ?? ''} placeholder="15000"
            onChange={e => set({ serviceIntervalKm: num(e.target.value) })} />
        </Field>
        <Field label="Or every (months)">
          <input type="number" inputMode="numeric" style={inputStyle}
            value={d.serviceIntervalMonths ?? ''} placeholder="12"
            onChange={e => set({ serviceIntervalMonths: num(e.target.value) })} />
        </Field>
      </Row>
      <Row>
        <Field label="Last service date">
          <input type="date" style={inputStyle} value={d.lastServiceDate ?? ''}
            onChange={e => set({ lastServiceDate: str(e.target.value) })} />
        </Field>
        <Field label="Odometer then (km)">
          <input type="number" inputMode="numeric" style={inputStyle}
            value={d.lastServiceKm ?? ''} placeholder="20000"
            onChange={e => set({ lastServiceKm: num(e.target.value) })} />
        </Field>
      </Row>
      <Row>
        <Field label="Odometer now (km)">
          <input type="number" inputMode="numeric" style={inputStyle}
            value={d.odometer ?? ''} placeholder="25000"
            onChange={e => set({ odometer: num(e.target.value) })} />
        </Field>
        <Field label="Reading taken on">
          <input type="date" style={inputStyle} value={d.odometerAt ?? ''}
            onChange={e => set({ odometerAt: str(e.target.value) })} />
        </Field>
      </Row>

      <div style={{
        background: G.raised, border: `1px solid ${G.border}`, borderRadius: 10,
        padding: '10px 12px', marginBottom: 12,
        fontFamily: G.body, fontSize: 12.5, color: projected ? G.text : G.muted,
      }}>
        {projected
          ? <>Next service ≈ <strong style={{ color: G.blue }}>{fmtDate(projected)}</strong>{' '}
              <span style={{ color: G.sub }}>({countdownLabel(daysUntil(projected))})</span></>
          : 'Add an interval, your last service and a dated odometer reading to estimate the next service.'}
      </div>

      <Field label="Remind me before a service">
        <LeadPicker value={d.serviceLeads} options={LEAD_OPTIONS}
          onChange={serviceLeads => set({ serviceLeads })} />
      </Field>

      <Actions
        canSave={d.name.trim() !== ''}
        onSave={() => onSave(d)}
        onDelete={onDelete}
        deleteLabel="Delete vehicle"
      />
    </Sheet>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: G.display, fontSize: 16, letterSpacing: '0.06em',
      textTransform: 'uppercase', color: G.blue,
      margin: '18px 0 10px', paddingTop: 12, borderTop: `1px solid ${G.border}`,
    }}>
      {children}
    </div>
  );
}

export function Sheet({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(3,5,10,0.78)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: G.surface, border: `1px solid ${G.border}`,
          borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 520,
          maxHeight: '92vh', overflowY: 'auto',
          padding: '16px 16px calc(16px + env(safe-area-inset-bottom))',
        }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 14, position: 'sticky', top: 0, background: G.surface,
          paddingBottom: 8,
        }}>
          <span style={{
            fontFamily: G.display, fontSize: 22, letterSpacing: '0.04em',
            textTransform: 'uppercase', color: G.text,
          }}>
            {title}
          </span>
          <button onClick={onClose} aria-label="Close" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: G.muted, padding: 6, display: 'flex',
          }}>
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Actions({ canSave, onSave, onDelete, deleteLabel }: {
  canSave: boolean; onSave: () => void; onDelete?: () => void; deleteLabel: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
      {onDelete && (
        <button onClick={onDelete} aria-label={deleteLabel} style={{
          border: `1px solid ${G.border}`, background: 'transparent', color: G.red,
          borderRadius: 11, padding: '13px 15px', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: G.body, fontSize: 13.5, fontWeight: 700,
        }}>
          <Trash2 size={15} strokeWidth={2.2} />
        </button>
      )}
      <button onClick={onSave} disabled={!canSave} style={{
        flex: 1, border: 'none', borderRadius: 11, padding: '13px 0',
        cursor: canSave ? 'pointer' : 'not-allowed', opacity: canSave ? 1 : 0.5,
        background: G.blue, color: '#06101F',
        fontFamily: G.body, fontSize: 14, fontWeight: 700,
      }}>
        Save
      </button>
    </div>
  );
}
