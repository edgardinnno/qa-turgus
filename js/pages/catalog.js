/* Prekių katalogas: paieška, filtrai, rikiavimas, puslapiavimas (būsena saugoma URL). */
(function () {
  'use strict';
  const QA = window.QA;
  const PER_PAGE = 8;
  const $ = (id) => document.getElementById(id);
  const els = {
    form: $('filters'),
    search: $('search'),
    category: $('category'),
    sort: $('sort'),
    inStock: $('in-stock'),
    grid: $('product-grid'),
    count: $('results-count'),
    loading: $('loading'),
    error: $('load-error'),
    empty: $('empty-state'),
    pagination: $('pagination'),
  };

  const SORTERS = {
    popular: (a, b) => b.reviewsCount - a.reviewsCount,
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    'name-asc': (a, b) => a.name.localeCompare(b.name, 'lt'),
    'name-desc': (a, b) => b.name.localeCompare(a.name, 'lt'),
    rating: (a, b) => b.rating - a.rating,
  };

  const params = new URLSearchParams(location.search);
  const state = {
    q: params.get('q') || '',
    cat: QA.CATEGORIES[params.get('cat')] ? params.get('cat') : '',
    sort: SORTERS[params.get('sort')] ? params.get('sort') : 'popular',
    inStock: params.get('stock') === '1',
    page: Math.max(1, parseInt(params.get('page'), 10) || 1),
  };
  let products = [];

  Object.entries(QA.CATEGORIES).forEach(([value, label]) => els.category.add(new Option(label, value)));

  function syncControls() {
    els.search.value = state.q;
    els.category.value = state.cat;
    els.sort.value = state.sort;
    els.inStock.checked = state.inStock;
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.cat) p.set('cat', state.cat);
    if (state.sort !== 'popular') p.set('sort', state.sort);
    if (state.inStock) p.set('stock', '1');
    if (state.page > 1) p.set('page', String(state.page));
    const qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  // „sviesa“ randa „Šviesa“ – ignoruojame diakritinius ženklus.
  const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function filtered() {
    const q = normalize(state.q.trim());
    return products
      .filter((p) => !state.cat || p.category === state.cat)
      .filter((p) => !state.inStock || p.stock > 0)
      .filter((p) => !q || normalize(`${p.name} ${p.description} ${QA.CATEGORIES[p.category]}`).includes(q))
      .sort(SORTERS[state.sort]);
  }

  function defaultOptions(p) {
    return p.variants && p.variants.colors ? { color: p.variants.colors[0] } : {};
  }

  function card(p) {
    const soldOut = p.stock <= 0;
    const needsSize = Boolean(p.variants && p.variants.sizes);
    const discount = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    const url = `product.html?id=${p.id}`;
    const name = QA.escapeHtml(p.name);
    let action;
    if (soldOut) {
      action = '<button type="button" class="btn btn-secondary btn-block" disabled data-testid="add-to-cart">Išparduota</button>';
    } else if (needsSize) {
      action = `<a href="${url}" class="btn btn-secondary btn-block" data-testid="choose-options">Pasirinkti dydį</a>`;
    } else {
      action = `<button type="button" class="btn btn-primary btn-block" data-testid="add-to-cart" data-id="${p.id}" aria-label="Į krepšelį: ${name}">Į krepšelį</button>`;
    }
    let stockTag = '';
    if (soldOut) stockTag = '<span class="tag tag-muted" data-testid="stock-badge">Išparduota</span>';
    else if (p.stock <= 3) stockTag = `<span class="tag tag-warn" data-testid="stock-badge">Liko ${p.stock} vnt.</span>`;

    return `
      <article class="product-card${soldOut ? ' sold-out' : ''}" data-testid="product-card" data-product-id="${p.id}">
        <a href="${url}" class="product-card-image" tabindex="-1" aria-hidden="true">
          ${QA.productImage(p)}
          ${discount ? `<span class="tag tag-sale" data-testid="discount-badge">-${discount}%</span>` : ''}
          ${stockTag}
        </a>
        <div class="product-card-body">
          <span class="product-category">${QA.CATEGORIES[p.category]}</span>
          <h3 class="product-card-title"><a href="${url}" data-testid="product-name">${name}</a></h3>
          <div class="rating" title="Įvertinimas ${p.rating} iš 5">${QA.stars(p.rating)}
            <span class="muted small">${p.rating.toFixed(1)} (${p.reviewsCount})</span></div>
          <div class="price-row">
            <span class="price" data-testid="product-price" data-value="${p.price}">${QA.money(p.price)}</span>
            ${p.oldPrice ? `<s class="old-price" data-testid="product-old-price">${QA.money(p.oldPrice)}</s>` : ''}
          </div>
          ${action}
        </div>
      </article>`;
  }

  function renderPagination(pages) {
    if (pages <= 1) {
      els.pagination.innerHTML = '';
      return;
    }
    const btn = (page, label, o) => {
      const opts = o || {};
      return `<button type="button" class="page-btn${opts.current ? ' current' : ''}" data-page="${page}"
        data-testid="${opts.testid || 'page-' + page}"${opts.disabled ? ' disabled' : ''}${opts.current ? ' aria-current="page"' : ''}>${label}</button>`;
    };
    let html = btn(state.page - 1, '‹ Ankstesnis', { disabled: state.page === 1, testid: 'page-prev' });
    for (let i = 1; i <= pages; i++) html += btn(i, i, { current: i === state.page });
    html += btn(state.page + 1, 'Kitas ›', { disabled: state.page === pages, testid: 'page-next' });
    els.pagination.innerHTML = html;
  }

  function render() {
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    state.page = Math.min(state.page, pages);
    const slice = list.slice((state.page - 1) * PER_PAGE, state.page * PER_PAGE);
    els.grid.innerHTML = slice.map(card).join('');
    els.count.textContent = `Rasta ${list.length} ${QA.plural(list.length, ['prekė', 'prekės', 'prekių'])}`;
    els.empty.hidden = list.length > 0;
    renderPagination(pages);
    syncUrl();
  }

  async function load() {
    els.loading.hidden = false;
    els.error.hidden = true;
    els.grid.innerHTML = '';
    els.count.textContent = '';
    try {
      products = await QA.fetchProducts();
      render();
    } catch (err) {
      els.error.innerHTML = `<span>${QA.escapeHtml(err.message)}</span>
        <button type="button" class="btn btn-secondary btn-sm" data-testid="retry-load">Bandyti dar kartą</button>`;
      els.error.querySelector('button').addEventListener('click', load);
      els.error.hidden = false;
    } finally {
      els.loading.hidden = true;
    }
  }

  // --- Įvykiai ---
  let debounce;
  const applySearch = () => {
    clearTimeout(debounce);
    state.q = els.search.value;
    state.page = 1;
    render();
  };
  els.search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(applySearch, 300);
  });
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    applySearch();
  });
  els.category.addEventListener('change', () => {
    state.cat = els.category.value;
    state.page = 1;
    render();
  });
  els.sort.addEventListener('change', () => {
    state.sort = els.sort.value;
    state.page = 1;
    render();
  });
  els.inStock.addEventListener('change', () => {
    state.inStock = els.inStock.checked;
    state.page = 1;
    render();
  });
  $('clear-filters').addEventListener('click', () => {
    Object.assign(state, { q: '', cat: '', sort: 'popular', inStock: false, page: 1 });
    syncControls();
    render();
  });
  document.querySelectorAll('[data-category-link]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      Object.assign(state, { cat: link.dataset.categoryLink, page: 1 });
      syncControls();
      render();
      $('catalog-title').scrollIntoView({ behavior: 'smooth' });
    });
  });
  els.pagination.addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]');
    if (!b || b.disabled) return;
    state.page = Number(b.dataset.page);
    render();
    $('catalog-title').scrollIntoView({ behavior: 'smooth' });
  });
  els.grid.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    const p = products.find((x) => x.id === b.dataset.id);
    try {
      QA.addToCart(p, 1, defaultOptions(p));
      QA.toast(`„${p.name}“ pridėta į krepšelį.`);
      b.textContent = '✓ Pridėta';
      b.classList.add('added');
      setTimeout(() => {
        b.textContent = 'Į krepšelį';
        b.classList.remove('added');
      }, 1500);
    } catch (err) {
      QA.toast(err.message, 'error');
    }
  });

  syncControls();
  load();
})();
