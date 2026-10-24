/* Krepšelis: kiekio keitimas, šalinimas, nuolaidos kodai, perėjimas prie apmokėjimo. */
(function () {
  'use strict';
  const QA = window.QA;
  const $ = (id) => document.getElementById(id);
  let cart = { items: [], promo: null };

  function itemHtml(item) {
    const name = QA.escapeHtml(item.name);
    const url = `product.html?id=${item.productId}`;
    return `
      <li class="cart-item" data-testid="cart-item" data-key="${QA.escapeHtml(item.key)}" data-product-id="${item.productId}">
        <a href="${url}" class="cart-item-image" tabindex="-1" aria-hidden="true">${QA.productImage(item, 'pimg-sm')}</a>
        <div class="cart-item-info">
          <a href="${url}" class="cart-item-name" data-testid="cart-item-name">${name}</a>
          ${item.size || item.color ? `<div class="muted small" data-testid="cart-item-options">${QA.escapeHtml(QA.optionsText(item))}</div>` : ''}
          <div class="small">Kaina: <span data-testid="cart-item-price">${QA.money(item.price)}</span></div>
        </div>
        <div class="qty-control">
          <button type="button" class="qty-btn" data-action="dec" aria-label="Sumažinti kiekį: ${name}" data-testid="cart-item-decrease"${item.qty <= 1 ? ' disabled' : ''}>−</button>
          <input type="number" min="1" max="${item.stock}" value="${item.qty}" inputmode="numeric" aria-label="Kiekis: ${name}" data-testid="cart-item-qty">
          <button type="button" class="qty-btn" data-action="inc" aria-label="Padidinti kiekį: ${name}" data-testid="cart-item-increase">+</button>
        </div>
        <div class="cart-item-total" data-testid="cart-item-total">${QA.money(item.price * item.qty)}</div>
        <button type="button" class="icon-btn" data-action="remove" aria-label="Pašalinti: ${name}" data-testid="cart-item-remove">✕</button>
      </li>`;
  }

  function render() {
    const empty = cart.items.length === 0;
    $('cart-loading').hidden = true;
    $('cart-empty').hidden = !empty;
    $('cart-content').hidden = empty;
    const count = cart.items.reduce((s, i) => s + i.qty, 0);
    $('items-count').textContent = empty ? '' : `${count} ${QA.plural(count, ['prekė', 'prekės', 'prekių'])}`;
    if (empty) return;

    $('cart-items').innerHTML = cart.items.map(itemHtml).join('');
    const t = QA.computeTotals(cart, 'courier');
    $('totals').innerHTML = QA.totalsHtml(t);

    const free = $('free-shipping');
    if (t.shipping === 0) {
      free.innerHTML = '🎉 Jums taikomas <strong>nemokamas pristatymas</strong>!';
      free.dataset.state = 'free';
    } else {
      const pct = Math.min(100, Math.round(((QA.FREE_SHIPPING_FROM - t.freeShippingLeft) / QA.FREE_SHIPPING_FROM) * 100));
      free.innerHTML = `Iki nemokamo pristatymo trūksta <strong data-testid="free-shipping-left">${QA.money(t.freeShippingLeft)}</strong>
        <div class="progress" role="progressbar" aria-label="Iki nemokamo pristatymo" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>`;
      free.dataset.state = 'paid';
    }

    const applied = $('promo-applied');
    if (cart.promo) {
      applied.innerHTML = `
        <span class="promo-chip${t.promoValid ? '' : ' invalid'}">
          <span data-testid="promo-applied-code">${QA.escapeHtml(cart.promo.code)}</span>
          <span class="small">${QA.escapeHtml(t.promoValid ? t.promoLabel : t.promoNote)}</span>
          <button type="button" class="icon-btn" id="remove-promo" aria-label="Pašalinti nuolaidos kodą" data-testid="promo-remove">✕</button>
        </span>`;
      applied.hidden = false;
      $('promo-form').hidden = true;
      $('remove-promo').addEventListener('click', () => run(async () => {
        cart = await QA.removePromo();
        QA.toast('Nuolaidos kodas pašalintas.', 'info');
      }));
    } else {
      applied.hidden = true;
      $('promo-form').hidden = false;
    }
  }

  // Vykdo krepšelio veiksmą: kol laukiama serverio, sąrašas pažymimas „užimtu“.
  async function run(action) {
    const list = $('cart-content');
    list.setAttribute('aria-busy', 'true');
    list.classList.add('busy');
    try {
      await action();
    } catch (err) {
      QA.toast(err.message, 'error');
    } finally {
      list.removeAttribute('aria-busy');
      list.classList.remove('busy');
      render();
    }
  }

  async function removeItem(key) {
    const item = cart.items.find((i) => i.key === key);
    const ok = await QA.confirmDialog({
      title: 'Pašalinti prekę?',
      message: `Ar tikrai norite pašalinti „${item.name}“ iš krepšelio?`,
      confirmText: 'Pašalinti',
      danger: true,
    });
    if (!ok) return;
    await run(async () => {
      cart = await QA.removeFromCart(key);
      QA.toast(`„${item.name}“ pašalinta iš krepšelio.`, 'info');
    });
  }

  $('cart-items').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const key = btn.closest('[data-key]').dataset.key;
    const item = cart.items.find((i) => i.key === key);
    if (btn.dataset.action === 'inc') run(async () => { cart = await QA.setCartQty(key, item.qty + 1); });
    if (btn.dataset.action === 'dec') run(async () => { cart = await QA.setCartQty(key, item.qty - 1); });
    if (btn.dataset.action === 'remove') removeItem(key);
  });

  $('cart-items').addEventListener('change', (e) => {
    if (e.target.dataset.testid !== 'cart-item-qty') return;
    const key = e.target.closest('[data-key]').dataset.key;
    run(async () => { cart = await QA.setCartQty(key, Number(e.target.value)); });
  });

  // Specialiai naudojamas naršyklės confirm() – praktikai su page.on('dialog').
  $('clear-cart').addEventListener('click', () => {
    if (!window.confirm('Ar tikrai norite išvalyti visą krepšelį?')) return;
    run(async () => {
      cart = await QA.clearCart();
      QA.toast('Krepšelis išvalytas.', 'info');
    });
  });

  $('promo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('promo-code');
    const btn = e.target.querySelector('[type="submit"]');
    QA.setFieldError(input, '');
    QA.setLoading(btn, true, 'Tikrinama…');
    try {
      const promo = await QA.applyPromo(input.value);
      cart = await QA.getCart();
      input.value = '';
      QA.toast(`Nuolaidos kodas ${promo.code} pritaikytas: ${promo.label}.`);
      render();
    } catch (err) {
      QA.setFieldError(input, (err.details && err.details.code) || err.message);
    } finally {
      QA.setLoading(btn, false);
    }
  });

  $('checkout-btn').addEventListener('click', () => {
    if (!QA.currentUser()) {
      QA.flash('Norėdami tęsti apmokėjimą, prisijunkite arba užsiregistruokite.', 'info');
      location.href = 'login.html?redirect=checkout.html';
      return;
    }
    location.href = 'checkout.html';
  });

  // Atnaujiname, jei svečio krepšelis pasikeitė kitame skirtuke.
  window.addEventListener('storage', async (e) => {
    if (e.key === 'qa_guest_cart' && !QA.currentUser()) {
      cart = await QA.getCart();
      render();
    }
  });

  (async () => {
    try {
      cart = await QA.getCart();
      render();
    } catch (err) {
      $('cart-loading').hidden = true;
      $('cart-error').textContent = err.message;
      $('cart-error').hidden = false;
    }
  })();
})();
