/* Kontaktų forma: validacija, simbolių skaitiklis, failo prisegimas. */
(function () {
  'use strict';
  const QA = window.QA;
  const $ = (id) => document.getElementById(id);
  const MAX_FILE = 2 * 1024 * 1024;
  const ALLOWED = ['image/png', 'image/jpeg', 'application/pdf'];
  const MAX_MESSAGE = 500;

  const form = $('contact-form');
  const user = QA.currentUser();
  if (user) {
    $('contact-name').value = `${user.firstName} ${user.lastName}`;
    $('contact-email').value = user.email;
  }

  const message = $('contact-message');
  const counter = $('message-counter');
  const updateCounter = () => {
    counter.textContent = `${message.value.length} / ${MAX_MESSAGE}`;
    counter.classList.toggle('warn', message.value.length > MAX_MESSAGE - 50);
  };
  message.addEventListener('input', updateCounter);

  // Užsakymo numerio laukas rodomas tik pasirinkus su užsakymu susijusią temą.
  const topic = $('contact-topic');
  const orderField = $('order-field');
  const toggleOrderField = () => {
    orderField.hidden = !['order', 'return'].includes(topic.value);
  };
  topic.addEventListener('change', toggleOrderField);

  // --- Failas ---
  const fileInput = $('contact-file');
  const fileInfo = $('file-info');
  function showFile() {
    const file = fileInput.files[0];
    if (!file) {
      fileInfo.hidden = true;
      return;
    }
    if (!ALLOWED.includes(file.type)) {
      QA.setFieldError(fileInput, 'Leidžiami tik PNG, JPG arba PDF failai.');
      fileInput.value = '';
      fileInfo.hidden = true;
      return;
    }
    if (file.size > MAX_FILE) {
      QA.setFieldError(fileInput, 'Failas per didelis. Maksimalus dydis – 2 MB.');
      fileInput.value = '';
      fileInfo.hidden = true;
      return;
    }
    QA.setFieldError(fileInput, '');
    $('file-name').textContent = file.name;
    $('file-size').textContent = `${(file.size / 1024).toFixed(1)} KB`;
    fileInfo.hidden = false;
  }
  fileInput.addEventListener('change', showFile);
  $('file-remove').addEventListener('click', () => {
    fileInput.value = '';
    showFile();
  });

  const v = QA.validators;
  const validate = QA.bindValidation({
    'contact-name': [v.required('Įveskite vardą.'), v.minLength(2, 'Vardas per trumpas.')],
    'contact-email': [v.required('Įveskite el. pašto adresą.'), v.email()],
    'contact-topic': [v.required('Pasirinkite temą.')],
    'contact-order': [v.custom((val) => (orderField.hidden || !val || /^ORD-\d{6}$/i.test(val) ? '' : 'Užsakymo numerio formatas: ORD-123456.'))],
    'contact-message': [v.required('Parašykite žinutę.'), v.minLength(20, 'Žinutė turi būti bent 20 simbolių.'), v.maxLength(MAX_MESSAGE)],
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const btn = $('contact-submit');
    QA.setLoading(btn, true, 'Siunčiama…');
    await QA.wait(800 + Math.random() * 700);
    const ticket = 'KT-' + Math.floor(1000 + Math.random() * 9000);
    $('ticket-number').textContent = ticket;
    $('copy-note').hidden = !$('contact-copy').checked;
    form.hidden = true;
    $('contact-success').hidden = false;
    $('contact-success').querySelector('h2').focus();
    QA.setLoading(btn, false);
  });

  $('contact-again').addEventListener('click', () => {
    form.reset();
    if (user) {
      $('contact-name').value = `${user.firstName} ${user.lastName}`;
      $('contact-email').value = user.email;
    }
    showFile();
    updateCounter();
    toggleOrderField();
    $('contact-success').hidden = true;
    form.hidden = false;
  });

  updateCounter();
  toggleOrderField();
})();
