import { Hono } from 'hono';
import type { AppEnv, ProductRow } from '../types';
import { requireAuth } from '../lib/auth';
import { ApiError, notFound } from '../lib/errors';
import { productJson } from '../lib/serialize';
import { CATEGORIES, normalize } from '../lib/shop';
import { readJson, validator } from '../lib/validation';

const products = new Hono<AppEnv>();

const SORTERS: Record<string, (a: ProductRow, b: ProductRow) => number> = {
  popular: (a, b) => b.reviews_count - a.reviews_count,
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  'name-asc': (a, b) => a.name.localeCompare(b.name, 'lt'),
  'name-desc': (a, b) => b.name.localeCompare(a.name, 'lt'),
  rating: (a, b) => b.rating - a.rating,
};

async function getProduct(db: D1Database, id: string) {
  const row = await db.prepare('SELECT * FROM products WHERE id = ?').bind(id).first<ProductRow>();
  if (!row) throw notFound('PRODUCT_NOT_FOUND', 'Prekė nerasta.');
  return row;
}

products.get('/categories', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT category, COUNT(*) AS count FROM products GROUP BY category').all<{ category: string; count: number }>();
  const counts = Object.fromEntries(results.map((r) => [r.category, r.count]));
  return c.json({ items: Object.entries(CATEGORIES).map(([id, name]) => ({ id, name, productCount: counts[id] ?? 0 })) });
});

/**
 * GET /products?q=&category=&sort=&inStock=true&page=1&limit=20
 * Duomenų nedaug, todėl rikiuojame JS'e – taip veikia lietuviškas abėcėlės rikiavimas (Š po S, Ž po Z).
 */
products.get('/products', async (c) => {
  const query = c.req.query();
  const errors: Record<string, string> = {};
  const q = (query.q ?? '').trim();
  const category = query.category ?? '';
  const sort = query.sort ?? 'popular';
  const inStock = query.inStock === 'true' || query.inStock === '1';
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);

  if (category && !CATEGORIES[category]) errors.category = `Nežinoma kategorija. Leidžiamos: ${Object.keys(CATEGORIES).join(', ')}.`;
  if (!SORTERS[sort]) errors.sort = `Leidžiamos reikšmės: ${Object.keys(SORTERS).join(', ')}.`;
  if (!Number.isInteger(page) || page < 1) errors.page = 'page turi būti sveikasis skaičius ≥ 1.';
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) errors.limit = 'limit turi būti sveikasis skaičius nuo 1 iki 50.';
  if (q.length > 100) errors.q = 'Paieškos frazė per ilga (max 100 simbolių).';
  if (Object.keys(errors).length) throw new ApiError(422, 'VALIDATION_ERROR', 'Neteisingi užklausos parametrai. Žr. details.', errors);

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM products
     WHERE (?1 = '' OR category = ?1)
       AND (?2 = 0 OR stock > 0)
       AND (?3 = '' OR instr(search_text, ?3) > 0)`,
  )
    .bind(category, inStock ? 1 : 0, normalize(q))
    .all<ProductRow>();

  const sorted = results.sort((a, b) => SORTERS[sort](a, b) || a.position - b.position);
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const items = sorted.slice((page - 1) * limit, page * limit).map(productJson);
  return c.json({ items, total, page, limit, pages });
});

products.get('/products/:id', async (c) => {
  return c.json({ product: productJson(await getProduct(c.env.DB, c.req.param('id'))) });
});

products.get('/products/:id/reviews', async (c) => {
  const product = await getProduct(c.env.DB, c.req.param('id'));
  const { results } = await c.env.DB.prepare(
    'SELECT id, author, rating, text, created_at AS createdAt FROM reviews WHERE product_id = ? ORDER BY created_at DESC, id DESC',
  )
    .bind(product.id)
    .all();
  return c.json({ items: results, total: results.length });
});

products.post('/products/:id/reviews', requireAuth, async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const product = await getProduct(db, c.req.param('id'));
  const v = validator(await readJson(c));
  const rating = v.int('rating', { min: 1, max: 5, message: 'Įvertinimas turi būti nuo 1 iki 5.' });
  const text = v.string('text', { requiredMessage: 'Parašykite atsiliepimą.', min: 10, minMessage: 'Atsiliepimas turi būti bent 10 simbolių.', max: 500 });
  v.done();

  if (await db.prepare('SELECT 1 FROM reviews WHERE product_id = ? AND user_id = ?').bind(product.id, user.id).first()) {
    throw new ApiError(409, 'REVIEW_EXISTS', 'Jūs jau parašėte atsiliepimą šiai prekei.');
  }
  const review = await db
    .prepare('INSERT INTO reviews (product_id, user_id, author, rating, text) VALUES (?, ?, ?, ?, ?) RETURNING id, author, rating, text, created_at AS createdAt')
    .bind(product.id, user.id, `${user.first_name} ${user.last_name.charAt(0)}.`, rating, text)
    .first();
  return c.json({ review }, 201);
});

export { getProduct };
export default products;
