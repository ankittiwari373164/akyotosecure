// AKYOTO Store — shared API (runs on Node via @hono/node-server and on Cloudflare Workers)
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { SCHEMA } from './schema.mjs';

const enc = new TextEncoder();
const now = () => new Date().toISOString();
const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

// ---------- crypto helpers (Web Crypto: same code on Node 18+ and Workers) ----------
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64url = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export async function hashPassword(password, saltHex) {
  const salt = saltHex || hex(crypto.getRandomValues(new Uint8Array(16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return { hash: hex(bits), salt };
}
const randomToken = (n = 24) => hex(crypto.getRandomValues(new Uint8Array(n)));

// ---------- small utils ----------
const toInt = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const str = (v, max = 500) => (v == null ? '' : String(v)).trim().slice(0, max);
const parseJSON = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const slugify = (s) => str(s, 120).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'product';
const phone10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const escapeCsv = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';

function productOut(p, full = false) {
  if (!p) return null;
  const o = {
    id: p.id, slug: p.slug, name: p.name, sku: p.sku, category: p.category, brand: p.brand,
    price: p.price, mrp: p.mrp, stock: p.stock, active: !!p.active, featured: !!p.featured,
    short_desc: p.short_desc, images: parseJSON(p.images, []), specs: parseJSON(p.specs, []),
    variant_group: p.variant_group || null, variant_label: p.variant_label || null,
    rating: p.rating != null ? Math.round(p.rating * 10) / 10 : null, review_count: p.review_count || 0,
    price_on_request: !p.price,
  };
  if (full) { o.description = p.description; o.created_at = p.created_at; o.updated_at = p.updated_at; }
  return o;
}

export function createApp(opts) {
  const { db, storage, env = {}, seed = {} } = opts;
  const app = new Hono();
  let ready = null;

  // ---------- settings ----------
  async function getSettings() {
    const rows = await db.all('SELECT setting_key, setting_value FROM settings');
    const s = {};
    for (const r of rows) s[r.setting_key] = r.setting_value;
    return s;
  }
  async function setSetting(key, value) {
    const v = value == null ? '' : String(value);
    if (await db.get('SELECT setting_key FROM settings WHERE setting_key = ?', [key])) await db.run('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [v, key]);
    else await db.run('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)', [key, v]);
  }
  async function paymentConfig() {
    const s = await getSettings();
    const keyId = env.RAZORPAY_KEY_ID || s.razorpay_key_id || '';
    const keySecret = env.RAZORPAY_KEY_SECRET || s.razorpay_key_secret || '';
    const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET || s.razorpay_webhook_secret || '';
    const demoAllowed = String(env.DEMO_PAYMENTS ?? s.demo_payments ?? '1') !== '0' && String(env.DEMO_PAYMENTS ?? '') !== 'false';
    let provider = 'none', mode = 'off';
    if (keyId && keySecret) { provider = 'razorpay'; mode = keyId.startsWith('rzp_live_') ? 'live' : 'test'; }
    else if (demoAllowed) { provider = 'demo'; mode = 'demo'; }
    return { keyId, keySecret, webhookSecret, provider, mode, cod: (s.cod_enabled ?? '1') === '1', settings: s,
      keysFrom: env.RAZORPAY_KEY_ID ? 'env' : (s.razorpay_key_id ? 'admin' : 'none') };
  }

  // ---------- init: schema + seed ----------
  async function init() {
    for (const stmt of SCHEMA[db.dialect || 'sqlite']) await db.run(stmt);
    const c = await db.get('SELECT COUNT(*) AS n FROM products');
    if (!c || !c.n) {
      for (const p of seed.products || []) {
        await db.run(`INSERT INTO products (slug,name,sku,category,brand,price,mrp,stock,active,featured,short_desc,description,specs,images,variant_group,variant_label,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [p.slug, p.name, p.sku || '', p.category, p.brand || 'Akyoto', p.price, p.mrp, p.stock ?? 25, p.active ?? 1, p.featured ?? 0,
            p.short_desc || '', p.description || '', JSON.stringify(p.specs || []), JSON.stringify(p.images || []), p.variant_group || null, p.variant_label || null, now(), now()]);
      }
    }
    const cc = await db.get('SELECT COUNT(*) AS n FROM coupons');
    if (!cc || !cc.n) {
      for (const k of seed.coupons || []) {
        await db.run('INSERT INTO coupons (code,type,value,min_order,max_discount,expires_at,usage_limit,used_count,active,description,created_at) VALUES (?,?,?,?,?,?,?,0,?,?,?)',
          [k.code, k.type, k.value, k.min_order || 0, k.max_discount || 0, k.expires_at || null, k.usage_limit || 0, k.active ?? 1, k.description || '', now()]);
      }
    }
    const s = await getSettings();
    const defaults = { store_name: 'Akyoto Secure', currency: 'INR', shipping_fee: '99', free_shipping_over: '999', cod_enabled: '1', cod_fee: '0',
      demo_payments: '1', support_phone: '+91-9650715739', support_phone_2: '9650409811', whatsapp: '919650715739', support_email: 'info@akyotosecure.com',
      sales_email: 'sales@akyotosecure.com', address: 'M/s Reyansh Enterprises, C-2nd/125, Raju Park, Devli Road, Khanpur, New Delhi-110080', gstin: '' };
    for (const [k, v] of Object.entries(defaults)) if (s[k] == null) await setSetting(k, v);
    if (!s.session_secret) await setSetting('session_secret', env.SESSION_SECRET || randomToken(32));
    const a = await db.get('SELECT COUNT(*) AS n FROM admins');
    if (!a || !a.n) {
      const email = (env.ADMIN_EMAIL || seed.admin?.email || 'admin@akyotosecure.com').toLowerCase();
      const { hash, salt } = await hashPassword(env.ADMIN_PASSWORD || seed.admin?.password || 'ChangeMe@123');
      await db.run('INSERT INTO admins (email, pass_hash, salt, created_at) VALUES (?,?,?,?)', [email, hash, salt, now()]);
    }
  }
  app.use('*', async (c, next) => { if (!ready) ready = init().catch((e) => { ready = null; throw e; }); await ready; await next(); });

  app.onError((err, c) => {
    if (!err.publicMessage || (err.status || 500) >= 500) console.error(err);
    return c.json({ ok: false, error: err.publicMessage || 'Something went wrong. Please try again.' }, err.status || 500);
  });
  const fail = (msg, status = 400) => { const e = new Error(msg); e.publicMessage = msg; e.status = status; return e; };

  // ---------- public: config ----------
  app.get('/api/config', async (c) => {
    const pc = await paymentConfig(); const s = pc.settings;
    return c.json({ ok: true, store: { name: s.store_name, phone: s.support_phone, phone2: s.support_phone_2, whatsapp: s.whatsapp, email: s.support_email, sales_email: s.sales_email, address: s.address },
      shipping: { fee: toInt(s.shipping_fee), free_over: toInt(s.free_shipping_over) },
      payments: { provider: pc.provider, mode: pc.mode, key_id: pc.provider === 'razorpay' ? pc.keyId : null, cod: pc.cod, cod_fee: toInt(s.cod_fee) } });
  });

  // ---------- public: catalogue ----------
  const PRODUCT_SELECT = `SELECT p.*, (SELECT AVG(rating) FROM reviews r WHERE r.product_id = p.id AND r.approved = 1) AS rating,
      (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id AND r.approved = 1) AS review_count FROM products p`;
  app.get('/api/products', async (c) => {
    const q = str(c.req.query('q'), 80).toLowerCase();
    const cat = str(c.req.query('category'), 80);
    let rows = await db.all(`${PRODUCT_SELECT} WHERE p.active = 1 ORDER BY p.featured DESC, p.id DESC`);
    if (cat) rows = rows.filter((r) => r.category === cat);
    if (q) rows = rows.filter((r) => (r.name + ' ' + r.category + ' ' + r.sku + ' ' + r.brand + ' ' + r.short_desc).toLowerCase().includes(q));
    return c.json({ ok: true, products: rows.map((r) => productOut(r)) });
  });
  app.get('/api/categories', async (c) => {
    const rows = await db.all('SELECT category AS name, COUNT(*) AS count, MIN(price) AS from_price FROM products WHERE active = 1 GROUP BY category ORDER BY count DESC');
    return c.json({ ok: true, categories: rows });
  });
  app.get('/api/products/:slug', async (c) => {
    const p = await db.get(`${PRODUCT_SELECT} WHERE p.slug = ? AND p.active = 1`, [c.req.param('slug')]);
    if (!p) throw fail('Product not found', 404);
    const reviews = await db.all('SELECT id, name, rating, body, created_at FROM reviews WHERE product_id = ? AND approved = 1 ORDER BY id DESC LIMIT 50', [p.id]);
    const variants = p.variant_group ? await db.all('SELECT slug, variant_label, price, stock FROM products WHERE variant_group = ? AND active = 1 ORDER BY price', [p.variant_group]) : [];
    const related = await db.all(`${PRODUCT_SELECT} WHERE p.category = ? AND p.id != ? AND p.active = 1 ORDER BY p.featured DESC, p.id DESC LIMIT 8`, [p.category, p.id]);
    return c.json({ ok: true, product: productOut(p, true), reviews, variants, related: related.map((r) => productOut(r)) });
  });
  app.post('/api/products/:slug/reviews', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const p = await db.get('SELECT id FROM products WHERE slug = ? AND active = 1', [c.req.param('slug')]);
    if (!p) throw fail('Product not found', 404);
    const name = str(b.name, 60), body = str(b.body, 1000), rating = Math.min(5, Math.max(1, toInt(b.rating, 5)));
    if (name.length < 2 || body.length < 5) throw fail('Please add your name and a short review.');
    await db.run('INSERT INTO reviews (product_id, name, rating, body, approved, created_at) VALUES (?,?,?,?,0,?)', [p.id, name, rating, body, now()]);
    return c.json({ ok: true, message: 'Thanks! Your review will appear after moderation.' });
  });

  // ---------- pricing engine (server is the source of truth) ----------
  async function couponCheck(code, subtotal) {
    code = str(code, 40).toUpperCase();
    if (!code) return { coupon: null, discount: 0 };
    const k = await db.get('SELECT * FROM coupons WHERE UPPER(code) = ?', [code]);
    if (!k || !k.active) throw fail('This coupon code is not valid.');
    if (k.starts_at && new Date(k.starts_at) > new Date()) throw fail('This coupon is not active yet.');
    if (k.expires_at && new Date(k.expires_at + (k.expires_at.length <= 10 ? 'T23:59:59+05:30' : '')) < new Date()) throw fail('This coupon has expired.');
    if (k.usage_limit && k.used_count >= k.usage_limit) throw fail('This coupon has reached its usage limit.');
    if (subtotal < (k.min_order || 0)) throw fail(`Add ₹${(k.min_order - subtotal).toLocaleString('en-IN')} more to use ${k.code} (min order ₹${k.min_order.toLocaleString('en-IN')}).`);
    let discount = k.type === 'percent' ? Math.floor((subtotal * k.value) / 100) : k.value;
    if (k.type === 'percent' && k.max_discount) discount = Math.min(discount, k.max_discount);
    discount = Math.max(0, Math.min(discount, subtotal));
    return { coupon: k, discount };
  }
  async function quote(items, couponCode, paymentMethod) {
    if (!Array.isArray(items) || !items.length) throw fail('Your cart is empty.');
    const lines = [];
    for (const it of items.slice(0, 50)) {
      const qty = Math.max(1, Math.min(99, toInt(it.qty, 1)));
      const p = await db.get('SELECT * FROM products WHERE id = ? AND active = 1', [toInt(it.id)]);
      if (!p) throw fail('A product in your cart is no longer available. Please refresh your cart.');
      if (!p.price) throw fail(`${p.name} is available on request — please contact us for a quote.`);
      if (p.stock < qty) throw fail(p.stock > 0 ? `Only ${p.stock} left of ${p.name}.` : `${p.name} is out of stock.`);
      const img = parseJSON(p.images, [])[0] || '';
      lines.push({ product_id: p.id, slug: p.slug, name: p.name, price: p.price, mrp: p.mrp, qty, image: img, line_total: p.price * qty });
    }
    const subtotal = lines.reduce((a, l) => a + l.line_total, 0);
    const { coupon, discount } = await couponCheck(couponCode, subtotal);
    const s = await getSettings();
    const after = subtotal - discount;
    const shipping = after >= toInt(s.free_shipping_over) ? 0 : toInt(s.shipping_fee);
    const codFee = paymentMethod === 'cod' ? toInt(s.cod_fee) : 0;
    return { lines, subtotal, discount, coupon_code: coupon ? coupon.code : null, coupon_id: coupon ? coupon.id : null, shipping: shipping + codFee, total: after + shipping + codFee,
      mrp_total: lines.reduce((a, l) => a + l.mrp * l.qty, 0) };
  }
  app.post('/api/cart/quote', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    try { return c.json({ ok: true, quote: await quote(b.items, b.coupon, b.payment_method) }); }
    catch (e) {
      if (e.publicMessage && b.coupon) { // retry without coupon so the cart still renders, with the coupon error
        const q = await quote(b.items, null, b.payment_method).catch(() => null);
        if (q) return c.json({ ok: true, quote: q, coupon_error: e.publicMessage });
      }
      throw e;
    }
  });
  app.post('/api/coupons/validate', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const { coupon, discount } = await couponCheck(b.code, toInt(b.subtotal));
    return c.json({ ok: true, code: coupon?.code, discount, description: coupon?.description || '' });
  });

  // ---------- orders ----------
  async function newOrderNo() {
    for (let i = 0; i < 5; i++) {
      const no = 'AKY' + Date.now().toString(36).toUpperCase().slice(-5) + Math.floor(Math.random() * 900 + 100);
      if (!(await db.get('SELECT id FROM orders WHERE order_no = ?', [no]))) return no;
    }
    return 'AKY' + randomToken(4).toUpperCase();
  }
  async function addEvent(orderId, status, note) {
    await db.run('INSERT INTO order_events (order_id, status, note, created_at) VALUES (?,?,?,?)', [orderId, status, note || '', now()]);
  }
  // stock + coupon usage are committed once: on payment success (prepaid) or on placement (COD)
  async function commitOrder(order) {
    if (order.committed) return;
    const items = await db.all('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    for (const it of items) await db.run('UPDATE products SET stock = CASE WHEN stock > ? THEN stock - ? ELSE 0 END WHERE id = ?', [it.qty, it.qty, it.product_id]);
    if (order.coupon_code) await db.run('UPDATE coupons SET used_count = used_count + 1 WHERE UPPER(code) = ?', [order.coupon_code.toUpperCase()]);
    await db.run('UPDATE orders SET committed = 1 WHERE id = ?', [order.id]);
  }
  async function markPaid(order, fields, note) {
    if (order.payment_status === 'paid') return;
    await db.run(`UPDATE orders SET payment_status = 'paid', status = CASE WHEN status = 'pending' THEN 'paid' ELSE status END, rzp_payment_id = COALESCE(?, rzp_payment_id),
      rzp_signature = COALESCE(?, rzp_signature), paid_at = ?, updated_at = ? WHERE id = ?`, [fields.payment_id || null, fields.signature || null, now(), now(), order.id]);
    await commitOrder(order);
    await addEvent(order.id, 'paid', note);
  }

  app.post('/api/orders', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const cu = b.customer || {};
    const customer = { name: str(cu.name, 80), phone: phone10(cu.phone), email: str(cu.email, 120), address: str(cu.address, 300), city: str(cu.city, 60), state: str(cu.state, 60), pincode: str(cu.pincode, 6) };
    if (customer.name.length < 2) throw fail('Please enter your full name.');
    if (!/^[6-9]\d{9}$/.test(customer.phone)) throw fail('Please enter a valid 10-digit mobile number.');
    if (customer.email && !/^\S+@\S+\.\S+$/.test(customer.email)) throw fail('Please enter a valid email address.');
    if (customer.address.length < 8 || !customer.city || !customer.state) throw fail('Please enter your full delivery address.');
    if (!/^\d{6}$/.test(customer.pincode)) throw fail('Please enter a valid 6-digit PIN code.');
    const pc = await paymentConfig();
    const method = b.payment_method === 'cod' ? 'cod' : 'online';
    if (method === 'cod' && !pc.cod) throw fail('Cash on delivery is not available right now.');
    if (method === 'online' && pc.provider === 'none') throw fail('Online payment is not configured yet. Please choose Cash on Delivery.');
    const q = await quote(b.items, b.coupon, method);
    const orderNo = await newOrderNo();
    const payMethod = method === 'cod' ? 'cod' : pc.provider; // razorpay | demo
    const r = await db.run(`INSERT INTO orders (order_no, customer_name, phone, email, address, city, state, pincode, subtotal, discount, shipping, total, coupon_code, payment_method, payment_mode,
        payment_status, status, notes, committed, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      [orderNo, customer.name, customer.phone, customer.email, customer.address, customer.city, customer.state, customer.pincode, q.subtotal, q.discount, q.shipping, q.total,
        q.coupon_code, payMethod, method === 'cod' ? 'cod' : pc.mode, 'pending', 'pending', str(b.notes, 500), now(), now()]);
    const orderId = r.lastId;
    for (const l of q.lines) await db.run('INSERT INTO order_items (order_id, product_id, name, price, qty, image) VALUES (?,?,?,?,?,?)', [orderId, l.product_id, l.name, l.price, l.qty, l.image]);
    await addEvent(orderId, 'pending', method === 'cod' ? 'Order placed — Cash on Delivery' : 'Order created — awaiting payment');
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    const out = { ok: true, order_no: orderNo, total: q.total, phone: customer.phone, payment_method: payMethod };
    if (method === 'cod') { await commitOrder(order); return c.json(out); }
    if (pc.provider === 'razorpay') {
      const res = await fetch((env.RAZORPAY_API_BASE || 'https://api.razorpay.com') + '/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa(pc.keyId + ':' + pc.keySecret) },
        body: JSON.stringify({ amount: q.total * 100, currency: 'INR', receipt: orderNo, notes: { order_no: orderNo, phone: customer.phone } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) {
        await db.run("UPDATE orders SET payment_status = 'failed', updated_at = ? WHERE id = ?", [now(), orderId]);
        await addEvent(orderId, 'pending', 'Razorpay order creation failed: ' + str(data?.error?.description || res.status, 200));
        throw fail('Payment gateway error: ' + (data?.error?.description || 'could not start payment') + '. Please try again or choose COD.', 502);
      }
      await db.run('UPDATE orders SET rzp_order_id = ? WHERE id = ?', [data.id, orderId]);
      out.razorpay = { key: pc.keyId, order_id: data.id, amount: data.amount, currency: data.currency, name: pc.settings.store_name || 'Akyoto Secure', mode: pc.mode,
        prefill: { name: customer.name, email: customer.email, contact: '+91' + customer.phone } };
    } else {
      out.demo = true; // no keys configured: clearly-labelled simulated payment (never available once keys are set)
    }
    return c.json(out);
  });

  app.post('/api/payments/verify', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const pc = await paymentConfig();
    if (pc.provider !== 'razorpay') throw fail('Razorpay is not configured.', 400);
    const order = await db.get('SELECT * FROM orders WHERE order_no = ?', [str(b.order_no, 40)]);
    if (!order || !order.rzp_order_id) throw fail('Order not found.', 404);
    if (b.razorpay_order_id !== order.rzp_order_id) throw fail('Payment does not match this order.', 400);
    const expected = await hmacHex(pc.keySecret, order.rzp_order_id + '|' + str(b.razorpay_payment_id, 60));
    if (!safeEqual(expected, str(b.razorpay_signature, 128))) {
      await addEvent(order.id, order.status, 'Payment signature verification FAILED');
      throw fail('Payment verification failed. If money was debited, contact us with your order number.', 400);
    }
    await markPaid(order, { payment_id: b.razorpay_payment_id, signature: b.razorpay_signature }, `Paid via Razorpay (${pc.mode}) — ${b.razorpay_payment_id}`);
    return c.json({ ok: true, order_no: order.order_no });
  });
  app.post('/api/payments/failed', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const order = await db.get('SELECT * FROM orders WHERE order_no = ?', [str(b.order_no, 40)]);
    if (order && order.payment_status === 'pending') {
      await db.run("UPDATE orders SET payment_status = 'failed', updated_at = ? WHERE id = ?", [now(), order.id]);
      await addEvent(order.id, order.status, 'Payment failed / cancelled: ' + str(b.reason, 200));
    }
    return c.json({ ok: true });
  });
  app.post('/api/payments/demo-confirm', async (c) => {
    const pc = await paymentConfig();
    if (pc.provider !== 'demo') throw fail('Demo payments are disabled because real Razorpay keys are configured.', 403);
    const b = await c.req.json().catch(() => ({}));
    const order = await db.get('SELECT * FROM orders WHERE order_no = ? AND payment_method = ?', [str(b.order_no, 40), 'demo']);
    if (!order) throw fail('Order not found.', 404);
    if (b.outcome === 'failure') {
      await db.run("UPDATE orders SET payment_status = 'failed', updated_at = ? WHERE id = ?", [now(), order.id]);
      await addEvent(order.id, order.status, 'DEMO payment failed (simulated)');
      return c.json({ ok: true, failed: true });
    }
    await markPaid(order, { payment_id: 'demo_' + randomToken(6) }, 'DEMO payment (simulated — no money collected). Add Razorpay keys to take real payments.');
    return c.json({ ok: true, order_no: order.order_no });
  });

  // Razorpay webhook: Dashboard → Settings → Webhooks → URL https://YOURDOMAIN/api/payments/webhook (events: payment.captured, payment.failed, order.paid, refund.processed)
  app.post('/api/payments/webhook', async (c) => {
    const pc = await paymentConfig();
    const raw = await c.req.text();
    if (!pc.webhookSecret) return c.json({ ok: false, error: 'Webhook secret not configured' }, 400);
    const sig = c.req.header('x-razorpay-signature') || '';
    const expected = await hmacHex(pc.webhookSecret, raw);
    if (!safeEqual(expected, sig)) return c.json({ ok: false, error: 'Invalid signature' }, 401);
    const evt = parseJSON(raw, {});
    const pay = evt?.payload?.payment?.entity || {};
    const rzpOrderId = pay.order_id || evt?.payload?.order?.entity?.id;
    const order = rzpOrderId ? await db.get('SELECT * FROM orders WHERE rzp_order_id = ?', [rzpOrderId]) : null;
    if (!order) return c.json({ ok: true, ignored: true });
    if (evt.event === 'payment.captured' || evt.event === 'order.paid') {
      if (pay.amount && pay.amount !== order.total * 100) { await addEvent(order.id, order.status, `Webhook amount mismatch: ${pay.amount} paise`); return c.json({ ok: true, mismatch: true }); }
      await markPaid(order, { payment_id: pay.id }, `Payment confirmed by Razorpay webhook (${evt.event})`);
    } else if (evt.event === 'payment.failed' && order.payment_status === 'pending') {
      await db.run("UPDATE orders SET payment_status = 'failed', updated_at = ? WHERE id = ?", [now(), order.id]);
      await addEvent(order.id, order.status, 'Payment failed (webhook): ' + str(pay.error_description, 200));
    } else if (evt.event === 'refund.processed') {
      await db.run("UPDATE orders SET payment_status = 'refunded', updated_at = ? WHERE id = ?", [now(), order.id]);
      await addEvent(order.id, order.status, 'Refund processed (webhook)');
    }
    return c.json({ ok: true });
  });

  app.get('/api/orders/track', async (c) => {
    const no = str(c.req.query('order_no'), 40).toUpperCase(), ph = phone10(c.req.query('phone'));
    const o = await db.get('SELECT * FROM orders WHERE UPPER(order_no) = ?', [no]);
    if (!o || o.phone !== ph) throw fail('No order found with that order ID and phone number.', 404);
    const items = await db.all('SELECT name, price, qty, image FROM order_items WHERE order_id = ?', [o.id]);
    const events = await db.all('SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id', [o.id]);
    return c.json({ ok: true, order: { order_no: o.order_no, name: o.customer_name, city: o.city, pincode: o.pincode, subtotal: o.subtotal, discount: o.discount, shipping: o.shipping,
      total: o.total, coupon_code: o.coupon_code, payment_method: o.payment_method, payment_status: o.payment_status, status: o.status, tracking_no: o.tracking_no,
      created_at: o.created_at, items, events: events.map((e) => ({ ...e, note: e.note.replace(/ — pay_\w+| — demo_\w+/, '') })) } });
  });

  app.post('/api/enquiries', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const name = str(b.name, 80), phone = str(b.phone, 20), email = str(b.email, 120), message = str(b.message, 2000);
    if (name.length < 2 || (!phone && !email) || message.length < 3) throw fail('Please add your name, a phone or email, and a message.');
    await db.run('INSERT INTO enquiries (name, email, phone, company, message, handled, created_at) VALUES (?,?,?,?,?,0,?)', [name, email, phone, str(b.company, 120), message, now()]);
    return c.json({ ok: true });
  });

  app.get('/uploads/:key', async (c) => {
    const f = await storage.get(c.req.param('key'));
    if (!f) return c.notFound();
    return new Response(f.body, { headers: { 'Content-Type': f.contentType || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' } });
  });

  // ---------- admin auth ----------
  async function sessionSecret() { return env.SESSION_SECRET || (await getSettings()).session_secret; }
  async function makeSession(adminId) {
    const payload = b64url(JSON.stringify({ a: adminId, e: Date.now() + 7 * 864e5 }));
    return payload + '.' + (await hmacHex(await sessionSecret(), payload));
  }
  async function readSession(c) {
    const t = getCookie(c, 'aky_admin') || '';
    const [payload, sig] = t.split('.');
    if (!payload || !sig) return null;
    if (!safeEqual(await hmacHex(await sessionSecret(), payload), sig)) return null;
    const d = parseJSON(unb64url(payload), null);
    if (!d || d.e < Date.now()) return null;
    return db.get('SELECT id, email FROM admins WHERE id = ?', [d.a]);
  }
  const loginAttempts = new Map();
  app.post('/api/admin/login', async (c) => {
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'local';
    const at = loginAttempts.get(ip) || { n: 0, t: Date.now() };
    if (Date.now() - at.t > 15 * 60e3) { at.n = 0; at.t = Date.now(); }
    if (at.n >= 10) throw fail('Too many attempts. Try again in 15 minutes.', 429);
    const b = await c.req.json().catch(() => ({}));
    const a = await db.get('SELECT * FROM admins WHERE email = ?', [str(b.email, 120).toLowerCase()]);
    const ok = a && safeEqual((await hashPassword(String(b.password || ''), a.salt)).hash, a.pass_hash);
    if (!ok) { at.n++; loginAttempts.set(ip, at); throw fail('Wrong email or password.', 401); }
    loginAttempts.delete(ip);
    setCookie(c, 'aky_admin', await makeSession(a.id), { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 7 * 86400, secure: new URL(c.req.url).protocol === 'https:' });
    return c.json({ ok: true, email: a.email });
  });
  app.post('/api/admin/logout', (c) => { deleteCookie(c, 'aky_admin', { path: '/' }); return c.json({ ok: true }); });
  app.use('/api/admin/*', async (c, next) => {
    if (c.req.path === '/api/admin/login' || c.req.path === '/api/admin/logout') return next();
    if (c.req.path === '/api/admin/me') { const me = await readSession(c); return me ? c.json({ ok: true, admin: me }) : c.json({ ok: false, logged_out: true }); }
    const a = await readSession(c);
    if (!a) return c.json({ ok: false, error: 'Please log in.' }, 401);
    c.set('admin', a);
    await next();
  });
  app.get('/api/admin/me', (c) => c.json({ ok: true, admin: c.get('admin') }));
  app.post('/api/admin/password', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const a = await db.get('SELECT * FROM admins WHERE id = ?', [c.get('admin').id]);
    if (!safeEqual((await hashPassword(String(b.current || ''), a.salt)).hash, a.pass_hash)) throw fail('Current password is wrong.');
    if (String(b.new_password || '').length < 8) throw fail('New password must be at least 8 characters.');
    const { hash, salt } = await hashPassword(String(b.new_password));
    const email = b.email ? str(b.email, 120).toLowerCase() : a.email;
    await db.run('UPDATE admins SET pass_hash = ?, salt = ?, email = ? WHERE id = ?', [hash, salt, email, a.id]);
    return c.json({ ok: true });
  });

  // ---------- admin: dashboard ----------
  app.get('/api/admin/dashboard', async (c) => {
    const paid = "payment_status = 'paid' AND status != 'cancelled'";
    const tot = await db.get(`SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders WHERE ${paid}`);
    const all = await db.get('SELECT COUNT(*) AS n FROM orders');
    const cod = await db.get("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS v FROM orders WHERE payment_method = 'cod' AND status NOT IN ('cancelled')");
    const byStatus = await db.all('SELECT status, COUNT(*) AS n FROM orders GROUP BY status');
    const since = new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10);
    const daily = await db.all(`SELECT substr(created_at,1,10) AS day, COUNT(*) AS orders, COALESCE(SUM(CASE WHEN ${paid} OR (payment_method='cod' AND status!='cancelled') THEN total ELSE 0 END),0) AS revenue
      FROM orders WHERE substr(created_at,1,10) >= ? GROUP BY day ORDER BY day`, [since]);
    const top = await db.all(`SELECT oi.name, SUM(oi.qty) AS qty, SUM(oi.qty*oi.price) AS revenue FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status != 'cancelled' AND (o.payment_status = 'paid' OR o.payment_method = 'cod') GROUP BY oi.name ORDER BY qty DESC LIMIT 5`);
    const low = await db.all('SELECT id, name, stock FROM products WHERE active = 1 AND stock <= 5 AND price > 0 ORDER BY stock LIMIT 8');
    const recent = await db.all('SELECT order_no, customer_name, total, status, payment_status, payment_method, created_at FROM orders ORDER BY id DESC LIMIT 6');
    const counts = await db.get(`SELECT (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM products WHERE active=1) AS active_products,
      (SELECT COUNT(*) FROM coupons WHERE active=1) AS coupons, (SELECT COUNT(*) FROM enquiries WHERE handled=0) AS enquiries, (SELECT COUNT(*) FROM reviews WHERE approved=0) AS reviews`);
    const pc = await paymentConfig();
    const N = (x) => Number(x || 0);
    daily.forEach((d) => { d.revenue = N(d.revenue); d.orders = N(d.orders); }); top.forEach((t) => { t.qty = N(t.qty); t.revenue = N(t.revenue); });
    return c.json({ ok: true, revenue: N(tot.revenue), paid_orders: tot.orders, total_orders: all.n, cod_open: { n: N(cod.n), v: N(cod.v) }, aov: tot.orders ? Math.round(N(tot.revenue) / N(tot.orders)) : 0,
      by_status: byStatus, daily, top, low_stock: low, recent, counts, payments: { provider: pc.provider, mode: pc.mode, keys_from: pc.keysFrom } });
  });

  // ---------- admin: products ----------
  app.get('/api/admin/products', async (c) => {
    const rows = await db.all(`${PRODUCT_SELECT} ORDER BY p.id DESC`);
    return c.json({ ok: true, products: rows.map((r) => productOut(r, true)) });
  });
  function productFields(b) {
    const f = {};
    if ('name' in b) f.name = str(b.name, 160);
    if ('slug' in b) f.slug = slugify(b.slug || b.name);
    for (const k of ['sku', 'category', 'brand', 'variant_group', 'variant_label']) if (k in b) f[k] = str(b[k], 80) || (k.startsWith('variant') ? null : '');
    if ('short_desc' in b) f.short_desc = str(b.short_desc, 600);
    if ('description' in b) f.description = String(b.description || '').slice(0, 30000).replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    for (const k of ['price', 'mrp', 'stock']) if (k in b) f[k] = Math.max(0, toInt(b[k]));
    for (const k of ['active', 'featured']) if (k in b) f[k] = b[k] ? 1 : 0;
    if ('images' in b) f.images = JSON.stringify((Array.isArray(b.images) ? b.images : []).map((x) => str(x, 300)).filter(Boolean).slice(0, 12));
    if ('specs' in b) f.specs = JSON.stringify((Array.isArray(b.specs) ? b.specs : []).filter((r) => Array.isArray(r) && r[0]).map((r) => [str(r[0], 80), str(r[1], 300)]).slice(0, 40));
    return f;
  }
  app.post('/api/admin/products', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const f = productFields({ active: 1, featured: 0, stock: 0, images: [], specs: [], ...b, slug: b.slug || b.name });
    if (!f.name) throw fail('Product name is required.');
    if (f.mrp < f.price) f.mrp = f.price;
    let slug = f.slug, n = 2;
    while (await db.get('SELECT id FROM products WHERE slug = ?', [slug])) slug = f.slug + '-' + n++;
    f.slug = slug; f.created_at = now(); f.updated_at = now();
    const keys = Object.keys(f);
    const r = await db.run(`INSERT INTO products (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => f[k]));
    return c.json({ ok: true, id: r.lastId, slug });
  });
  app.put('/api/admin/products/:id', async (c) => {
    const id = toInt(c.req.param('id'));
    const b = await c.req.json().catch(() => ({}));
    const f = productFields(b);
    if ('name' in f && !f.name) throw fail('Product name is required.');
    if (f.slug && (await db.get('SELECT id FROM products WHERE slug = ? AND id != ?', [f.slug, id]))) throw fail('Another product already uses that URL slug.');
    f.updated_at = now();
    const keys = Object.keys(f);
    await db.run(`UPDATE products SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ?`, [...keys.map((k) => f[k]), id]);
    return c.json({ ok: true });
  });
  app.delete('/api/admin/products/:id', async (c) => {
    const id = toInt(c.req.param('id'));
    const used = await db.get('SELECT COUNT(*) AS n FROM order_items WHERE product_id = ?', [id]);
    if (used.n) { await db.run('UPDATE products SET active = 0 WHERE id = ?', [id]); return c.json({ ok: true, archived: true, message: 'This product has orders, so it was hidden (deactivated) instead of deleted.' }); }
    await db.run('DELETE FROM reviews WHERE product_id = ?', [id]);
    await db.run('DELETE FROM products WHERE id = ?', [id]);
    return c.json({ ok: true });
  });
  app.post('/api/admin/upload', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    const m = /^data:(image\/(png|jpeg|webp|gif|avif));base64,(.+)$/.exec(String(b.data_url || ''));
    if (!m) throw fail('Upload a PNG, JPG or WebP image.');
    const bin = Uint8Array.from(atob(m[3]), (ch) => ch.charCodeAt(0));
    if (bin.length > 4 * 1024 * 1024) throw fail('Image is too large (max 4 MB).');
    const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
    const key = Date.now().toString(36) + '-' + randomToken(4) + '.' + ext;
    await storage.put(key, bin, m[1]);
    return c.json({ ok: true, url: '/uploads/' + key });
  });

  // ---------- admin: orders ----------
  app.get('/api/admin/orders', async (c) => {
    const q = c.req.query();
    const where = [], params = [];
    if (q.status) { where.push('status = ?'); params.push(q.status); }
    if (q.payment_status) { where.push('payment_status = ?'); params.push(q.payment_status); }
    if (q.payment_method) { where.push('payment_method = ?'); params.push(q.payment_method); }
    if (q.from) { where.push('substr(created_at,1,10) >= ?'); params.push(q.from); }
    if (q.to) { where.push('substr(created_at,1,10) <= ?'); params.push(q.to); }
    if (q.q) { where.push('(order_no LIKE ? OR customer_name LIKE ? OR phone LIKE ? OR email LIKE ?)'); const s = '%' + str(q.q, 60) + '%'; params.push(s, s, s, s); }
    const rows = await db.all(`SELECT o.*, (SELECT SUM(qty) FROM order_items WHERE order_id = o.id) AS item_count FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 500`, params);
    if (q.format === 'csv') {
      const cols = ['order_no', 'created_at', 'customer_name', 'phone', 'email', 'address', 'city', 'state', 'pincode', 'subtotal', 'discount', 'shipping', 'total', 'coupon_code', 'payment_method', 'payment_status', 'status', 'rzp_order_id', 'rzp_payment_id', 'tracking_no'];
      const csv = [cols.join(',')].concat(rows.map((r) => cols.map((k) => escapeCsv(r[k])).join(','))).join('\n');
      return new Response(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="akyoto-orders.csv"' } });
    }
    return c.json({ ok: true, orders: rows.map(({ rzp_signature, ...r }) => r) });
  });
  app.get('/api/admin/orders/:id', async (c) => {
    const o = await db.get('SELECT * FROM orders WHERE id = ?', [toInt(c.req.param('id'))]);
    if (!o) throw fail('Order not found', 404);
    const items = await db.all('SELECT * FROM order_items WHERE order_id = ?', [o.id]);
    const events = await db.all('SELECT * FROM order_events WHERE order_id = ? ORDER BY id', [o.id]);
    delete o.rzp_signature;
    return c.json({ ok: true, order: o, items, events });
  });
  app.put('/api/admin/orders/:id', async (c) => {
    const o = await db.get('SELECT * FROM orders WHERE id = ?', [toInt(c.req.param('id'))]);
    if (!o) throw fail('Order not found', 404);
    const b = await c.req.json().catch(() => ({}));
    const status = b.status && ORDER_STATUSES.includes(b.status) ? b.status : o.status;
    const pstatus = b.payment_status && PAYMENT_STATUSES.includes(b.payment_status) ? b.payment_status : o.payment_status;
    const tracking = 'tracking_no' in b ? str(b.tracking_no, 80) : o.tracking_no;
    await db.run('UPDATE orders SET status = ?, payment_status = ?, tracking_no = ?, updated_at = ? WHERE id = ?', [status, pstatus, tracking, now(), o.id]);
    if (pstatus === 'paid' && o.payment_status !== 'paid') await commitOrder(o);
    if (status === 'cancelled' && o.status !== 'cancelled' && o.committed) {
      const items = await db.all('SELECT * FROM order_items WHERE order_id = ?', [o.id]);
      for (const it of items) await db.run('UPDATE products SET stock = stock + ? WHERE id = ?', [it.qty, it.product_id]);
      await db.run('UPDATE orders SET committed = 0 WHERE id = ?', [o.id]);
    }
    const changes = [];
    if (status !== o.status) changes.push('Status → ' + status);
    if (pstatus !== o.payment_status) changes.push('Payment → ' + pstatus);
    if (tracking !== o.tracking_no && tracking) changes.push('Tracking: ' + tracking);
    if (changes.length || b.note) await addEvent(o.id, status, [changes.join(' · '), str(b.note, 300)].filter(Boolean).join(' — ') + ` (by ${c.get('admin').email})`);
    return c.json({ ok: true });
  });

  // ---------- admin: coupons ----------
  function couponFields(b) {
    const f = {};
    if ('code' in b) f.code = str(b.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if ('type' in b) f.type = b.type === 'flat' ? 'flat' : 'percent';
    for (const k of ['value', 'min_order', 'max_discount', 'usage_limit']) if (k in b) f[k] = Math.max(0, toInt(b[k]));
    if ('expires_at' in b) f.expires_at = str(b.expires_at, 25) || null;
    if ('starts_at' in b) f.starts_at = str(b.starts_at, 25) || null;
    if ('active' in b) f.active = b.active ? 1 : 0;
    if ('description' in b) f.description = str(b.description, 200);
    return f;
  }
  app.get('/api/admin/coupons', async (c) => c.json({ ok: true, coupons: await db.all('SELECT * FROM coupons ORDER BY id DESC') }));
  app.post('/api/admin/coupons', async (c) => {
    const f = couponFields({ type: 'percent', active: 1, ...(await c.req.json().catch(() => ({}))) });
    if (!f.code) throw fail('Coupon code is required.');
    if (!f.value) throw fail('Discount value is required.');
    if (f.type === 'percent' && f.value > 90) throw fail('Percent discount must be 90% or less.');
    if (await db.get('SELECT id FROM coupons WHERE UPPER(code) = ?', [f.code])) throw fail('That coupon code already exists.');
    f.created_at = now(); f.used_count = 0;
    const keys = Object.keys(f);
    const r = await db.run(`INSERT INTO coupons (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => f[k]));
    return c.json({ ok: true, id: r.lastId });
  });
  app.put('/api/admin/coupons/:id', async (c) => {
    const id = toInt(c.req.param('id'));
    const f = couponFields(await c.req.json().catch(() => ({})));
    if ('code' in f && !f.code) throw fail('Coupon code is required.');
    if (f.code && (await db.get('SELECT id FROM coupons WHERE UPPER(code) = ? AND id != ?', [f.code, id]))) throw fail('That coupon code already exists.');
    if (f.type === 'percent' && f.value > 90) throw fail('Percent discount must be 90% or less.');
    const keys = Object.keys(f);
    if (keys.length) await db.run(`UPDATE coupons SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ?`, [...keys.map((k) => f[k]), id]);
    return c.json({ ok: true });
  });
  app.delete('/api/admin/coupons/:id', async (c) => { await db.run('DELETE FROM coupons WHERE id = ?', [toInt(c.req.param('id'))]); return c.json({ ok: true }); });

  // ---------- admin: reviews, enquiries ----------
  app.get('/api/admin/reviews', async (c) => c.json({ ok: true, reviews: await db.all('SELECT r.*, p.name AS product_name, p.slug FROM reviews r LEFT JOIN products p ON p.id = r.product_id ORDER BY r.approved, r.id DESC LIMIT 300') }));
  app.put('/api/admin/reviews/:id', async (c) => { const b = await c.req.json().catch(() => ({})); await db.run('UPDATE reviews SET approved = ? WHERE id = ?', [b.approved ? 1 : 0, toInt(c.req.param('id'))]); return c.json({ ok: true }); });
  app.delete('/api/admin/reviews/:id', async (c) => { await db.run('DELETE FROM reviews WHERE id = ?', [toInt(c.req.param('id'))]); return c.json({ ok: true }); });
  app.get('/api/admin/enquiries', async (c) => c.json({ ok: true, enquiries: await db.all('SELECT * FROM enquiries ORDER BY handled, id DESC LIMIT 300') }));
  app.put('/api/admin/enquiries/:id', async (c) => { const b = await c.req.json().catch(() => ({})); await db.run('UPDATE enquiries SET handled = ? WHERE id = ?', [b.handled ? 1 : 0, toInt(c.req.param('id'))]); return c.json({ ok: true }); });
  app.delete('/api/admin/enquiries/:id', async (c) => { await db.run('DELETE FROM enquiries WHERE id = ?', [toInt(c.req.param('id'))]); return c.json({ ok: true }); });

  // ---------- admin: settings ----------
  const SETTING_KEYS = ['store_name', 'support_phone', 'support_phone_2', 'whatsapp', 'support_email', 'sales_email', 'address', 'gstin', 'shipping_fee', 'free_shipping_over', 'cod_enabled', 'cod_fee', 'demo_payments', 'razorpay_key_id', 'razorpay_key_secret', 'razorpay_webhook_secret'];
  const mask = (v) => (v ? '••••••' + String(v).slice(-4) : '');
  app.get('/api/admin/settings', async (c) => {
    const s = await getSettings(); const pc = await paymentConfig();
    const out = {};
    for (const k of SETTING_KEYS) out[k] = s[k] ?? '';
    out.razorpay_key_secret = mask(s.razorpay_key_secret); out.razorpay_webhook_secret = mask(s.razorpay_webhook_secret);
    return c.json({ ok: true, settings: out, payments: { provider: pc.provider, mode: pc.mode, keys_from: pc.keysFrom, env_override: !!env.RAZORPAY_KEY_ID, webhook: !!pc.webhookSecret },
      webhook_url: new URL('/api/payments/webhook', c.req.url).toString() });
  });
  app.put('/api/admin/settings', async (c) => {
    const b = await c.req.json().catch(() => ({}));
    for (const k of SETTING_KEYS) {
      if (!(k in b)) continue;
      let v = str(b[k], 300);
      if ((k === 'razorpay_key_secret' || k === 'razorpay_webhook_secret') && v.startsWith('••')) continue; // unchanged mask
      if (k === 'razorpay_key_id' && v && !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(v)) throw fail('Razorpay Key ID should look like rzp_test_xxxx or rzp_live_xxxx.');
      await setSetting(k, v);
    }
    return c.json({ ok: true });
  });

  app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ ok: false, error: 'Not found' }, 404) : c.text('Not found', 404)));
  return app;
}
