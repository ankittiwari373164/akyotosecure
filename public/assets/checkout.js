/* Checkout: validation, server-side order, Razorpay Checkout / demo / COD */
document.addEventListener('DOMContentLoaded', async () => {
  if (!Cart.get().length) { location.replace('/cart'); return; }
  const cfg = await config(); const pay = cfg.payments;
  const opts = [];
  if (pay.provider !== 'none') opts.push(`<label><input type="radio" name="pm" value="online" checked><span><b>Pay online ${pay.provider === 'demo' ? '<span class="badge badge-amber">DEMO</span>' : pay.mode === 'test' ? '<span class="badge badge-navy">TEST MODE</span>' : ''}</b><small>UPI, cards, net banking and wallets via Razorpay</small></span></label>`);
  if (pay.cod) opts.push(`<label><input type="radio" name="pm" value="cod" ${pay.provider === 'none' ? 'checked' : ''}><span><b>Cash on Delivery</b><small>Pay when your order arrives${pay.cod_fee ? ` (+${fmt(pay.cod_fee)} COD fee)` : ''}</small></span></label>`);
  $('#paym').innerHTML = opts.join('') || '<p class="muted">Payments are not configured yet. Please contact us on WhatsApp to order.</p>';
  $('#modenote').innerHTML = pay.provider === 'demo' ? '<div class="mode-note demo"><b>Demo payments:</b> Razorpay keys are not added yet, so online payment is simulated and no money is charged.</div>'
    : pay.mode === 'test' ? '<div class="mode-note test"><b>Razorpay test mode:</b> use Razorpay test cards/UPI (e.g. success@razorpay). No real money moves.</div>' : '';
  const pm = () => $('input[name=pm]:checked')?.value || 'online';
  let quote;
  const saved = JSON.parse(localStorage.getItem('aky_addr') || '{}');
  for (const [k, v] of Object.entries(saved)) { const el = $(`#cform [name=${k}]`); if (el) el.value = v; }
  let drawCoupon;
  const render = async () => {
    quote = await getQuote(pm()); if (!quote || quote.error) return;
    $('#mini').innerHTML = quote.lines.map((l) => `<div style="display:flex;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)"><img src="${esc(l.image)}" alt="" style="width:52px;height:52px;object-fit:contain;background:var(--bg);border-radius:10px"><div style="flex:1;font-size:14px"><b>${esc(l.name)}</b><div class="muted small">Qty ${l.qty}</div></div><b>${fmt(l.line_total)}</b></div>`).join('');
    $('#totals').innerHTML = totalsHTML(quote, cfg);
    $('#place').textContent = (pm() === 'cod' ? 'Place COD order · ' : 'Pay securely · ') + fmt(quote.total);
    drawCoupon(quote);
  };
  drawCoupon = couponUI(render);
  $('#paym').addEventListener('change', render);
  render();

  const rules = { name: (v) => v.trim().length >= 2, phone: (v) => /^[6-9]\d{9}$/.test(v.replace(/\D/g, '').slice(-10)), email: (v) => !v || /^\S+@\S+\.\S+$/.test(v), address: (v) => v.trim().length >= 8, city: (v) => !!v.trim(), state: (v) => !!v, pincode: (v) => /^\d{6}$/.test(v) };
  const validate = () => { let ok = true, first; for (const [k, fn] of Object.entries(rules)) { const el = $(`#cform [name=${k}]`); const good = fn(el.value); el.closest('.field').classList.toggle('err', !good); if (!good) { ok = false; first = first || el; } } if (first) first.focus(); return ok; };
  $$('#cform input,#cform select,#cform textarea').forEach((el) => el.addEventListener('input', () => el.closest('.field')?.classList.remove('err')));

  const done = (orderNo, phone) => { sessionStorage.setItem('aky_last', JSON.stringify({ orderNo, phone })); Cart.clear(); Cart.coupon(''); location.href = `/order-success?order=${encodeURIComponent(orderNo)}`; };
  const btn = $('#place');
  const busy = (b) => { btn.disabled = b; btn.style.opacity = b ? '.7' : ''; if (b) btn.textContent = 'Processing…'; };
  btn.addEventListener('click', async () => {
    if (!validate()) { toast('Please fill in the highlighted fields', true); return; }
    const f = Object.fromEntries(new FormData($('#cform')));
    localStorage.setItem('aky_addr', JSON.stringify({ name: f.name, phone: f.phone, email: f.email, address: f.address, city: f.city, state: f.state, pincode: f.pincode }));
    busy(true);
    let res;
    try { res = await api('/api/orders', { method: 'POST', body: { items: Cart.get().map((x) => ({ id: x.id, qty: x.qty })), coupon: Cart.coupon(), payment_method: pm(), notes: f.notes, customer: f } }); }
    catch (e) { toast(esc(e.message), true); busy(false); render(); return; }
    if (res.payment_method === 'cod') return done(res.order_no, res.phone);
    if (res.demo) {
      const m = $('#demoModal'); $('#damt').textContent = fmt(res.total); $('#dord').textContent = 'Order ' + res.order_no; m.classList.add('open');
      $$('[data-demo]', m).forEach((b) => (b.onclick = async () => {
        try { const r = await api('/api/payments/demo-confirm', { method: 'POST', body: { order_no: res.order_no, outcome: b.dataset.demo } });
          if (r.failed) { m.classList.remove('open'); toast('Payment failed (simulated). You can try again.', true); busy(false); render(); } else done(res.order_no, res.phone);
        } catch (e) { toast(esc(e.message), true); }
      }));
      return;
    }
    // real Razorpay Checkout (test or live keys)
    await new Promise((ok, no) => { if (window.Razorpay) return ok(); const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); })
      .catch(() => { toast('Could not load Razorpay. Check your connection and try again.', true); busy(false); });
    if (!window.Razorpay) return;
    const rz = new Razorpay({
      key: res.razorpay.key, amount: res.razorpay.amount, currency: res.razorpay.currency, order_id: res.razorpay.order_id, name: res.razorpay.name,
      description: 'Order ' + res.order_no, image: location.origin + '/img/favicon.svg', prefill: res.razorpay.prefill, notes: { order_no: res.order_no }, theme: { color: '#282c6e' },
      handler: async (r) => {
        try { await api('/api/payments/verify', { method: 'POST', body: { order_no: res.order_no, ...r } }); done(res.order_no, res.phone); }
        catch (e) { toast(esc(e.message), true); busy(false); }
      },
      modal: { ondismiss: () => { busy(false); render(); toast('Payment cancelled. Your cart is saved.'); } },
    });
    rz.on('payment.failed', (r) => { api('/api/payments/failed', { method: 'POST', body: { order_no: res.order_no, reason: r.error?.description } }).catch(() => {}); });
    rz.open();
  });
});
