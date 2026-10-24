/*
 * QA Turgus – bendra visų puslapių logika.
 *
 * Duomenys gyvena serveryje (REST API, žr. api/ ir /docs):
 *  - prisijungus API grąžina token, jis saugomas slapuke „qa_session“ ir siunčiamas
 *    antraštėje „Authorization: Bearer <token>“;
 *  - neprisijungusio vartotojo krepšelis laikomas localStorage ir prisijungus perkeliamas į serverį.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Konstantos
  // ---------------------------------------------------------------------------
  const API_URL = (window.QA_CONFIG && window.QA_CONFIG.API_URL) || 'http://localhost:8787/api';
  const SESSION_COOKIE = 'qa_session';
  const USER_KEY = 'qa_user';
  const GUEST_CART_KEY = 'qa_guest_cart';
  const CONSENT_KEY = 'qa_cookie_consent';
  const FLASH_KEY = 'qa_flash';

  const CATEGORIES = {
    elektronika: 'Elektronika',
    drabuziai: 'Drabužiai',
    namai: 'Namai',
    sportas: 'Sportas',
    knygos: 'Knygos',
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

  // ---------------------------------------------------------------------------
  // Pagalbinės funkcijos
  // ---------------------------------------------------------------------------
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
  // API klientas
  // ---------------------------------------------------------------------------
  class ApiError extends Error {
    constructor(message, status, code, details) {
      super(message);
      this.status = status;
      this.code = code;
      this.details = details || {};
    }
  }

  async function api(path, opts) {
    const o = opts || {};
    const headers = { Accept: 'application/json' };
    if (o.body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getCookie(SESSION_COOKIE);
    if (token) headers.Authorization = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(API_URL + path, {
        method: o.method || 'GET',
        headers,
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
      });
    } catch (e) {
      throw new ApiError('Nepavyko susisiekti su serveriu. Patikrinkite interneto ryšį.', 0, 'NETWORK_ERROR');
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (res.ok) return data;

    const err = (data && data.error) || {};
    // Token nebegalioja – išvalome sesiją ir siunčiame prisijungti.
    if (res.status === 401 && token) {
      clearSession();
      flash('Sesija baigėsi. Prisijunkite iš naujo.', 'info');
      location.replace('login.html?redirect=' + encodeURIComponent(currentPage()));
    }
    throw new ApiError(err.message || `Serverio klaida (HTTP ${res.status}).`, res.status, err.code, err.details);
  }

  // ---------------------------------------------------------------------------
  // Autentifikacija
  // ---------------------------------------------------------------------------
  function currentUser() {
    return getCookie(SESSION_COOKIE) ? read(USER_KEY, null) : null;
  }

  function cacheUser(user) {
    write(USER_KEY, user);
  }

  function clearSession() {
    deleteCookie(SESSION_COOKIE);
    localStorage.removeItem(USER_KEY);
    cartCache = null;
  }

  async function login(email, password, remember) {
    const data = await api('/auth/login', { method: 'POST', body: { email: email.trim(), password, remember: Boolean(remember) } });
    setCookie(SESSION_COOKIE, data.token, remember ? 7 : 0);
    cacheUser(data.user);
    await mergeGuestCart();
    return data.user;
  }

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (e) { /* vis tiek atsijungiame lokaliai */ }
    clearSession();
  }

  async function register(data) {
    return (await api('/auth/register', { method: 'POST', body: data })).user;
  }

  async function refreshUser() {
    if (!getCookie(SESSION_COOKIE)) return null;
    const { user } = await api('/users/me');
    cacheUser(user);
    return user;
  }

  async function updateProfile(changes) {
    const { user } = await api('/users/me', { method: 'PATCH', body: changes });
    cacheUser(user);
    return user;
  }

  async function changePassword(currentPassword, newPassword) {
    await api('/users/me/password', { method: 'PUT', body: { currentPassword, newPassword } });
  }

  // ---------------------------------------------------------------------------
  // Krepšelis: prisijungus – serveryje, neprisijungus – localStorage.
  // Viduje visada naudojama ta pati forma: { items: [{ key, productId, …, qty }], promo }
  // ---------------------------------------------------------------------------
  let cartCache = null;

  function fromServer(c) {
    return {
      items: c.items.map((i) => ({
        key: String(i.id),
        productId: i.productId,
        name: i.name,
        price: i.price,
        image: i.image,
        hue: i.hue,
        stock: i.stock,
        size: i.size,
        color: i.color,
        qty: i.quantity,
      })),
      promo: c.promo,
    };
  }

  const readGuestCart = () => read(GUEST_CART_KEY, { items: [], promo: null });

  function setCart(cart, guest) {
    if (guest) write(GUEST_CART_KEY, cart);
    cartCache = cart;
    emit('cart:change', cart);
    return cart;
  }

  async function getCart() {
    if (currentUser()) return setCart(fromServer(await api('/cart')));
    return setCart(readGuestCart(), false);
  }

  const qtyOfProduct = (cart, productId, exceptKey) => cart.items
    .filter((i) => i.productId === productId && i.key !== exceptKey)
    .reduce((sum, i) => sum + i.qty, 0);

  async function addToCart(product, qty, opts) {
    const options = opts || {};
    const amount = qty || 1;
    if (currentUser()) {
      const body = { productId: product.id, quantity: amount };
      if (options.size) body.size = options.size;
      if (options.color) body.color = options.color;
      return setCart(fromServer(await api('/cart/items', { method: 'POST', body })));
    }
    const cart = readGuestCart();
    if (product.stock <= 0) throw new Error('Ši prekė išparduota.');
    const already = qtyOfProduct(cart, product.id);
    if (already + amount > product.stock) {
      throw new Error(`Sandėlyje yra tik ${product.stock} vnt. Krepšelyje jau turite ${already} vnt.`);
    }
    const key = [product.id, options.size || '', options.color || ''].join('|');
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
    return setCart(cart, true);
  }

  async function setCartQty(key, qty) {
    if (!Number.isInteger(qty) || qty < 1) throw new Error('Kiekis turi būti ne mažesnis nei 1.');
    if (currentUser()) {
      return setCart(fromServer(await api(`/cart/items/${key}`, { method: 'PATCH', body: { quantity: qty } })));
    }
    const cart = readGuestCart();
    const item = cart.items.find((i) => i.key === key);
    if (!item) throw new Error('Prekė krepšelyje nerasta.');
    if (qtyOfProduct(cart, item.productId, key) + qty > item.stock) {
      throw new Error(`Sandėlyje yra tik ${item.stock} vnt. šios prekės.`);
    }
    item.qty = qty;
    return setCart(cart, true);
  }

  async function removeFromCart(key) {
    if (currentUser()) return setCart(fromServer(await api(`/cart/items/${key}`, { method: 'DELETE' })));
    const cart = readGuestCart();
    cart.items = cart.items.filter((i) => i.key !== key);
    if (!cart.items.length) cart.promo = null;
    return setCart(cart, true);
  }

  async function clearCart() {
    if (currentUser()) {
      await api('/cart', { method: 'DELETE' });
      return setCart({ items: [], promo: null });
    }
    return setCart({ items: [], promo: null }, true);
  }

  function cartCount() {
    return cartCache ? cartCache.items.reduce((sum, i) => sum + i.qty, 0) : 0;
  }

  async function applyPromo(code) {
    const c = String(code || '').trim();
    if (!c) throw new ApiError('Įveskite nuolaidos kodą.', 422, 'VALIDATION_ERROR');
    if (currentUser()) {
      const cart = setCart(fromServer(await api('/cart/promo', { method: 'POST', body: { code: c } })));
      return cart.promo;
    }
    const cart = readGuestCart();
    const subtotal = round2(cart.items.reduce((s, i) => s + i.price * i.qty, 0));
    const { promo } = await api('/promo-codes/validate', { method: 'POST', body: { code: c, subtotal } });
    if (cart.promo && cart.promo.code === promo.code) throw new ApiError('Šis kodas jau pritaikytas.', 409, 'PROMO_ALREADY_APPLIED');
    cart.promo = promo;
    setCart(cart, true);
    return promo;
  }

  async function removePromo() {
    if (currentUser()) return setCart(fromServer(await api('/cart/promo', { method: 'DELETE' })));
    const cart = readGuestCart();
    cart.promo = null;
    return setCart(cart, true);
  }

  // Prisijungus svečio krepšelis perkeliamas į serverį (prekės, kurių nebėra, praleidžiamos).
  async function mergeGuestCart() {
    const guest = readGuestCart();
    if (!guest.items.length) return;
    for (const item of guest.items) {
      const body = { productId: item.productId, quantity: item.qty };
      if (item.size) body.size = item.size;
      if (item.color) body.color = item.color;
      try {
        await api('/cart/items', { method: 'POST', body });
      } catch (e) { /* pvz. nepakanka sandėlyje */ }
    }
    if (guest.promo) {
      try {
        await api('/cart/promo', { method: 'POST', body: { code: guest.promo.code } });
      } catch (e) { /* kodas jau pritaikytas arba nebegalioja */ }
    }
    localStorage.removeItem(GUEST_CART_KEY);
  }

  // Ta pati logika kaip serveryje (api/src/lib/shop.ts) – kad sumos matytųsi iškart.
  function computeTotals(cart, method) {
    const shippingMethod = SHIPPING[method] ? method : 'courier';
    const subtotal = round2(cart.items.reduce((s, i) => s + i.price * i.qty, 0));
    const promo = cart.promo || null;
    let promoValid = Boolean(promo);
    let promoNote = '';
    if (promo && promo.min && subtotal < promo.min) {
      promoValid = false;
      promoNote = `Kodas ${promo.code} negalioja: suma mažesnė nei ${money(promo.min)}.`;
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
      promoCode: promo && promo.code,
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
  async function fetchProducts(params) {
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== false) qs.set(k, String(v));
    });
    const query = qs.toString();
    return api('/products' + (query ? '?' + query : ''));
  }

  async function fetchProduct(id) {
    try {
      return (await api(`/products/${encodeURIComponent(id || '')}`)).product;
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async function getReviews(productId) {
    const { items } = await api(`/products/${encodeURIComponent(productId)}/reviews`);
    return items.map((r) => ({ ...r, date: formatDate(r.createdAt) }));
  }

  async function addReview(productId, rating, text) {
    return (await api(`/products/${encodeURIComponent(productId)}/reviews`, { method: 'POST', body: { rating, text } })).review;
  }

  // ---------------------------------------------------------------------------
  // Užsakymai
  // ---------------------------------------------------------------------------
  async function placeOrder(details) {
    const { order } = await api('/orders', { method: 'POST', body: details });
    setCart({ items: [], promo: null });
    return order;
  }

  async function getOrders() {
    return (await api('/orders')).items;
  }

  async function getOrder(id) {
    try {
      return (await api(`/orders/${encodeURIComponent(id || '')}`)).order;
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async function cancelOrder(id) {
    return (await api(`/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST' })).order;
  }

  // ---------------------------------------------------------------------------
  // Formų validacija (kliento pusė – serveris tikrina dar kartą)
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

  // Serverio grąžintas klaidas (error.details) parodo prie atitinkamų laukų.
  function showServerErrors(err, fieldMap) {
    let shown = false;
    Object.entries((err && err.details) || {}).forEach(([field, msg]) => {
      const el = fieldMap[field] && document.getElementById(fieldMap[field]);
      if (el) {
        setFieldError(el, msg);
        shown = true;
      }
    });
    return shown;
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
  let menuListenersBound = false;

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
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      list.hidden = !list.hidden;
      btn.setAttribute('aria-expanded', String(!list.hidden));
    });
    root.querySelector('[data-testid="logout-button"]').addEventListener('click', async () => {
      await logout();
      flash('Sėkmingai atsijungėte.', 'info');
      location.href = 'index.html';
    });
    if (menuListenersBound) return;
    menuListenersBound = true;
    const close = () => {
      const l = document.getElementById('user-menu-list');
      const b = document.getElementById('user-menu-button');
      if (l && !l.hidden) {
        l.hidden = true;
        b.setAttribute('aria-expanded', 'false');
        return b;
      }
      return null;
    };
    document.addEventListener('click', (e) => {
      const l = document.getElementById('user-menu-list');
      if (l && !l.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const b = close();
        if (b) b.focus();
      }
    });
  }

  function updateCartBadge() {
    const badge = document.querySelector('[data-testid="cart-badge"]');
    if (!badge) return;
    const count = cartCount();
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  function resetLocalData() {
    [USER_KEY, GUEST_CART_KEY, CONSENT_KEY].forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem(FLASH_KEY);
    deleteCookie(SESSION_COOKIE);
    cartCache = null;
  }

  function renderFooter() {
    const el = document.getElementById('site-footer');
    if (!el) return;
    el.innerHTML = `
      <div class="container footer-inner">
        <p>© 2026 QA Turgus – mokomoji parduotuvė testų automatizavimui. Tikri pirkimai nevykdomi – neįveskite tikrų duomenų.
          <a href="${escapeHtml(API_URL.replace(/\/api$/, '/docs'))}" target="_blank" rel="noopener" data-testid="api-docs-link">API dokumentacija</a></p>
        <button type="button" class="btn btn-ghost btn-sm" data-testid="reset-data">Išvalyti naršyklės duomenis</button>
      </div>`;
    el.querySelector('[data-testid="reset-data"]').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Išvalyti naršyklės duomenis?',
        message: 'Būsite atjungti, bus išvalytas svečio krepšelis ir slapukų pasirinkimas. Serveryje esantys duomenys (paskyros, užsakymai) neištrinami.',
        confirmText: 'Išvalyti',
        danger: true,
      });
      if (!ok) return;
      resetLocalData();
      flash('Naršyklės duomenys išvalyti.', 'info');
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
    const params = new URLSearchParams(location.search);
    if (params.has('reset')) {
      resetLocalData();
      params.delete('reset');
      const qs = params.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
      flash('Naršyklės duomenys išvalyti.', 'info');
    }
    // Neprisijungęs vartotojas – rodome svečio krepšelį iškart.
    if (!currentUser()) cartCache = readGuestCart();
    renderHeader();
    renderFooter();
    bindPasswordToggles();
    showFlash();
    initCookieBanner();
    on('cart:change', updateCartBadge);
    window.addEventListener('storage', (e) => {
      if (e.key === GUEST_CART_KEY && !currentUser()) {
        cartCache = readGuestCart();
        updateCartBadge();
      }
    });
    // Prisijungus – krepšelio ženkliukui pasiimame serverio krepšelį.
    if (currentUser()) getCart().catch(() => { /* pvz. API nepasiekiamas */ });
  }

  window.QA = {
    API_URL,
    // duomenys
    CATEGORIES, SHIPPING, PARCEL_LOCKERS, STORES, BANKS, COUNTRIES, PAYMENT_LABELS, ORDER_STATUS, FREE_SHIPPING_FROM,
    // pagalbinės
    money, escapeHtml, param, plural, formatDate, wait,
    // įvykiai
    on, emit,
    // API
    api, ApiError,
    // autentifikacija
    currentUser, login, logout, register, refreshUser, updateProfile, changePassword, requireAuth, safeRedirect,
    // krepšelis
    getCart, addToCart, setCartQty, removeFromCart, clearCart, cartCount, applyPromo, removePromo, computeTotals,
    // prekės, užsakymai
    fetchProducts, fetchProduct, getReviews, addReview, placeOrder, getOrders, getOrder, cancelOrder,
    // formos
    validators, setFieldError, validateField, bindValidation, showServerErrors, bindPasswordMeter, bindPasswordToggles, PASSWORD_RULES,
    // UI
    toast, flash, confirmDialog, setLoading, stars, productImage, optionsText, totalsHtml, renderHeader,
  };

  init();
})();
