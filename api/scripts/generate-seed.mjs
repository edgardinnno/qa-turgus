// Sugeneruoja migrations/0002_seed.sql iš ../data/products.json ir demo vartotojų.
// Paleidimas: npm run seed
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const products = JSON.parse(readFileSync(join(root, '..', 'data', 'products.json'), 'utf8'));

// Turi sutapti su src/lib/crypto.ts
const ITERATIONS = 10000;
const CATEGORIES = { elektronika: 'Elektronika', drabuziai: 'Drabužiai', namai: 'Namai', sportas: 'Sportas', knygos: 'Knygos' };
const DEMO_PASSWORD = 'Slaptas123!';
const DEMO_USERS = [
  ['standartinis@test.lt', 'Jonas', 'Jonaitis', 'standard'],
  ['uzblokuotas@test.lt', 'Petras', 'Petraitis', 'locked'],
  ['letas@test.lt', 'Rasa', 'Lėtaitė', 'slow'],
  ['klaidingas@test.lt', 'Klaidas', 'Klaidutis', 'error'],
];

const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  return `pbkdf2_sha256$${ITERATIONS}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

const lines = ['-- Sugeneruota scripts/generate-seed.mjs. Neredaguokite rankiniu būdu.', ''];

for (const [email, first, last, type] of DEMO_USERS) {
  lines.push(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, birth_date, country, type, is_demo, created_at) VALUES (${[
      email, hashPassword(DEMO_PASSWORD), first, last, '+37060000000', '1990-01-15', 'LT', type,
    ].map(q).join(', ')}, 1, '2026-01-05T09:00:00.000Z');`,
  );
}
lines.push('');

products.forEach((p, i) => {
  const search = normalize(`${p.name} ${p.description} ${CATEGORIES[p.category]}`);
  lines.push(
    `INSERT INTO products (id, name, category, price, old_price, rating, reviews_count, stock, image, hue, description, specs, variants, search_text, position) VALUES (${[
      p.id, p.name, p.category, p.price, p.oldPrice ?? null, p.rating, p.reviewsCount, p.stock, p.image, p.hue,
      p.description, JSON.stringify(p.specs || {}), JSON.stringify(p.variants || {}), search, i,
    ].map(q).join(', ')});`,
  );
  for (const r of p.reviews || []) {
    lines.push(
      `INSERT INTO reviews (product_id, author, rating, text, created_at) VALUES (${[p.id, r.author, r.rating, r.text, `${r.date}T12:00:00.000Z`].map(q).join(', ')});`,
    );
  }
});

writeFileSync(join(root, 'migrations', '0002_seed.sql'), lines.join('\n') + '\n');
console.log(`OK: ${DEMO_USERS.length} vartotojai, ${products.length} prekės → migrations/0002_seed.sql`);
