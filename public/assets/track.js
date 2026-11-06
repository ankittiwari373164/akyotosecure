document.addEventListener('DOMContentLoaded', () => {
  const f = $('#tform');
  const steps = [['pending', 'Placed', '📝'], ['paid', 'Confirmed', '✅'], ['shipped', 'Shipped', '🚚'], ['delivered', 'Delivered', '🏠']];
  const run = async () => {
    const no = f.order_no.value.trim(), ph = f.phone.value.trim(); if (!no || !ph) return;
    $('#tres').innerHTML = '<div class="skeleton" style="min-height:200px"></div>';
    try {
      const { order: o } = await api(`/api/orders/track?order_no=${encodeURIComponent(no)}&phone=${encodeURIComponent(ph)}`);
      const idx = o.status === 'cancelled' ? -1 : Math.max(0, steps.findIndex((s) => s[0] === o.status));
      $('#tres').innerHTML = `<div class="panel-card reveal"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px"><div><span class="small muted">Order</span><h2 style="font-size:24px">${esc(o.order_no)}</h2><span class="small muted">Placed ${new Date(o.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
        <div style="text-align:right"><span class="badge ${o.status === 'cancelled' ? 'badge-red' : 'badge-green'}" style="font-size:14px">${esc(o.status.toUpperCase())}</span><div class="small muted" style="margin-top:6px">Payment: ${esc(o.payment_status)} · ${o.payment_method === 'cod' ? 'COD' : o.payment_method === 'demo' ? 'Online (demo)' : 'Online'}</div></div></div>
        ${o.status === 'cancelled' ? '<p style="margin-top:20px;color:var(--red-2);font-weight:700">This order was cancelled. Contact us if you have questions.</p>' : `<div class="timeline"><div class="bar" id="tlbar"></div>${steps.map((s, i) => `<div class="tl ${i <= idx ? 'done' : ''} ${i === idx ? 'cur' : ''}"><i>${i <= idx ? '✓' : s[2]}</i>${s[1]}</div>`).join('')}</div>`}
        ${o.tracking_no ? `<p><b>Courier tracking:</b> ${esc(o.tracking_no)}</p>` : ''}
        <div class="split" style="align-items:start;margin-top:20px;gap:24px"><div><h3 style="font-size:17px;margin-bottom:10px">Items</h3>${o.items.map((i) => `<div style="display:flex;gap:10px;align-items:center;padding:6px 0"><img src="${esc(i.image)}" alt="" style="width:46px;height:46px;object-fit:contain;background:var(--bg);border-radius:8px"><span style="flex:1;font-size:14px">${esc(i.name)} × ${i.qty}</span><b>${fmt(i.price * i.qty)}</b></div>`).join('')}
        <div style="border-top:1px dashed var(--line);margin-top:8px;padding-top:8px;font-size:14px">${o.discount ? `<div style="display:flex;justify-content:space-between"><span>Discount ${esc(o.coupon_code || '')}</span><span>− ${fmt(o.discount)}</span></div>` : ''}<div style="display:flex;justify-content:space-between"><span>Shipping</span><span>${o.shipping ? fmt(o.shipping) : 'FREE'}</span></div><div style="display:flex;justify-content:space-between;font-weight:800;font-size:17px"><span>Total</span><span>${fmt(o.total)}</span></div></div></div>
        <div><h3 style="font-size:17px;margin-bottom:10px">Updates</h3><ul class="events">${o.events.slice().reverse().map((e) => `<li><b>${esc(e.note || e.status)}</b><div class="small muted">${new Date(e.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div></li>`).join('')}</ul></div></div></div>`;
      observeReveals($('#tres')); setTimeout(() => { const b = $('#tlbar'); if (b) b.style.width = (idx / (steps.length - 1)) * 88 + '%'; }, 200);
    } catch (e) { $('#tres').innerHTML = `<div class="panel-card center"><h3>Order not found</h3><p class="muted">${esc(e.message)} Check the order ID from your confirmation and the mobile number used at checkout.</p></div>`; }
  };
  f.addEventListener('submit', (e) => { e.preventDefault(); run(); });
  if (qs('order')) { f.order_no.value = qs('order'); if (qs('phone')) { f.phone.value = qs('phone'); run(); } }
});
