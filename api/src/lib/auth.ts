import { createMiddleware } from 'hono/factory';
import type { AppEnv, UserRow } from '../types';
import { ApiError } from './errors';

export const SESSION_HOURS = { default: 24, remember: 24 * 7 };

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const rand = (min: number, max: number) => Math.round(min + Math.random() * (max - min));

/** „Lėtas“ demo vartotojas kiekvieną atsakymą gauna po 2,5–4 s. */
export async function slowDown(user: Pick<UserRow, 'type'> | null | undefined) {
  if (user?.type === 'slow') await sleep(rand(2500, 4000));
}

/** Reikalauja antraštės `Authorization: Bearer <token>`. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const match = /^Bearer\s+(\S+)$/i.exec(c.req.header('Authorization') ?? '');
  if (!match) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Reikalinga autentifikacija: pridėkite antraštę „Authorization: Bearer <token>“.');
  }
  const row = await c.env.DB.prepare(
    'SELECT u.*, s.expires_at AS session_expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?',
  )
    .bind(match[1])
    .first<UserRow & { session_expires_at: string }>();

  if (!row) throw new ApiError(401, 'INVALID_TOKEN', 'Sesija negalioja. Prisijunkite iš naujo.');
  if (row.session_expires_at < new Date().toISOString()) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(match[1]).run();
    throw new ApiError(401, 'SESSION_EXPIRED', 'Sesija baigėsi. Prisijunkite iš naujo.');
  }
  if (row.type === 'locked') throw new ApiError(403, 'ACCOUNT_LOCKED', 'Ši paskyra užblokuota. Susisiekite su administratoriumi.');

  c.set('user', row);
  c.set('token', match[1]);
  await slowDown(row);
  await next();
});

export function assertNotDemo(user: UserRow) {
  if (user.is_demo) {
    throw new ApiError(403, 'DEMO_ACCOUNT', 'Demo paskyros duomenų keisti negalima. Užsiregistruokite savo vartotoją.');
  }
}
