/* Cart page + shared quote rendering (also used by checkout) */
async function getQuote(paymentMethod) {
  const items = Cart.get().map((x) => ({ id: x.id, qty: x.qty }));
  if (!items.length) return null;
  try {
    const r = await api('/api/cart/quote', { method: 'POST', body: { items, coupon: Cart.coupon(), payment_method: paymentMethod } });
    if (r.coupon_error) { Cart.coupon(''); toast(esc(r.coupon_error), true); }
    // sync prices/names from server
    const byId = Object.fromEntries(r.quote.lines.map((l) => [l.product_id, l]));
    Cart.set(Cart.get().filter((x) => byId[x.id]).map((x) => ({ ...x, price: byId[x.id].price, name: byId[x.id].name, qty: byId[x.id].qty })));
    return r.quote;
  } catch (e) { toast(esc(e.message), true); return { error: e.message }; }
}
function totalsHTML(q, cfg) {
  return `<div class="row"><span>Subtotal (${Cart.count()} items)</span><b>${fmt(q.subtotal)}</b></div>
    ${q.mrp_total > q.subtotal ? `<div class="row small" style="color:#0b8a4c"><span>You save on MRP</span><b>− ${fmt(q.mrp_total - q.subtotal)}</b></div>` : ''}
    ${q.discount ? `<div class="row" style="color:#0b8a4c"><span>Coupon ${esc(q.coupon_code)}</span><b>− ${fmt(q.discount)}</b></div>` : ''}
    <div class="row"><span>Shipping</span><b>${q.shipping ? fmt(q.shipping) : '<span style="color:#0b8a4c">FREE</span>'}</b></div>
    <div class="row total"><span>Total</span><span>${fmt(q.total)}</span></div>`;
}
function couponUI(onChange) {
  const inp = $('#coupon'), msg = $('#cmsg');
  const draw = (q) => {
    if (q && q.coupon_code) { inp.parentElement.style.display = 'none'; msg.innerHTML = `<div class="coupon-ok"><span>🎉 ${esc(q.coupon_code)} applied · you save ${fmt(q.discount)}</span><button id="rmc" style="text-decoration:underline">Remove</button></div>`; $('#rmc').onclick = () => { Cart.coupon(''); onChange(); }; }
    else { inp.parentElement.style.display = ''; msg.innerHTML = ''; }
  };
  const apply = async () => {
    const code = inp.value.trim().toUpperCase(); if (!code) return;
    const sub = Cart.get().reduce((a, x) => a + x.price * x.qty, 0);
    try { await api('/api/coupons/validate', { method: 'POST', body: { code, subtotal: sub } }); Cart.coupon(code); inp.value = ''; toast('Coupon applied 🎉'); onChange(); }
    catch (e) { msg.innerHTML = `<p class="small" style="color:var(--red-2);margin-bottom:8px">${esc(e.message)}</p>`; inp.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 300 }); }
  };
  $('#applyc').onclick = apply; inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
  return draw;
}
if (location.pathname.replace(/\.html$/, '') === '/cart') document.addEventListener('DOMContentLoaded', async () => {
  const cfg = await config();
  let drawCoupon;
  const render = async () => {
    const items = Cart.get();
    if (!items.length) {
      $('#lines').innerHTML = `<div class="panel-card center"><div style="font-size:56px">🛒</div><h2>Your cart is empty</h2><p class="muted" style="margin:8px 0 18px">Start with an alarm system or build a complete kit.</p><a class="btn btn-red" href="/shop">Shop products</a> <a class="btn btn-line" href="/kit-builder">Build a kit</a></div>`;
      $('#summary').style.display = 'none'; return;
    }
    const q = await getQuote(); if (!q || q.error) return;
    $('#lines').innerHTML = Cart.get().map((x) => `<div class="cline" data-id="${x.id}"><a href="/product?slug=${encodeURIComponent(x.slug)}"><img src="${esc(x.image)}" alt=""></a>
      <div><h4><a href="/product?slug=${encodeURIComponent(x.slug)}">${esc(x.name)}</a></h4><div class="price" style="margin:4px 0"><b style="font-size:16px">${fmt(x.price)}</b>${x.mrp > x.price ? `<s>${fmt(x.mrp)}</s>` : ''}</div>
      <div class="qty sm"><button data-d="-1">−</button><input value="${x.qty}" readonly aria-label="Quantity"><button data-d="1">+</button></div> <button class="rm" data-rm>Remove</button></div>
      <b>${fmt(x.price * x.qty)}</b></div>`).join('');
    $('#totals').innerHTML = totalsHTML(q, cfg);
    const left = cfg.shipping.free_over - (q.subtotal - q.discount);
    $('#shipmsg').innerHTML = left > 0 ? `Add <b>${fmt(left)}</b> more for <b>FREE shipping</b>` : '🎉 You\'ve unlocked <b>FREE shipping</b>';
    $('#shipbar').style.width = Math.min(100, ((q.subtotal - q.discount) / cfg.shipping.free_over) * 100) + '%';
    drawCoupon(q);
  };
  drawCoupon = couponUI(render);
  $('#lines').addEventListener('click', (e) => {
    const line = e.target.closest('.cline'); if (!line) return; const id = +line.dataset.id;
    const b = e.target.closest('[data-d]'); if (b) { const it = Cart.get().find((x) => x.id === id); Cart.setQty(id, it.qty + +b.dataset.d); render(); }
    if (e.target.closest('[data-rm]')) { line.classList.add('out'); setTimeout(() => { Cart.remove(id); render(); }, 300); }
  });
  render();
  try { const all = await products(); const inCart = new Set(Cart.get().map((x) => x.id));
    const ups = all.filter((p) => ['Wireless Sensors', 'Alarm Siren', 'Accessories'].includes(p.category) && p.price && !inCart.has(p.id)).slice(0, 10);
    if (ups.length && Cart.get().length) { $('#upsell-wrap').style.display = ''; $('#upsell').innerHTML = ups.map(productCard).join(''); bindCards($('#upsell'), () => all); $('#upsell').addEventListener('click', (e) => { if (e.target.closest('[data-add]')) setTimeout(render, 50); }); }
  } catch {}
});
