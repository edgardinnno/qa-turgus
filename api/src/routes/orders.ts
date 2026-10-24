import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../lib/auth';
import { ApiError, notFound } from '../lib/errors';
import { orderJson, type OrderRow } from '../lib/serialize';
import {
  BANKS, computeTotals, DECLINED_CARDS, PARCEL_LOCKERS, PAYMENT_METHODS, SHIPPING, SHIPPING_METHODS, STORES,
} from '../lib/shop';
import { luhn, PATTERNS, readJson, validator } from '../lib/validation';
import { loadCart } from './cart';

const orders = new Hono<AppEnv>();
orders.use('*', requireAuth);

function expiryError(val: string): string | null {
  const m = /^(\d{2})\/(\d{2})$/.exec(val);
  if (!m) return 'Galiojimo datos formatas: MM/YY.';
  const month = Number(m[1]);
  if (month < 1 || month > 12) return 'Neteisingas mėnuo.';
  return new Date(Date.UTC(2000 + Number(m[2]), month, 1)) <= new Date() ? 'Kortelės galiojimas pasibaigęs.' : null;
}

/**
 * POST /orders
 * { address: {firstName, lastName, phone, street, city, postal, notes?},
 *   delivery: {method: courier|parcel|pickup, location?},
 *   payment: {method: card|bank|cash, card?: {holder, number, expiry, cvc}, bank?} }
 */
orders.post('/', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const v = validator(await readJson(c));

  const a = validator(v.object('address'));
  const address = {
    firstName: a.string('firstName', { requiredMessage: 'Įveskite vardą.', max: 50 }),
    lastName: a.string('lastName', { requiredMessage: 'Įveskite pavardę.', max: 50 }),
    phone: a.string('phone', { requiredMessage: 'Įveskite telefono numerį.' })?.replace(/\s/g, ''),
    street: a.string('street', { requiredMessage: 'Įveskite gatvę ir namo numerį.', min: 5, minMessage: 'Adresas per trumpas.', max: 100 }),
    city: a.string('city', { requiredMessage: 'Įveskite miestą.', max: 50 }),
    postal: a.string('postal', { requiredMessage: 'Įveskite pašto kodą.', pattern: PATTERNS.postal, message: 'Pašto kodo formatas: LT-12345.' }),
    notes: a.string('notes', { required: false, max: 200 }) ?? '',
  };
  if (address.phone && !PATTERNS.phone.test(address.phone)) a.fail('phone', 'Telefono formatas: +370XXXXXXXX.');
  if (address.postal) address.postal = address.postal.toUpperCase().startsWith('LT-') ? address.postal.toUpperCase() : `LT-${address.postal}`;
  v.nested('address', a);

  const d = validator(v.object('delivery'));
  const method = d.oneOf('method', SHIPPING_METHODS, { message: `Pristatymo būdas: ${SHIPPING_METHODS.join(', ')}.` });
  let location: string | undefined;
  if (method === 'parcel') location = d.oneOf('location', PARCEL_LOCKERS, { message: 'Pasirinkite paštomatą iš sąrašo.' });
  if (method === 'pickup') location = d.oneOf('location', STORES, { message: 'Pasirinkite parduotuvę iš sąrašo.' });
  v.nested('delivery', d);

  const p = validator(v.object('payment'));
  const payMethod = p.oneOf('method', PAYMENT_METHODS, { message: `Mokėjimo būdas: ${PAYMENT_METHODS.join(', ')}.` });
  const payment: Record<string, string> = { method: payMethod ?? '' };
  let cardNumber = '';
  if (payMethod === 'cash' && method === 'parcel') p.fail('method', 'Grynaisiais negalima mokėti pasirinkus paštomatą.');
  if (payMethod === 'card') {
    const k = validator(p.object('card'));
    k.string('holder', { requiredMessage: 'Įveskite kortelės savininko vardą ir pavardę.', pattern: PATTERNS.name, message: 'Galima naudoti tik raides.' });
    cardNumber = k.string('number', { requiredMessage: 'Įveskite kortelės numerį.' })?.replace(/\s/g, '') ?? '';
    if (cardNumber && !/^\d{16}$/.test(cardNumber)) k.fail('number', 'Kortelės numeris turi būti iš 16 skaitmenų.');
    else if (cardNumber && !luhn(cardNumber)) k.fail('number', 'Neteisingas kortelės numeris.');
    const expiry = k.string('expiry', { requiredMessage: 'Įveskite galiojimo datą.' });
    if (expiry) {
      const err = expiryError(expiry);
      if (err) k.fail('expiry', err);
    }
    k.string('cvc', { requiredMessage: 'Įveskite CVC kodą.', pattern: /^\d{3}$/, message: 'CVC kodą sudaro 3 skaitmenys.' });
    p.nested('card', k);
    payment.last4 = cardNumber.slice(-4);
  }
  if (payMethod === 'bank') payment.bank = p.oneOf('bank', BANKS, { message: 'Pasirinkite banką iš sąrašo.' }) ?? '';
  v.nested('payment', p);
  v.done();

  // Specialus demo vartotojas – užsakymai visada „lūžta“.
  if (user.type === 'error') {
    throw new ApiError(500, 'SERVER_ERROR', 'Serverio klaida (500). Užsakymo pateikti nepavyko – bandykite vėliau.');
  }

  const cart = await loadCart(db, user.id);
  if (!cart.items.length) throw new ApiError(422, 'CART_EMPTY', 'Krepšelis tuščias.');
  if (payMethod === 'card' && DECLINED_CARDS[cardNumber]) {
    throw new ApiError(402, 'PAYMENT_DECLINED', DECLINED_CARDS[cardNumber]);
  }

  let id: string;
  do {
    id = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
  } while (await db.prepare('SELECT 1 FROM orders WHERE id = ?').bind(id).first());

  const items = cart.items.map(({ productId, name, price, image, hue, size, color, quantity }) => ({
    productId, name, price, image, hue, size, color, quantity,
  }));
  const shipping = SHIPPING[method!];
  const delivery = { method, label: shipping.label, eta: shipping.eta, ...(location ? { location } : {}) };
  const totals = computeTotals(cart.items, cart.promo?.code ?? null, method);

  // batch vykdomas kaip viena transakcija: užsakymas sukuriamas ir krepšelis išvalomas kartu.
  const [, , inserted] = await db.batch([
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM carts WHERE user_id = ?').bind(user.id),
    db.prepare(
      'INSERT INTO orders (id, user_id, items, totals, address, delivery, payment) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *',
    ).bind(id, user.id, JSON.stringify(items), JSON.stringify(totals), JSON.stringify(address), JSON.stringify(delivery), JSON.stringify(payment)),
  ]);

  return c.json({ order: orderJson(inserted.results[0] as OrderRow) }, 201, { Location: `/api/orders/${id}` });
});

orders.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC')
    .bind(c.get('user').id)
    .all<OrderRow>();
  return c.json({ items: results.map(orderJson), total: results.length });
});

async function ownOrder(db: D1Database, userId: number, id: string) {
  const row = await db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').bind(id, userId).first<OrderRow>();
  if (!row) throw notFound('ORDER_NOT_FOUND', 'Užsakymas nerastas.');
  return row;
}

orders.get('/:id', async (c) => {
  return c.json({ order: orderJson(await ownOrder(c.env.DB, c.get('user').id, c.req.param('id'))) });
});

orders.post('/:id/cancel', async (c) => {
  const db = c.env.DB;
  const order = await ownOrder(db, c.get('user').id, c.req.param('id'));
  if (order.status !== 'processing') {
    throw new ApiError(409, 'ORDER_NOT_CANCELLABLE', 'Šio užsakymo atšaukti nebegalima.');
  }
  const updated = await db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? RETURNING *").bind(order.id).first<OrderRow>();
  return c.json({ order: orderJson(updated!) });
});

export default orders;
