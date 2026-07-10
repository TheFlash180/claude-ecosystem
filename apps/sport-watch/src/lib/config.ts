// Shared types + visual config for SA Sport Watch.

export type SportKey = "rugby" | "mma" | "f1";

export interface SportEvent {
  id: string;
  sport: SportKey;
  competition: string;
  home: string;
  away: string | null;
  homeFlag: string;
  awayFlag: string | null;
  date: Date | null;
  venue?: string;
  result?: string;
  note?: string;
  channel?: string;
  watchUrl?: string;
  isConditional?: boolean;
  isSpecial?: boolean;
  dateTBC?: boolean;
}

export const SPORT: Record<SportKey, { label: string; icon: string; color: string; bg: string; liveDuration: number }> = {
  rugby: { label: "Rugby",  icon: "🏉", color: "#3AA864", bg: "#061B0E", liveDuration: 7200000 },
  mma:   { label: "MMA",    icon: "🥊", color: "#D44040", bg: "#1C0606", liveDuration: 18000000 },
  f1:    { label: "F1",     icon: "🏎️", color: "#E0762F", bg: "#1C0F06", liveDuration: 7200000 },
};

export const S = {
  bg:      "#080C09",
  surface: "#111814",
  border:  "#1A221A",
  text:    "#F0EDE6",
  muted:   "#4A524A",
  dim:     "#272F27",
  display: "'Oswald', sans-serif",
  body:    "'Inter', sans-serif",
};
