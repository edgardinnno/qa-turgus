-- QA Turgus duomenų bazės schema

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  first_name    TEXT    NOT NULL,
  last_name     TEXT    NOT NULL,
  phone         TEXT,
  birth_date    TEXT    NOT NULL,
  country       TEXT    NOT NULL,
  newsletter    INTEGER NOT NULL DEFAULT 0,
  type          TEXT    NOT NULL DEFAULT 'standard', -- standard | locked | slow | error
  is_demo       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE products (
  id            TEXT PRIMARY KEY,
  name          TEXT    NOT NULL,
  category      TEXT    NOT NULL,
  price         REAL    NOT NULL,
  old_price     REAL,
  rating        REAL    NOT NULL,
  reviews_count INTEGER NOT NULL,
  stock         INTEGER NOT NULL,
  image         TEXT    NOT NULL,
  hue           INTEGER NOT NULL,
  description   TEXT    NOT NULL,
  specs         TEXT    NOT NULL DEFAULT '{}', -- JSON
  variants      TEXT    NOT NULL DEFAULT '{}', -- JSON
  search_text   TEXT    NOT NULL,               -- mažosios raidės be diakritikų
  position      INTEGER NOT NULL
);

CREATE TABLE reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  author     TEXT    NOT NULL,
  rating     INTEGER NOT NULL,
  text       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE UNIQUE INDEX idx_reviews_one_per_user ON reviews(product_id, user_id) WHERE user_id IS NOT NULL;

CREATE TABLE carts (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  promo_code TEXT
);

-- size / color saugomi kaip '' (ne NULL), kad veiktų UNIQUE apribojimas.
CREATE TABLE cart_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size       TEXT    NOT NULL DEFAULT '',
  color      TEXT    NOT NULL DEFAULT '',
  quantity   INTEGER NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, product_id, size, color)
);

CREATE TABLE orders (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT    NOT NULL DEFAULT 'processing', -- processing | cancelled
  items      TEXT    NOT NULL, -- JSON
  totals     TEXT    NOT NULL, -- JSON
  address    TEXT    NOT NULL, -- JSON
  delivery   TEXT    NOT NULL, -- JSON
  payment    TEXT    NOT NULL, -- JSON
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_orders_user ON orders(user_id);
