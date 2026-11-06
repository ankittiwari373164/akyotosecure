/* Home-protection quiz / recommender */
document.addEventListener('DOMContentLoaded', async () => {
  const Q = [
    { k: 'place', q: 'What do you want to protect?', o: [['flat', '🏢', 'Flat / apartment'], ['house', '🏡', 'Independent house'], ['shop', '🏪', 'Shop / showroom'], ['office', '💼', 'Office'], ['warehouse', '🏭', 'Warehouse / factory']] },
    { k: 'doors', q: 'How many doors and windows open to the outside?', o: [[1, '🚪', '1–2', 'small flat or shop'], [3, '🚪🚪', '3–4', 'most homes'], [5, '🏘️', '5 or more', 'large house / premises']] },
    { k: 'net', q: 'What connectivity is available on site?', o: [['wifi', '📶', 'Wi-Fi is always on'], ['gsm', '📱', 'Only mobile network', 'SIM-based alerts'], ['both', '🔁', 'Both / not sure', 'we\'ll cover both']] },
    { k: 'extra', q: 'Any extra safety needs?', multi: true, o: [['fire', '🔥', 'Fire / smoke'], ['gas', '🧯', 'Gas leak'], ['panic', '🆘', 'Panic button', 'for elders or staff'], ['none', '✔️', 'Just burglary protection']] },
    { k: 'budget', q: "What's your budget for the alarm panel?", o: [[10000, '💰', 'Under ₹10,000'], [15000, '💰💰', '₹10,000 – ₹15,000'], [99999, '💎', '₹15,000+', 'best features']] },
  ];
  const ans = { extra: new Set() }; let i = 0; const all = await products();
  const find = (re, cat) => all.find((p) => re.test(p.name) && p.price && (!cat || p.category === cat));
  const body = $('#qbody'), bar = $('#qbar');
  const step = () => {
    bar.style.width = (i / Q.length) * 100 + '%';
    if (i >= Q.length) return result();
    const q = Q[i];
    body.innerHTML = `<div class="qslide"><span class="eyebrow">Question ${i + 1} of ${Q.length}</span><h2 class="h2" style="font-size:clamp(22px,3vw,32px)">${q.q}</h2>
      <div class="qopts">${q.o.map(([v, em, t, s]) => `<button class="qopt ${q.multi ? (ans.extra.has(v) ? 'on' : '') : ans[q.k] === v ? 'on' : ''}" data-v="${v}"><span class="em">${em}</span><span>${t}${s ? `<small>${s}</small>` : ''}</span></button>`).join('')}</div>
      <div style="display:flex;justify-content:space-between;margin-top:22px">${i ? '<button class="btn btn-line btn-sm" id="back">← Back</button>' : '<span></span>'}${q.multi ? '<button class="btn btn-red" id="next">Next →</button>' : ''}</div></div>`;
    $$('.qopt', body).forEach((b) => b.addEventListener('click', () => {
      let v = b.dataset.v; if (!isNaN(+v)) v = +v;
      if (q.multi) { if (v === 'none') ans.extra.clear(); else ans.extra.delete('none'); ans.extra.has(v) ? ans.extra.delete(v) : ans.extra.add(v); $$('.qopt', body).forEach((x) => x.classList.toggle('on', ans.extra.has(x.dataset.v))); }
      else { ans[q.k] = v; b.classList.add('on'); setTimeout(() => { i++; step(); }, 220); }
    }));
    $('#back', body)?.addEventListener('click', () => { i--; step(); }); $('#next', body)?.addEventListener('click', () => { i++; step(); });
  };
  const result = () => {
    const big = ['warehouse', 'office'].includes(ans.place) || ans.doors >= 5;
    let panel;
    if (ans.budget <= 10000) panel = ans.net === 'wifi' && !big ? find(/HSL-038/) || find(/HSL-037/) : find(/HSL-037/);
    else if (ans.budget <= 15000) panel = big ? find(/HSL-036/) || find(/HSL-009/) : find(/HSL-056/) || find(/HSL-077/);
    else panel = big ? find(/HSL-068/) : find(/HSL-063/) || find(/HSL-068/);
    panel = panel || all.find((p) => p.category === 'Alarm Systems' && p.price);
    const lines = [[panel, 1, 'Control panel — the brain of your system']];
    const door = find(/Wireless Door Sensor/, 'Wireless Sensors'); if (door) lines.push([door, ans.doors || 2, 'One for each door/window that opens to the outside']);
    const pir = find(/PIR Sensor/); if (pir) lines.push([pir, big || ans.place === 'house' ? 2 : 1, 'Detects movement inside main rooms']);
    if (['shop', 'warehouse'].includes(ans.place)) { const sh = find(/Wireless Shutter Sensor/); if (sh) lines.push([sh, 1, 'Alerts if the rolling shutter is lifted']); }
    if (ans.place !== 'flat') { const sir = find(/Alarm Siren 120 dB/); if (sir) lines.push([sir, 1, 'Outdoor siren to scare intruders and alert neighbours']); }
    if (ans.extra.has('fire')) { const sm = find(/Wireless Smoke Detector/); if (sm) lines.push([sm, big ? 2 : 1, 'Early warning of smoke and fire']); }
    if (ans.extra.has('gas')) { const g = find(/Gas Leakage/); if (g) lines.push([g, 1, 'Detects LPG / gas leaks in the kitchen']); }
    if (ans.extra.has('panic')) { const pb = find(/Wireless Panic Button/); if (pb) lines.push([pb, 1, 'One-press emergency alert']); }
    const tot = lines.reduce((a, [p, q]) => a + p.price * q, 0);
    const score = Math.min(98, 55 + lines.length * 6 + (ans.net !== 'wifi' ? 6 : 0));
    bar.style.width = '100%';
    body.innerHTML = `<div class="qslide center"><span class="eyebrow">Your recommendation</span>
      <svg class="score-ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="none" stroke="#eef0fb" stroke-width="12"/><circle id="ring" cx="60" cy="60" r="50" fill="none" stroke="url(#qg)" stroke-width="12" stroke-linecap="round" stroke-dasharray="314" stroke-dashoffset="314" transform="rotate(-90 60 60)" style="transition:stroke-dashoffset 1.4s cubic-bezier(.2,.8,.2,1)"/><defs><linearGradient id="qg"><stop stop-color="#ff2e3a"/><stop offset="1" stop-color="#2ee59d"/></linearGradient></defs><text x="60" y="66" text-anchor="middle" font-size="26" font-weight="800" font-family="Sora" fill="#16183a">${score}</text></svg>
      <p class="muted">Estimated protection score with this kit</p><div style="text-align:left;margin-top:22px">${lines.map(([p, q, why]) => `<a href="/product?slug=${encodeURIComponent(p.slug)}" class="cline" style="grid-template-columns:64px 1fr auto"><img src="${esc(p.images[0])}" alt="" style="width:64px;height:64px"><div><b>${q} × ${esc(p.name)}</b><div class="small muted">${why}</div></div><b>${fmt(p.price * q)}</b></a>`).join('')}</div>
      <div style="display:flex;justify-content:space-between;font-size:22px;font-weight:800;font-family:var(--head);margin:14px 4px"><span>Kit total</span><span>${fmt(tot)}</span></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><button class="btn btn-red" id="qadd">Add this kit to cart</button><a class="btn btn-navy" href="/kit-builder?kit=${lines.map(([p, q]) => p.id + ':' + q).join(',')}">Customise in kit builder</a><button class="btn btn-line" id="again">Retake quiz</button></div>
      <p class="small muted" style="margin-top:14px">Recommendations are a starting point. Our team can confirm the right setup for your site on WhatsApp.</p></div>`;
    setTimeout(() => ($('#ring').style.strokeDashoffset = 314 - (314 * score) / 100), 100);
    $('#qadd').addEventListener('click', () => { lines.forEach(([p, q]) => Cart.add(p, q)); toast('Kit added to cart'); setTimeout(() => (location.href = '/cart'), 700); });
    $('#again').addEventListener('click', () => { i = 0; ans.extra.clear(); delete ans.place; step(); });
  };
  step();
});
