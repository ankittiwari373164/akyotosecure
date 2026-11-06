/* AKYOTO Secure — shared storefront script */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const qs = (k) => new URLSearchParams(location.search).get(k);

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok || data.ok === false) { const e = new Error(data.error || 'Request failed'); e.status = res.status; e.data = data; throw e; }
  return data;
}

/* ---------- config ---------- */
let _cfg;
async function config() {
  if (_cfg) return _cfg;
  try { _cfg = await api('/api/config'); } catch { _cfg = { store: { phone: '+91-9650715739', whatsapp: '919650715739', email: 'info@akyotosecure.com' }, shipping: { fee: 99, free_over: 999 }, payments: { provider: 'none', cod: true } }; }
  return _cfg;
}
function waLink(text) { const n = (_cfg?.store?.whatsapp || '919650715739').replace(/\D/g, ''); return `https://wa.me/${n}?text=${encodeURIComponent(text || 'Hi Akyoto, I need help choosing a security system.')}`; }

/* ---------- products cache ---------- */
let _products;
async function products() {
  if (_products) return _products;
  const d = await api('/api/products');
  _products = d.products;
  return _products;
}

/* ---------- cart ---------- */
const Cart = {
  key: 'aky_cart_v1',
  get() { try { return JSON.parse(localStorage.getItem(this.key)) || []; } catch { return []; } },
  set(items) { localStorage.setItem(this.key, JSON.stringify(items)); updateCartCount(true); },
  add(p, qty = 1) {
    const items = this.get();
    const i = items.find((x) => x.id === p.id);
    if (i) i.qty = Math.min(99, i.qty + qty);
    else items.push({ id: p.id, slug: p.slug, name: p.name, price: p.price, mrp: p.mrp, image: (p.images || [])[0] || p.image, qty });
    this.set(items);
  },
  setQty(id, qty) { let items = this.get(); if (qty <= 0) items = items.filter((x) => x.id !== id); else items.forEach((x) => { if (x.id === id) x.qty = Math.min(99, qty); }); this.set(items); },
  remove(id) { this.set(this.get().filter((x) => x.id !== id)); },
  clear() { localStorage.removeItem(this.key); updateCartCount(); },
  count() { return this.get().reduce((a, x) => a + x.qty, 0); },
  coupon(v) { if (v === undefined) return localStorage.getItem('aky_coupon') || ''; if (v) localStorage.setItem('aky_coupon', v); else localStorage.removeItem('aky_coupon'); },
};
function updateCartCount(bump) {
  const n = Cart.count();
  $$('.cart-count').forEach((el) => { el.textContent = n; el.classList.toggle('show', n > 0); if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } });
}
function flyToCart(img) {
  const target = $('.cart-btn'); if (!img || !target) return;
  const a = img.getBoundingClientRect(), b = target.getBoundingClientRect();
  const f = document.createElement('img'); f.src = img.currentSrc || img.src; f.className = 'fly';
  f.style.left = a.left + a.width / 2 - 30 + 'px'; f.style.top = a.top + a.height / 2 - 30 + 'px';
  document.body.appendChild(f);
  requestAnimationFrame(() => { f.style.transform = `translate(${b.left - a.left - a.width / 2 + 52}px, ${b.top - a.top - a.height / 2 + 52}px) scale(.25)`; f.style.opacity = '.3'; });
  setTimeout(() => f.remove(), 850);
}
function addToCart(p, qty = 1, imgEl) {
  if (!p.price) { location.href = waLink(`Hi Akyoto, please share a quote for ${p.name}.`); return; }
  if (p.stock <= 0) return toast('Sorry, this item is out of stock', true);
  Cart.add(p, qty); flyToCart(imgEl);
  toast(`Added to cart · <a href="/cart">View cart</a>`);
}

/* ---------- UI helpers ---------- */
function toast(html, err) {
  let box = $('.toasts'); if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.innerHTML = html; box.appendChild(t);
  setTimeout(() => { t.style.transition = '.3s'; t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; setTimeout(() => t.remove(), 300); }, 2600);
}
function stars(r) { if (!r) return ''; const f = Math.round(r); return '<span class="stars">' + '★'.repeat(f) + '☆'.repeat(5 - f) + '</span>'; }
function offPct(p) { return p.mrp > p.price && p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0; }
function priceHTML(p) {
  if (!p.price) return '<div class="price"><b>Price on request</b></div>';
  const o = offPct(p);
  return `<div class="price"><b>${fmt(p.price)}</b>${o ? `<s>${fmt(p.mrp)}</s><span class="off">${o}% off</span>` : ''}</div>`;
}
function productCard(p) {
  const o = offPct(p), alt = p.images[1];
  return `<article class="pcard" data-id="${p.id}">
    <a class="pimg" href="/product?slug=${encodeURIComponent(p.slug)}" aria-label="${esc(p.name)}">
      <div class="tags">${o ? `<span class="badge badge-red">-${o}%</span>` : ''}${p.featured ? '<span class="badge badge-navy">Bestseller</span>' : ''}${p.stock <= 0 && p.price ? '<span class="badge badge-amber">Sold out</span>' : ''}</div>
      <img class="main ${alt ? 'has-alt' : ''}" src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy" width="400" height="400">
      ${alt ? `<img class="alt" src="${esc(alt)}" alt="" loading="lazy" width="400" height="400">` : ''}
    </a>
    <div class="pbody">
      <span class="pcat">${esc(p.category)}</span>
      <h3><a href="/product?slug=${encodeURIComponent(p.slug)}">${esc(p.name)}</a></h3>
      ${p.rating ? `<div>${stars(p.rating)} <span class="small muted">(${p.review_count})</span></div>` : ''}
      ${priceHTML(p)}
      <div class="add">${p.price ? `<button class="btn btn-navy" data-add="${p.id}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6h15l-1.5 9h-12z"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M6 6 5 3H2"/></svg>Add</button>` : `<a class="btn btn-wa" href="${waLink('Hi Akyoto, please share a quote for ' + p.name)}" target="_blank" rel="noopener">Get quote</a>`}</div>
    </div></article>`;
}
function bindCards(root, list) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]'); if (!b) return;
    e.preventDefault();
    const p = list().find((x) => x.id === +b.dataset.add);
    if (p) addToCart(p, 1, b.closest('.pcard').querySelector('.pimg img'));
  });
}

/* ---------- animations ---------- */
const io = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }) : null;
function observeReveals(root = document) {
  $$('.reveal,.reveal-l,.reveal-r,.stagger', root).forEach((el) => {
    if (el.classList.contains('stagger')) [...el.children].forEach((c, i) => (c.style.transitionDelay = Math.min(i * 70, 700) + 'ms'));
    io ? io.observe(el) : el.classList.add('in');
  });
}
function countUp(el) {
  const end = +el.dataset.count, dur = 1400, t0 = performance.now(), suf = el.dataset.suffix || '';
  const step = (t) => { const k = Math.min(1, (t - t0) / dur); el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))).toLocaleString('en-IN') + suf; if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function initParallax() {
  const els = $$('[data-parallax]'); const bar = $('.progress-bar');
  let ticking = false;
  const run = () => {
    const y = scrollY;
    els.forEach((el) => { el.style.transform = `translate3d(0, ${y * parseFloat(el.dataset.parallax)}px, 0)`; });
    if (bar) bar.style.width = (y / (document.documentElement.scrollHeight - innerHeight || 1)) * 100 + '%';
    $('.header')?.classList.toggle('scrolled', y > 10);
    ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(run); } }, { passive: true });
  run();
}

/* ---------- header: drawer + search ---------- */
function initHeader() {
  const drawer = $('#mnav');
  $$('[data-open-menu]').forEach((b) => b.addEventListener('click', () => drawer.classList.add('open')));
  $$('#mnav .scrim, #mnav [data-close]').forEach((b) => b.addEventListener('click', () => drawer.classList.remove('open')));
  const ov = $('#search'); const inp = $('#search input'); const out = $('#search .search-results');
  let sel = -1;
  const open = () => { ov.classList.add('open'); setTimeout(() => inp.focus(), 50); products().catch(() => {}); };
  const close = () => { ov.classList.remove('open'); };
  $$('[data-open-search]').forEach((b) => b.addEventListener('click', open));
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); open(); } });
  inp.addEventListener('input', async () => {
    const q = inp.value.trim().toLowerCase(); sel = -1;
    if (!q) { out.innerHTML = ''; return; }
    const list = (await products()).filter((p) => (p.name + ' ' + p.category + ' ' + p.sku).toLowerCase().includes(q)).slice(0, 8);
    out.innerHTML = list.length ? list.map((p) => `<a class="sr-item" href="/product?slug=${encodeURIComponent(p.slug)}"><img src="${esc(p.images[0])}" alt=""><div><b>${esc(p.name)}</b><span>${esc(p.category)} · ${p.price ? fmt(p.price) : 'Price on request'}</span></div></a>`).join('') + `<a class="sr-item" href="/shop?q=${encodeURIComponent(q)}"><div><b>See all results for “${esc(q)}” →</b></div></a>`
      : `<div class="sr-item"><div><b>No products found</b><span>Try “siren”, “door sensor” or “GSM”</span></div></div>`;
  });
  inp.addEventListener('keydown', (e) => {
    const items = $$('.sr-item[href]', out);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((x, i) => x.classList.toggle('on', i === sel)); }
    if (e.key === 'Enter') { if (sel >= 0 && items[sel]) location.href = items[sel].href; else location.href = '/shop?q=' + encodeURIComponent(inp.value.trim()); }
  });
  // highlight active nav
  const path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  $$('.menu > li > a, .mnav a').forEach((a) => { const h = a.getAttribute('href'); if (h === path || (h !== '/' && path.startsWith(h))) a.classList.add('active'); });
}

async function fillStore() {
  const c = await config();
  $$('[data-store]').forEach((el) => { const v = c.store[el.dataset.store]; if (v) el.textContent = v; });
  $$('[data-wa]').forEach((a) => (a.href = waLink(a.dataset.wa || undefined)));
  $$('[data-free-ship]').forEach((el) => (el.textContent = fmt(c.shipping.free_over)));
}

document.addEventListener('DOMContentLoaded', () => {
  initHeader(); initParallax(); observeReveals(); updateCartCount(); fillStore();
  const cio = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { countUp(en.target); cio.unobserve(en.target); } }), { threshold: 0.6 });
  $$('[data-count]').forEach((el) => cio.observe(el));
  $$('.year').forEach((el) => (el.textContent = new Date().getFullYear()));
});
