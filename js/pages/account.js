/* Paskyra: profilis, slaptažodžio keitimas, užsakymų istorija. */
(function () {
  'use strict';
  const QA = window.QA;
  if (!QA.requireAuth()) return;
  const $ = (id) => document.getElementById(id);
  const SECTIONS = ['profile', 'password', 'orders'];

  // --- Skiltys (pagal URL #hash) ---
  function showSection() {
    const hash = location.hash.slice(1);
    const current = SECTIONS.includes(hash) ? hash : 'profile';
    SECTIONS.forEach((s) => {
      $(`section-${s}`).hidden = s !== current;
      const link = document.querySelector(`[data-testid="account-tab-${s}"]`);
      link.classList.toggle('active', s === current);
      if (s === current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }
  window.addEventListener('hashchange', showSection);

  function renderGreeting() {
    const user = QA.currentUser();
    $('account-greeting').textContent = `Sveiki, ${user.firstName}!`;
    $('account-since').textContent = `Narys nuo ${QA.formatDate(user.createdAt)}`;
  }

  // --- Profilis ---
  const profileForm = $('profile-form');
  const saveBtn = $('profile-save');
  const fields = ['profile-first-name', 'profile-last-name', 'profile-phone', 'profile-newsletter'];
  let initial = '';

  const snapshot = () => fields.map((f) => ($(f).type === 'checkbox' ? $(f).checked : $(f).value)).join('|');

  function fillProfile() {
    const user = QA.currentUser();
    $('profile-email').value = user.email;
    $('profile-first-name').value = user.firstName;
    $('profile-last-name').value = user.lastName;
    $('profile-phone').value = user.phone || '';
    $('profile-newsletter').checked = Boolean(user.newsletter);
    initial = snapshot();
    saveBtn.disabled = true;
    $('profile-dirty').hidden = true;
  }

  // Mygtukas „Išsaugoti“ aktyvus tik kai yra neišsaugotų pakeitimų.
  const updateDirty = () => {
    const dirty = snapshot() !== initial;
    saveBtn.disabled = !dirty;
    $('profile-dirty').hidden = !dirty;
  };
  profileForm.addEventListener('input', updateDirty);
  profileForm.addEventListener('change', updateDirty);

  const v = QA.validators;
  const NAME_RE = /^[\p{L}\s'-]+$/u;
  const validateProfile = QA.bindValidation({
    'profile-first-name': [v.required('Įveskite vardą.'), v.minLength(2, 'Vardas turi būti bent 2 simbolių.'), v.pattern(NAME_RE, 'Varde gali būti tik raidės.')],
    'profile-last-name': [v.required('Įveskite pavardę.'), v.minLength(2, 'Pavardė turi būti bent 2 simbolių.'), v.pattern(NAME_RE, 'Pavardėje gali būti tik raidės.')],
    'profile-phone': [v.custom((val) => (!val || /^\+370\d{8}$/.test(val.replace(/\s/g, '')) ? '' : 'Telefono formatas: +370XXXXXXXX.'))],
  });

  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateProfile()) return;
    QA.setLoading(saveBtn, true, 'Saugoma…');
    try {
      await QA.updateProfile({
        firstName: $('profile-first-name').value.trim(),
        lastName: $('profile-last-name').value.trim(),
        phone: $('profile-phone').value.replace(/\s/g, ''),
        newsletter: $('profile-newsletter').checked,
      });
      QA.setLoading(saveBtn, false);
      fillProfile();
      renderGreeting();
      QA.renderHeader();
      QA.toast('Profilis atnaujintas.');
    } catch (err) {
      QA.setLoading(saveBtn, false);
      QA.toast(err.message, 'error');
    }
  });

  // --- Slaptažodis ---
  const pwForm = $('password-form');
  QA.bindPasswordMeter($('pw-new'), $('pw-new-meter'));
  const validatePassword = QA.bindValidation({
    'pw-current': [v.required('Įveskite dabartinį slaptažodį.')],
    'pw-new': [v.required('Įveskite naują slaptažodį.'), v.password()],
    'pw-confirm': [v.required('Pakartokite naują slaptažodį.'), v.matches('pw-new', 'Slaptažodžiai nesutampa.')],
  });

  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('password-error').hidden = true;
    if (!validatePassword()) return;
    const btn = $('password-save');
    QA.setLoading(btn, true, 'Keičiama…');
    try {
      await QA.changePassword($('pw-current').value, $('pw-new').value);
      pwForm.reset();
      $('pw-new').dispatchEvent(new Event('input'));
      QA.toast('Slaptažodis sėkmingai pakeistas.');
    } catch (err) {
      $('password-error').textContent = err.message;
      $('password-error').hidden = false;
    } finally {
      QA.setLoading(btn, false);
    }
  });

  // --- Užsakymai ---
  function renderOrders() {
    const orders = QA.getOrders();
    $('orders-count').textContent = String(orders.length);
    $('orders-empty').hidden = orders.length > 0;
    $('orders-table-wrap').hidden = orders.length === 0;
    $('orders-body').innerHTML = orders.map((o) => {
      const count = o.items.reduce((s, i) => s + i.qty, 0);
      return `
        <tr data-testid="order-row" data-order-id="${o.id}">
          <td><a href="order.html?id=${o.id}" data-testid="order-link">${o.id}</a></td>
          <td>${QA.formatDate(o.createdAt, true)}</td>
          <td>${count} ${QA.plural(count, ['prekė', 'prekės', 'prekių'])}</td>
          <td data-testid="order-row-total">${QA.money(o.totals.total)}</td>
          <td><span class="status status-${o.status}" data-testid="order-row-status">${QA.ORDER_STATUS[o.status]}</span></td>
        </tr>`;
    }).join('');
  }

  renderGreeting();
  fillProfile();
  renderOrders();
  showSection();
  $('account-content').hidden = false;
})();
