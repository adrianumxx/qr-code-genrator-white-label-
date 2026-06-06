// Vercel serverless function — redirect + scan tracking per QR dinamici
// Route: /r/{code}  ->  (vercel.json rewrite)  ->  /api/r/{code}
// Funziona sia sul dominio Vercel che sui domini custom dei clienti (stesso progetto).

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function parseUA(ua = '') {
  let device = 'Desktop';
  if (/Mobile|Android|iPhone|iPod/i.test(ua)) device = 'Mobile';
  else if (/iPad|Tablet/i.test(ua)) device = 'Tablet';
  let os = 'Unknown';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod|iOS/i.test(ua)) os = 'iOS';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  let browser = 'Unknown';
  if (/Edg/i.test(ua)) browser = 'Edge';
  else if (/Chrome/i.test(ua)) browser = 'Chrome';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';
  else if (/Safari/i.test(ua)) browser = 'Safari';
  return { device, os, browser };
}

export default async function handler(req, res) {
  const code = req.query.code;
  if (!code) { res.status(400).send('Codice mancante'); return; }
  if (!SUPABASE_URL || !KEY) { res.status(500).send('Backend non configurato'); return; }

  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  const q = await fetch(
    `${SUPABASE_URL}/rest/v1/qr_codes?short_code=eq.${encodeURIComponent(code)}&select=id,tenant_id,destination`,
    { headers });
  const rows = await q.json().catch(() => []);
  const qr = Array.isArray(rows) ? rows[0] : null;
  if (!qr || !qr.destination) { res.status(404).send('QR non trovato'); return; }

  const ua = req.headers['user-agent'] || '';
  const { device, os, browser } = parseUA(ua);
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const country = req.headers['x-vercel-ip-country'] || null;

  // registra la scansione (await per garantirlo in ambiente serverless)
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/scans`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        qr_id: qr.id, tenant_id: qr.tenant_id, ip, country,
        device, os, browser, referer: req.headers['referer'] || null, user_agent: ua,
      }),
    });
  } catch (e) { /* non bloccare il redirect */ }

  let dest = qr.destination;
  if (!/^https?:\/\//i.test(dest)) dest = 'https://' + dest;
  res.writeHead(302, { Location: dest });
  res.end();
}
