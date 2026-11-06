document.addEventListener('DOMContentLoaded', async () => {
  const no = qs('order'); const last = JSON.parse(sessionStorage.getItem('aky_last') || '{}');
  $('#ono').textContent = no || '—';
  if (no) $('#trackLink').href = `/track?order=${encodeURIComponent(no)}${last.orderNo === no ? '&phone=' + last.phone : ''}`;
  const colors = ['#ff2e3a', '#ffb020', '#2ee59d', '#39d0ff', '#282c6e'];
  for (let i = 0; i < 70; i++) { const c = document.createElement('i'); c.className = 'confetti'; c.style.left = Math.random() * 100 + 'vw'; c.style.background = colors[i % 5]; c.style.animationDuration = 2 + Math.random() * 2.5 + 's'; c.style.animationDelay = Math.random() * 0.8 + 's'; document.body.appendChild(c); setTimeout(() => c.remove(), 5500); }
  if (no && last.orderNo === no) {
    try { const { order: o } = await api(`/api/orders/track?order_no=${encodeURIComponent(no)}&phone=${last.phone}`);
      $('#odet').innerHTML = `<div style="text-align:left;max-width:460px;margin:auto">${o.items.map((i) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(i.name)} × ${i.qty}</span><b>${fmt(i.price * i.qty)}</b></div>`).join('')}
        <div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:800;font-size:18px"><span>Total</span><span>${fmt(o.total)}</span></div>
        <p class="small muted">Payment: <b>${o.payment_method === 'cod' ? 'Cash on Delivery' : o.payment_method === 'demo' ? 'Online (DEMO, no money charged)' : 'Online (Razorpay)'}</b> · Status: <b>${esc(o.payment_status)}</b></p></div>`;
    } catch {}
  }
});
