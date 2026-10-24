import type { Context } from 'hono';
import { ApiError } from './errors';

export const PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  name: /^[\p{L}\s'-]+$/u,
  phone: /^\+370\d{8}$/,
  postal: /^(LT-)?\d{5}$/i,
  date: /^\d{4}-\d{2}-\d{2}$/,
};

export const PASSWORD_RULES: [RegExp | ((v: string) => boolean), string][] = [
  [(v) => v.length >= 8, 'Slaptažodis turi būti bent 8 simbolių.'],
  [/\p{Lu}/u, 'Slaptažodyje turi būti bent viena didžioji raidė.'],
  [/\p{Ll}/u, 'Slaptažodyje turi būti bent viena mažoji raidė.'],
  [/\d/, 'Slaptažodyje turi būti bent vienas skaičius.'],
  [/[^\p{L}\d\s]/u, 'Slaptažodyje turi būti bent vienas specialusis simbolis (pvz. ! @ #).'],
];

export function passwordError(value: string): string | null {
  for (const [rule, msg] of PASSWORD_RULES) {
    const ok = typeof rule === 'function' ? rule(value) : rule.test(value);
    if (!ok) return msg;
  }
  return null;
}

export async function readJson(c: Context): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Užklausos turinys turi būti galiojantis JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'INVALID_JSON', 'Užklausos turinys turi būti JSON objektas.');
  }
  return body as Record<string, unknown>;
}

interface StringOpts {
  required?: boolean;
  requiredMessage?: string;
  min?: number;
  minMessage?: string;
  max?: number;
  pattern?: RegExp;
  message?: string;
  trim?: boolean;
}

/** Surenka visas lauko klaidas ir, jei jų yra, meta 422 VALIDATION_ERROR su details. */
export function validator(data: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  const fail = (field: string, msg: string) => {
    if (!errors[field]) errors[field] = msg;
  };

  return {
    errors,
    fail,
    has: (field: string) => data[field] !== undefined,

    string(field: string, opts: StringOpts = {}): string | undefined {
      const raw = data[field];
      const required = opts.required !== false;
      if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
        if (required) fail(field, opts.requiredMessage ?? 'Laukas privalomas.');
        return undefined;
      }
      if (typeof raw !== 'string') {
        fail(field, 'Reikšmė turi būti tekstas.');
        return undefined;
      }
      const value = opts.trim === false ? raw : raw.trim();
      if (opts.min !== undefined && value.length < opts.min) fail(field, opts.minMessage ?? `Turi būti bent ${opts.min} simbolių.`);
      else if (opts.max !== undefined && value.length > opts.max) fail(field, `Ne daugiau kaip ${opts.max} simbolių.`);
      else if (opts.pattern && !opts.pattern.test(value)) fail(field, opts.message ?? 'Neteisingas formatas.');
      return value;
    },

    int(field: string, opts: { required?: boolean; min?: number; max?: number; message?: string } = {}): number | undefined {
      const raw = data[field];
      if (raw === undefined || raw === null) {
        if (opts.required !== false) fail(field, 'Laukas privalomas.');
        return undefined;
      }
      if (typeof raw !== 'number' || !Number.isInteger(raw)) {
        fail(field, 'Reikšmė turi būti sveikasis skaičius.');
        return undefined;
      }
      if ((opts.min !== undefined && raw < opts.min) || (opts.max !== undefined && raw > opts.max)) {
        fail(field, opts.message ?? `Reikšmė turi būti nuo ${opts.min} iki ${opts.max}.`);
      }
      return raw;
    },

    bool(field: string): boolean | undefined {
      const raw = data[field];
      if (raw === undefined || raw === null) return undefined;
      if (typeof raw !== 'boolean') {
        fail(field, 'Reikšmė turi būti true arba false.');
        return undefined;
      }
      return raw;
    },

    oneOf<T extends string>(field: string, values: readonly T[], opts: { required?: boolean; message?: string } = {}): T | undefined {
      const raw = data[field];
      if (raw === undefined || raw === null || raw === '') {
        if (opts.required !== false) fail(field, opts.message ?? 'Laukas privalomas.');
        return undefined;
      }
      if (typeof raw !== 'string' || !values.includes(raw as T)) {
        fail(field, opts.message ?? `Leidžiamos reikšmės: ${values.join(', ')}.`);
        return undefined;
      }
      return raw as T;
    },

    object(field: string): Record<string, unknown> {
      const raw = data[field];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        fail(field, 'Laukas privalomas (JSON objektas).');
        return {};
      }
      return raw as Record<string, unknown>;
    },

    /** Įdėtinio objekto laukų klaidos įrašomos kaip „address.city“. */
    nested(prefix: string, child: { errors: Record<string, string> }) {
      for (const [k, v] of Object.entries(child.errors)) fail(`${prefix}.${k}`, v);
    },

    done() {
      if (Object.keys(errors).length) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Užklausoje yra klaidų. Žr. details.', errors);
      }
    },
  };
}

export function ageFrom(date: string): number {
  const d = new Date(date + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return NaN;
  const now = new Date();
  let years = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) years--;
  return years;
}

export function luhn(num: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}
