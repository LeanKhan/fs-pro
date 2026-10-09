// Service health probe (Windows side).
const urls = ['http://localhost:4173', 'http://localhost:3010/healthz', 'http://localhost:3011/healthz', 'http://localhost:3005/healthz'];
for (const u of urls) {
  const t0 = Date.now();
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
    let body = '';
    try { body = (await r.text()).slice(0, 120); } catch {}
    console.log(u, '->', r.status, `${Date.now() - t0}ms`, body.replace(/\s+/g, ' '));
  } catch (e) {
    console.log(u, '-> ERR', e.message, `${Date.now() - t0}ms`);
  }
}
