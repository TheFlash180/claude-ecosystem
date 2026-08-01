// Price Watch: types + visual identity. Violet, matching its hub tile —
// distinct from Front Row's magenta and Glovebox's blue.

export interface Product {
  id: string;
  retailer: string;
  externalId: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  url: string | null;
  /** Last time the sync successfully read this product, changed or not. */
  lastCheckedAt: string | null;
  /** Set when the retailer stops returning the product at all. */
  delistedAt: string | null;
  /** A variant parent: the tracked price is the CHEAPEST option, not the price
   *  of one specific item. Shown as "from R…" so nobody thinks the 4TB drive
   *  just dropped to the 1TB price. */
  hasVariants: boolean;
}

/** One observation. The series is sparse: a row exists only where something
 *  changed, so read it as a step function, never interpolated. */
export interface PricePoint {
  at: string;
  price: number;
  /** The retailer's claimed "was" price. Frequently fiction — kept so the
   *  app can say so, not because it is trusted. */
  listingPrice: number | null;
  inStock: boolean;
  stockStatus: string | null;
}

export interface Track {
  id: string;
  productId: string;
  targetPrice: number | null;
  enabled: boolean;
  createdAt: string;
}

export interface SourceHealth {
  key: string;
  label: string;
  enabled: boolean;
  lastOkAt: string | null;
  lastError: string | null;
  lastCount: number | null;
}

/** A product plus everything the UI needs to render it in one place. */
export interface TrackedProduct {
  track: Track;
  product: Product;
  history: PricePoint[];
}

export const RETAILERS: Record<string, string> = {
  takealot: 'Takealot',
};

export const P = {
  bg:      '#0C0B14',
  surface: '#15131F',
  raised:  '#1D1929',
  border:  '#2B2539',
  text:    '#F2EFF8',
  sub:     '#B0A7C0',
  muted:   '#7B7290',
  violet:  '#A78BFA',
  green:   '#46B27E',
  amber:   '#E8B04B',
  red:     '#E2574C',
  display: "'Sora', 'Inter', sans-serif",
  body:    "'Inter', sans-serif",
} as const;
