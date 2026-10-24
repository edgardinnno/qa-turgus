import { Hono } from 'hono';
import type { AppEnv, UserRow } from '../types';
import { requireAuth, SESSION_HOURS, slowDown } from '../lib/auth';
import { hashPassword, randomToken, verifyPassword } from '../lib/crypto';
import { ApiError } from '../lib/errors';
import { userJson } from '../lib/serialize';
import { COUNTRIES } from '../lib/shop';
import { ageFrom, passwordError, PATTERNS, readJson, validator } from '../lib/validation';

const auth = new Hono<AppEnv>();

auth.post('/register', async (c) => {
  const v = validator(await readJson(c));
  const firstName = v.string('firstName', {
    requiredMessage: 'Įveskite vardą.', min: 2, minMessage: 'Vardas turi būti bent 2 simbolių.', max: 50,
    pattern: PATTERNS.name, message: 'Varde gali būti tik raidės.',
  });
  const lastName = v.string('lastName', {
    requiredMessage: 'Įveskite pavardę.', min: 2, minMessage: 'Pavardė turi būti bent 2 simbolių.', max: 50,
    pattern: PATTERNS.name, message: 'Pavardėje gali būti tik raidės.',
  });
  const email = v.string('email', {
    requiredMessage: 'Įveskite el. pašto adresą.', max: 254, pattern: PATTERNS.email, message: 'Neteisingas el. pašto formatas.',
  })?.toLowerCase();
  const phone = v.string('phone', { required: false })?.replace(/\s/g, '') || null;
  if (phone && !PATTERNS.phone.test(phone)) v.fail('phone', 'Telefono formatas: +370XXXXXXXX.');
  const birthDate = v.string('birthDate', {
    requiredMessage: 'Įveskite gimimo datą.', pattern: PATTERNS.date, message: 'Datos formatas: YYYY-MM-DD.',
  });
  if (birthDate && PATTERNS.date.test(birthDate)) {
    const age = ageFrom(birthDate);
    if (Number.isNaN(age) || age < 0 || age > 120) v.fail('birthDate', 'Neteisinga gimimo data.');
    else if (age < 18) v.fail('birthDate', 'Registruotis gali tik asmenys nuo 18 metų.');
  }
  const country = v.oneOf('country', COUNTRIES, { message: `Pasirinkite šalį: ${COUNTRIES.join(', ')}.` });
  const password = v.string('password', { requiredMessage: 'Įveskite slaptažodį.', trim: false, max: 128 });
  if (password) {
    const err = passwordError(password);
    if (err) v.fail('password', err);
  }
  const newsletter = v.bool('newsletter') ?? false;
  v.done();

  const db = c.env.DB;
  if (await db.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) {
    throw new ApiError(409, 'EMAIL_TAKEN', 'Vartotojas su šiuo el. pašto adresu jau užregistruotas.', {
      email: 'Šis el. pašto adresas jau užimtas.',
    });
  }
  const user = await db
    .prepare(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, birth_date, country, newsletter)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .bind(email, await hashPassword(password!), firstName, lastName, phone, birthDate, country, newsletter ? 1 : 0)
    .first<UserRow>();

  return c.json({ user: userJson(user!) }, 201, { Location: '/api/users/me' });
});

auth.post('/login', async (c) => {
  const v = validator(await readJson(c));
  const email = v.string('email', { requiredMessage: 'Įveskite el. pašto adresą.', pattern: PATTERNS.email, message: 'Neteisingas el. pašto formatas.' });
  const password = v.string('password', { requiredMessage: 'Įveskite slaptažodį.', trim: false });
  const remember = v.bool('remember') ?? false;
  v.done();

  const db = c.env.DB;
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email!.toLowerCase()).first<UserRow>();
  await slowDown(user);
  if (!user || !(await verifyPassword(password!, user.password_hash))) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Neteisingas el. paštas arba slaptažodis.');
  }
  if (user.type === 'locked') {
    throw new ApiError(403, 'ACCOUNT_LOCKED', 'Ši paskyra užblokuota. Susisiekite su administratoriumi.');
  }

  const token = randomToken();
  const expiresAt = new Date(Date.now() + (remember ? SESSION_HOURS.remember : SESSION_HOURS.default) * 3600_000).toISOString();
  await db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').bind(token, user.id, expiresAt).run();

  return c.json({ token, tokenType: 'Bearer', expiresAt, user: userJson(user) });
});

auth.post('/logout', requireAuth, async (c) => {
  await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(c.get('token')).run();
  return c.body(null, 204);
});

export default auth;
