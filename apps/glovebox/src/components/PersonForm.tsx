import { useState } from 'react';
import { DEFAULT_LICENCE_LEADS, G, LEAD_OPTIONS, type Person } from '../lib/config';
import { Field, LeadPicker, inputStyle } from './Field';
import { Actions, Sheet } from './VehicleForm';

export type PersonDraft = Omit<Person, 'id'> & { id: string | null };

export function emptyPerson(): PersonDraft {
  return { id: null, name: '', licenceExpiry: null, licenceLeads: DEFAULT_LICENCE_LEADS };
}

export function PersonForm({ initial, onSave, onDelete, onClose }: {
  initial: PersonDraft;
  onSave: (p: PersonDraft) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<PersonDraft>(initial);

  return (
    <Sheet title={initial.id ? 'Edit driver' : 'Add driver'} onClose={onClose}>
      <Field label="Name">
        <input style={inputStyle} value={d.name} placeholder="Riaan"
          onChange={e => setD({ ...d, name: e.target.value })} />
      </Field>

      <Field label="Licence expiry" hint="printed on the card">
        <input type="date" style={inputStyle} value={d.licenceExpiry ?? ''}
          onChange={e => setD({ ...d, licenceExpiry: e.target.value.trim() || null })} />
      </Field>

      <Field label="Remind me" hint="a renewal means a DLTC booking, so start early">
        <LeadPicker value={d.licenceLeads} options={LEAD_OPTIONS}
          onChange={licenceLeads => setD({ ...d, licenceLeads })} />
      </Field>

      <p style={{
        fontFamily: G.body, fontSize: 11.5, color: G.muted,
        lineHeight: 1.6, margin: '4px 0 0',
      }}>
        A driver's licence belongs to a person, not a car — so it is tracked
        here rather than on a vehicle.
      </p>

      <Actions
        canSave={d.name.trim() !== ''}
        onSave={() => onSave(d)}
        onDelete={onDelete}
        deleteLabel="Delete driver"
      />
    </Sheet>
  );
}
