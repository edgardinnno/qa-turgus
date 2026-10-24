// DB eilučių pavertimas API atsakymais (camelCase).
import type { ProductRow, UserRow, Variants } from '../types';
import { CATEGORIES } from './shop';

export function userJson(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.first_name,
    lastName: u.last_name,
    phone: u.phone,
    birthDate: u.birth_date,
    country: u.country,
    newsletter: Boolean(u.newsletter),
    isDemo: Boolean(u.is_demo),
    createdAt: u.created_at,
  };
}

export function productJson(p: ProductRow) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    categoryName: CATEGORIES[p.category],
    price: p.price,
    oldPrice: p.old_price,
    rating: p.rating,
    reviewsCount: p.reviews_count,
    stock: p.stock,
    image: p.image,
    hue: p.hue,
    description: p.description,
    specs: JSON.parse(p.specs) as Record<string, string>,
    variants: JSON.parse(p.variants) as Variants,
  };
}

export interface OrderRow {
  id: string;
  user_id: number;
  status: string;
  items: string;
  totals: string;
  address: string;
  delivery: string;
  payment: string;
  created_at: string;
}

export const ORDER_STATUS: Record<string, string> = { processing: 'Apdorojamas', cancelled: 'Atšauktas' };

export function orderJson(o: OrderRow) {
  return {
    id: o.id,
    status: o.status,
    statusLabel: ORDER_STATUS[o.status],
    createdAt: o.created_at,
    items: JSON.parse(o.items),
    totals: JSON.parse(o.totals),
    address: JSON.parse(o.address),
    delivery: JSON.parse(o.delivery),
    payment: JSON.parse(o.payment),
  };
}
