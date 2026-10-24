/* Apmokėjimas – 4 žingsnių vedlys: adresas → pristatymas → mokėjimas → peržiūra. */
(function () {
  'use strict';
  const QA = window.QA;
  if (!QA.requireAuth()) return;

  const $ = (id) => document.getElementById(id);
  const form = $('checkout-form');
  const user = QA.currentUser();
  let step = 1;
  let cart = { items: [], promo: null };

  // --- Pradinės reikšmės ---
  $('ship-first-name').value = user.firstName || '';
  $('ship-last-name').value = user.lastName || '';
  $('ship-phone').value = user.phone || '';
  QA.PARCEL_LOCKERS.forEach((l) => $('parcel-locker').add(new Option(l, l)));
  QA.STORES.forEach((s) => $('pickup-store').add(new Option(s, s)));
  QA.BANKS.forEach((b) => $('bank-select').add(new Option(b, b)));

  const deliveryMethod = () => form.querySelector('input[name="delivery"]:checked').value;
  const paymentMethod = () => form.querySelector('input[name="payment"]:checked').value;

  // --- Validacija ---
  function luhn(num) {
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

  const cardNumberCheck = (val) => {
    const digits = val.replace(/\s/g, '');
    if (!/^\d{16}$/.test(digits)) return 'Kortelės numeris turi būti iš 16 skaitmenų.';
    return luhn(digits) ? '' : 'Neteisingas kortelės numeris.';
  };

  const expiryCheck = (val) => {
    const m = /^(\d{2})\/(\d{2})$/.exec(val);
    if (!m) return 'Galiojimo datos formatas: MM/YY.';
    const month = Number(m[1]);
    if (month < 1 || month > 12) return 'Neteisingas mėnuo.';
    const firstDayAfter = new Date(2000 + Number(m[2]), month, 1);
    return firstDayAfter <= new Date() ? 'Kortelės galiojimas pasibaigęs.' : '';
  };

  const phoneCheck = (val) => (!val || /^\+370\d{8}$/.test(val.replace(/\s/g, '')) ? '' : 'Telefono formatas: +370XXXXXXXX.');

  const v = QA.validators;
  const validate = QA.bindValidation({
    'ship-first-name': [v.required('Įveskite vardą.')],
    'ship-last-name': [v.required('Įveskite pavardę.')],
    'ship-phone': [v.required('Įveskite telefono numerį.'), phoneCheck],
    'ship-address': [v.required('Įveskite gatvę ir namo numerį.'), v.minLength(5, 'Adresas per trumpas.')],
    'ship-city': [v.required('Įveskite miestą.')],
    'ship-postal': [v.required('Įveskite pašto kodą.'), v.pattern(/^(LT-)?\d{5}$/i, 'Pašto kodo formatas: LT-12345.')],
    'parcel-locker': [v.required('Pasirinkite paštomatą.')],
    'pickup-store': [v.required('Pasirinkite parduotuvę.')],
    'card-name': [v.required('Įveskite kortelės savininko vardą ir pavardę.'), v.pattern(/^[\p{L}\s'-]+$/u, 'Galima naudoti tik raides.')],
    'card-number': [v.required('Įveskite kortelės numerį.'), cardNumberCheck],
    'card-expiry': [v.required('Įveskite galiojimo datą.'), expiryCheck],
    'card-cvc': [v.required('Įveskite CVC kodą.'), v.pattern(/^\d{3}$/, 'CVC kodą sudaro 3 skaitmenys.')],
    'bank-select': [v.required('Pasirinkite banką.')],
    'accept-terms': [v.required('Turite sutikti su pirkimo taisyklėmis.')],
  });

  function fieldsForStep() {
    if (step === 1) return ['ship-first-name', 'ship-last-name', 'ship-phone', 'ship-address', 'ship-city', 'ship-postal'];
    if (step === 2) return { courier: [], parcel: ['parcel-locker'], pickup: ['pickup-store'] }[deliveryMethod()];
    if (step === 3) return { card: ['card-name', 'card-number', 'card-expiry', 'card-cvc'], bank: ['bank-select'], cash: [] }[paymentMethod()];
    return ['accept-terms'];
  }

  // --- Žingsniai ---
  function showStep(n) {
    step = n;
    form.querySelectorAll('.step').forEach((s) => {
      s.hidden = Number(s.dataset.step) !== n;
    });
    document.querySelectorAll('.stepper li').forEach((li) => {
      const i = Number(li.dataset.step);
      li.classList.toggle('active', i === n);
      li.classList.toggle('done', i < n);
      if (i === n) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    $('prev-step').hidden = n === 1;
    $('next-step').hidden = n === 4;
    $('place-order').hidden = n !== 4;
    $('checkout-error').hidden = true;
    if (n === 4) renderReview();
    const heading = form.querySelector(`.step[data-step="${n}"] h2`);
    heading.focus();
  }

  // --- Pristatymas ---
  function onDeliveryChange() {
    const m = deliveryMethod();
    $('parcel-field').hidden = m !== 'parcel';
    $('store-field').hidden = m !== 'pickup';
    // Grynaisiais negalima mokėti paštomate.
    const cash = $('pay-cash');
    cash.disabled = m === 'parcel';
    $('cash-unavailable').hidden = m !== 'parcel';
    if (cash.disabled && cash.checked) {
      $('pay-card').checked = true;
      onPaymentChange();
    }
    renderSummary();
  }

  // --- Mokėjimas ---
  function onPaymentChange() {
    const m = paymentMethod();
    $('card-fields').hidden = m !== 'card';
    $('bank-fields').hidden = m !== 'bank';
    $('cash-note').hidden = m !== 'cash';
  }

  $('card-number').addEventListener('input', (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 16);
    e.target.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
    let brand = '';
    if (/^4/.test(digits)) brand = 'VISA';
    else if (/^5[1-5]/.test(digits)) brand = 'MASTERCARD';
    $('card-brand').textContent = brand;
    $('card-brand').hidden = !brand;
  });

  $('card-expiry').addEventListener('input', (e) => {
    let d = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (d.length >= 3) d = `${d.slice(0, 2)}/${d.slice(2)}`;
    e.target.value = d;
  });

  $('card-cvc').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3);
  });

  // --- Suvestinė ---
  function renderSummary() {
    $('summary-items').innerHTML = cart.items.map((i) => `
      <li class="mini-item" data-testid="summary-item">
        ${QA.productImage(i, 'pimg-xs')}
        <span class="mini-item-name">${QA.escapeHtml(i.name)}
          <span class="muted small">${QA.escapeHtml(QA.optionsText(i))}${i.size || i.color ? ' · ' : ''}${i.qty} vnt.</span>
        </span>
        <span class="mini-item-price">${QA.money(i.price * i.qty)}</span>
      </li>`).join('');
    $('totals').innerHTML = QA.totalsHtml(QA.computeTotals(cart, deliveryMethod()));
    Object.keys(QA.SHIPPING).forEach((method) => {
      const price = QA.computeTotals(cart, method).shipping;
      $(`price-${method}`).textContent = price === 0 ? 'Nemokamai' : QA.money(price);
    });
  }

  // Užsakymo duomenys tokiu pavidalu, kokio tikisi POST /api/orders.
  function collect() {
    const method = deliveryMethod();
    const delivery = { method };
    if (method === 'parcel') delivery.location = $('parcel-locker').value;
    if (method === 'pickup') delivery.location = $('pickup-store').value;

    const pay = paymentMethod();
    const payment = { method: pay };
    if (pay === 'card') {
      payment.card = {
        holder: $('card-name').value.trim(),
        number: $('card-number').value.replace(/\s/g, ''),
        expiry: $('card-expiry').value.trim(),
        cvc: $('card-cvc').value.trim(),
      };
    }
    if (pay === 'bank') payment.bank = $('bank-select').value;

    const postal = $('ship-postal').value.trim().toUpperCase();
    return {
      address: {
        firstName: $('ship-first-name').value.trim(),
        lastName: $('ship-last-name').value.trim(),
        phone: $('ship-phone').value.replace(/\s/g, ''),
        street: $('ship-address').value.trim(),
        city: $('ship-city').value.trim(),
        postal: postal.startsWith('LT-') ? postal : `LT-${postal}`,
        notes: $('ship-notes').value.trim(),
      },
      delivery,
      payment,
    };
  }

  function renderReview() {
    const d = collect();
    const a = d.address;
    d.delivery.label = QA.SHIPPING[d.delivery.method].label;
    d.delivery.eta = QA.SHIPPING[d.delivery.method].eta;
    let paymentText = QA.PAYMENT_LABELS[d.payment.method];
    if (d.payment.method === 'card') paymentText += ` •••• ${d.payment.card.number.slice(-4)}`;
    if (d.payment.method === 'bank') paymentText += ` (${d.payment.bank})`;
    const block = (title, testid, goto, body) => `
      <div class="review-block" data-testid="${testid}">
        <div class="review-block-head">
          <h3>${title}</h3>
          <button type="button" class="link-btn" data-goto="${goto}" data-testid="edit-step-${goto}">Keisti</button>
        </div>
        ${body}
      </div>`;
    $('review-summary').innerHTML = [
      block('Pristatymo adresas', 'review-address', 1, `<p>${QA.escapeHtml(`${a.firstName} ${a.lastName}`)}<br>${QA.escapeHtml(a.street)}<br>${QA.escapeHtml(`${a.postal} ${a.city}`)}<br>${QA.escapeHtml(a.phone)}</p>${a.notes ? `<p class="muted small">Pastabos: ${QA.escapeHtml(a.notes)}</p>` : ''}`),
      block('Pristatymo būdas', 'review-delivery', 2, `<p>${QA.escapeHtml(d.delivery.label)}${d.delivery.location ? `<br>${QA.escapeHtml(d.delivery.location)}` : ''}<br><span class="muted small">${d.delivery.eta}</span></p>`),
      block('Mokėjimas', 'review-payment', 3, `<p>${QA.escapeHtml(paymentText)}</p>`),
    ].join('');
  }

  // Serverio klaidų laukai (error.details) → formos laukai.
  const SERVER_FIELDS = {
    'address.firstName': 'ship-first-name',
    'address.lastName': 'ship-last-name',
    'address.phone': 'ship-phone',
    'address.street': 'ship-address',
    'address.city': 'ship-city',
    'address.postal': 'ship-postal',
    'delivery.location': 'parcel-locker',
    'payment.card.holder': 'card-name',
    'payment.card.number': 'card-number',
    'payment.card.expiry': 'card-expiry',
    'payment.card.cvc': 'card-cvc',
    'payment.bank': 'bank-select',
  };

  async function submitOrder() {
    const btn = $('place-order');
    const error = $('checkout-error');
    error.hidden = true;
    $('prev-step').disabled = true;
    QA.setLoading(btn, true, 'Apdorojamas užsakymas…');
    try {
      const order = await QA.placeOrder(collect());
      location.href = `order.html?id=${order.id}&new=1`;
    } catch (err) {
      QA.showServerErrors(err, SERVER_FIELDS);
      const fieldErrors = Object.values(err.details || {});
      error.textContent = fieldErrors.length ? `${err.message} ${fieldErrors.join(' ')}` : err.message;
      error.hidden = false;
      error.scrollIntoView({ behavior: 'smooth', block: 'center' });
      QA.setLoading(btn, false);
      $('prev-step').disabled = false;
    }
  }

  // --- Įvykiai ---
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate(fieldsForStep())) return;
    if (step < 4) showStep(step + 1);
    else submitOrder();
  });
  $('prev-step').addEventListener('click', () => showStep(step - 1));
  $('review-summary').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-goto]');
    if (btn) showStep(Number(btn.dataset.goto));
  });
  form.querySelectorAll('input[name="delivery"]').forEach((r) => r.addEventListener('change', onDeliveryChange));
  form.querySelectorAll('input[name="payment"]').forEach((r) => r.addEventListener('change', onPaymentChange));

  (async () => {
    try {
      cart = await QA.getCart();
    } catch (err) {
      $('checkout-loading').hidden = true;
      QA.toast(err.message, 'error');
      return;
    }
    if (!cart.items.length) {
      QA.flash('Krepšelis tuščias – pirmiausia įsidėkite prekių.', 'info');
      location.replace('cart.html');
      return;
    }
    onDeliveryChange();
    onPaymentChange();
    renderSummary();
    $('checkout-loading').hidden = true;
    $('checkout-content').hidden = false;
  })();
})();
