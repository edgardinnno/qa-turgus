// Parduotuvės verslo taisyklės: kategorijos, nuolaidų kodai, pristatymas, sumos.
import { ApiError } from './errors';

export const CATEGORIES: Record<string, string> = {
  elektronika: 'Elektronika',
  drabuziai: 'Drabužiai',
  namai: 'Namai',
  sportas: 'Sportas',
  knygos: 'Knygos',
};

export interface Promo {
  code: string;
  type: 'percent' | 'shipping';
  value?: number;
  min?: number;
  label: string;
}

const PROMOS: Record<string, Omit<Promo, 'code'> | { expired: true }> = {
  PLAYWRIGHT10: { type: 'percent', value: 10, label: '-10 % visam krepšeliui' },
  DIDELIS20: { type: 'percent', value: 20, min: 100, label: '-20 % užsakymams nuo 100 €' },
  NEMOKAMAS: { type: 'shipping', label: 'Nemokamas pristatymas' },
  SENAS2024: { expired: true },
};

export function findPromo(code: string): Promo | null {
  const c = code.trim().toUpperCase();
  const p = PROMOS[c];
  return p && !('expired' in p) ? { code: c, ...p } : null;
}

/** Patikrina kodą konkrečiai sumai. Meta ApiError su skirtingais statusais – gera medžiaga negatyviems testams. */
export function validatePromo(code: string, subtotal: number): Promo {
  const c = code.trim().toUpperCase();
  const p = PROMOS[c];
  if (!p) throw new ApiError(404, 'PROMO_NOT_FOUND', 'Toks nuolaidos kodas neegzistuoja.');
  if ('expired' in p) throw new ApiError(410, 'PROMO_EXPIRED', 'Šio nuolaidos kodo galiojimas pasibaigęs.');
  if (p.min && subtotal < p.min) {
    throw new ApiError(422, 'PROMO_MIN_AMOUNT', `Kodas galioja užsakymams nuo ${money(p.min)}.`);
  }
  return { code: c, ...p };
}

export const FREE_SHIPPING_FROM = 50;
export const SHIPPING = {
  courier: { label: 'Kurjeris į namus', price: 4.99, eta: '1–2 darbo dienos' },
  parcel: { label: 'Paštomatas', price: 2.99, eta: '1–3 darbo dienos' },
  pickup: { label: 'Atsiėmimas parduotuvėje', price: 0, eta: 'Jau rytoj' },
} as const;
export type ShippingMethod = keyof typeof SHIPPING;
export const SHIPPING_METHODS = Object.keys(SHIPPING) as ShippingMethod[];

export const PARCEL_LOCKERS = [
  'Vilnius – Centras (Gedimino pr. 9)',
  'Vilnius – Šiaurės miestelis (Kalvarijų g. 120)',
  'Kaunas – Senamiestis (Rotušės a. 3)',
  'Kaunas – Žaliakalnis (Savanorių pr. 200)',
  'Klaipėda – Centras (Tiltų g. 5)',
  'Šiauliai – Centras (Vilniaus g. 150)',
];
export const STORES = ['Vilnius, Testuotojų g. 1', 'Kaunas, Automatizacijos g. 7', 'Klaipėda, Lokatorių g. 12'];
export const BANKS = ['Swedbank', 'SEB', 'Luminor', 'Šiaulių bankas', 'Citadele'];
export const COUNTRIES = ['LT', 'LV', 'EE', 'PL', 'DE', 'OTHER'] as const;
export const PAYMENT_METHODS = ['card', 'bank', 'cash'] as const;

export const DECLINED_CARDS: Record<string, string> = {
  '4000000000000002': 'Kortelė atmesta. Pabandykite kitą mokėjimo kortelę.',
  '4000000000009995': 'Mokėjimas atmestas: kortelėje nepakanka lėšų.',
};

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number) => n.toFixed(2).replace('.', ',') + ' €';

export interface Totals {
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  vat: number;
  promoCode: string | null;
  promoValid: boolean;
  promoNote: string;
  freeShippingLeft: number;
  shippingMethod: ShippingMethod;
}

export function computeTotals(items: { price: number; quantity: number }[], promoCode: string | null, method: ShippingMethod = 'courier'): Totals {
  const subtotal = round2(items.reduce((s, i) => s + i.price * i.quantity, 0));
  const promo = promoCode ? findPromo(promoCode) : null;
  let promoValid = Boolean(promo);
  let promoNote = '';
  if (promo?.min && subtotal < promo.min) {
    promoValid = false;
    promoNote = `Kodas ${promo.code} negalioja: suma mažesnė nei ${money(promo.min)}.`;
  }
  const discount = promoValid && promo?.type === 'percent' ? round2((subtotal * (promo.value ?? 0)) / 100) : 0;
  const afterDiscount = round2(subtotal - discount);
  let shipping: number = subtotal > 0 ? SHIPPING[method].price : 0;
  if (afterDiscount >= FREE_SHIPPING_FROM || (promoValid && promo?.type === 'shipping')) shipping = 0;
  const total = round2(afterDiscount + shipping);
  return {
    subtotal,
    discount,
    shipping,
    total,
    vat: round2(total - total / 1.21),
    promoCode,
    promoValid,
    promoNote,
    freeShippingLeft: Math.max(0, round2(FREE_SHIPPING_FROM - afterDiscount)),
    shippingMethod: method,
  };
}

export const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
