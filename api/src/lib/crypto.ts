// PBKDF2 per WebCrypto. Iteracijų mažiau nei rekomenduojama produkcijai, kad tilptume į
// nemokamo Workers plano CPU limitą – tai mokomasis projektas be tikrų duomenų.
const ITERATIONS = 10000;
const encoder = new TextEncoder();

const toHex = (buf: ArrayBuffer | Uint8Array) =>
  Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string) => new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2_sha256$${ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, iter, saltHex, hashHex] = stored.split('$');
  if (algo !== 'pbkdf2_sha256') return false;
  const hash = toHex(await derive(password, fromHex(saltHex), Number(iter)));
  // Palyginimas pastoviu laiku
  let diff = hash.length ^ hashHex.length;
  for (let i = 0; i < hash.length && i < hashHex.length; i++) diff |= hash.charCodeAt(i) ^ hashHex.charCodeAt(i);
  return diff === 0;
}

export function randomToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}
