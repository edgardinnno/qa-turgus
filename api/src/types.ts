export interface Env {
  DB: D1Database;
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  birth_date: string;
  country: string;
  newsletter: number;
  type: 'standard' | 'locked' | 'slow' | 'error';
  is_demo: number;
  created_at: string;
}

export interface ProductRow {
  id: string;
  name: string;
  category: string;
  price: number;
  old_price: number | null;
  rating: number;
  reviews_count: number;
  stock: number;
  image: string;
  hue: number;
  description: string;
  specs: string;
  variants: string;
  search_text: string;
  position: number;
}

export interface Variants {
  sizes?: string[];
  colors?: string[];
}

export type AppEnv = {
  Bindings: Env;
  Variables: { user: UserRow; token: string };
};
