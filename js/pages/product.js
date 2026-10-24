/* Prekės puslapis: variantai, kiekis, skirtukai, atsiliepimai, susijusios prekės. */
(function () {
  'use strict';
  const QA = window.QA;
  const $ = (id) => document.getElementById(id);
  const id = QA.param('id');

  function stockInfo(p) {
    if (p.stock <= 0) return { cls: 'out', text: 'Išparduota' };
    if (p.stock <= 3) return { cls: 'low', text: `Liko tik ${p.stock} vnt.!` };
    return { cls: 'in', text: `Sandėlyje: ${p.stock} vnt.` };
  }

  function renderBreadcrumbs(p) {
    $('breadcrumbs').innerHTML = `
      <ol>
        <li><a href="index.html">Parduotuvė</a></li>
        <li><a href="index.html?cat=${p.category}" data-testid="breadcrumb-category">${QA.CATEGORIES[p.category]}</a></li>
        <li aria-current="page">${QA.escapeHtml(p.name)}</li>
      </ol>`;
  }

  function renderProduct(p) {
    const soldOut = p.stock <= 0;
    const stock = stockInfo(p);
    const v = p.variants || {};
    const discount = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    const colors = v.colors
      ? `<fieldset class="field">
          <legend>Spalva: <strong id="color-label" data-testid="selected-color">${v.colors[0]}</strong></legend>
          <div class="swatches">
            ${v.colors.map((c, i) => `<label class="swatch"><input type="radio" name="color" value="${c}"${i === 0 ? ' checked' : ''} data-testid="color-option"><span>${c}</span></label>`).join('')}
          </div>
        </fieldset>`
      : '';
    const sizes = v.sizes
      ? `<div class="field">
          <label for="size">Dydis</label>
          <select id="size" data-testid="size-select" aria-describedby="size-error">
            <option value="">Pasirinkite dydį</option>
            ${v.sizes.map((s) => `<option value="${s}">${s}</option>`).join('')}
          </select>
          <p class="field-error" id="size-error" data-testid="size-error" hidden></p>
        </div>`
      : '';

    $('product').innerHTML = `
      <article class="product-detail" data-testid="product-detail" data-product-id="${p.id}">
        <div class="product-gallery">
          ${QA.productImage(p, 'pimg-lg')}
          ${discount ? `<span class="tag tag-sale">-${discount}%</span>` : ''}
        </div>
        <div class="product-info">
          <span class="product-category">${QA.CATEGORIES[p.category]}</span>
          <h1 data-testid="product-title">${QA.escapeHtml(p.name)}</h1>
          <div class="rating">${QA.stars(p.rating)}
            <a href="#reviews" id="reviews-link" data-testid="reviews-link">${p.rating.toFixed(1)} · ${p.reviewsCount} ${QA.plural(p.reviewsCount, ['įvertinimas', 'įvertinimai', 'įvertinimų'])}</a>
          </div>
          <div class="price-row lg">
            <span class="price" data-testid="product-price" data-value="${p.price}">${QA.money(p.price)}</span>
            ${p.oldPrice ? `<s class="old-price" data-testid="product-old-price">${QA.money(p.oldPrice)}</s>` : ''}
          </div>
          <p class="stock stock-${stock.cls}" data-testid="stock-status">${stock.text}</p>
          <form id="add-form" class="add-form" data-testid="add-to-cart-form" novalidate>
            ${colors}
            ${sizes}
            <div class="field">
              <label for="qty">Kiekis</label>
              <div class="qty-control">
                <button type="button" class="qty-btn" data-step="-1" aria-label="Sumažinti kiekį" data-testid="qty-decrease"${soldOut ? ' disabled' : ''}>−</button>
                <input type="number" id="qty" value="1" min="1" max="${p.stock}" inputmode="numeric" data-testid="qty-input" aria-describedby="qty-error"${soldOut ? ' disabled' : ''}>
                <button type="button" class="qty-btn" data-step="1" aria-label="Padidinti kiekį" data-testid="qty-increase"${soldOut ? ' disabled' : ''}>+</button>
              </div>
              <p class="field-error" id="qty-error" data-testid="qty-error" hidden></p>
            </div>
            <button type="submit" class="btn btn-primary btn-lg" data-testid="add-to-cart"${soldOut ? ' disabled' : ''}>${soldOut ? 'Išparduota' : 'Į krepšelį'}</button>
          </form>
          <ul class="perks">
            <li>🚚 Nemokamas pristatymas nuo ${QA.money(QA.FREE_SHIPPING_FROM)}</li>
            <li>↩️ 30 dienų prekių grąžinimas</li>
            <li>🔒 Saugus (ir visiškai netikras) atsiskaitymas</li>
          </ul>
        </div>
      </article>

      <section class="tabs" id="reviews" data-testid="product-tabs">
        <div class="tab-list" role="tablist" aria-label="Prekės informacija">
          <button type="button" role="tab" id="tab-description" aria-controls="panel-description" aria-selected="true" data-testid="tab-description">Aprašymas</button>
          <button type="button" role="tab" id="tab-specs" aria-controls="panel-specs" aria-selected="false" tabindex="-1" data-testid="tab-specs">Specifikacijos</button>
          <button type="button" role="tab" id="tab-reviews" aria-controls="panel-reviews" aria-selected="false" tabindex="-1" data-testid="tab-reviews">Atsiliepimai (<span data-testid="reviews-count">0</span>)</button>
        </div>
        <div class="tab-panel" role="tabpanel" id="panel-description" aria-labelledby="tab-description" data-testid="panel-description">
          <p>${QA.escapeHtml(p.description)}</p>
        </div>
        <div class="tab-panel" role="tabpanel" id="panel-specs" aria-labelledby="tab-specs" data-testid="panel-specs" hidden>
          <table class="specs-table" data-testid="specs-table">
            <tbody>${Object.entries(p.specs || {}).map(([k, val]) => `<tr><th scope="row">${QA.escapeHtml(k)}</th><td>${QA.escapeHtml(val)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
        <div class="tab-panel" role="tabpanel" id="panel-reviews" aria-labelledby="tab-reviews" data-testid="panel-reviews" hidden>
          <div id="reviews-list" class="reviews-list" data-testid="reviews-list"></div>
          <div id="review-form-wrap"></div>
        </div>
      </section>`;

    bindAddForm(p);
    bindTabs();
    renderReviews(p);
    renderReviewForm(p);
  }

  function bindAddForm(p) {
    const form = $('add-form');
    const qty = $('qty');
    const size = $('size');

    form.addEventListener('change', (e) => {
      if (e.target.name === 'color') $('color-label').textContent = e.target.value;
      if (e.target === size && size.value) QA.setFieldError(size, '');
    });

    form.querySelectorAll('.qty-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = (parseInt(qty.value, 10) || 1) + Number(btn.dataset.step);
        qty.value = String(Math.min(Math.max(next, 1), p.stock));
        QA.setFieldError(qty, '');
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let ok = true;
      if (size && !size.value) {
        QA.setFieldError(size, 'Pasirinkite dydį.');
        size.focus();
        ok = false;
      }
      const amount = Number(qty.value);
      if (!Number.isInteger(amount) || amount < 1) {
        QA.setFieldError(qty, 'Kiekis turi būti teigiamas sveikasis skaičius.');
        ok = false;
      } else if (amount > p.stock) {
        QA.setFieldError(qty, `Maksimalus galimas kiekis – ${p.stock} vnt.`);
        ok = false;
      } else {
        QA.setFieldError(qty, '');
      }
      if (!ok) return;

      const checkedColor = form.querySelector('input[name="color"]:checked');
      try {
        QA.addToCart(p, amount, { size: size ? size.value : null, color: checkedColor ? checkedColor.value : null });
        QA.toast(`„${p.name}“ (${amount} vnt.) pridėta į krepšelį.`);
        qty.value = '1';
      } catch (err) {
        QA.setFieldError(qty, err.message);
        QA.toast(err.message, 'error');
      }
    });
  }

  function bindTabs() {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const select = (tab) => {
      tabs.forEach((t) => {
        const selected = t === tab;
        t.setAttribute('aria-selected', String(selected));
        t.tabIndex = selected ? 0 : -1;
        $(t.getAttribute('aria-controls')).hidden = !selected;
      });
      tab.focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') select(tabs[(i + 1) % tabs.length]);
        if (e.key === 'ArrowLeft') select(tabs[(i - 1 + tabs.length) % tabs.length]);
      });
    });
    $('reviews-link').addEventListener('click', () => select($('tab-reviews')));
  }

  function renderReviews(p) {
    const reviews = QA.getReviews(p);
    document.querySelector('[data-testid="reviews-count"]').textContent = String(reviews.length);
    $('reviews-list').innerHTML = reviews.length
      ? reviews.map((r) => `
          <article class="review" data-testid="review">
            <header>
              <strong data-testid="review-author">${QA.escapeHtml(r.author)}</strong>
              <span class="review-stars" data-testid="review-rating" data-value="${r.rating}" title="${r.rating} iš 5">${QA.stars(r.rating)}</span>
              <time class="muted small" datetime="${r.date}">${r.date}</time>
            </header>
            <p data-testid="review-body">${QA.escapeHtml(r.text)}</p>
          </article>`).join('')
      : '<p class="muted" data-testid="no-reviews">Atsiliepimų dar nėra. Būkite pirmas!</p>';
  }

  function renderReviewForm(p) {
    const wrap = $('review-form-wrap');
    if (!QA.currentUser()) {
      const back = encodeURIComponent(`product.html?id=${p.id}`);
      wrap.innerHTML = `<p class="muted" data-testid="review-login-hint">Norėdami parašyti atsiliepimą, <a href="login.html?redirect=${back}">prisijunkite</a>.</p>`;
      return;
    }
    wrap.innerHTML = `
      <form id="review-form" class="review-form" data-testid="review-form" novalidate>
        <h3>Parašykite atsiliepimą</h3>
        <div class="field">
          <label for="review-rating">Įvertinimas</label>
          <select id="review-rating" data-testid="review-rating-select">
            <option value="">Pasirinkite įvertinimą</option>
            <option value="5">5 – Puiku</option>
            <option value="4">4 – Gerai</option>
            <option value="3">3 – Vidutiniškai</option>
            <option value="2">2 – Prastai</option>
            <option value="1">1 – Labai prastai</option>
          </select>
          <p class="field-error" id="review-rating-error" data-testid="review-rating-error" hidden></p>
        </div>
        <div class="field">
          <label for="review-text">Atsiliepimas</label>
          <textarea id="review-text" rows="4" maxlength="500" data-testid="review-text" placeholder="Kuo prekė patiko ar nepatiko?"></textarea>
          <p class="field-error" id="review-text-error" data-testid="review-text-error" hidden></p>
        </div>
        <button type="submit" class="btn btn-primary" data-testid="review-submit">Paskelbti atsiliepimą</button>
      </form>`;

    const v = QA.validators;
    const validate = QA.bindValidation({
      'review-rating': [v.required('Pasirinkite įvertinimą.')],
      'review-text': [v.required('Parašykite atsiliepimą.'), v.minLength(10, 'Atsiliepimas turi būti bent 10 simbolių.')],
    });
    const form = $('review-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validate()) return;
      const btn = form.querySelector('[type="submit"]');
      QA.setLoading(btn, true, 'Skelbiama…');
      try {
        await QA.addReview(p.id, Number($('review-rating').value), $('review-text').value.trim());
        form.reset();
        renderReviews(p);
        QA.toast('Ačiū! Jūsų atsiliepimas paskelbtas.');
      } catch (err) {
        QA.toast(err.message, 'error');
      } finally {
        QA.setLoading(btn, false);
      }
    });
  }

  function renderRelated(p, products) {
    const related = products.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 4);
    if (!related.length) return;
    $('related-grid').innerHTML = related.map((r) => `
      <a class="mini-card" href="product.html?id=${r.id}" data-testid="related-product">
        ${QA.productImage(r)}
        <span class="mini-card-name">${QA.escapeHtml(r.name)}</span>
        <span class="price">${QA.money(r.price)}</span>
      </a>`).join('');
    $('related').hidden = false;
  }

  async function load() {
    try {
      const { product, products } = await QA.fetchProduct(id);
      $('loading').hidden = true;
      if (!product) {
        $('not-found').hidden = false;
        document.title = 'Prekė nerasta | QA Turgus';
        return;
      }
      document.title = `${product.name} | QA Turgus`;
      renderBreadcrumbs(product);
      renderProduct(product);
      renderRelated(product, products);
      $('product').hidden = false;
    } catch (err) {
      $('loading').hidden = true;
      $('load-error').textContent = err.message;
      $('load-error').hidden = false;
    }
  }

  load();
})();
