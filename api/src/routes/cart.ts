import { Hono } from 'hono';
import type { AppEnv, Variants } from '../types';
import { requireAuth } from '../lib/auth';
import { ApiError, notFound } from '../lib/errors';
import { computeTotals, findPromo, validatePromo } from '../lib/shop';
import { readJson, validator } from '../lib/validation';
import { getProduct } from './products';

interface CartItemRow {
  id: number;
  product_id: string;
  size: string;
  color: string;
  quantity: number;
  name: string;
  price: number;
  image: string;
  hue: number;
  stock: number;
}

export async function loadCart(db: D1Database, userId: number) {
  const [items, cart] = await db.batch([
    db.prepare(
      `SELECT ci.id, ci.product_id, ci.size, ci.color, ci.quantity, p.name, p.price, p.image, p.hue, p.stock
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = ? ORDER BY ci.id`,
    ).bind(userId),
    db.prepare('SELECT promo_code FROM carts WHERE user_id = ?').bind(userId),
  ]);
  const rows = items.results as CartItemRow[];
  const promoCode = ((cart.results[0] as { promo_code: string | null } | undefined)?.promo_code) ?? null;
  const promo = promoCode ? findPromo(promoCode) : null;
  return {
    items: rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      name: r.name,
      price: r.price,
      image: r.image,
      hue: r.hue,
      stock: r.stock,
      size: r.size || null,
      color: r.color || null,
      quantity: r.quantity,
      lineTotal: Math.round(r.price * r.quantity * 100) / 100,
    })),
    itemCount: rows.reduce((s, r) => s + r.quantity, 0),
    promo,
    totals: computeTotals(rows, promoCode, 'courier'),
  };
}

const cart = new Hono<AppEnv>();

// Svečiams: nuolaidos kodo patikrinimas be prisijungimo.
cart.post('/promo-codes/validate', async (c) => {
  const body = await readJson(c);
  const v = validator(body);
  const code = v.string('code', { requiredMessage: 'Įveskite nuolaidos kodą.' });
  const subtotal = body.subtotal ?? 0;
  if (typeof subtotal !== 'number' || subtotal < 0) v.fail('subtotal', 'subtotal turi būti neneigiamas skaičius.');
  v.done();
  return c.json({ promo: validatePromo(code!, subtotal as number) });
});

// '/cart/*' Hono'je apima ir patį '/cart'.
cart.use('/cart/*', requireAuth);

cart.get('/cart', async (c) => c.json(await loadCart(c.env.DB, c.get('user').id)));

cart.post('/cart/items', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const v = validator(await readJson(c));
  const productId = v.string('productId', { requiredMessage: 'Nurodykite productId.' });
  const quantity = v.int('quantity', { required: false, min: 1, max: 99, message: 'Kiekis turi būti nuo 1 iki 99.' }) ?? 1;
  const size = v.string('size', { required: false }) ?? '';
  const color = v.string('color', { required: false }) ?? '';
  v.done();

  const product = await getProduct(db, productId!);
  const variants = JSON.parse(product.variants) as Variants;
  const vv = validator({});
  if (variants.sizes && !size) vv.fail('size', 'Pasirinkite dydį.');
  else if (variants.sizes && !variants.sizes.includes(size)) vv.fail('size', `Galimi dydžiai: ${variants.sizes.join(', ')}.`);
  else if (!variants.sizes && size) vv.fail('size', 'Ši prekė neturi dydžių.');
  if (variants.colors && !color) vv.fail('color', 'Pasirinkite spalvą.');
  else if (variants.colors && !variants.colors.includes(color)) vv.fail('color', `Galimos spalvos: ${variants.colors.join(', ')}.`);
  else if (!variants.colors && color) vv.fail('color', 'Ši prekė neturi spalvų pasirinkimo.');
  vv.done();

  if (product.stock <= 0) throw new ApiError(409, 'OUT_OF_STOCK', 'Ši prekė išparduota.');
  const already = await db.prepare('SELECT COALESCE(SUM(quantity), 0) AS qty FROM cart_items WHERE user_id = ? AND product_id = ?')
    .bind(user.id, product.id).first<number>('qty');
  if ((already ?? 0) + quantity > product.stock) {
    throw new ApiError(409, 'OUT_OF_STOCK', `Sandėlyje yra tik ${product.stock} vnt. Krepšelyje jau turite ${already} vnt.`);
  }

  await db.prepare(
    `INSERT INTO cart_items (user_id, product_id, size, color, quantity) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, product_id, size, color) DO UPDATE SET quantity = quantity + excluded.quantity`,
  ).bind(user.id, product.id, size, color, quantity).run();

  return c.json(await loadCart(db, user.id), 201);
});

async function ownItem(db: D1Database, userId: number, idParam: string) {
  const id = Number(idParam);
  const item = Number.isInteger(id)
    ? await db.prepare('SELECT ci.*, p.stock FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.id = ? AND ci.user_id = ?')
      .bind(id, userId).first<{ id: number; product_id: string; stock: number }>()
    : null;
  if (!item) throw notFound('CART_ITEM_NOT_FOUND', 'Prekė krepšelyje nerasta.');
  return item;
}

cart.patch('/cart/items/:id', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const item = await ownItem(db, user.id, c.req.param('id'));
  const v = validator(await readJson(c));
  const quantity = v.int('quantity', { min: 1, max: 99, message: 'Kiekis turi būti nuo 1 iki 99.' });
  v.done();
  const others = await db.prepare('SELECT COALESCE(SUM(quantity), 0) AS qty FROM cart_items WHERE user_id = ? AND product_id = ? AND id != ?')
    .bind(user.id, item.product_id, item.id).first<number>('qty');
  if ((others ?? 0) + quantity! > item.stock) {
    throw new ApiError(409, 'OUT_OF_STOCK', `Sandėlyje yra tik ${item.stock} vnt. šios prekės.`);
  }
  await db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').bind(quantity, item.id).run();
  return c.json(await loadCart(db, user.id));
});

cart.delete('/cart/items/:id', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const item = await ownItem(db, user.id, c.req.param('id'));
  await db.prepare('DELETE FROM cart_items WHERE id = ?').bind(item.id).run();
  // Ištuštėjus krepšeliui nuolaidos kodas pašalinamas.
  await db.prepare('UPDATE carts SET promo_code = NULL WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM cart_items WHERE user_id = ?)')
    .bind(user.id, user.id).run();
  return c.json(await loadCart(db, user.id));
});

cart.delete('/cart', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  await db.batch([
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM carts WHERE user_id = ?').bind(user.id),
  ]);
  return c.body(null, 204);
});

cart.post('/cart/promo', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const v = validator(await readJson(c));
  const code = v.string('code', { requiredMessage: 'Įveskite nuolaidos kodą.' });
  v.done();
  const current = await loadCart(db, user.id);
  if (!current.items.length) throw new ApiError(422, 'CART_EMPTY', 'Krepšelis tuščias – kodo pritaikyti negalima.');
  const promo = validatePromo(code!, current.totals.subtotal);
  if (current.promo?.code === promo.code) throw new ApiError(409, 'PROMO_ALREADY_APPLIED', 'Šis kodas jau pritaikytas.');
  await db.prepare('INSERT INTO carts (user_id, promo_code) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET promo_code = excluded.promo_code')
    .bind(user.id, promo.code).run();
  return c.json(await loadCart(db, user.id));
});

cart.delete('/cart/promo', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare('UPDATE carts SET promo_code = NULL WHERE user_id = ?').bind(user.id).run();
  return c.json(await loadCart(c.env.DB, user.id));
});

export default cart;
