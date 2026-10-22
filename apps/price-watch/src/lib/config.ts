// Price Watch: types + visual identity. Violet, matching its hub tile —
// distinct from Glovebox's blue.

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
  /** Set on a point of the best-price series: the shop it was at. */
  retailer?: string;
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

/** One shop's listing of a tracked product: the product itself, or another
 *  shop's listing linked to it. Only `tracked` and `confirmed` offers are
 *  ever compared; a `suggested` one is asked about and nothing more. */
export interface Offer {
  /** Null for the tracked product itself. */
  linkId: string | null;
  status: 'tracked' | 'confirmed' | 'suggested';
  /** How a link was made: the same retail barcode, found by search, or a
   *  link pasted by a person. */
  reason: 'barcode' | 'search' | 'pasted' | null;
  /** When a link was confirmed. Its prices count from then. */
  decidedAt: string | null;
  product: Product;
  history: PricePoint[];
}

/** A product plus everything the UI needs to render it in one place. */
export interface TrackedProduct {
  track: Track;
  product: Product;
  /** The tracked product's own history. */
  history: PricePoint[];
  /** Every shop for it, the tracked product first. */
  offers: Offer[];
}

/** Shop names as a card shows them. PnP prices online by store and its own
 *  default store is the one read, so it says so. */
export const RETAILERS: Record<string, string> = {
  takealot: 'Takealot',
  babycity: 'Baby City',
  checkers: 'Checkers',
  pnp: 'PnP online',
};

export const shopName = (retailer: string) => RETAILERS[retailer] ?? retailer;

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
