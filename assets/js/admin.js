const sb = supabase.createClient(QR_CONFIG.SUPABASE_URL, QR_CONFIG.SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtNumber(v) {
  return Number(v || 0).toLocaleString();
}

function fmtPct(v) {
  return `${Math.round(Number(v || 0))}%`;
}

function ratio(part, total) {
  return total ? (Number(part || 0) / Number(total || 0)) * 100 : 0;
}

function fmtDate(v) {
  return v ? new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not accepted';
}

function showGate(title, message, action = '') {
  $('adminGate').innerHTML = `
    <h1 class="page-title">${escapeHtml(title)}</h1>
    <p class="page-sub">${escapeHtml(message)}</p>
    ${action}`;
  $('adminGate').classList.remove('hidden');
  $('adminDashboard').classList.add('hidden');
}

async function busy(btn, label, fn) {
  if (!btn || btn.disabled) return;
  const prev = btn.textContent; btn.disabled = true; btn.textContent = label;
  try { return await fn(); }
  finally { btn.disabled = false; btn.textContent = prev; }
}

async function boot() {
  const { data } = await sb.auth.getSession();
  if (!data.session) { location.href = 'index.html'; return; }
  $('adminEmail').textContent = data.session.user.email || '';

  const { data: allowed, error } = await sb.rpc('is_platform_admin');
  if (error || allowed !== true) {
    showGate('Access denied', 'This account is not a platform super admin.',
      '<a class="btn" href="app.html" style="display:inline-block">Back to workspace</a>');
    return;
  }

  $('adminGate').classList.add('hidden');
  $('adminDashboard').classList.remove('hidden');
  await refreshAdmin();
}

async function refreshAdmin() {
  const [statsRes, adminsRes] = await Promise.all([
    sb.rpc('admin_platform_stats'),
    sb.rpc('admin_list_super_admins'),
  ]);

  if (statsRes.error) { showGate('Admin data unavailable', statsRes.error.message); return; }
  if (adminsRes.error) { showGate('Admin list unavailable', adminsRes.error.message); return; }

  const stats = statsRes.data || {};
  renderSummary(stats);
  renderTrafficChart(stats.scans_by_day || []);
  renderHealth(stats);
  renderTrafficMix(stats);
  renderTenantLeaderboard(stats.tenant_leaderboard || []);
  renderAdmins(adminsRes.data || []);
}

function renderSummary(stats) {
  const activation = ratio(stats.confirmed_users, stats.total_users);
  const activity = ratio(stats.active_users_30d, stats.total_users);
  const dynamicRate = ratio(stats.dynamic_qr_codes, stats.qr_codes);
  const scanVelocity = Math.round(Number(stats.scans_30d || 0) / 30);

  const cards = [
    { label: 'Users', value: fmtNumber(stats.total_users), meta: `${fmtPct(activation)} confirmed`, tone: 'blue' },
    { label: 'Active 30d', value: fmtNumber(stats.active_users_30d), meta: `${fmtPct(activity)} of all users`, tone: 'green' },
    { label: 'Traffic', value: fmtNumber(stats.scans_30d), meta: `${fmtNumber(scanVelocity)} scans/day avg`, tone: 'pink' },
    { label: 'Revenue', value: '0', meta: stats.revenue_status || 'Not connected', tone: 'neutral' },
  ];

  $('adminSummary').innerHTML = cards.map(c => `
    <div class="admin-kpi ${c.tone}">
      <div class="admin-kpi-label">${escapeHtml(c.label)}</div>
      <div class="admin-kpi-value">${c.value}</div>
      <div class="admin-kpi-meta">${escapeHtml(c.meta)}</div>
    </div>`).join('');

  $('trafficHint').textContent = `${fmtNumber(stats.scans_7d)} scans in 7d · ${fmtNumber(stats.scans_total)} lifetime`;
  window.__adminDynamicRate = dynamicRate;
}

function renderTrafficChart(days) {
  const normalized = Array.isArray(days) ? days : [];
  const max = Math.max(...normalized.map(d => Number(d.scans || 0)), 1);
  $('trafficChart').innerHTML = normalized.map(d => {
    const scans = Number(d.scans || 0);
    const h = Math.max(8, Math.round((scans / max) * 100));
    const day = new Date(d.day + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' });
    return `<div class="spark-col" title="${escapeHtml(d.day)}: ${fmtNumber(scans)} scans">
      <div class="spark-value">${fmtNumber(scans)}</div>
      <div class="spark-track"><span style="height:${h}%"></span></div>
      <div class="spark-label">${escapeHtml(day)}</div>
    </div>`;
  }).join('');
}

function renderHealth(stats) {
  const items = [
    ['Activation', ratio(stats.confirmed_users, stats.total_users), `${fmtNumber(stats.confirmed_users)} confirmed / ${fmtNumber(stats.total_users)} total`],
    ['Activity', ratio(stats.active_users_30d, stats.total_users), `${fmtNumber(stats.active_users_30d)} active in 30 days`],
    ['Dynamic QR adoption', window.__adminDynamicRate || 0, `${fmtNumber(stats.dynamic_qr_codes)} dynamic / ${fmtNumber(stats.qr_codes)} total`],
    ['Traffic recency', ratio(stats.scans_7d, stats.scans_30d), `${fmtNumber(stats.scans_7d)} scans in last 7 days`],
  ];
  $('healthPanel').innerHTML = items.map(([label, pct, detail]) => progressRow(label, pct, detail)).join('');
}

function renderTrafficMix(stats) {
  const devices = stats.top_devices || [];
  const countries = stats.top_countries || [];
  const deviceTotal = devices.reduce((n, d) => n + Number(d.count || 0), 0);
  const countryTotal = countries.reduce((n, d) => n + Number(d.count || 0), 0);
  const deviceRows = devices.length ? devices.map(d => progressRow(d.label || 'Unknown', ratio(d.count, deviceTotal), `${fmtNumber(d.count)} scans`)).join('') : '<div class="muted">No device data yet</div>';
  const countryRows = countries.length ? countries.map(d => progressRow(d.label || 'Unknown', ratio(d.count, countryTotal), `${fmtNumber(d.count)} scans`)).join('') : '<div class="muted">No country data yet</div>';
  $('trafficMix').innerHTML = `
    <div class="mini-section">Devices</div>
    ${deviceRows}
    <div class="mini-section" style="margin-top:18px">Countries</div>
    ${countryRows}`;
}

function progressRow(label, pct, detail) {
  const safePct = Math.max(0, Math.min(100, Number(pct || 0)));
  return `<div class="progress-row">
    <div class="progress-top">
      <b>${escapeHtml(label)}</b>
      <span>${fmtPct(safePct)}</span>
    </div>
    <div class="progress-bar"><span style="width:${safePct}%"></span></div>
    <div class="muted" style="font-size:12px">${escapeHtml(detail)}</div>
  </div>`;
}

function renderTenantLeaderboard(rows) {
  const data = Array.isArray(rows) ? rows : [];
  if (!data.length) {
    $('tenantLeaderboard').innerHTML = '<div class="muted">No tenant activity yet.</div>';
    return;
  }
  $('tenantLeaderboard').innerHTML = data.map((t, i) => `
    <div class="leader-row">
      <div class="leader-rank">${i + 1}</div>
      <div>
        <b>${escapeHtml(t.name || 'Unnamed tenant')}</b>
        <div class="muted" style="font-size:12px">${fmtNumber(t.qr_codes)} QR · ${fmtNumber(t.scans)} scans</div>
      </div>
      <div class="leader-score">${fmtNumber(t.scans_30d || 0)}<span>30d</span></div>
    </div>`).join('');
}

function renderAdmins(rows) {
  if (!rows.length) {
    $('adminsList').innerHTML = '<div class="empty-t">No super admins</div>';
    return;
  }
  $('adminsList').className = '';
  $('adminsList').innerHTML = rows.map(a => `
    <div class="card" style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div>
          <h4>${escapeHtml(a.email)}</h4>
          <span class="badge ${a.status === 'active' ? 'stat' : 'dyn'}">${escapeHtml(a.status)}</span>
          <span class="muted" style="font-size:12px"> · ${escapeHtml(a.role)}</span>
        </div>
        <div class="muted" style="font-size:12px;text-align:right">${fmtDate(a.accepted_at)}</div>
      </div>
    </div>`).join('');
}

$('inviteForm').onsubmit = e => {
  e.preventDefault();
  const btn = e.submitter;
  const msg = $('inviteMsg');
  msg.className = 'msg'; msg.textContent = 'Inviting...';
  return busy(btn, 'Inviting...', async () => {
    const email = $('inviteEmail').value.trim();
    const { error } = await sb.rpc('admin_invite_super_admin', { p_email: email });
    if (error) { msg.className = 'msg err'; msg.textContent = error.message; return; }
    msg.className = 'msg ok'; msg.textContent = 'Super admin invited.';
    $('inviteEmail').value = '';
    await refreshAdmin();
  });
};

$('refreshAdmin').onclick = () => refreshAdmin();
$('logoutBtn').onclick = async () => { await sb.auth.signOut(); location.href = 'index.html'; };

boot();
