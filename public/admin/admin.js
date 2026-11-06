/* AKYOTO admin panel (single page, hash routes) */
const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dt = (s) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.endsWith('/login')) { showLogin(); throw new Error('Please log in'); }
  if (!res.ok || data.ok === false) throw new Error(data.error || 'Request failed');
  return data;
}
function toast(msg, err) { const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 2800); }
const st = (s) => `<span class="st ${esc(s)}">${esc(s)}</span>`;
const modal = { open(title, html) { $('#mtitle').textContent = title; $('#mbody').innerHTML = html; $('#modal').classList.add('open'); }, close() { $('#modal').classList.remove('open'); } };
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) modal.close(); });

function showLogin() { $('#app').hidden = true; $('#login').hidden = false; }
$('#lform').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); $('#lerr').textContent = '';
  try { await api('/api/admin/login', { method: 'POST', body: f }); boot(); } catch (err) { $('#lerr').textContent = err.message; }
});
$('#logout').addEventListener('click', async () => { await api('/api/admin/logout', { method: 'POST' }).catch(() => {}); showLogin(); });
$('#burger').addEventListener('click', () => $('#side').classList.toggle('open'));

async function boot() {
  const me = await fetch('/api/admin/me').then((r) => r.json()).catch(() => ({})); if (!me.ok) return showLogin(); $('#who').textContent = me.admin.email;
  $('#login').hidden = true; $('#app').hidden = false; route();
}
const routes = { dashboard, orders, order: orderDetail, products, coupons, reviews, enquiries, settings };
async function route() {
  const [r, id] = (location.hash.replace(/^#\//, '') || 'dashboard').split('/');
  const name = r === 'orders' && id ? 'order' : r;
  $$('.side nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === r)); $('#side').classList.remove('open');
  $('#title').textContent = { dashboard: 'Dashboard', orders: 'Orders', order: 'Order details', products: 'Products', coupons: 'Coupons', reviews: 'Reviews', enquiries: 'Enquiries', settings: 'Settings' }[name] || 'Dashboard';
  const old = $('#view'); const v = old.cloneNode(false); old.replaceWith(v); v.innerHTML = '<p class="muted">Loading…</p>';
  try { await (routes[name] || dashboard)(v, id); } catch (e) { v.innerHTML = `<div class="notice">${esc(e.message)}</div>`; }
}
addEventListener('hashchange', route);
function payPill(p) { const el = $('#paypill'); el.className = 'pill ' + p.mode; el.textContent = { demo: 'PAYMENTS: DEMO', test: 'RAZORPAY TEST', live: 'RAZORPAY LIVE', off: 'NO ONLINE PAYMENTS' }[p.mode] || ''; }

/* ---------- dashboard ---------- */
async function dashboard(v) {
  const d = await api('/api/admin/dashboard'); payPill(d.payments);
  $('#nReviews').textContent = d.counts.reviews || ''; $('#nEnq').textContent = d.counts.enquiries || '';
  const pend = (d.by_status.find((x) => x.status === 'pending') || {}).n || 0; $('#nOrders').textContent = pend || '';
  const days = []; for (let i = 13; i >= 0; i--) { const k = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); const r = d.daily.find((x) => x.day === k) || { revenue: 0, orders: 0 }; days.push({ k, ...r }); }
  const max = Math.max(1, ...days.map((x) => x.revenue));
  v.innerHTML = `${d.payments.mode === 'demo' ? '<div class="notice"><b>Payments are in DEMO mode.</b> Checkout simulates Razorpay and no money is collected. Add your Razorpay keys in <a href="#/settings" style="text-decoration:underline">Settings</a> (or as environment variables) to accept real payments.</div>' : d.payments.mode === 'test' ? '<div class="notice info"><b>Razorpay TEST mode.</b> Use test cards/UPI. Switch to rzp_live_ keys to go live.</div>' : ''}
  <div class="cards"><div class="card stat"><span>Revenue (paid)</span><b>${fmt(d.revenue)}</b></div><div class="card stat"><span>Paid orders</span><b>${d.paid_orders}</b></div><div class="card stat"><span>All orders</span><b>${d.total_orders}</b></div>
  <div class="card stat"><span>Avg order value</span><b>${fmt(d.aov)}</b></div><div class="card stat"><span>Open COD orders</span><b>${d.cod_open.n} · ${fmt(d.cod_open.v)}</b></div><div class="card stat"><span>Active products</span><b>${d.counts.active_products}/${d.counts.products}</b></div></div>
  <div class="grid2"><div class="card"><h3>Sales, last 14 days</h3><div class="chart">${days.map((x) => `<div title="${x.k}: ${fmt(x.revenue)} · ${x.orders} orders"><small>${x.revenue ? Math.round(x.revenue / 1000) + 'k' : ''}</small><i style="height:0" data-h="${(x.revenue / max) * 100}"></i><small>${x.k.slice(8)}</small></div>`).join('')}</div></div>
  <div class="card"><h3>Orders by status</h3>${['pending', 'paid', 'shipped', 'delivered', 'cancelled'].map((s) => `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)"><a href="#/orders?status=${s}">${st(s)}</a><b>${(d.by_status.find((x) => x.status === s) || {}).n || 0}</b></div>`).join('')}</div></div>
  <div class="grid2" style="margin-top:14px"><div class="card"><h3>Recent orders</h3>${d.recent.length ? `<div class="table-wrap" style="box-shadow:none"><table style="min-width:520px"><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Payment</th></tr>${d.recent.map((o) => `<tr><td><b>${esc(o.order_no)}</b><div class="small muted">${dt(o.created_at)}</div></td><td>${esc(o.customer_name)}</td><td>${fmt(o.total)}</td><td>${st(o.status)}</td><td>${st(o.payment_status)} <span class="small muted">${esc(o.payment_method)}</span></td></tr>`).join('')}</table></div>` : '<p class="muted">No orders yet.</p>'}</div>
  <div class="card"><h3>Top products</h3>${d.top.length ? d.top.map((t) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px solid var(--line)"><span>${esc(t.name)}</span><b>${t.qty} sold</b></div>`).join('') : '<p class="muted">No sales yet.</p>'}
  <h3 style="margin-top:16px">Low stock (≤5)</h3>${d.low_stock.length ? d.low_stock.map((p) => `<div style="display:flex;justify-content:space-between;padding:6px 0"><span>${esc(p.name)}</span><b style="color:var(--red)">${p.stock}</b></div>`).join('') : '<p class="muted">All good.</p>'}</div></div>`;
  requestAnimationFrame(() => $$('.chart i', v).forEach((i) => (i.style.height = Math.max(1, +i.dataset.h) + '%')));
}

/* ---------- orders ---------- */
async function orders(v) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  v.innerHTML = `<div class="bar"><input class="grow" id="oq" placeholder="Search order ID, name, phone, email" value="${esc(params.get('q') || '')}">
    <select id="os"><option value="">All statuses</option>${['pending', 'paid', 'shipped', 'delivered', 'cancelled'].map((s) => `<option ${params.get('status') === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <select id="op"><option value="">All payments</option>${['pending', 'paid', 'failed', 'refunded'].map((s) => `<option>${s}</option>`).join('')}</select>
    <select id="om"><option value="">All methods</option><option value="razorpay">Razorpay</option><option value="cod">COD</option><option value="demo">Demo</option></select>
    <input type="date" id="of" title="From"><input type="date" id="ot" title="To"><a class="btn" id="csv" href="#">⬇ CSV</a></div><div class="table-wrap" id="otbl"></div>`;
  const load = async () => {
    const q = new URLSearchParams({ q: $('#oq').value, status: $('#os').value, payment_status: $('#op').value, payment_method: $('#om').value, from: $('#of').value, to: $('#ot').value });
    for (const [k, val] of [...q]) if (!val) q.delete(k);
    $('#csv').href = '/api/admin/orders?format=csv&' + q;
    const d = await api('/api/admin/orders?' + q);
    $('#otbl').innerHTML = d.orders.length ? `<table><tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th></tr>${d.orders.map((o) => `<tr class="click" data-id="${o.id}"><td><b>${esc(o.order_no)}</b></td><td>${dt(o.created_at)}</td><td>${esc(o.customer_name)}<div class="small muted">${esc(o.phone)} · ${esc(o.city)}</div></td><td>${o.item_count || 0}</td><td><b>${fmt(o.total)}</b>${o.coupon_code ? `<div class="small muted">${esc(o.coupon_code)}</div>` : ''}</td><td>${st(o.payment_status)} <div class="small muted">${esc(o.payment_method)}${o.payment_mode && o.payment_mode !== 'cod' ? ' · ' + esc(o.payment_mode) : ''}</div></td><td>${st(o.status)}</td></tr>`).join('')}</table>` : '<p class="muted" style="padding:20px">No orders match.</p>';
  };
  let t; $('#oq').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  ['#os', '#op', '#om', '#of', '#ot'].forEach((s) => $(s).addEventListener('change', load));
  $('#otbl').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = '#/orders/' + tr.dataset.id; });
  await load();
}
async function orderDetail(v, id) {
  const { order: o, items, events } = await api('/api/admin/orders/' + id);
  const wa = `https://wa.me/91${o.phone}?text=${encodeURIComponent(`Hi ${o.customer_name}, this is Akyoto Secure about your order ${o.order_no}.`)}`;
  v.innerHTML = `<p><a href="#/orders" class="muted">← All orders</a></p><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0 16px"><h2>${esc(o.order_no)} ${st(o.status)} ${st(o.payment_status)}</h2>
    <div style="display:flex;gap:8px"><a class="btn" href="${wa}" target="_blank" rel="noopener">💬 WhatsApp customer</a><button class="btn" onclick="print()">🖨 Print</button></div></div>
    ${o.payment_method === 'demo' ? '<div class="notice">This order was paid in <b>DEMO mode</b> (simulated, no money collected).</div>' : ''}
    <div class="grid2"><div style="display:grid;gap:14px"><div class="card"><h3>Items</h3><div class="table-wrap" style="box-shadow:none"><table style="min-width:420px"><tr><th></th><th>Product</th><th>Price</th><th>Qty</th><th>Total</th></tr>${items.map((i) => `<tr><td><img src="${esc(i.image)}" alt=""></td><td>${esc(i.name)}</td><td>${fmt(i.price)}</td><td>${i.qty}</td><td><b>${fmt(i.price * i.qty)}</b></td></tr>`).join('')}</table></div>
      <dl class="kv" style="margin-top:12px;max-width:340px;margin-left:auto"><dt>Subtotal</dt><dd>${fmt(o.subtotal)}</dd><dt>Discount</dt><dd>− ${fmt(o.discount)} ${o.coupon_code ? `(${esc(o.coupon_code)})` : ''}</dd><dt>Shipping</dt><dd>${fmt(o.shipping)}</dd><dt><b>Total</b></dt><dd><b>${fmt(o.total)}</b></dd></dl></div>
      <div class="card"><h3>Timeline</h3><ul class="tl">${events.slice().reverse().map((e) => `<li><b>${esc(e.note || e.status)}</b><div class="small muted">${dt(e.created_at)}</div></li>`).join('')}</ul></div></div>
    <div style="display:grid;gap:14px;align-content:start"><div class="card"><h3>Update order</h3><div class="form" style="grid-template-columns:1fr">
      <label>Order status<select id="ust">${['pending', 'paid', 'shipped', 'delivered', 'cancelled'].map((s) => `<option ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>Payment status<select id="ups">${['pending', 'paid', 'failed', 'refunded'].map((s) => `<option ${o.payment_status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>Courier / tracking number<input id="utr" value="${esc(o.tracking_no || '')}" placeholder="e.g. Delhivery 1234567890"></label>
      <label>Note (shown to customer on tracking page)<input id="unote" placeholder="optional"></label><button class="btn primary" id="usave">Save changes</button></div></div>
      <div class="card"><h3>Customer</h3><dl class="kv"><dt>Name</dt><dd>${esc(o.customer_name)}</dd><dt>Phone</dt><dd><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></dd><dt>Email</dt><dd>${esc(o.email || '—')}</dd><dt>Address</dt><dd>${esc(o.address)}, ${esc(o.city)}, ${esc(o.state)} – ${esc(o.pincode)}</dd>${o.notes ? `<dt>Notes</dt><dd>${esc(o.notes)}</dd>` : ''}</dl></div>
      <div class="card"><h3>Payment</h3><dl class="kv"><dt>Method</dt><dd>${esc(o.payment_method)} ${o.payment_mode ? '(' + esc(o.payment_mode) + ')' : ''}</dd><dt>Razorpay order</dt><dd><code>${esc(o.rzp_order_id || '—')}</code></dd><dt>Payment ID</dt><dd><code>${esc(o.rzp_payment_id || '—')}</code></dd><dt>Paid at</dt><dd>${dt(o.paid_at) || '—'}</dd><dt>Placed</dt><dd>${dt(o.created_at)}</dd></dl></div></div></div>`;
  $('#usave').addEventListener('click', async () => {
    try { await api('/api/admin/orders/' + id, { method: 'PUT', body: { status: $('#ust').value, payment_status: $('#ups').value, tracking_no: $('#utr').value, note: $('#unote').value } }); toast('Order updated'); orderDetail(v, id); } catch (e) { toast(e.message, true); }
  });
}

/* ---------- products ---------- */
let PRODUCTS = [];
async function products(v) {
  const d = await api('/api/admin/products'); PRODUCTS = d.products;
  const cats = [...new Set(PRODUCTS.map((p) => p.category))];
  v.innerHTML = `<div class="bar"><input class="grow" id="pq" placeholder="Search products"><select id="pc"><option value="">All categories</option>${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
    <select id="pa"><option value="">Active + hidden</option><option value="1">Active</option><option value="0">Hidden</option></select><button class="btn primary" id="pnew">+ Add product</button></div><div class="table-wrap" id="ptbl"></div>
    <datalist id="catlist">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`;
  const draw = () => {
    const q = $('#pq').value.toLowerCase(), c = $('#pc').value, a = $('#pa').value;
    const list = PRODUCTS.filter((p) => (!q || (p.name + p.sku).toLowerCase().includes(q)) && (!c || p.category === c) && (!a || String(+p.active) === a));
    $('#ptbl').innerHTML = `<table><tr><th></th><th>Product</th><th>Category</th><th>Price</th><th>MRP</th><th>Stock</th><th>Active</th><th></th></tr>${list.map((p) => `<tr data-id="${p.id}"><td><img src="${esc(p.images[0] || '/img/placeholder.svg')}" alt=""></td>
      <td><b>${esc(p.name)}</b><div class="small muted">${esc(p.sku || p.slug)}</div></td><td>${esc(p.category)}</td>
      <td><input type="number" class="inl" data-f="price" value="${p.price}" style="width:90px;padding:6px;border:1.5px solid var(--line);border-radius:8px"></td><td>${fmt(p.mrp)}</td>
      <td><input type="number" class="inl" data-f="stock" value="${p.stock}" style="width:70px;padding:6px;border:1.5px solid var(--line);border-radius:8px;${p.stock <= 5 ? 'color:var(--red);font-weight:700' : ''}"></td>
      <td><label class="switch"><input type="checkbox" data-f="active" ${p.active ? 'checked' : ''}><span></span></label></td>
      <td style="white-space:nowrap"><button class="btn sm" data-edit>Edit</button> <a class="btn sm" href="/product?slug=${encodeURIComponent(p.slug)}" target="_blank">View</a> <button class="btn sm danger" data-del>Delete</button></td></tr>`).join('')}</table>`;
  };
  ['#pq', '#pc', '#pa'].forEach((s) => $(s).addEventListener('input', draw));
  $('#ptbl').addEventListener('change', async (e) => {
    const f = e.target.dataset.f; if (!f) return; const id = +e.target.closest('tr').dataset.id; const val = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
    try { await api('/api/admin/products/' + id, { method: 'PUT', body: { [f]: val } }); const p = PRODUCTS.find((x) => x.id === id); p[f] = val; if (f === 'price' && p.mrp < val) p.mrp = val; toast('Saved'); } catch (err) { toast(err.message, true); }
  });
  $('#ptbl').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return; const p = PRODUCTS.find((x) => x.id === +tr.dataset.id);
    if (e.target.closest('[data-edit]')) productForm(p, () => products(v));
    if (e.target.closest('[data-del]') && confirm(`Delete “${p.name}”?`)) { try { const r = await api('/api/admin/products/' + p.id, { method: 'DELETE' }); toast(r.message || 'Deleted'); products(v); } catch (err) { toast(err.message, true); } }
  });
  $('#pnew').addEventListener('click', () => productForm(null, () => products(v)));
  draw();
}
function resizeImage(file, max = 1200) {
  return new Promise((ok, no) => { const img = new Image(); img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); ok(c.toDataURL('image/webp', 0.85).startsWith('data:image/webp') ? c.toDataURL('image/webp', 0.85) : c.toDataURL('image/jpeg', 0.85)); }; img.onerror = no; img.src = URL.createObjectURL(file); });
}
function productForm(p, done) {
  const isNew = !p; p = p || { name: '', slug: '', sku: '', category: '', brand: 'Akyoto', price: 0, mrp: 0, stock: 10, active: true, featured: false, short_desc: '', description: '', specs: [], images: [], variant_group: '', variant_label: '' };
  let images = [...p.images], specs = p.specs.map((r) => [...r]);
  modal.open(isNew ? 'Add product' : 'Edit product', `<form class="form" id="pf">
    <label class="full">Product name *<input name="name" value="${esc(p.name)}" required></label>
    <label>URL slug<input name="slug" value="${esc(p.slug)}" placeholder="auto from name"></label><label>SKU / model<input name="sku" value="${esc(p.sku)}"></label>
    <label>Category<input name="category" value="${esc(p.category)}" list="catlist"></label><label>Brand<input name="brand" value="${esc(p.brand)}"></label>
    <label>Selling price (₹) *<input name="price" type="number" min="0" value="${p.price}"></label><label>MRP (₹)<input name="mrp" type="number" min="0" value="${p.mrp}"></label>
    <label>Stock<input name="stock" type="number" min="0" value="${p.stock}"></label>
    <div style="display:flex;gap:20px;align-items:end"><label style="display:flex;gap:8px;align-items:center">Active <span class="switch"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}><span></span></span></label><label style="display:flex;gap:8px;align-items:center">Featured <span class="switch"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}><span></span></span></label></div>
    <div class="full"><b class="small">Images</b> <span class="small muted">(first image is the main one; uploads are resized automatically)</span><div class="imgs" id="imgs" style="margin-top:6px"></div><input type="file" id="upl" accept="image/*" multiple hidden></div>
    <label class="full">Short description<textarea name="short_desc" style="font-family:inherit;min-height:60px">${esc(p.short_desc)}</textarea></label>
    <label class="full">Full description (HTML allowed)<textarea name="description" style="min-height:140px">${esc(p.description || '')}</textarea></label>
    <div class="full specs-ed"><b class="small">Specifications</b><div id="specs" style="margin-top:6px"></div><button type="button" class="btn sm" id="addspec">+ Add spec</button></div>
    <label>Variant group <span class="muted">(products sharing a group show as options)</span><input name="variant_group" value="${esc(p.variant_group || '')}"></label><label>Variant label<input name="variant_label" value="${esc(p.variant_label || '')}" placeholder="e.g. 120 dB"></label>
    <div class="full mfoot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${isNew ? 'Create product' : 'Save changes'}</button></div></form>`);
  const drawImgs = () => { $('#imgs').innerHTML = images.map((src, i) => `<div><img src="${esc(src)}" alt=""><button type="button" data-rmi="${i}">✕</button>${i ? `<button type="button" data-first="${i}" style="left:-8px;right:auto;background:#282c6e" title="Make main">★</button>` : ''}</div>`).join('') + '<div class="up" id="upb">+ Upload</div>'; };
  const drawSpecs = () => { $('#specs').innerHTML = specs.map(([k, v2], i) => `<div><input value="${esc(k)}" data-sk="${i}" placeholder="Name"><input value="${esc(v2)}" data-sv="${i}" placeholder="Value"><button type="button" class="btn sm danger" data-rms="${i}">✕</button></div>`).join(''); };
  drawImgs(); drawSpecs();
  $('#imgs').addEventListener('click', (e) => { if (e.target.closest('#upb')) $('#upl').click(); const r = e.target.dataset.rmi; if (r !== undefined) { images.splice(+r, 1); drawImgs(); } const f = e.target.dataset.first; if (f !== undefined) { images.unshift(images.splice(+f, 1)[0]); drawImgs(); } });
  $('#upl').addEventListener('change', async (e) => { for (const file of e.target.files) { try { toast('Uploading…'); const data_url = await resizeImage(file); const r = await api('/api/admin/upload', { method: 'POST', body: { data_url } }); images.push(r.url); drawImgs(); } catch (err) { toast(err.message, true); } } e.target.value = ''; });
  $('#specs').addEventListener('input', (e) => { if (e.target.dataset.sk) specs[+e.target.dataset.sk][0] = e.target.value; if (e.target.dataset.sv) specs[+e.target.dataset.sv][1] = e.target.value; });
  $('#specs').addEventListener('click', (e) => { if (e.target.dataset.rms) { specs.splice(+e.target.dataset.rms, 1); drawSpecs(); } });
  $('#addspec').addEventListener('click', () => { specs.push(['', '']); drawSpecs(); });
  $('#pf').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const body = { ...f, price: +f.price, mrp: +f.mrp || +f.price, stock: +f.stock, active: !!f.active, featured: !!f.featured, images, specs: specs.filter((r) => r[0]) };
    if (!body.slug) delete body.slug;
    try { await api('/api/admin/products' + (isNew ? '' : '/' + p.id), { method: isNew ? 'POST' : 'PUT', body }); toast(isNew ? 'Product created' : 'Product saved'); modal.close(); done(); } catch (err) { toast(err.message, true); }
  });
}

/* ---------- coupons ---------- */
async function coupons(v) {
  const d = await api('/api/admin/coupons');
  const state = (k) => !k.active ? 'Inactive' : k.expires_at && new Date(k.expires_at + 'T23:59:59+05:30') < new Date() ? 'Expired' : k.usage_limit && k.used_count >= k.usage_limit ? 'Used up' : 'Live';
  v.innerHTML = `<div class="bar"><span class="muted">Coupons are validated on the server at checkout: active, not expired, under the usage limit, and above the minimum order.</span><button class="btn primary" id="cnew" style="margin-left:auto">+ New coupon</button></div>
    <div class="table-wrap"><table><tr><th>Code</th><th>Discount</th><th>Min order</th><th>Expiry</th><th>Usage</th><th>State</th><th>Active</th><th></th></tr>${d.coupons.map((k) => `<tr data-id="${k.id}"><td><b>${esc(k.code)}</b><div class="small muted">${esc(k.description || '')}</div></td>
      <td>${k.type === 'percent' ? k.value + '%' + (k.max_discount ? ` (max ${fmt(k.max_discount)})` : '') : fmt(k.value) + ' flat'}</td><td>${k.min_order ? fmt(k.min_order) : '—'}</td><td>${esc(k.expires_at || 'No expiry')}</td><td>${k.used_count}${k.usage_limit ? ' / ' + k.usage_limit : ' / ∞'}</td>
      <td>${st(state(k) === 'Live' ? 'paid' : 'pending').replace(/>(paid|pending)</, '>' + state(k) + '<')}</td><td><label class="switch"><input type="checkbox" data-act ${k.active ? 'checked' : ''}><span></span></label></td>
      <td style="white-space:nowrap"><button class="btn sm" data-edit>Edit</button> <button class="btn sm danger" data-del>Delete</button></td></tr>`).join('')}</table></div>`;
  $('#cnew').addEventListener('click', () => couponForm(null, () => coupons(v)));
  v.querySelector('table').addEventListener('change', async (e) => { if (!e.target.matches('[data-act]')) return; const id = e.target.closest('tr').dataset.id; try { await api('/api/admin/coupons/' + id, { method: 'PUT', body: { active: e.target.checked } }); toast('Saved'); coupons(v); } catch (err) { toast(err.message, true); } });
  v.querySelector('table').addEventListener('click', async (e) => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; const k = d.coupons.find((x) => x.id === +tr.dataset.id);
    if (e.target.closest('[data-edit]')) couponForm(k, () => coupons(v));
    if (e.target.closest('[data-del]') && confirm(`Delete coupon ${k.code}?`)) { await api('/api/admin/coupons/' + k.id, { method: 'DELETE' }); toast('Deleted'); coupons(v); } });
}
function couponForm(k, done) {
  const isNew = !k; k = k || { code: '', type: 'percent', value: 10, min_order: 0, max_discount: 0, expires_at: '', usage_limit: 0, active: 1, description: '' };
  modal.open(isNew ? 'New coupon' : 'Edit coupon ' + k.code, `<form class="form" id="cf"><label>Code *<input name="code" value="${esc(k.code)}" required style="text-transform:uppercase"></label>
    <label>Type<select name="type"><option value="percent" ${k.type === 'percent' ? 'selected' : ''}>Percent (%)</option><option value="flat" ${k.type === 'flat' ? 'selected' : ''}>Flat amount (₹)</option></select></label>
    <label>Value *<input name="value" type="number" min="1" value="${k.value}"></label><label>Max discount (₹, percent only; 0 = no cap)<input name="max_discount" type="number" min="0" value="${k.max_discount}"></label>
    <label>Minimum order (₹)<input name="min_order" type="number" min="0" value="${k.min_order}"></label><label>Expiry date<input name="expires_at" type="date" value="${esc((k.expires_at || '').slice(0, 10))}"></label>
    <label>Usage limit (0 = unlimited)<input name="usage_limit" type="number" min="0" value="${k.usage_limit}"></label><label style="display:flex;gap:8px;align-items:center;align-self:end">Active <span class="switch"><input type="checkbox" name="active" ${k.active ? 'checked' : ''}><span></span></span></label>
    <label class="full">Description (internal / shown on validation)<input name="description" value="${esc(k.description || '')}"></label>
    <div class="full mfoot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${isNew ? 'Create coupon' : 'Save'}</button></div></form>`);
  $('#cf').addEventListener('submit', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    try { await api('/api/admin/coupons' + (isNew ? '' : '/' + k.id), { method: isNew ? 'POST' : 'PUT', body: { ...f, active: !!f.active } }); toast('Coupon saved'); modal.close(); done(); } catch (err) { toast(err.message, true); } });
}

/* ---------- reviews / enquiries ---------- */
async function reviews(v) {
  const d = await api('/api/admin/reviews');
  v.innerHTML = d.reviews.length ? `<div class="table-wrap"><table><tr><th>Product</th><th>Customer</th><th>Rating</th><th>Review</th><th>Date</th><th>Approved</th><th></th></tr>${d.reviews.map((r) => `<tr data-id="${r.id}"><td><a href="/product?slug=${encodeURIComponent(r.slug)}" target="_blank">${esc(r.product_name)}</a></td><td>${esc(r.name)}</td><td>${'★'.repeat(r.rating)}</td><td style="max-width:360px">${esc(r.body)}</td><td>${dt(r.created_at)}</td>
    <td><label class="switch"><input type="checkbox" data-ap ${r.approved ? 'checked' : ''}><span></span></label></td><td><button class="btn sm danger" data-del>Delete</button></td></tr>`).join('')}</table></div>` : '<div class="card"><p class="muted">No reviews yet. Customer reviews from product pages appear here for approval before they go live.</p></div>';
  v.addEventListener('change', async (e) => { if (e.target.matches('[data-ap]')) { await api('/api/admin/reviews/' + e.target.closest('tr').dataset.id, { method: 'PUT', body: { approved: e.target.checked } }); toast(e.target.checked ? 'Review published' : 'Review hidden'); } });
  v.addEventListener('click', async (e) => { if (e.target.closest('[data-del]') && confirm('Delete this review?')) { await api('/api/admin/reviews/' + e.target.closest('tr').dataset.id, { method: 'DELETE' }); reviews(v); } });
}
async function enquiries(v) {
  const d = await api('/api/admin/enquiries');
  v.innerHTML = d.enquiries.length ? `<div class="table-wrap"><table><tr><th>Date</th><th>Name</th><th>Contact</th><th>Message</th><th>Handled</th><th></th></tr>${d.enquiries.map((r) => `<tr data-id="${r.id}"><td>${dt(r.created_at)}</td><td><b>${esc(r.name)}</b><div class="small muted">${esc(r.company || '')}</div></td><td>${r.phone ? `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a><br>` : ''}${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : ''}</td><td style="max-width:380px">${esc(r.message)}</td>
    <td><label class="switch"><input type="checkbox" data-h ${r.handled ? 'checked' : ''}><span></span></label></td><td><button class="btn sm danger" data-del>Delete</button></td></tr>`).join('')}</table></div>` : '<div class="card"><p class="muted">No enquiries yet. Messages from the Contact page land here.</p></div>';
  v.addEventListener('change', async (e) => { if (e.target.matches('[data-h]')) { await api('/api/admin/enquiries/' + e.target.closest('tr').dataset.id, { method: 'PUT', body: { handled: e.target.checked } }); toast('Saved'); } });
  v.addEventListener('click', async (e) => { if (e.target.closest('[data-del]') && confirm('Delete this enquiry?')) { await api('/api/admin/enquiries/' + e.target.closest('tr').dataset.id, { method: 'DELETE' }); enquiries(v); } });
}

/* ---------- settings ---------- */
async function settings(v) {
  const d = await api('/api/admin/settings'); const s = d.settings; payPill(d.payments);
  const inp = (k, label, extra = '') => `<label>${label}<input name="${k}" value="${esc(s[k])}" ${extra}></label>`;
  v.innerHTML = `<div class="grid2" style="align-items:start"><form class="card" id="sf"><h3>Payments — Razorpay</h3>
    <div class="notice ${d.payments.mode === 'live' ? 'ok' : d.payments.mode === 'test' ? 'info' : ''}">Current mode: <b>${d.payments.mode.toUpperCase()}</b>${d.payments.env_override ? ' · keys come from environment variables (they override the fields below)' : ''}.
      ${d.payments.mode === 'demo' ? ' No keys yet, so checkout simulates payments and no money is collected.' : ''}${d.payments.mode === 'test' ? ' Test keys: no real money moves.' : ''}${d.payments.mode === 'live' ? ' Real payments are live.' : ''}</div>
    <div class="form">${inp('razorpay_key_id', 'Key ID (rzp_test_… or rzp_live_…)', 'placeholder="rzp_test_xxxxxxxx"')}${inp('razorpay_key_secret', 'Key secret', 'type="password" autocomplete="off"')}
    ${inp('razorpay_webhook_secret', 'Webhook secret', 'type="password" autocomplete="off"')}<label>Demo payments when no keys<select name="demo_payments"><option value="1" ${s.demo_payments !== '0' ? 'selected' : ''}>On (for testing)</option><option value="0" ${s.demo_payments === '0' ? 'selected' : ''}>Off (production)</option></select></label>
    <div class="full small muted">Webhook URL for the Razorpay Dashboard → Settings → Webhooks (events: payment.captured, payment.failed, order.paid, refund.processed):<br><code>${esc(d.webhook_url)}</code></div></div>
    <h3 style="margin-top:20px">Shipping &amp; COD</h3><div class="form">${inp('shipping_fee', 'Shipping fee (₹)', 'type="number" min="0"')}${inp('free_shipping_over', 'Free shipping above (₹)', 'type="number" min="0"')}
    <label>Cash on Delivery<select name="cod_enabled"><option value="1" ${s.cod_enabled === '1' ? 'selected' : ''}>Enabled</option><option value="0" ${s.cod_enabled !== '1' ? 'selected' : ''}>Disabled</option></select></label>${inp('cod_fee', 'COD fee (₹)', 'type="number" min="0"')}</div>
    <h3 style="margin-top:20px">Store details</h3><div class="form">${inp('store_name', 'Store name')}${inp('gstin', 'GSTIN')}${inp('support_phone', 'Support phone')}${inp('support_phone_2', 'Second phone')}${inp('whatsapp', 'WhatsApp number (with 91)')}${inp('support_email', 'Support email')}${inp('sales_email', 'Sales email')}<label class="full">Address<input name="address" value="${esc(s.address)}"></label></div>
    <div class="mfoot"><button class="btn primary">Save settings</button></div></form>
    <form class="card" id="pwf"><h3>Admin login</h3><p class="small muted" style="margin-bottom:12px">Change the default password right away.</p><div class="form" style="grid-template-columns:1fr">
    <label>Login email<input name="email" type="email" value="${esc($('#who').textContent)}"></label><label>Current password<input name="current" type="password" autocomplete="current-password" required></label><label>New password (8+ characters)<input name="new_password" type="password" autocomplete="new-password" minlength="8" required></label><button class="btn primary">Update login</button></div></form></div>`;
  $('#sf').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/api/admin/settings', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Settings saved'); settings(v); } catch (err) { toast(err.message, true); } });
  $('#pwf').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/api/admin/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Login updated'); e.target.reset(); } catch (err) { toast(err.message, true); } });
}
boot();
