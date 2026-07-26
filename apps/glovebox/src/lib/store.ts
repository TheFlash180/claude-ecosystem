// Data access: token-checked RPCs in, typed rows out. All mapping between the
// snake_case database shape and the camelCase app shape lives here.
import { deviceToken, ensurePushSubscription } from '@ecosystem/shared';
import { sb } from './supabase';
import { projectServiceDue } from './due';
import {
  DEFAULT_DISC_LEADS, DEFAULT_LICENCE_LEADS, DEFAULT_SERVICE_LEADS,
  type Person, type Vehicle,
} from './config';

const VAPID_PUBLIC = 'BH8emEzAussJXGdzlPQFCXiVd2AA1PKCQ3KWYJCI2cnvZwDoSweYJTzGc3QajK4M3nP0MOhGfTJpW75Ul9u4cpI';
const TOKEN_KEY = 'glovebox:device-token';

export function getDeviceToken(): string {
  return deviceToken(TOKEN_KEY);
}

interface VehicleRow {
  id: string;
  name: string;
  make_model: string | null;
  reg: string | null;
  disc_expiry: string | null;
  service_interval_km: number | null;
  service_interval_months: number | null;
  last_service_date: string | null;
  last_service_km: number | null;
  odometer: number | null;
  odometer_at: string | null;
  service_due: string | null;
  disc_leads: number[] | null;
  service_leads: number[] | null;
}

interface PersonRow {
  id: string;
  name: string;
  licence_expiry: string | null;
  licence_leads: number[] | null;
}

function toVehicle(r: VehicleRow): Vehicle {
  return {
    id: r.id,
    name: r.name,
    makeModel: r.make_model,
    reg: r.reg,
    discExpiry: r.disc_expiry,
    serviceIntervalKm: r.service_interval_km,
    serviceIntervalMonths: r.service_interval_months,
    lastServiceDate: r.last_service_date,
    lastServiceKm: r.last_service_km,
    odometer: r.odometer,
    odometerAt: r.odometer_at,
    serviceDue: r.service_due,
    discLeads: r.disc_leads ?? DEFAULT_DISC_LEADS,
    serviceLeads: r.service_leads ?? DEFAULT_SERVICE_LEADS,
  };
}

function toPerson(r: PersonRow): Person {
  return {
    id: r.id,
    name: r.name,
    licenceExpiry: r.licence_expiry,
    licenceLeads: r.licence_leads ?? DEFAULT_LICENCE_LEADS,
  };
}

export async function fetchAll(): Promise<{ vehicles: Vehicle[]; people: Person[] } | null> {
  const client = sb();
  if (!client) return null;
  const [v, p] = await Promise.all([
    client.rpc('glovebox_list_vehicles', { p_token: getDeviceToken() }),
    client.rpc('glovebox_list_people', { p_token: getDeviceToken() }),
  ]);
  if (v.error || p.error) return null;
  return {
    vehicles: ((v.data ?? []) as VehicleRow[]).map(toVehicle),
    people: ((p.data ?? []) as PersonRow[]).map(toPerson),
  };
}

/** Save a vehicle, recomputing the projected service date from its inputs so
 *  the stored value and the displayed one can never disagree. `id` null adds. */
export async function saveVehicle(v: Omit<Vehicle, 'serviceDue' | 'id'> & { id: string | null }): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { error } = await client.rpc('glovebox_save_vehicle', {
    p_token: getDeviceToken(),
    p_id: v.id,
    p_name: v.name,
    p_make_model: v.makeModel,
    p_reg: v.reg,
    p_disc_expiry: v.discExpiry,
    p_interval_km: v.serviceIntervalKm,
    p_interval_months: v.serviceIntervalMonths,
    p_last_service_date: v.lastServiceDate,
    p_last_service_km: v.lastServiceKm,
    p_odometer: v.odometer,
    p_odometer_at: v.odometerAt,
    p_service_due: projectServiceDue(v),
    p_disc_leads: v.discLeads,
    p_service_leads: v.serviceLeads,
  });
  return !error;
}

export async function savePerson(p: Omit<Person, 'id'> & { id: string | null }): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { error } = await client.rpc('glovebox_save_person', {
    p_token: getDeviceToken(),
    p_id: p.id,
    p_name: p.name,
    p_licence_expiry: p.licenceExpiry,
    p_leads: p.licenceLeads,
  });
  return !error;
}

export async function deleteVehicle(id: string): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('glovebox_delete_vehicle', {
    p_token: getDeviceToken(), p_id: id,
  });
  return !error && data === true;
}

export async function deletePerson(id: string): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('glovebox_delete_person', {
    p_token: getDeviceToken(), p_id: id,
  });
  return !error && data === true;
}

export async function registerPush(): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const sub = await ensurePushSubscription(VAPID_PUBLIC);
  if (!sub) return false;
  const key = sub.toJSON();
  const { data, error } = await client.rpc('glovebox_push_register', {
    p_endpoint: sub.endpoint,
    p_p256dh: key.keys?.p256dh,
    p_auth: key.keys?.auth,
    p_token: getDeviceToken(),
  });
  return !error && data === true;
}
