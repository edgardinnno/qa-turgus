/* Prisijungimas. */
(function () {
  'use strict';
  const QA = window.QA;
  const $ = (id) => document.getElementById(id);
  const redirect = QA.safeRedirect(QA.param('redirect'), 'index.html');

  if (QA.currentUser()) {
    location.replace(QA.param('redirect') ? redirect : 'account.html');
    return;
  }

  const form = $('login-form');
  const error = $('login-error');
  const info = $('login-info');

  // Po registracijos parodome pranešimą ir užpildome el. paštą.
  const registered = sessionStorage.getItem('qa_registered_email');
  if (registered) {
    sessionStorage.removeItem('qa_registered_email');
    info.textContent = 'Registracija sėkminga! Dabar galite prisijungti.';
    info.hidden = false;
    $('login-email').value = registered;
  }

  const v = QA.validators;
  const validate = QA.bindValidation({
    'login-email': [v.required('Įveskite el. pašto adresą.'), v.email()],
    'login-password': [v.required('Įveskite slaptažodį.')],
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    if (!validate()) return;
    const btn = $('login-submit');
    QA.setLoading(btn, true, 'Jungiamasi…');
    try {
      const user = await QA.login($('login-email').value, $('login-password').value, $('login-remember').checked);
      QA.flash(`Sveiki sugrįžę, ${user.firstName}!`);
      location.href = redirect;
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      $('login-password').value = '';
      $('login-password').focus();
      QA.setLoading(btn, false);
    }
  });

  document.querySelectorAll('[data-fill-user]').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('login-email').value = btn.dataset.fillUser;
      $('login-password').value = 'Slaptas123!';
      QA.setFieldError($('login-email'), '');
      QA.setFieldError($('login-password'), '');
      $('login-submit').focus();
    });
  });
})();
