// Vercel serverless function — gestione domini custom dei clienti via API Vercel.
// Auth: verifica il JWT Supabase del chiamante, ricava il tenant, aggiorna branding.
// Env richieste: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VERCEL_TOKEN, VERCEL_PROJECT_ID, (opz) VERCEL_TEAM_ID

const SUPABASE_URL = process.env.SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VT = process.env.VERCEL_TOKEN;
const PID = process.env.VERCEL_PROJECT_ID;
const TEAM = process.env.VERCEL_TEAM_ID || '';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Solo POST' }); return; }
  if (!SUPABASE_URL || !SR) { res.status(500).json({ error: 'Supabase non configurato' }); return; }
  if (!VT || !PID) { res.status(500).json({ error: 'Vercel non configurato (VERCEL_TOKEN / VERCEL_PROJECT_ID).' }); return; }

  const srHeaders = { apikey: SR, Authorization: `Bearer ${SR}` };

  // --- verifica utente dal JWT Supabase ---
  const auth = req.headers['authorization'] || '';
  const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SR, Authorization: auth } });
  if (!ur.ok) { res.status(401).json({ error: 'Non autenticato' }); return; }
  const user = await ur.json();

  // --- tenant del utente ---
  const mr = await fetch(`${SUPABASE_URL}/rest/v1/memberships?user_id=eq.${user.id}&select=tenant_id&limit=1`, { headers: srHeaders });
  const mem = (await mr.json())[0];
  if (!mem) { res.status(400).json({ error: 'Nessun tenant' }); return; }
  const tenant = mem.tenant_id;

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { action, domain } = body;
  const teamQ = TEAM ? `?teamId=${TEAM}` : '';
  const vh = { Authorization: `Bearer ${VT}`, 'Content-Type': 'application/json' };

  const updateBranding = (obj) => fetch(`${SUPABASE_URL}/rest/v1/branding?tenant_id=eq.${tenant}`, {
    method: 'PATCH',
    headers: { ...srHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(obj),
  });

  const getDomain = async () => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/branding?tenant_id=eq.${tenant}&select=custom_domain`, { headers: srHeaders });
    return (await r.json())[0];
  };

  try {
    if (action === 'add') {
      const host = String(domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) { res.status(400).json({ error: 'Dominio non valido' }); return; }
      const vr = await fetch(`https://api.vercel.com/v10/projects/${PID}/domains${teamQ}`, {
        method: 'POST', headers: vh, body: JSON.stringify({ name: host }),
      });
      const vd = await vr.json();
      if (!vr.ok && vd.error && vd.error.code !== 'domain_already_in_use') {
        res.status(400).json({ error: vd.error?.message || 'Errore Vercel' }); return;
      }
      await updateBranding({ custom_domain: host, domain_status: 'pending', domain_verified_at: null });
      res.json({ ok: true, status: 'pending', hostname: host, cname_target: 'cname.vercel-dns.com' });
      return;
    }

    if (action === 'status') {
      const br = await getDomain();
      if (!br || !br.custom_domain) { res.json({ status: 'none' }); return; }
      const vr = await fetch(`https://api.vercel.com/v9/projects/${PID}/domains/${br.custom_domain}${teamQ}`, { headers: vh });
      const vd = await vr.json();
      const verified = vd.verified === true;
      const status = verified ? 'active' : 'pending';
      await updateBranding({ domain_status: status, domain_verified_at: verified ? new Date().toISOString() : null });
      res.json({ status, verification: vd.verification || null, domain: br.custom_domain });
      return;
    }

    if (action === 'remove') {
      const br = await getDomain();
      if (br && br.custom_domain) {
        await fetch(`https://api.vercel.com/v9/projects/${PID}/domains/${br.custom_domain}${teamQ}`, { method: 'DELETE', headers: vh });
      }
      await updateBranding({ custom_domain: null, domain_status: 'none', domain_verified_at: null, domain_cf_id: null });
      res.json({ ok: true, status: 'none' });
      return;
    }

    res.status(400).json({ error: 'Azione sconosciuta' });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
