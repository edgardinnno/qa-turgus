import { Hono } from 'hono';
import type { AppEnv, UserRow } from '../types';
import { assertNotDemo, requireAuth } from '../lib/auth';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { ApiError } from '../lib/errors';
import { userJson } from '../lib/serialize';
import { passwordError, PATTERNS, readJson, validator } from '../lib/validation';

const users = new Hono<AppEnv>();
users.use('*', requireAuth);

users.get('/me', (c) => c.json({ user: userJson(c.get('user')) }));

users.patch('/me', async (c) => {
  const user = c.get('user');
  assertNotDemo(user);
  const body = await readJson(c);
  const v = validator(body);
  const changes: Record<string, string | number | null> = {};

  if (v.has('firstName')) {
    changes.first_name = v.string('firstName', {
      requiredMessage: 'Įveskite vardą.', min: 2, minMessage: 'Vardas turi būti bent 2 simbolių.', max: 50,
      pattern: PATTERNS.name, message: 'Varde gali būti tik raidės.',
    }) ?? null;
  }
  if (v.has('lastName')) {
    changes.last_name = v.string('lastName', {
      requiredMessage: 'Įveskite pavardę.', min: 2, minMessage: 'Pavardė turi būti bent 2 simbolių.', max: 50,
      pattern: PATTERNS.name, message: 'Pavardėje gali būti tik raidės.',
    }) ?? null;
  }
  if (v.has('phone')) {
    const phone = v.string('phone', { required: false })?.replace(/\s/g, '') || null;
    if (phone && !PATTERNS.phone.test(phone)) v.fail('phone', 'Telefono formatas: +370XXXXXXXX.');
    changes.phone = phone;
  }
  if (v.has('newsletter')) {
    const n = v.bool('newsletter');
    if (n !== undefined) changes.newsletter = n ? 1 : 0;
  }
  if (!Object.keys(changes).length && !Object.keys(v.errors).length) {
    v.fail('body', 'Nurodykite bent vieną keičiamą lauką: firstName, lastName, phone, newsletter.');
  }
  v.done();

  const cols = Object.keys(changes);
  const updated = await c.env.DB.prepare(`UPDATE users SET ${cols.map((col) => `${col} = ?`).join(', ')} WHERE id = ? RETURNING *`)
    .bind(...cols.map((col) => changes[col]), user.id)
    .first<UserRow>();
  return c.json({ user: userJson(updated!) });
});

users.put('/me/password', async (c) => {
  const user = c.get('user');
  assertNotDemo(user);
  const v = validator(await readJson(c));
  const current = v.string('currentPassword', { requiredMessage: 'Įveskite dabartinį slaptažodį.', trim: false });
  const next = v.string('newPassword', { requiredMessage: 'Įveskite naują slaptažodį.', trim: false, max: 128 });
  if (next) {
    const err = passwordError(next);
    if (err) v.fail('newPassword', err);
    else if (current === next) v.fail('newPassword', 'Naujas slaptažodis turi skirtis nuo dabartinio.');
  }
  v.done();

  if (!(await verifyPassword(current!, user.password_hash))) {
    throw new ApiError(400, 'WRONG_PASSWORD', 'Dabartinis slaptažodis neteisingas.', { currentPassword: 'Dabartinis slaptažodis neteisingas.' });
  }
  const db = c.env.DB;
  await db.batch([
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(next!), user.id),
    // Kitos sesijos nutraukiamos, dabartinė lieka.
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').bind(user.id, c.get('token')),
  ]);
  return c.body(null, 204);
});

users.delete('/me', async (c) => {
  const user = c.get('user');
  assertNotDemo(user);
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
  return c.body(null, 204);
});

export default users;
