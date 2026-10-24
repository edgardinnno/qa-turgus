/* Naujo vartotojo registracija. */
(function () {
  'use strict';
  const QA = window.QA;
  const $ = (id) => document.getElementById(id);

  if (QA.currentUser()) {
    QA.flash('Jūs jau esate prisijungę.', 'info');
    location.replace('account.html');
    return;
  }

  const form = $('register-form');
  const error = $('register-error');

  Object.entries(QA.COUNTRIES).forEach(([code, label]) => $('reg-country').add(new Option(label, code)));
  $('reg-birth-date').max = new Date().toISOString().slice(0, 10);
  QA.bindPasswordMeter($('reg-password'), $('password-meter'));

  function age(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    let years = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years--;
    return years;
  }

  const v = QA.validators;
  const NAME_RE = /^[\p{L}\s'-]+$/u;
  const validate = QA.bindValidation({
    'reg-first-name': [v.required('Įveskite vardą.'), v.minLength(2, 'Vardas turi būti bent 2 simbolių.'), v.maxLength(50), v.pattern(NAME_RE, 'Varde gali būti tik raidės.')],
    'reg-last-name': [v.required('Įveskite pavardę.'), v.minLength(2, 'Pavardė turi būti bent 2 simbolių.'), v.maxLength(50), v.pattern(NAME_RE, 'Pavardėje gali būti tik raidės.')],
    'reg-email': [v.required('Įveskite el. pašto adresą.'), v.email()],
    'reg-phone': [v.custom((val) => (!val || /^\+370\d{8}$/.test(val.replace(/\s/g, '')) ? '' : 'Telefono formatas: +370XXXXXXXX.'))],
    'reg-birth-date': [
      v.required('Įveskite gimimo datą.'),
      v.custom((val) => {
        if (!val) return '';
        const years = age(val);
        if (Number.isNaN(years) || years > 120) return 'Neteisinga gimimo data.';
        return years < 18 ? 'Registruotis gali tik asmenys nuo 18 metų.' : '';
      }),
    ],
    'reg-country': [v.required('Pasirinkite šalį.')],
    'reg-password': [v.required('Įveskite slaptažodį.'), v.password()],
    'reg-password-confirm': [v.required('Pakartokite slaptažodį.'), v.matches('reg-password', 'Slaptažodžiai nesutampa.')],
    'reg-terms': [v.required('Turite sutikti su naudojimosi taisyklėmis.')],
  });

  // Pakeitus slaptažodį iš naujo patikriname pakartojimą (jei jau buvo klaida).
  $('reg-password').addEventListener('input', () => {
    const confirm = $('reg-password-confirm');
    if (confirm.getAttribute('aria-invalid') === 'true') confirm.dispatchEvent(new Event('input'));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    if (!validate()) return;
    const btn = $('register-submit');
    QA.setLoading(btn, true, 'Kuriama paskyra…');
    try {
      const user = await QA.register({
        firstName: $('reg-first-name').value.trim(),
        lastName: $('reg-last-name').value.trim(),
        email: $('reg-email').value.trim(),
        phone: $('reg-phone').value.replace(/\s/g, ''),
        birthDate: $('reg-birth-date').value,
        country: $('reg-country').value,
        password: $('reg-password').value,
        newsletter: $('reg-newsletter').checked,
      });
      sessionStorage.setItem('qa_registered_email', user.email);
      location.href = 'login.html';
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      error.scrollIntoView({ behavior: 'smooth', block: 'center' });
      QA.setLoading(btn, false);
    }
  });
})();
