/*
 * QA Turgus – bendra visų puslapių logika.
 *
 * „Serveris“ imituojamas naršyklėje:
 *  - vartotojai, krepšeliai, užsakymai ir atsiliepimai saugomi localStorage;
 *  - sesijos žetonas saugomas slapuke (cookie) „qa_session“;
 *  - prekės kraunamos per fetch() iš data/products.json;
 *  - visos „API“ užklausos turi dirbtinį vėlavimą (kaip tikrame tinkle).
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Konstantos
  // ---------------------------------------------------------------------------
  const KEYS = {
    seeded: 'qa_seeded_v1',
    users: 'qa_users',
    sessions: 'qa_sessions',
    carts: 'qa_carts',
    orders: 'qa_orders',
    reviews: 'qa_reviews',
  };
  const CONSENT_KEY = 'qa_cookie_consent';
  const FLASH_KEY = 'qa_flash';
  const SESSION_COOKIE = 'qa_session';

  const CATEGORIES = {
    elektronika: 'Elektronika',
    drabuziai: 'Drabužiai',
    namai: 'Namai',
    sportas: 'Sportas',
    knygos: 'Knygos',
  };

  const SEED_PASSWORD = 'Slaptas123!';
  const SEED_USERS = [
    { email: 'standartinis@test.lt', firstName: 'Jonas', lastName: 'Jonaitis', type: 'standard' },
    { email: 'uzblokuotas@test.lt', firstName: 'Petras', lastName: 'Petraitis', type: 'locked' },
    { email: 'letas@test.lt', firstName: 'Rasa', lastName: 'Lėtaitė', type: 'slow' },
    { email: 'klaidingas@test.lt', firstName: 'Klaidas', lastName: 'Klaidutis', type: 'error' },
  ].map((u) => ({
    ...u,
    password: SEED_PASSWORD,
    phone: '+37060000000',
    birthDate: '1990-01-15',
    country: 'LT',
    newsletter: false,
    createdAt: '2026-01-05T09:00:00.000Z',
  }));

  const PROMOS = {
    PLAYWRIGHT10: { type: 'percent', value: 10, label: '-10 % visam krepšeliui' },
    DIDELIS20: { type: 'percent', value: 20, min: 100, label: '-20 % užsakymams nuo 100 €' },
    NEMOKAMAS: { type: 'shipping', label: 'Nemokamas pristatymas' },
    SENAS2024: { expired: true },
  };

  const FREE_SHIPPING_FROM = 50;
  const SHIPPING = {
    courier: { label: 'Kurjeris į namus', price: 4.99, eta: '1–2 darbo dienos' },
    parcel: { label: 'Paštomatas', price: 2.99, eta: '1–3 darbo dienos' },
    pickup: { label: 'Atsiėmimas parduotuvėje', price: 0, eta: 'Jau rytoj' },
  };
  const PARCEL_LOCKERS = [
    'Vilnius – Centras (Gedimino pr. 9)',
    'Vilnius – Šiaurės miestelis (Kalvarijų g. 120)',
    'Kaunas – Senamiestis (Rotušės a. 3)',
    'Kaunas – Žaliakalnis (Savanorių pr. 200)',
    'Klaipėda – Centras (Tiltų g. 5)',
    'Šiauliai – Centras (Vilniaus g. 150)',
  ];
  const STORES = ['Vilnius, Testuotojų g. 1', 'Kaunas, Automatizacijos g. 7', 'Klaipėda, Lokatorių g. 12'];
  const BANKS = ['Swedbank', 'SEB', 'Luminor', 'Šiaulių bankas', 'Citadele'];
  const COUNTRIES = { LT: 'Lietuva', LV: 'Latvija', EE: 'Estija', PL: 'Lenkija', DE: 'Vokietija', OTHER: 'Kita' };
  const PAYMENT_LABELS = { card: 'Mokėjimo kortelė', bank: 'Bankinis pavedimas', cash: 'Grynaisiais atsiimant' };
  const ORDER_STATUS = { processing: 'Apdorojamas', cancelled: 'Atšauktas' };

  // Testinės kortelės: praeina Luhn patikrą, bet „bankas“ jas atmeta.
  const DECLINED_CARDS = {
    '4000000000000002': 'Kortelė atmesta. Pabandykite kitą mokėjimo kortelę.',
    '4000000000009995': 'Mokėjimas atmestas: kortelėje nepakanka lėšų.',
  };

  // ---------------------------------------------------------------------------
  // Pagalbinės funkcijos
  // ---------------------------------------------------------------------------
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rand = (min, max) => Math.round(min + Math.random() * (max - min));
  const round2 = (n) => Math.round(n * 100) / 100;

  function money(n) {
    return Number(n).toFixed(2).replace('.', ',') + ' €';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function param(name) {
    return new URLSearchParams(location.search).get(name);
  }

  // Lietuviškos daugiskaitos formos: [1 prekė, 2 prekės, 10 prekių]
  function plural(n, forms) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && (mod100 < 10 || mod100 >= 20)) return forms[1];
    return forms[2];
  }

  function formatDate(iso, withTime) {
    const d = new Date(iso);
    const pad = (x) => String(x).padStart(2, '0');
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return withTime ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
  }

  // ---------------------------------------------------------------------------
  // Saugykla
  // ---------------------------------------------------------------------------
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function seed(force) {
    if (!force && localStorage.getItem(KEYS.seeded)) return;
    write(KEYS.users, SEED_USERS);
    write(KEYS.sessions, {});
    write(KEYS.carts, {});
    write(KEYS.orders, []);
    write(KEYS.reviews, {});
    localStorage.setItem(KEYS.seeded, '1');
  }

  function resetAll() {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem(FLASH_KEY);
    deleteCookie(SESSION_COOKIE);
    seed(true);
  }

  // ---------------------------------------------------------------------------
  // Slapukai
  // ---------------------------------------------------------------------------
  function setCookie(name, value, days) {
    let cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
    if (days) cookie += `; max-age=${days * 86400}`;
    document.cookie = cookie;
  }

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function deleteCookie(name) {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  }

  // ---------------------------------------------------------------------------
  // Įvykiai
  // ---------------------------------------------------------------------------
  const bus = new EventTarget();
  const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
  const on = (name, fn) => bus.addEventListener(name, (e) => fn(e.detail));

  // ---------------------------------------------------------------------------
  // Autentifikacija
  // ---------------------------------------------------------------------------
  const allUsers = () => read(KEYS.users, []);

  function findUser(email) {
    const e = String(email || '').trim().toLowerCase();
    return allUsers().find((u) => u.email === e) || null;
  }

  function saveUser(user) {
    const list = allUsers();
    const i = list.findIndex((u) => u.email === user.email);
    if (i >= 0) list[i] = user;
    else list.push(user);
    write(KEYS.users, list);
  }

  function publicUser(u) {
    const copy = { ...u };
    delete copy.password;
    return copy;
  }

  function currentUser() {
    const token = getCookie(SESSION_COOKIE);
    if (!token) return null;
    const email = read(KEYS.sessions, {})[token];
    const user = email && findUser(email);
    if (!user || user.type === 'locked') return null;
    return publicUser(user);
  }

  // Vėlavimas priklauso nuo vartotojo: „lėtas“ vartotojas viską gauna po 2,5–4 s.
  function latency(range, user) {
    const u = user === undefined ? currentUser() : user;
    if (u && u.type === 'slow') return wait(rand(2500, 4000));
    const r = range || [250, 700];
    return wait(rand(r[0], r[1]));
  }

  async function login(email, password, remember) {
    const user = findUser(email);
    await latency([400, 900], user);
    if (!user || user.password !== password) {
      throw new Error('Neteisingas el. paštas arba slaptažodis.');
    }
    if (user.type === 'locked') {
      throw new Error('Ši paskyra užblokuota. Susisiekite su administratoriumi.');
    }
    const token = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const sessions = read(KEYS.sessions, {});
    sessions[token] = user.email;
    write(KEYS.sessions, sessions);
    setCookie(SESSION_COOKIE, token, remember ? 7 : 0);
    mergeGuestCart(user.email);
    return publicUser(user);
  }

  function logout() {
    const token = getCookie(SESSION_COOKIE);
    if (token) {
      const sessions = read(KEYS.sessions, {});
      delete sessions[token];
      write(KEYS.sessions, sessions);
    }
    deleteCookie(SESSION_COOKIE);
  }

  async function register(data) {
    await latency([600, 1200], null);
    const email = data.email.trim().toLowerCase();
    if (findUser(email)) throw new Error('Vartotojas su šiuo el. pašto adresu jau užregistruotas.');
    const user = { ...data, email, type: 'standard', createdAt: new Date().toISOString() };
    saveUser(user);
    return publicUser(user);
  }

  async function updateProfile(changes) {
    const me = currentUser();
    if (!me) throw new Error('Sesija baigėsi. Prisijunkite iš naujo.');
    await latency();
    const user = findUser(me.email);
    Object.assign(user, changes);
    saveUser(user);
    return publicUser(user);
  }

  async function changePassword(current, next) {
    const me = currentUser();
    if (!me) throw new Error('Sesija baigėsi. Prisijunkite iš naujo.');
    await latency();
    const user = findUser(me.email);
    if (user.password !== current) throw new Error('Dabartinis slaptažodis neteisingas.');
    if (current === next) throw new Error('Naujas slaptažodis turi skirtis nuo dabartinio.');
    user.password = next;
    saveUser(user);
  }

  // ---------------------------------------------------------------------------
  // Krepšelis (kiekvienas vartotojas turi savo; neprisijungęs – „guest“)
  // ---------------------------------------------------------------------------
  function cartOwner() {
    const u = currentUser();
    return u ? u.email : 'guest';
  }

  function getCart(owner) {
    const carts = read(KEYS.carts, {});
    return carts[owner || cartOwner()] || { items: [], promo: null };
  }

  function saveCart(cart, owner) {
    const carts = read(KEYS.carts, {});
    carts[owner || cartOwner()] = cart;
    write(KEYS.carts, carts);
    emit('cart:change', cart);
  }

  const itemKey = (id, opts) => [id, opts.size || '', opts.color || ''].join('|');
  const qtyOfProduct = (cart, productId, exceptKey) => cart.items
    .filter((i) => i.productId === productId && i.key !== exceptKey)
    .reduce((sum, i) => sum + i.qty, 0);

  function addToCart(product, qty, opts) {
    const options = opts || {};
    const amount = qty || 1;
    const cart = getCart();
    if (product.stock <= 0) throw new Error('Ši prekė išparduota.');
    const already = qtyOfProduct(cart, product.id);
    if (already + amount > product.stock) {
      throw new Error(`Sandėlyje yra tik ${product.stock} vnt. Krepšelyje jau turite ${already} vnt.`);
    }
    const key = itemKey(product.id, options);
    const existing = cart.items.find((i) => i.key === key);
    if (existing) {
      existing.qty += amount;
    } else {
      cart.items.push({
        key,
        productId: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        hue: product.hue,
        stock: product.stock,
        size: options.size || null,
        color: options.color || null,
        qty: amount,
      });
    }
    saveCart(cart);
    return cart;
  }

  function setCartQty(key, qty) {
    const cart = getCart();
    const item = cart.items.find((i) => i.key === key);
    if (!item) throw new Error('Prekė krepšelyje nerasta.');
    if (!Number.isInteger(qty) || qty < 1) throw new Error('Kiekis turi būti ne mažesnis nei 1.');
    const others = qtyOfProduct(cart, item.productId, key);
    if (others + qty > item.stock) {
      throw new Error(`Sandėlyje yra tik ${item.stock} vnt. šios prekės.`);
    }
    item.qty = qty;
    saveCart(cart);
    return cart;
  }

  function removeFromCart(key) {
    const cart = getCart();
    cart.items = cart.items.filter((i) => i.key !== key);
    if (!cart.items.length) cart.promo = null;
    saveCart(cart);
    return cart;
  }

  function clearCart() {
    saveCart({ items: [], promo: null });
  }

  function cartCount() {
    return getCart().items.reduce((sum, i) => sum + i.qty, 0);
  }

  // Prisijungus svečio krepšelis sujungiamas su vartotojo krepšeliu.
  function mergeGuestCart(email) {
    const carts = read(KEYS.carts, {});
    const guest = carts.guest;
    if (!guest || !guest.items.length) return;
    const target = carts[email] || { items: [], promo: null };
    guest.items.forEach((g) => {
      const existing = target.items.find((i) => i.key === g.key);
      if (existing) existing.qty = Math.min(existing.qty + g.qty, g.stock);
      else target.items.push(g);
    });
    if (!target.promo && guest.promo) target.promo = guest.promo;
    carts[email] = target;
    delete carts.guest;
    write(KEYS.carts, carts);
  }

  async function applyPromo(code) {
    await latency([300, 700]);
    const c = String(code || '').trim().toUpperCase();
    if (!c) throw new Error('Įveskite nuolaidos kodą.');
    const promo = PROMOS[c];
    if (!promo) throw new Error('Toks nuolaidos kodas neegzistuoja.');
    if (promo.expired) throw new Error('Šio nuolaidos kodo galiojimas pasibaigęs.');
    const cart = getCart();
    if (cart.promo === c) throw new Error('Šis kodas jau pritaikytas.');
    const subtotal = cart.items.reduce((s, i) => s + i.price * i.qty, 0);
    if (promo.min && subtotal < promo.min) throw new Error(`Kodas galioja užsakymams nuo ${money(promo.min)}.`);
    cart.promo = c;
    saveCart(cart);
    return { code: c, ...promo };
  }

  function removePromo() {
    const cart = getCart();
    cart.promo = null;
    saveCart(cart);
  }

  function computeTotals(cart, method) {
    const shippingMethod = SHIPPING[method] ? method : 'courier';
    const subtotal = round2(cart.items.reduce((s, i) => s + i.price * i.qty, 0));
    const promo = cart.promo ? PROMOS[cart.promo] : null;
    let promoValid = Boolean(promo && !promo.expired);
    let promoNote = '';
    if (promoValid && promo.min && subtotal < promo.min) {
      promoValid = false;
      promoNote = `Kodas ${cart.promo} negalioja: suma mažesnė nei ${money(promo.min)}.`;
    }
    const discount = promoValid && promo.type === 'percent' ? round2((subtotal * promo.value) / 100) : 0;
    const afterDiscount = round2(subtotal - discount);
    let shipping = subtotal > 0 ? SHIPPING[shippingMethod].price : 0;
    if (afterDiscount >= FREE_SHIPPING_FROM || (promoValid && promo.type === 'shipping')) shipping = 0;
    const total = round2(afterDiscount + shipping);
    return {
      subtotal,
      discount,
      shipping,
      total,
      vat: round2(total - total / 1.21),
      promoCode: cart.promo,
      promoLabel: promo && promo.label,
      promoValid,
      promoNote,
      freeShippingLeft: Math.max(0, round2(FREE_SHIPPING_FROM - afterDiscount)),
      shippingMethod,
    };
  }

  // ---------------------------------------------------------------------------
  // Prekės ir atsiliepimai
  // ---------------------------------------------------------------------------
  async function fetchProducts() {
    await latency();
    let res;
    try {
      res = await fetch('data/products.json', { cache: 'no-store' });
    } catch (e) {
      throw new Error('Nepavyko įkelti prekių. Patikrinkite interneto ryšį.');
    }
    if (!res.ok) throw new Error(`Nepavyko įkelti prekių (HTTP ${res.status}).`);
    return res.json();
  }

  async function fetchProduct(id) {
    const products = await fetchProducts();
    return { product: products.find((p) => p.id === id) || null, products };
  }

  function getReviews(product) {
    const local = read(KEYS.reviews, {})[product.id] || [];
    return [...local, ...(product.reviews || [])];
  }

  async function addReview(productId, rating, text) {
    const user = currentUser();
    if (!user) throw new Error('Norėdami rašyti atsiliepimą, prisijunkite.');
    await latency([300, 600]);
    const all = read(KEYS.reviews, {});
    const review = {
      author: `${user.firstName} ${user.lastName.charAt(0)}.`,
      rating,
      text,
      date: formatDate(new Date().toISOString()),
    };
    all[productId] = [review, ...(all[productId] || [])];
    write(KEYS.reviews, all);
    return review;
  }

  // ---------------------------------------------------------------------------
  // Užsakymai
  // ---------------------------------------------------------------------------
  async function placeOrder(details) {
    const user = currentUser();
    if (!user) throw new Error('Sesija baigėsi. Prisijunkite iš naujo.');
    await latency([900, 1600]);
    if (user.type === 'error') {
      throw new Error('Serverio klaida (500). Užsakymo pateikti nepavyko – bandykite vėliau.');
    }
    const cart = getCart();
    if (!cart.items.length) throw new Error('Krepšelis tuščias.');
    if (details.payment.method === 'card' && DECLINED_CARDS[details.payment.number]) {
      throw new Error(DECLINED_CARDS[details.payment.number]);
    }
    const orders = read(KEYS.orders, []);
    let id;
    do {
      id = 'ORD-' + rand(100000, 999999);
    } while (orders.some((o) => o.id === id));
    const payment = { method: details.payment.method };
    if (payment.method === 'card') payment.last4 = details.payment.number.slice(-4);
    if (payment.method === 'bank') payment.bank = details.payment.bank;
    const order = {
      id,
      userEmail: user.email,
      createdAt: new Date().toISOString(),
      status: 'processing',
      items: cart.items.map((i) => ({ ...i })),
      totals: computeTotals(cart, details.delivery.method),
      address: details.address,
      delivery: details.delivery,
      payment,
    };
    orders.push(order);
    write(KEYS.orders, orders);
    clearCart();
    return order;
  }

  function getOrders() {
    const user = currentUser();
    if (!user) return [];
    return read(KEYS.orders, [])
      .filter((o) => o.userEmail === user.email)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function getOrder(id) {
    return getOrders().find((o) => o.id === id) || null;
  }

  async function cancelOrder(id) {
    await latency();
    const user = currentUser();
    const orders = read(KEYS.orders, []);
    const order = orders.find((o) => o.id === id && user && o.userEmail === user.email);
    if (!order) throw new Error('Užsakymas nerastas.');
    if (order.status !== 'processing') throw new Error('Šio užsakymo atšaukti nebegalima.');
    order.status = 'cancelled';
    write(KEYS.orders, orders);
    return order;
  }

  // ---------------------------------------------------------------------------
  // Formų validacija
  // ---------------------------------------------------------------------------
  const validators = {
    required: (msg) => (val) => (val === '' || val === false ? msg || 'Šis laukas privalomas.' : ''),
    email: (msg) => (val) => (!val || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val) ? '' : msg || 'Įveskite teisingą el. pašto adresą.'),
    minLength: (n, msg) => (val) => (!val || val.length >= n ? '' : msg || `Turi būti bent ${n} simbolių.`),
    maxLength: (n, msg) => (val) => (!val || val.length <= n ? '' : msg || `Ne daugiau kaip ${n} simbolių.`),
    pattern: (re, msg) => (val) => (!val || re.test(val) ? '' : msg),
    matches: (otherId, msg) => (val) => (val === document.getElementById(otherId).value ? '' : msg),
    custom: (fn) => fn,
  };

  const PASSWORD_RULES = [
    { id: 'length', label: 'Bent 8 simbolių', test: (v) => v.length >= 8, msg: 'Slaptažodis turi būti bent 8 simbolių.' },
    { id: 'upper', label: 'Bent viena didžioji raidė', test: (v) => /\p{Lu}/u.test(v), msg: 'Slaptažodyje turi būti bent viena didžioji raidė.' },
    { id: 'lower', label: 'Bent viena mažoji raidė', test: (v) => /\p{Ll}/u.test(v), msg: 'Slaptažodyje turi būti bent viena mažoji raidė.' },
    { id: 'digit', label: 'Bent vienas skaičius', test: (v) => /\d/.test(v), msg: 'Slaptažodyje turi būti bent vienas skaičius.' },
    { id: 'special', label: 'Bent vienas specialusis simbolis', test: (v) => /[^\p{L}\d\s]/u.test(v), msg: 'Slaptažodyje turi būti bent vienas specialusis simbolis (pvz. ! @ #).' },
  ];
  validators.password = () => (val) => {
    if (!val) return '';
    const failed = PASSWORD_RULES.find((r) => !r.test(val));
    return failed ? failed.msg : '';
  };

  function fieldValue(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'password') return el.value;
    return el.value.trim();
  }

  function setFieldError(el, msg) {
    const err = document.getElementById(el.id + '-error');
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    const field = el.closest('.field');
    if (field) field.classList.toggle('has-error', Boolean(msg));
    if (err) {
      err.textContent = msg || '';
      err.hidden = !msg;
    }
  }

  function validateField(el, checks) {
    const value = fieldValue(el);
    for (const check of checks) {
      const msg = check(value, el);
      if (msg) {
        setFieldError(el, msg);
        return false;
      }
    }
    setFieldError(el, '');
    return true;
  }

  // rules: { elementoId: [tikrinimai] }. Grąžina funkciją, kuri patikrina visus (arba nurodytus) laukus.
  function bindValidation(rules) {
    const entries = Object.entries(rules).map(([id, checks]) => [document.getElementById(id), checks]);
    entries.forEach(([el, checks]) => {
      const live = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(live, () => {
        if (el.getAttribute('aria-invalid') === 'true') validateField(el, checks);
      });
      if (el.type !== 'checkbox') {
        el.addEventListener('blur', () => {
          if (fieldValue(el) !== '') validateField(el, checks);
        });
      }
    });
    return function validateAll(onlyIds) {
      let firstInvalid = null;
      entries.forEach(([el, checks]) => {
        if (onlyIds && !onlyIds.includes(el.id)) return;
        if (!validateField(el, checks) && !firstInvalid) firstInvalid = el;
      });
      if (firstInvalid) firstInvalid.focus();
      return !firstInvalid;
    };
  }

  function passwordStrength(val) {
    if (!val) return { level: 0, label: '' };
    const met = PASSWORD_RULES.filter((r) => r.test(val)).length;
    if (met <= 2) return { level: 1, label: 'Silpnas' };
    if (met <= 4) return { level: 2, label: 'Vidutinis' };
    return { level: 3, label: 'Stiprus' };
  }

  function bindPasswordMeter(input, container) {
    container.innerHTML = `
      <div class="pw-meter" data-testid="password-strength" data-level="0">
        <div class="pw-meter-bar"><span></span></div>
        <span class="pw-meter-label" data-testid="password-strength-label"></span>
      </div>
      <ul class="pw-rules" data-testid="password-rules">
        ${PASSWORD_RULES.map((r) => `<li data-rule="${r.id}" data-testid="password-rule-${r.id}" data-met="false">${r.label}</li>`).join('')}
      </ul>`;
    const meter = container.querySelector('.pw-meter');
    const label = container.querySelector('.pw-meter-label');
    const update = () => {
      const s = passwordStrength(input.value);
      meter.dataset.level = s.level;
      label.textContent = s.label;
      PASSWORD_RULES.forEach((r) => {
        const li = container.querySelector(`[data-rule="${r.id}"]`);
        const ok = r.test(input.value);
        li.classList.toggle('met', ok);
        li.dataset.met = String(ok);
      });
    };
    input.addEventListener('input', update);
    update();
  }

  function bindPasswordToggles(root) {
    (root || document).querySelectorAll('[data-toggle-password]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.togglePassword);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', String(show));
        btn.setAttribute('aria-label', show ? 'Slėpti slaptažodį' : 'Rodyti slaptažodį');
        btn.textContent = show ? 'Slėpti' : 'Rodyti';
      });
    });
  }

  // ---------------------------------------------------------------------------
  // UI komponentai
  // ---------------------------------------------------------------------------
  function toast(message, type, timeout) {
    const kind = type || 'success';
    let box = document.getElementById('toast-container');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toast-container';
      box.className = 'toast-container';
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.className = `toast toast-${kind}`;
    t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    t.dataset.testid = 'toast';
    t.dataset.type = kind;
    t.innerHTML = `<span class="toast-msg" data-testid="toast-message">${escapeHtml(message)}</span>
      <button type="button" class="toast-close" aria-label="Uždaryti pranešimą" data-testid="toast-close">×</button>`;
    t.querySelector('button').addEventListener('click', () => t.remove());
    box.appendChild(t);
    setTimeout(() => {
      t.classList.add('leaving');
      setTimeout(() => t.remove(), 300);
    }, timeout || 3500);
  }

  // Pranešimas, kuris parodomas kitame puslapyje (pvz. po nukreipimo).
  function flash(message, type) {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, type: type || 'success' }));
  }

  function showFlash() {
    const raw = sessionStorage.getItem(FLASH_KEY);
    if (!raw) return;
    sessionStorage.removeItem(FLASH_KEY);
    try {
      const f = JSON.parse(raw);
      toast(f.message, f.type);
    } catch (e) { /* ignoruojame */ }
  }

  function confirmDialog(opts) {
    const o = { title: 'Ar tikrai?', message: '', confirmText: 'Patvirtinti', cancelText: 'Atšaukti', danger: false, ...opts };
    return new Promise((resolve) => {
      const previous = document.activeElement;
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-text" data-testid="confirm-dialog">
          <h2 id="modal-title" class="modal-title">${escapeHtml(o.title)}</h2>
          <p id="modal-text" class="modal-text">${escapeHtml(o.message)}</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" data-testid="confirm-cancel">${escapeHtml(o.cancelText)}</button>
            <button type="button" class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}" data-testid="confirm-ok">${escapeHtml(o.confirmText)}</button>
          </div>
        </div>`;
      const close = (result) => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        if (previous && previous.focus) previous.focus();
        resolve(result);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') close(false);
      };
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
      });
      overlay.querySelector('[data-testid="confirm-cancel"]').addEventListener('click', () => close(false));
      overlay.querySelector('[data-testid="confirm-ok"]').addEventListener('click', () => close(true));
      document.addEventListener('keydown', onKey);
      document.body.appendChild(overlay);
      overlay.querySelector('[data-testid="confirm-ok"]').focus();
    });
  }

  function setLoading(btn, loading, text) {
    if (loading) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${escapeHtml(text || 'Palaukite…')}`;
    } else {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
  }

  function stars(rating) {
    const full = Math.round(rating);
    return `<span class="stars" aria-hidden="true">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span>`;
  }

  function productImage(p, cls) {
    return `<div class="pimg ${cls || ''}" style="--h:${Number(p.hue) || 220}" role="img" aria-label="${escapeHtml(p.name)}">${p.image}</div>`;
  }

  function optionsText(item) {
    const parts = [];
    if (item.size) parts.push(`Dydis: ${item.size}`);
    if (item.color) parts.push(`Spalva: ${item.color}`);
    return parts.join(' · ');
  }

  function totalsHtml(t) {
    const row = (label, value, testid, cls) => `<div class="totals-row ${cls || ''}"><dt>${label}</dt><dd data-testid="${testid}">${value}</dd></div>`;
    return [
      row('Tarpinė suma', money(t.subtotal), 'summary-subtotal'),
      t.discount ? row(`Nuolaida (${escapeHtml(t.promoCode)})`, '-' + money(t.discount), 'summary-discount', 'discount') : '',
      row('Pristatymas', t.shipping === 0 ? 'Nemokamai' : money(t.shipping), 'summary-shipping'),
      row('Iš viso', money(t.total), 'summary-total', 'total'),
      row('Iš jų PVM (21 %)', money(t.vat), 'summary-vat', 'muted small'),
    ].join('');
  }

  function currentPage() {
    return (location.pathname.split('/').pop() || 'index.html') + location.search + location.hash;
  }

  // Leidžiame nukreipti tik į vietinius puslapius (apsauga nuo „open redirect“).
  function safeRedirect(target, fallback) {
    return target && /^[a-z-]+\.html([?#][^\s<>"']*)?$/i.test(target) ? target : fallback || 'index.html';
  }

  function requireAuth() {
    if (currentUser()) return true;
    flash('Norėdami tęsti, prisijunkite.', 'info');
    location.replace('login.html?redirect=' + encodeURIComponent(currentPage()));
    return false;
  }

  // ---------------------------------------------------------------------------
  // Antraštė, poraštė, slapukų juosta
  // ---------------------------------------------------------------------------
  const CART_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>';

  function renderHeader() {
    const el = document.getElementById('site-header');
    if (!el) return;
    const user = currentUser();
    const page = document.body.dataset.page;
    const navLink = (href, label, key) => {
      const active = page === key;
      return `<a href="${href}" class="nav-link${active ? ' active' : ''}"${active ? ' aria-current="page"' : ''} data-testid="nav-${key}">${label}</a>`;
    };
    const userArea = user
      ? `<div class="user-menu">
          <button type="button" class="user-menu-button" id="user-menu-button" data-testid="user-menu-button" aria-haspopup="true" aria-expanded="false" aria-controls="user-menu-list">
            <span class="avatar" aria-hidden="true">${escapeHtml(user.firstName.charAt(0))}</span>
            <span class="user-name" data-testid="user-greeting">${escapeHtml(user.firstName)}</span>
            <span aria-hidden="true">▾</span>
          </button>
          <div class="user-menu-list" id="user-menu-list" role="menu" aria-labelledby="user-menu-button" data-testid="user-menu" hidden>
            <div class="user-menu-email" data-testid="user-email">${escapeHtml(user.email)}</div>
            <a role="menuitem" href="account.html#profile" data-testid="menu-profile">Mano paskyra</a>
            <a role="menuitem" href="account.html#orders" data-testid="menu-orders">Mano užsakymai</a>
            <button role="menuitem" type="button" class="danger" data-testid="logout-button">Atsijungti</button>
          </div>
        </div>`
      : `<a href="login.html" class="nav-link${page === 'login' ? ' active' : ''}" data-testid="nav-login">Prisijungti</a>
         <a href="register.html" class="btn btn-primary btn-sm" data-testid="nav-register">Registruotis</a>`;

    el.innerHTML = `
      <div class="container header-inner">
        <a href="index.html" class="logo" data-testid="logo"><span class="logo-mark" aria-hidden="true">QA</span><span>Turgus</span></a>
        <nav class="main-nav" aria-label="Pagrindinė navigacija">
          ${navLink('index.html', 'Parduotuvė', 'catalog')}
          ${navLink('contact.html', 'Kontaktai', 'contact')}
        </nav>
        <div class="header-actions">
          <a href="cart.html" class="cart-link${page === 'cart' ? ' active' : ''}" data-testid="cart-link" aria-label="Krepšelis">
            ${CART_ICON}<span class="cart-label">Krepšelis</span>
            <span class="badge" data-testid="cart-badge" hidden>0</span>
          </a>
          ${userArea}
        </div>
      </div>`;

    updateCartBadge();
    if (user) bindUserMenu(el);
  }

  function bindUserMenu(root) {
    const btn = root.querySelector('#user-menu-button');
    const list = root.querySelector('#user-menu-list');
    const setOpen = (open) => {
      list.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(list.hidden);
    });
    document.addEventListener('click', (e) => {
      if (!list.hidden && !list.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !list.hidden) {
        setOpen(false);
        btn.focus();
      }
    });
    root.querySelector('[data-testid="logout-button"]').addEventListener('click', () => {
      logout();
      flash('Sėkmingai atsijungėte.', 'info');
      location.href = 'index.html';
    });
  }

  function updateCartBadge() {
    const badge = document.querySelector('[data-testid="cart-badge"]');
    if (!badge) return;
    const count = cartCount();
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  function renderFooter() {
    const el = document.getElementById('site-footer');
    if (!el) return;
    el.innerHTML = `
      <div class="container footer-inner">
        <p>© 2026 QA Turgus – mokomoji parduotuvė testų automatizavimui. Duomenys saugomi tik jūsų naršyklėje, tikri pirkimai nevykdomi.</p>
        <button type="button" class="btn btn-ghost btn-sm" data-testid="reset-data">Atstatyti demo duomenis</button>
      </div>`;
    el.querySelector('[data-testid="reset-data"]').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Atstatyti demo duomenis?',
        message: 'Bus ištrinti visi registruoti vartotojai, krepšeliai, užsakymai ir atsiliepimai. Būsite atjungti.',
        confirmText: 'Atstatyti',
        danger: true,
      });
      if (!ok) return;
      resetAll();
      flash('Demo duomenys atstatyti.', 'info');
      location.href = 'index.html';
    });
  }

  // Slapukų juosta pasirodo su nedideliu vėlavimu – gera proga išbandyti page.addLocatorHandler().
  function initCookieBanner() {
    if (localStorage.getItem(CONSENT_KEY)) return;
    setTimeout(() => {
      if (localStorage.getItem(CONSENT_KEY)) return;
      const banner = document.createElement('div');
      banner.className = 'cookie-banner';
      banner.setAttribute('role', 'region');
      banner.setAttribute('aria-label', 'Slapukų sutikimas');
      banner.dataset.testid = 'cookie-banner';
      banner.innerHTML = `
        <p><strong>Mes naudojame slapukus 🍪</strong> Būtinieji slapukai reikalingi prisijungimui ir krepšeliui. Analitinių slapukų nenaudojame – tai mokomasis puslapis.</p>
        <div class="cookie-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-testid="cookie-reject">Tik būtinieji</button>
          <button type="button" class="btn btn-primary btn-sm" data-testid="cookie-accept">Sutinku</button>
        </div>`;
      const decide = (value) => {
        localStorage.setItem(CONSENT_KEY, value);
        banner.remove();
      };
      banner.querySelector('[data-testid="cookie-accept"]').addEventListener('click', () => decide('all'));
      banner.querySelector('[data-testid="cookie-reject"]').addEventListener('click', () => decide('necessary'));
      document.body.appendChild(banner);
    }, 800);
  }

  // ---------------------------------------------------------------------------
  // Paleidimas
  // ---------------------------------------------------------------------------
  function init() {
    seed();
    const params = new URLSearchParams(location.search);
    if (params.has('reset')) {
      resetAll();
      params.delete('reset');
      const qs = params.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
      flash('Demo duomenys atstatyti.', 'info');
    }
    renderHeader();
    renderFooter();
    bindPasswordToggles();
    showFlash();
    initCookieBanner();
    on('cart:change', updateCartBadge);
    window.addEventListener('storage', (e) => {
      if (e.key === KEYS.carts) updateCartBadge();
    });
  }

  window.QA = {
    // duomenys
    CATEGORIES, SHIPPING, PARCEL_LOCKERS, STORES, BANKS, COUNTRIES, PAYMENT_LABELS, ORDER_STATUS, FREE_SHIPPING_FROM,
    // pagalbinės
    money, escapeHtml, param, plural, formatDate, wait,
    // įvykiai
    on, emit,
    // autentifikacija
    currentUser, login, logout, register, updateProfile, changePassword, findUser, requireAuth, safeRedirect,
    // krepšelis
    getCart, addToCart, setCartQty, removeFromCart, clearCart, cartCount, applyPromo, removePromo, computeTotals,
    // prekės, užsakymai
    fetchProducts, fetchProduct, getReviews, addReview, placeOrder, getOrders, getOrder, cancelOrder,
    // formos
    validators, setFieldError, validateField, bindValidation, bindPasswordMeter, bindPasswordToggles, PASSWORD_RULES,
    // UI
    toast, flash, confirmDialog, setLoading, stars, productImage, optionsText, totalsHtml, renderHeader,
    // testams
    resetAll,
  };

  init();
})();
