/* Kit builder */
const KIT_TYPE = (p) => { const n = p.name.toLowerCase();
  if (p.category === 'Alarm Systems') return 'panel'; if (/shutter/.test(n)) return 'shutter'; if (/door sensor|magnetic/.test(n)) return 'door'; if (/vibration|glass/.test(n)) return 'window';
  if (/pir|motion/.test(n)) return 'motion'; if (/smoke|gas|call point/.test(n)) return 'smoke'; if (/panic/.test(n)) return 'panic'; if (/siren/.test(n)) return 'siren'; if (/keyfob|remote/.test(n)) return 'remote'; return 'other'; };
const panelTag = (p) => { const s = (re) => (p.specs.find(([k]) => re.test(k)) || [])[1] || ''; if (/yes/i.test(s(/^gsm$/i)) || /gsm/i.test(s(/features/i))) return 'GSM + Wi-Fi alerts'; if (/yes/i.test(s(/app operated/i))) return 'App operated'; if (s(/display/i)) return s(/display/i) + ' display'; return 'Wireless panel'; };
const KIT_W = { panel: 30, door: 14, motion: 14, siren: 10, window: 8, smoke: 8, panic: 6, shutter: 6, remote: 4, other: 2 };
document.addEventListener('DOMContentLoaded', async () => {
  const all = await products();
  const panels = all.filter((p) => p.category === 'Alarm Systems' && p.price && !/AKT-GD/.test(p.name)).sort((a, b) => a.price - b.price);
  const sensors = all.filter((p) => ['Wireless Sensors', 'Alarm Siren'].includes(p.category) && p.price);
  const acc = all.filter((p) => p.category === 'Accessories' && p.price);
  const sel = new Map(); let panel = null;
  const pre = (qs('kit') || '').split(',').map((x) => x.split(':').map(Number)).filter((x) => x[0]);
  for (const [id, q] of pre) { const p = all.find((x) => x.id === id); if (!p) continue; if (p.category === 'Alarm Systems') panel = p.id; else sel.set(p.id, q || 1); }
  if (!panel && panels[0]) panel = panels.find((p) => /HSL-037/.test(p.name))?.id || panels[0].id;
  const card = (p, isPanel) => { const q = sel.get(p.id) || 0; const on = isPanel ? panel === p.id : q > 0;
    return `<div class="opt ${on ? 'on' : ''}" data-id="${p.id}" role="button" tabindex="0"><img src="${esc(p.images[0])}" alt="" loading="lazy"><b>${esc(p.name.replace(/^Akyoto\s+/, ''))}</b>${priceHTML(p)}
      ${isPanel ? `<span class="small muted">${esc(panelTag(p))}</span>`
      : `<div class="qty sm" onclick="event.stopPropagation()"><button data-k="-1">−</button><input value="${q}" readonly aria-label="Quantity"><button data-k="1">+</button></div>`}</div>`; };
  const draw = () => {
    $('#panels').innerHTML = panels.map((p) => card(p, true)).join(''); $('#sensors').innerHTML = sensors.map((p) => card(p)).join(''); $('#acc').innerHTML = acc.map((p) => card(p)).join('');
    summary();
  };
  const summary = () => {
    const lines = []; if (panel) lines.push([all.find((p) => p.id === panel), 1]);
    for (const [id, q] of sel) if (q > 0) lines.push([all.find((p) => p.id === id), q]);
    const tot = lines.reduce((a, [p, q]) => a + p.price * q, 0), mrp = lines.reduce((a, [p, q]) => a + p.mrp * q, 0);
    $('#klines').innerHTML = lines.length ? lines.map(([p, q]) => `<div><span>${q} × ${esc(p.name.replace(/^Akyoto\s+/, ''))}</span><b>${fmt(p.price * q)}</b></div>`).join('') : '<div style="opacity:.7">Pick a panel to start.</div>';
    $('#ktotal').textContent = fmt(tot); $('#kbtotal').textContent = fmt(tot); $('#kmrp').textContent = mrp > tot ? fmt(mrp) : '';
    const types = new Set(lines.map(([p]) => KIT_TYPE(p)));
    let score = [...types].reduce((a, t) => a + (KIT_W[t] || 0), 0) + Math.min(10, lines.reduce((a, [, q]) => a + q, 0) - types.size);
    score = Math.max(0, Math.min(100, score)); $('#meter').style.width = score + '%'; $('#score').textContent = score; $('#kbscore').textContent = score;
    $$('.house .dot').forEach((d) => d.classList.toggle('on', types.has(d.dataset.type)));
  };
  const onClick = (e) => {
    const o = e.target.closest('.opt'); if (!o) return; const id = +o.dataset.id; const p = all.find((x) => x.id === id);
    const k = e.target.closest('[data-k]');
    if (p.category === 'Alarm Systems') panel = id;
    else { const q = Math.max(0, Math.min(20, (sel.get(id) || 0) + (k ? +k.dataset.k : (sel.get(id) ? -sel.get(id) : 1)))); sel.set(id, q); }
    const y = scrollY; draw(); scrollTo(0, y);
  };
  ['#panels', '#sensors', '#acc'].forEach((s) => { $(s).addEventListener('click', onClick); $(s).addEventListener('keydown', (e) => { if (e.key === 'Enter') onClick(e); }); });
  $('#kadd').addEventListener('click', () => {
    if (!panel) return toast('Pick an alarm panel first', true);
    Cart.add(all.find((p) => p.id === panel), 1); for (const [id, q] of sel) if (q > 0) Cart.add(all.find((p) => p.id === id), q);
    toast('Kit added to cart · <a href="/cart">View cart</a>'); setTimeout(() => (location.href = '/cart'), 900);
  });
  $('#kbadd').addEventListener('click', () => $('#kadd').click());
  document.body.classList.add('has-sticky');
  draw();
});
