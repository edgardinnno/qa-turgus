import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv, Env } from './types';
import { ApiError } from './lib/errors';
import { BANKS, COUNTRIES, FREE_SHIPPING_FROM, PARCEL_LOCKERS, SHIPPING, STORES } from './lib/shop';
import { PATTERNS, readJson, validator } from './lib/validation';
import { docsHtml, openapi } from './openapi';
import auth from './routes/auth';
import cart from './routes/cart';
import orders from './routes/orders';
import products from './routes/products';
import users from './routes/users';

const app = new Hono<AppEnv>();

// Autentifikacija vyksta per Authorization antraštę (ne slapukus), todėl galima leisti bet kurį origin.
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Location'],
  maxAge: 86400,
}));

app.get('/', (c) => c.redirect('/docs'));
app.get('/docs', (c) => c.html(docsHtml));
app.get('/openapi.json', (c) => c.json(openapi));

const api = new Hono<AppEnv>();

api.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

api.get('/config', (c) => c.json({
  freeShippingFrom: FREE_SHIPPING_FROM,
  shipping: SHIPPING,
  parcelLockers: PARCEL_LOCKERS,
  stores: STORES,
  banks: BANKS,
  countries: COUNTRIES,
}));

api.post('/contact-messages', async (c) => {
  const v = validator(await readJson(c));
  v.string('name', { requiredMessage: 'Įveskite vardą.', min: 2, minMessage: 'Vardas per trumpas.', max: 100 });
  v.string('email', { requiredMessage: 'Įveskite el. pašto adresą.', pattern: PATTERNS.email, message: 'Neteisingas el. pašto formatas.' });
  v.oneOf('topic', ['order', 'return', 'account', 'other'], { message: 'Pasirinkite temą: order, return, account, other.' });
  v.string('orderNumber', { required: false, pattern: /^ORD-\d{6}$/i, message: 'Užsakymo numerio formatas: ORD-123456.' });
  v.string('message', { requiredMessage: 'Parašykite žinutę.', min: 20, minMessage: 'Žinutė turi būti bent 20 simbolių.', max: 500 });
  v.bool('sendCopy');
  v.done();
  return c.json({ ticket: `KT-${Math.floor(1000 + Math.random() * 9000)}` }, 201);
});

api.route('/auth', auth);
api.route('/users', users);
api.route('/orders', orders);
api.route('/', products);
api.route('/', cart);

app.route('/api', api);

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: `Maršrutas ${c.req.method} ${c.req.path} neegzistuoja.` } }, 404));

app.onError((err, c) => {
  if (err instanceof ApiError) return c.json(err.toJSON(), err.status);
  console.error(err);
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Netikėta serverio klaida.' } }, 500);
});

export default {
  fetch: app.fetch,

  // Kas naktį: pasibaigusios sesijos, 30 d. senumo testiniai vartotojai ir senos demo vartotojų užsakymų istorijos.
  async scheduled(_controller: ScheduledController, env: Env) {
    const now = new Date();
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now.toISOString()),
      env.DB.prepare('DELETE FROM users WHERE is_demo = 0 AND created_at < ?').bind(daysAgo(30)),
      env.DB.prepare('DELETE FROM orders WHERE created_at < ? AND user_id IN (SELECT id FROM users WHERE is_demo = 1)').bind(daysAgo(7)),
    ]);
  },
} satisfies ExportedHandler<Env>;
