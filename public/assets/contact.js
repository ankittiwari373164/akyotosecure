document.addEventListener('DOMContentLoaded', () => {
  $('#eform').addEventListener('submit', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    try { await api('/api/enquiries', { method: 'POST', body: f }); e.target.innerHTML = '<div class="center" style="padding:40px 0"><div style="font-size:56px">✅</div><h3>Thanks, we got your message!</h3><p class="muted">Our team will get back to you shortly. For anything urgent, call +91-9650715739.</p></div>'; }
    catch (err) { toast(esc(err.message), true); } });
});
