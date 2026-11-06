/* Home page */
document.addEventListener('DOMContentLoaded', async () => {
  // how it works: steps + simulation
  const scene = $('#scene'); const steps = $$('.hstep');
  let timer, auto;
  const show = (n) => { scene.className = 'scene' + (n ? ' s' + n : ''); steps.forEach((s) => s.classList.toggle('on', +s.dataset.step === (n || 1))); };
  steps.forEach((s) => s.addEventListener('click', () => { clearInterval(auto); clearTimeout(timer); show(+s.dataset.step); }));
  $('#simulate').addEventListener('click', () => {
    clearInterval(auto); clearTimeout(timer); show(0);
    timer = setTimeout(() => { show(1); timer = setTimeout(() => { show(2); timer = setTimeout(() => show(3), 1400); }, 1300); }, 300);
  });
  let k = 0; show(1);
  const sio = new IntersectionObserver((e) => { if (e[0].isIntersecting) { sio.disconnect(); auto = setInterval(() => { k = (k % 3) + 1; show(k); }, 2600); } }, { threshold: 0.4 });
  sio.observe(scene);
  // hero chip cycling
  const states = [['Front door', 'Armed · secure'], ['Back window', 'Armed · secure'], ['Shutter', 'Armed · secure'], ['Panic button', 'Ready']];
  let si = 0; setInterval(() => { si = (si + 1) % states.length; const c = $('#chip1'); if (c) c.innerHTML = `${states[si][0]}<small>${states[si][1]}</small>`; }, 2400);

  try {
    const [list, cats] = await Promise.all([products(), api('/api/categories')]);
    const firstImg = (c) => (list.find((p) => p.category === c && p.featured) || list.find((p) => p.category === c))?.images[0];
    $('#cats').innerHTML = cats.categories.slice(0, 12).map((c) => `<a class="cat" href="/shop?cat=${encodeURIComponent(c.name)}"><img src="${esc(firstImg(c.name))}" alt="" loading="lazy"><b>${esc(c.name)}</b><span>${c.count} products${c.from_price ? ' · from ' + fmt(c.from_price) : ''}</span></a>`).join('');
    const feat = list.filter((p) => p.category === 'Alarm Systems' && p.price).slice(0, 8);
    $('#featured').innerHTML = feat.map(productCard).join('');
    $('#guard').innerHTML = list.filter((p) => p.category === 'Guard Monitoring Solution').slice(0, 4).map(productCard).join('');
    bindCards($('#featured'), () => list); bindCards($('#guard'), () => list);
    observeReveals();
    renderCompare($('#compare'), { limit: 5 });
  } catch (e) { $('#featured').innerHTML = '<p class="empty">Could not load products. Please refresh.</p>'; }
});
