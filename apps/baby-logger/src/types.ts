export interface Household {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string;
  display_name: string;
  role: 'parent' | 'caregiver';
  created_at: string;
}

export interface Baby {
  id: string;
  household_id: string;
  name: string | null;
  due_date: string;
  birth_date: string | null;
  birth_weight_g: number | null;
  created_at: string;
}

export interface FeedEvent {
  id: string;
  baby_id: string;
  logged_by: string;
  feed_type: 'breast_left' | 'breast_right' | 'bottle' | 'solid';
  started_at: string;
  duration_minutes: number | null;
  amount_ml: number | null;
  notes: string | null;
  created_at: string;
}

export interface SleepEvent {
  id: string;
  baby_id: string;
  logged_by: string;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface NappyEvent {
  id: string;
  baby_id: string;
  logged_by: string;
  nappy_type: 'wet' | 'dirty' | 'both';
  logged_at: string;
  notes: string | null;
  created_at: string;
}

export interface WeightEvent {
  id: string;
  baby_id: string;
  logged_by: string;
  weight_g: number;
  measured_at: string;
  notes: string | null;
  created_at: string;
}

export type TimelineEvent =
  | { type: 'feed'; data: FeedEvent }
  | { type: 'sleep'; data: SleepEvent }
  | { type: 'nappy'; data: NappyEvent }
  | { type: 'weight'; data: WeightEvent };
