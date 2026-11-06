/* Shop: filters, search, sort (URL-synced) */
document.addEventListener('DOMContentLoaded', async () => {
  const grid = $('#grid'); let list = [];
  const st = { cats: new Set((qs('cat') || '').split('|').filter(Boolean)), brands: new Set(), q: qs('q') || '', min: '', max: '', sale: false, stock: false, sort: qs('sort') || 'featured' };
  try { list = await products(); } catch { grid.innerHTML = '<p class="empty">Could not load products.</p>'; return; }
  const count = (key, v) => list.filter((p) => p[key] === v).length;
  const cats = [...new Set(list.map((p) => p.category))].sort((a, b) => count('category', b) - count('category', a));
  const brands = [...new Set(list.map((p) => p.brand))];
  $('#fcat').innerHTML = cats.map((c) => `<label class="fopt"><input type="checkbox" value="${esc(c)}" ${st.cats.has(c) ? 'checked' : ''}> ${esc(c)} <span>${count('category', c)}</span></label>`).join('');
  $('#fbrand').innerHTML = brands.map((c) => `<label class="fopt"><input type="checkbox" value="${esc(c)}"> ${esc(c)} <span>${count('brand', c)}</span></label>`).join('');
  $('#q').value = st.q; $('#sort').value = st.sort;
  const render = () => {
    let r = list.filter((p) => (!st.cats.size || st.cats.has(p.category)) && (!st.brands.size || st.brands.has(p.brand))
      && (!st.q || (p.name + ' ' + p.category + ' ' + p.sku + ' ' + p.short_desc).toLowerCase().includes(st.q.toLowerCase()))
      && (!st.min || p.price >= +st.min) && (!st.max || (p.price && p.price <= +st.max)) && (!st.sale || offPct(p) > 0) && (!st.stock || p.stock > 0));
    const s = st.sort;
    const pr = (p) => p.price || 1e12;
    if (s === 'price-asc') r.sort((a, b) => pr(a) - pr(b)); else if (s === 'price-desc') r.sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (s === 'discount') r.sort((a, b) => offPct(b) - offPct(a)); else if (s === 'new') r.sort((a, b) => b.id - a.id); else if (s === 'name') r.sort((a, b) => a.name.localeCompare(b.name));
    grid.classList.remove('in', 'stagger'); void grid.offsetWidth;
    grid.innerHTML = r.length ? r.map(productCard).join('') : '<div class="empty" style="grid-column:1/-1"><h3>No products match</h3><p>Try removing a filter or searching for something else.</p></div>';
    grid.classList.add('stagger'); observeReveals(grid.parentElement);
    $('#count').textContent = `Showing ${r.length} of ${list.length} products`;
    const chips = [...[...st.cats].map((c) => ['cat', c]), ...[...st.brands].map((c) => ['brand', c]), ...(st.q ? [['q', '“' + st.q + '”']] : []), ...(st.sale ? [['sale', 'On sale']] : []), ...(st.stock ? [['stock', 'In stock']] : []), ...(st.min || st.max ? [['price', `₹${st.min || 0} – ${st.max ? '₹' + st.max : 'any'}`]] : [])];
    $('#active').innerHTML = chips.map(([k, v]) => `<button data-k="${k}" data-v="${esc(v)}">${esc(v)} ✕</button>`).join('');
    const u = new URL(location); st.cats.size ? u.searchParams.set('cat', [...st.cats].join('|')) : u.searchParams.delete('cat'); st.q ? u.searchParams.set('q', st.q) : u.searchParams.delete('q'); st.sort !== 'featured' ? u.searchParams.set('sort', st.sort) : u.searchParams.delete('sort');
    history.replaceState(null, '', u);
  };
  bindCards(grid, () => list);
  $('#fcat').addEventListener('change', (e) => { e.target.checked ? st.cats.add(e.target.value) : st.cats.delete(e.target.value); render(); });
  $('#fbrand').addEventListener('change', (e) => { e.target.checked ? st.brands.add(e.target.value) : st.brands.delete(e.target.value); render(); });
  let t; $('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); render(); }, 150); });
  $('#sort').addEventListener('change', (e) => { st.sort = e.target.value; render(); });
  $('#pmin').addEventListener('input', (e) => { st.min = e.target.value; render(); }); $('#pmax').addEventListener('input', (e) => { st.max = e.target.value; render(); });
  $('#fsale').addEventListener('change', (e) => { st.sale = e.target.checked; render(); }); $('#fstock').addEventListener('change', (e) => { st.stock = e.target.checked; render(); });
  $('#active').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const k = b.dataset.k;
    if (k === 'cat') { st.cats.delete(b.dataset.v); $$('#fcat input').forEach((i) => (i.checked = st.cats.has(i.value))); }
    if (k === 'brand') { st.brands.delete(b.dataset.v); $$('#fbrand input').forEach((i) => (i.checked = st.brands.has(i.value))); }
    if (k === 'q') { st.q = ''; $('#q').value = ''; } if (k === 'sale') { st.sale = false; $('#fsale').checked = false; } if (k === 'stock') { st.stock = false; $('#fstock').checked = false; }
    if (k === 'price') { st.min = st.max = ''; $('#pmin').value = $('#pmax').value = ''; } render(); });
  $('#clearF').addEventListener('click', () => { st.cats.clear(); st.brands.clear(); st.q = st.min = st.max = ''; st.sale = st.stock = false; $$('.filters input').forEach((i) => (i.type === 'checkbox' ? (i.checked = false) : (i.value = ''))); $('#q').value = ''; render(); });
  $('#openF').addEventListener('click', () => $('#filters').classList.add('open')); $('#applyF').addEventListener('click', () => $('#filters').classList.remove('open'));
  render();
});
