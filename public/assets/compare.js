/* Comparison table of Akyoto alarm panels — built from each product's listed specs */
async function renderCompare(el, opts = {}) {
  const all = await products();
  let list = all.filter((p) => p.category === 'Alarm Systems' && p.price);
  if (opts.limit) list = list.slice(0, opts.limit);
  const details = await Promise.all(list.map((p) => api('/api/products/' + encodeURIComponent(p.slug)).then((d) => d.product).catch(() => p)));
  const specOf = (p, re) => { const r = (p.specs || []).find(([k]) => re.test(k)); return r ? r[1] : null; };
  const txt = (p) => ((p.description || '') + ' ' + (p.specs || []).map((r) => r.join(' ')).join(' ')).toLowerCase();
  const yn = (v) => (v == null ? '<span class="no">—</span>' : /^(yes|y)$/i.test(String(v).trim()) ? '<span class="yes">✓</span>' : /^(no|n)$/i.test(String(v).trim()) ? '<span class="no">✕</span>' : esc(v));
  const has = (p, re, specRe) => { const s = specRe && specOf(p, specRe); if (s) return s; return re.test(txt(p)) ? 'Yes' : null; };
  const rows = [
    ['Price', (p) => `<b>${fmt(p.price)}</b>${p.mrp > p.price ? `<br><s class="small muted">${fmt(p.mrp)}</s>` : ''}`],
    ['GSM (SIM) alerts', (p) => yn(has(p, /\bgsm\b/, /^gsm$/i))],
    ['Wi-Fi / app', (p) => yn(has(p, /wi-?fi|smartphone app|application/, /^wi-?fi$|app operated/i))],
    ['Calling', (p) => yn(specOf(p, /calling/i) || (/(voice call|calls?\b)/.test(txt(p)) ? 'Yes' : null))],
    ['SMS', (p) => yn(specOf(p, /sms/i) || (/\bsms\b/.test(txt(p)) ? 'Yes' : null))],
    ['Battery backup', (p) => yn(specOf(p, /battery backup|^battery$/i))],
    ['Alarm range', (p) => yn(specOf(p, /alarm range|range/i))],
    ['Siren / hooter', (p) => yn(specOf(p, /hooter|sound level/i))],
    ['Wireless frequency', (p) => yn(specOf(p, /frequency/i))],
    ['Display', (p) => yn(specOf(p, /display/i))],
    ['Best for', (p) => yn(specOf(p, /usage|application/i))],
  ];
  el.innerHTML = `<table class="cmp"><thead><tr><th>Model</th>${details.map((p) => `<th><a href="/product?slug=${encodeURIComponent(p.slug)}"><img src="${esc(p.images[0])}" alt="" loading="lazy">${esc(p.name.replace(/^Akyoto\s+/, ''))}</a></th>`).join('')}</tr></thead>
    <tbody>${rows.map(([label, f]) => `<tr><td>${label}</td>${details.map((p) => `<td>${f(p)}</td>`).join('')}</tr>`).join('')}
    <tr><td></td>${details.map((p) => `<td><button class="btn btn-navy btn-sm" data-cmp-add="${p.id}">Add to cart</button></td>`).join('')}</tr></tbody></table>`;
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-cmp-add]'); if (b) { const p = details.find((x) => x.id === +b.dataset.cmpAdd); addToCart(p, 1, b.closest('td') && el.querySelector(`th:nth-child(${[...b.closest('tr').children].indexOf(b.closest('td')) + 1}) img`)); } });
}
