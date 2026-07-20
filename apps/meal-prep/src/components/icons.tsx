// One place mapping shopping aisles to lucide icons, so the pure lib code
// never imports React components.
import {
  Beef, Carrot, Croissant, Flame, Milk, Package, ShoppingBag, Snowflake,
  type LucideIcon,
} from 'lucide-react';
import type { Category } from '../lib/config';

export const CATEGORY_ICON: Record<Category, LucideIcon> = {
  meat: Beef,
  veg: Carrot,
  dairy: Milk,
  bakery: Croissant,
  frozen: Snowflake,
  pantry: Package,
  spices: Flame,
  other: ShoppingBag,
};
