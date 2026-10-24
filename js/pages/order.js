/* Užsakymo patvirtinimas ir detalės. */
(function () {
  'use strict';
  const QA = window.QA;
  if (!QA.requireAuth()) return;
  const $ = (id) => document.getElementById(id);
  const id = QA.param('id');
  const isNew = QA.param('new') === '1';

  function render() {
    const order = QA.getOrder(id);
    if (!order) {
      $('not-found').hidden = false;
      $('order').hidden = true;
      return;
    }
    document.title = `Užsakymas ${order.id} | QA Turgus`;
    const t = order.totals;
    const a = order.address;
    const d = order.delivery;
    const p = order.payment;
    let paymentText = QA.PAYMENT_LABELS[p.method];
    if (p.last4) paymentText += ` •••• ${p.last4}`;
    if (p.bank) paymentText += ` (${p.bank})`;

    const heading = isNew
      ? `<div class="success-banner" data-testid="order-success">
          <div class="success-icon" aria-hidden="true">✓</div>
          <div>
            <h1>Ačiū! Užsakymas pateiktas</h1>
            <p>Patvirtinimą „išsiuntėme“ adresu <strong>${QA.escapeHtml(order.userEmail)}</strong>. Užsakymo būseną galite stebėti paskyroje.</p>
          </div>
        </div>`
      : `<h1>Užsakymas ${order.id}</h1>`;

    $('order').innerHTML = `
      ${heading}
      <div class="card order-card" data-testid="order-details">
        <div class="order-head">
          <div><span class="muted small">Užsakymo numeris</span><div class="order-number" data-testid="order-number">${order.id}</div></div>
          <div><span class="muted small">Data</span><div data-testid="order-date">${QA.formatDate(order.createdAt, true)}</div></div>
          <div><span class="muted small">Būsena</span><div><span class="status status-${order.status}" data-testid="order-status">${QA.ORDER_STATUS[order.status]}</span></div></div>
          <div><span class="muted small">Suma</span><div class="strong" data-testid="order-total">${QA.money(t.total)}</div></div>
        </div>
        <div class="table-wrap">
          <table class="table" data-testid="order-items">
            <thead><tr><th scope="col">Prekė</th><th scope="col">Kiekis</th><th scope="col">Kaina</th><th scope="col">Suma</th></tr></thead>
            <tbody>
              ${order.items.map((i) => `
                <tr data-testid="order-item">
                  <td><span data-testid="order-item-name">${QA.escapeHtml(i.name)}</span>${i.size || i.color ? `<div class="muted small">${QA.escapeHtml(QA.optionsText(i))}</div>` : ''}</td>
                  <td data-testid="order-item-qty">${i.qty}</td>
                  <td>${QA.money(i.price)}</td>
                  <td>${QA.money(i.price * i.qty)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="order-grid">
          <div data-testid="order-shipping">
            <h3>Pristatymas</h3>
            <p>${QA.escapeHtml(d.label)}${d.location ? `<br>${QA.escapeHtml(d.location)}` : ''}</p>
            <p>${QA.escapeHtml(`${a.firstName} ${a.lastName}`)}<br>${QA.escapeHtml(a.street)}<br>${QA.escapeHtml(`${a.postal} ${a.city}`)}<br>${QA.escapeHtml(a.phone)}</p>
          </div>
          <div data-testid="order-payment">
            <h3>Mokėjimas</h3>
            <p>${QA.escapeHtml(paymentText)}</p>
          </div>
          <div>
            <h3>Suma</h3>
            <dl class="totals">${QA.totalsHtml(t)}</dl>
          </div>
        </div>
        <div class="order-actions">
          <a href="index.html" class="btn btn-primary" data-testid="continue-shopping">Tęsti apsipirkimą</a>
          <a href="account.html#orders" class="btn btn-secondary" data-testid="view-orders">Visi mano užsakymai</a>
          ${order.status === 'processing' ? '<button type="button" class="btn btn-ghost danger" id="cancel-order" data-testid="cancel-order">Atšaukti užsakymą</button>' : ''}
        </div>
      </div>`;
    $('order').hidden = false;

    const cancel = $('cancel-order');
    if (cancel) {
      cancel.addEventListener('click', async () => {
        const ok = await QA.confirmDialog({
          title: 'Atšaukti užsakymą?',
          message: `Užsakymas ${order.id} bus atšauktas. Šio veiksmo anuliuoti negalima.`,
          confirmText: 'Taip, atšaukti',
          cancelText: 'Ne',
          danger: true,
        });
        if (!ok) return;
        QA.setLoading(cancel, true, 'Atšaukiama…');
        try {
          await QA.cancelOrder(order.id);
          QA.toast(`Užsakymas ${order.id} atšauktas.`, 'info');
          render();
        } catch (err) {
          QA.toast(err.message, 'error');
          QA.setLoading(cancel, false);
        }
      });
    }
  }

  render();
})();
