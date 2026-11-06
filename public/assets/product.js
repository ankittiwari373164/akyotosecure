/* Product detail page */
document.addEventListener('DOMContentLoaded', async () => {
  const slug = qs('slug');
  let d;
  try { d = await api('/api/products/' + encodeURIComponent(slug || '')); }
  catch { $('#pdp').innerHTML = '<div class="empty" style="grid-column:1/-1"><h2>Product not found</h2><p><a class="btn btn-navy" href="/shop">Back to shop</a></p></div>'; $('#tabs').style.display = 'none'; return; }
  const p = d.product; const o = offPct(p);
  document.title = p.name + ' — Akyoto Secure';
  $('#crumbs').innerHTML = `<a href="/">Home</a> / <a href="/shop">Shop</a> / <a href="/shop?cat=${encodeURIComponent(p.category)}">${esc(p.category)}</a> / ${esc(p.name)}`;
  const stockTxt = !p.price ? '' : p.stock <= 0 ? '<span class="stock out">Out of stock</span>' : p.stock <= 5 ? `<span class="stock low">Only ${p.stock} left — order soon</span>` : '<span class="stock">In stock, ready to ship</span>';
  const keySpecs = (p.specs || []).filter(([k]) => !/minimum order/i.test(k)).slice(0, 4);
  $('#pdp').innerHTML = `
    <div class="gallery reveal-l"><div class="gmain" id="gmain"><img src="${esc(p.images[0])}" alt="${esc(p.name)}" id="gimg"></div>
      ${p.images.length > 1 ? `<div class="gthumbs">${p.images.map((src, i) => `<button class="${i ? '' : 'on'}" data-src="${esc(src)}" aria-label="Image ${i + 1}"><img src="${esc(src)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}</div>
    <div class="pinfo reveal-r"><span class="badge badge-navy">${esc(p.category)}</span>${o ? ` <span class="badge badge-red">Save ${o}%</span>` : ''}
      <h1>${esc(p.name)}</h1>
      ${p.rating ? `<div>${stars(p.rating)} <a href="#tabs" class="small muted">${p.review_count} review${p.review_count > 1 ? 's' : ''}</a></div>` : `<a href="#tabs" class="small muted" data-goto="reviews">No reviews yet · be the first</a>`}
      <div style="margin:16px 0 6px">${priceHTML(p)}</div>${p.price ? `<p class="small muted">Inclusive of all taxes${o ? ` · You save ${fmt(p.mrp - p.price)}` : ''}</p>` : ''}
      ${p.short_desc && !/^model no/i.test(p.short_desc) ? `<p style="margin-top:14px;color:#44476e">${esc(p.short_desc)}</p>` : ''}
      ${keySpecs.length ? `<ul class="checks" style="margin:16px 0">${keySpecs.map(([k, v]) => `<li><span><b>${esc(k)}:</b> ${esc(v)}</span></li>`).join('')}</ul>` : ''}
      ${d.variants.length > 1 ? `<div style="margin-top:16px"><b class="small">Choose option</b><div class="variants">${d.variants.map((v) => `<a href="/product?slug=${encodeURIComponent(v.slug)}" class="${v.slug === p.slug ? 'on' : ''}">${esc(v.variant_label)}<br><small>${fmt(v.price)}</small></a>`).join('')}</div></div>` : ''}
      <div style="margin-top:16px">${stockTxt}</div>
      ${p.price ? `<div class="buy-row"><div class="qty"><button data-q="-1" aria-label="Less">−</button><input id="qty" value="1" inputmode="numeric" aria-label="Quantity"><button data-q="1" aria-label="More">+</button></div>
        <button class="btn btn-navy" id="add" ${p.stock <= 0 ? 'disabled style="opacity:.5"' : ''}>Add to cart</button><button class="btn btn-red" id="buy" ${p.stock <= 0 ? 'disabled style="opacity:.5"' : ''}>Buy now</button></div>`
        : `<div class="buy-row"><a class="btn btn-wa" target="_blank" rel="noopener" href="${waLink('Hi Akyoto, please share a quote for ' + p.name)}">Get a quote on WhatsApp</a><a class="btn btn-line" href="tel:+919650715739">Call us</a></div>`}
      <div class="perks"><div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>Delivery in 5–7 business days</div><div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9h11a5 5 0 0 1 0 10H8"/><path d="m8 5-4 4 4 4"/></svg>3-day easy returns</div><div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>Secure Razorpay checkout</div></div>
      <div class="pin-check"><input id="pin" maxlength="6" inputmode="numeric" placeholder="Enter PIN code for delivery estimate"><button class="btn btn-line btn-sm" id="pinb">Check</button></div><p class="small" id="pinr" style="margin-top:6px"></p>
      <p class="small muted" style="margin-top:14px">Questions? <a data-wa="Hi Akyoto, I have a question about ${esc(p.name)}" href="${waLink('Hi Akyoto, I have a question about ' + p.name)}" target="_blank" rel="noopener" style="color:#128c4b;font-weight:700">Ask on WhatsApp →</a></p></div>`;
  observeReveals($('#pdp'));
  // gallery
  const gimg = $('#gimg'), gmain = $('#gmain');
  $$('.gthumbs button').forEach((b) => b.addEventListener('click', () => { $$('.gthumbs button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); gimg.style.opacity = 0; setTimeout(() => { gimg.src = b.dataset.src; gimg.style.opacity = 1; }, 150); }));
  gmain.addEventListener('mousemove', (e) => { const r = gmain.getBoundingClientRect(); gimg.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`; gimg.style.transform = 'scale(1.9)'; });
  gmain.addEventListener('mouseleave', () => { gimg.style.transform = ''; });
  let sx = 0; gmain.addEventListener('touchstart', (e) => (sx = e.touches[0].clientX), { passive: true });
  gmain.addEventListener('touchend', (e) => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) < 40) return; const bs = $$('.gthumbs button'); const i = bs.findIndex((b) => b.classList.contains('on')); bs[(i + (dx < 0 ? 1 : -1) + bs.length) % bs.length]?.click(); });
  // qty + buy
  const qty = $('#qty');
  $$('[data-q]').forEach((b) => b.addEventListener('click', () => { qty.value = Math.max(1, Math.min(99, (+qty.value || 1) + +b.dataset.q)); }));
  $('#add')?.addEventListener('click', () => addToCart(p, +qty.value || 1, gimg));
  $('#buy')?.addEventListener('click', () => { if (p.stock > 0) { Cart.add(p, +qty.value || 1); location.href = '/checkout'; } });
  $('#pinb').addEventListener('click', () => { const v = $('#pin').value.trim(); const d1 = new Date(); const add = (n) => { const x = new Date(d1); let k = 0; while (k < n) { x.setDate(x.getDate() + 1); if (x.getDay()) k++; } return x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
    $('#pinr').innerHTML = /^[1-9]\d{5}$/.test(v) ? `🚚 Estimated delivery to <b>${v}</b>: <b>${add(5)} – ${add(7)}</b> (5–7 business days)` : '<span style="color:var(--red-2)">Please enter a valid 6-digit PIN code</span>'; });
  // sticky mobile bar
  if (p.price && p.stock > 0) {
    document.body.classList.add('has-sticky'); $('#sname').textContent = p.name; $('#sprice').textContent = fmt(p.price);
    $('#sadd').addEventListener('click', () => addToCart(p, 1, gimg));
    const sio = new IntersectionObserver((e) => $('#sticky').classList.toggle('show', !e[0].isIntersecting)); sio.observe($('.buy-row'));
  } else $('#sticky').remove();
  // tabs
  const showTab = (t) => { $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t)); $$('.tabpane').forEach((x) => x.classList.toggle('on', x.id === 'tab-' + t)); };
  $$('#tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $$('[data-goto]').forEach((a) => a.addEventListener('click', () => showTab(a.dataset.goto)));
  $('#tab-desc').innerHTML = p.description || `<p>${esc(p.short_desc || 'Details coming soon.')}</p>`;
  $('#tab-specs').innerHTML = p.specs.length ? `<table class="spec">${p.specs.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>` : '<p class="muted">See the description for details.</p>';
  $('#rc').textContent = d.reviews.length ? `(${d.reviews.length})` : '';
  $('#rlist').innerHTML = d.reviews.length ? d.reviews.map((r) => `<div class="review"><div style="display:flex;justify-content:space-between"><b>${esc(r.name)}</b>${stars(r.rating)}</div><p style="margin-top:6px">${esc(r.body)}</p><span class="small muted">${new Date(r.created_at).toLocaleDateString('en-IN')}</span></div>`).join('')
    : '<div class="review"><b>No reviews yet</b><p class="muted">Bought this? Share your experience to help other customers.</p></div>';
  $('#rform').addEventListener('submit', async (e) => { e.preventDefault(); const f = new FormData(e.target);
    try { const r = await api(`/api/products/${encodeURIComponent(p.slug)}/reviews`, { method: 'POST', body: { name: f.get('name'), body: f.get('body'), rating: f.get('rating') } }); e.target.innerHTML = `<h3>Thank you! 🙏</h3><p class="muted">${esc(r.message)}</p>`; } catch (err) { toast(esc(err.message), true); } });
  // related
  $('#related').innerHTML = d.related.map(productCard).join('') || '<p class="muted">More products coming soon.</p>';
  bindCards($('#related'), () => d.related);
});
