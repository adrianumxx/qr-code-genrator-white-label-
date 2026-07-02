const sb = supabase.createClient(QR_CONFIG.SUPABASE_URL, QR_CONFIG.SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);

const statLabels = {
  total_users: 'Total users',
  confirmed_users: 'Confirmed users',
  active_users_30d: 'Active users 30d',
  tenants: 'Tenants',
  memberships: 'Memberships',
  qr_codes: 'QR codes',
  dynamic_qr_codes: 'Dynamic QR',
  scans_total: 'Scans total',
  scans_7d: 'Scans 7d',
  scans_30d: 'Scans 30d',
  revenue: 'Revenue',
};

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtNumber(v) {
  return Number(v || 0).toLocaleString();
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

  if (statsRes.error) {
    showGate('Admin data unavailable', statsRes.error.message);
    return;
  }
  if (adminsRes.error) {
    showGate('Admin list unavailable', adminsRes.error.message);
    return;
  }

  renderStats(statsRes.data || {});
  renderAdmins(adminsRes.data || []);
}

function renderStats(stats) {
  const order = [
    'total_users', 'confirmed_users', 'active_users_30d',
    'tenants', 'qr_codes', 'dynamic_qr_codes',
    'scans_total', 'scans_7d', 'scans_30d', 'revenue',
  ];
  $('statsGrid').innerHTML = order.map(k => {
    const value = k === 'revenue' ? '0' : fmtNumber(stats[k]);
    const note = k === 'revenue' ? `<div class="muted" style="font-size:12px">${escapeHtml(stats.revenue_status || 'Not connected')}</div>` : '';
    return `<div class="card">
      <div class="stat-box" style="background:transparent;border:0;padding:0">
        <div class="n">${value}</div>
        <div class="l">${statLabels[k]}</div>
        ${note}
      </div>
    </div>`;
  }).join('');
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
