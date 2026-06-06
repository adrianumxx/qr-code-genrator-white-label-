/* ===================== QR Studio — app logic ===================== */
const sb = supabase.createClient(QR_CONFIG.SUPABASE_URL, QR_CONFIG.SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

let STATE = { user: null, tenantId: null, branding: null };

/* ---------- toast ---------- */
function toast(msg, ok = true) {
  const t = el('div', 'toast', msg); t.style.borderColor = ok ? 'var(--ok)' : 'var(--danger)';
  $('toastRoot').appendChild(t); setTimeout(() => t.remove(), 2600);
}

/* ---------- helpers: anti doppio-submit + validazione ---------- */
async function busy(btn, label, fn) {
  if (!btn || btn.disabled) return;
  const prev = btn.textContent; btn.disabled = true; btn.textContent = label;
  try { return await fn(); }
  finally { btn.disabled = false; btn.textContent = prev; }
}
const isUrl = s => { try { new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); return true; } catch { return false; } };
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isTel = s => /^[+]?[\d\s().-]{5,}$/.test(s);
/* escape caratteri speciali nei formati strutturati (WIFI/vCard) */
const esc = s => String(s).replace(/([\\;,:"])/g, '\\$1');

/* ---------- auth guard + bootstrap ---------- */
async function boot() {
  const { data } = await sb.auth.getSession();
  if (!data.session) { location.href = 'index.html'; return; }
  STATE.user = data.session.user;
  $('userEmail').textContent = STATE.user.email;

  const { data: mem } = await sb.from('memberships').select('tenant_id').limit(1).maybeSingle();
  if (!mem) { toast('Nessuna azienda trovata', false); return; }
  STATE.tenantId = mem.tenant_id;

  const { data: br } = await sb.from('branding').select('*').eq('tenant_id', STATE.tenantId).maybeSingle();
  STATE.branding = br || {};
  $('tenantName').textContent = (br && br.company_name) ? br.company_name : 'La tua azienda';
  fillBrandingForm();
  renderDomain();
  renderTypeFields(); refreshQR();
}

/* base url per i link dinamici: dominio custom verificato, altrimenti dominio corrente (Vercel) */
function redirectBase() {
  const b = STATE.branding || {};
  const root = (b.custom_domain && b.domain_status === 'active')
    ? `https://${b.custom_domain}` : location.origin;
  return `${root}/r`;
}

$('logoutBtn').onclick = async () => { await sb.auth.signOut(); location.href = 'index.html'; };

/* ---------- mobile drawer ---------- */
function setDrawer(open) {
  $('side').classList.toggle('open', open);
  $('overlay').classList.toggle('show', open);
}
$('menuBtn').onclick = () => setDrawer(!$('side').classList.contains('open'));
$('overlay').onclick = () => setDrawer(false);

/* ---------- navigation ---------- */
document.querySelectorAll('.nav').forEach(n => n.onclick = () => {
  document.querySelectorAll('.nav').forEach(x => x.classList.remove('active'));
  n.classList.add('active');
  const p = n.dataset.page;
  ['generate', 'codes', 'bulk', 'branding'].forEach(pg =>
    $('page-' + pg).classList.toggle('hidden', pg !== p));
  if (p === 'codes') loadCodes();
  setDrawer(false); // chiudi il drawer dopo la scelta su mobile
});

/* ===================== CONTENT TYPE FIELDS ===================== */
const TYPE_FIELDS = {
  url: [['url', 'URL', 'https://...']],
  file: [],
  text: [['text', 'Testo', 'Scrivi qui...']],
  email: [['email', 'Email', 'nome@dominio.it'], ['subject', 'Oggetto', ''], ['body', 'Messaggio', '']],
  tel: [['tel', 'Numero', '+39...']],
  sms: [['tel', 'Numero', '+39...'], ['body', 'Messaggio', '']],
  wifi: [['ssid', 'Nome rete (SSID)', ''], ['password', 'Password', ''], ['enc', 'Sicurezza (WPA/WEP/nopass)', 'WPA']],
  vcard: [['fn', 'Nome completo', ''], ['org', 'Azienda', ''], ['phone', 'Telefono', ''], ['vemail', 'Email', ''], ['vurl', 'Sito', '']],
  event: [['summary', 'Titolo evento', ''], ['location', 'Luogo', ''], ['start', 'Inizio (YYYYMMDDThhmmss)', ''], ['end', 'Fine (YYYYMMDDThhmmss)', '']],
};

let FILE_URL = null;   // public url del file caricato (tipo "file")

function renderTypeFields() {
  const type = $('g_type').value;
  const wrap = $('g_fields'); wrap.innerHTML = '';

  if (type === 'file') {
    FILE_URL = null;
    const f = el('div', 'field');
    f.innerHTML = `<label>Carica un file (max ~50MB)</label>
      <input type="file" id="g_filein">
      <div class="msg" id="g_filemsg"></div>`;
    wrap.appendChild(f);
    $('g_dynamic').closest('.field').style.display = '';
    document.getElementById('g_filein').onchange = uploadContentFile;
    return;
  }

  TYPE_FIELDS[type].forEach(([k, label, ph]) => {
    const f = el('div', 'field');
    f.innerHTML = `<label>${label}</label>` +
      (k === 'text' || k === 'body' ? `<textarea data-k="${k}" rows="2" placeholder="${ph}"></textarea>`
        : `<input data-k="${k}" placeholder="${ph}">`);
    wrap.appendChild(f);
  });
  // dynamic available for url and file
  $('g_dynamic').closest('.field').style.display = isDynable(type) ? '' : 'none';
  if (!isDynable(type)) $('g_dynamic').checked = false;
  wrap.querySelectorAll('input,textarea').forEach(i => i.oninput = refreshQR);
}

function isDynable(type) { return type === 'url' || type === 'file'; }

async function uploadContentFile(e) {
  const file = e.target.files[0]; const m = $('g_filemsg');
  if (!file) { FILE_URL = null; refreshQR(); return; }
  m.className = 'msg'; m.textContent = 'Caricamento...';
  const safe = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${STATE.tenantId}/${Date.now()}_${safe}`;
  const { error } = await sb.storage.from('files').upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
  if (error) { m.className = 'msg err'; m.textContent = error.message; FILE_URL = null; refreshQR(); return; }
  FILE_URL = sb.storage.from('files').getPublicUrl(path).data.publicUrl;
  if (!$('g_title').value) $('g_title').value = file.name;
  m.className = 'msg ok'; m.textContent = 'File caricato ✓ Il QR aprirà questo file.';
  refreshQR();
}
$('g_type').onchange = () => { renderTypeFields(); refreshQR(); };
$('g_dynamic').onchange = refreshQR;

function fieldVal(k) { const e = document.querySelector(`#g_fields [data-k="${k}"]`); return e ? e.value.trim() : ''; }

/* build the QR payload string from current inputs */
function buildPayload() {
  const t = $('g_type').value;
  if (t === 'url') return fieldVal('url');
  if (t === 'file') return FILE_URL || '';
  if (t === 'text') return fieldVal('text');
  if (t === 'email') return `mailto:${fieldVal('email')}?subject=${encodeURIComponent(fieldVal('subject'))}&body=${encodeURIComponent(fieldVal('body'))}`;
  if (t === 'tel') return `tel:${fieldVal('tel')}`;
  if (t === 'sms') return `SMSTO:${fieldVal('tel')}:${fieldVal('body')}`;
  if (t === 'wifi') return `WIFI:T:${fieldVal('enc') || 'WPA'};S:${esc(fieldVal('ssid'))};P:${esc(fieldVal('password'))};;`;
  if (t === 'vcard') return `BEGIN:VCARD\nVERSION:3.0\nFN:${esc(fieldVal('fn'))}\nORG:${esc(fieldVal('org'))}\nTEL:${fieldVal('phone')}\nEMAIL:${fieldVal('vemail')}\nURL:${fieldVal('vurl')}\nEND:VCARD`;
  if (t === 'event') return `BEGIN:VEVENT\nSUMMARY:${fieldVal('summary')}\nLOCATION:${fieldVal('location')}\nDTSTART:${fieldVal('start')}\nDTEND:${fieldVal('end')}\nEND:VEVENT`;
  return '';
}

/* ===================== DESIGN / QR RENDERING ===================== */
// sync color text<->picker
[['d_fg', 'd_fg_t'], ['d_fg2', 'd_fg2_t'], ['d_bg', 'd_bg_t'], ['b_primary', 'b_primary_t'], ['b_bg', 'b_bg_t'], ['b_accent', 'b_accent_t']].forEach(([a, b]) => {
  const A = $(a), B = $(b); if (!A) return;
  A.oninput = () => { B.value = A.value; refreshQR(); };
  B.oninput = () => { A.value = B.value; refreshQR(); };
});
['d_gradient', 'd_dotshape', 'd_corner', 'd_ecc', 'd_margin', 'd_transparent'].forEach(id => $(id).oninput = refreshQR);
$('d_gradient').addEventListener('change', () => $('d_gradient_field').classList.toggle('hidden', !$('d_gradient').checked));
$('d_transparent').addEventListener('change', () => {
  const on = $('d_transparent').checked;
  $('d_bg').disabled = $('d_bg_t').disabled = on;            // sfondo colore irrilevante se trasparente
  $('qrPreview').classList.toggle('checkerboard', on);       // mostra la trasparenza in anteprima
});

let LOGO_DATA = null;
$('d_logo').onchange = e => {
  const f = e.target.files[0]; if (!f) { LOGO_DATA = null; refreshQR(); return; }
  const r = new FileReader(); r.onload = () => { LOGO_DATA = r.result; refreshQR(); }; r.readAsDataURL(f);
};

function currentDesign() {
  return {
    fg: $('d_fg').value, bg: $('d_bg').value, gradient: $('d_gradient').checked,
    fg2: $('d_fg2').value, transparent: $('d_transparent').checked,
    dotshape: $('d_dotshape').value, corner: $('d_corner').value,
    ecc: $('d_ecc').value, margin: +$('d_margin').value, logo: LOGO_DATA,
  };
}

function qrOptions(dataStr, d, size = 280) {
  const dots = d.gradient
    ? { type: d.dotshape, gradient: { type: 'linear', rotation: 0.8, colorStops: [{ offset: 0, color: d.fg }, { offset: 1, color: d.fg2 || (STATE.branding && STATE.branding.accent_color) || '#8b5cf6' }] } }
    : { type: d.dotshape, color: d.fg };
  const opt = {
    width: size, height: size, type: 'svg', data: dataStr || ' ',
    margin: d.margin, qrOptions: { errorCorrectionLevel: d.ecc },
    backgroundOptions: { color: d.transparent ? 'rgba(0,0,0,0)' : d.bg },
    dotsOptions: dots,
    cornersSquareOptions: { type: d.corner, color: d.fg },
    cornersDotOptions: { color: d.fg },
  };
  if (d.logo) { opt.image = d.logo; opt.imageOptions = { crossOrigin: 'anonymous', margin: 4, imageSize: 0.32 }; }
  return opt;
}

let qrPreview = null;
function refreshQR() {
  const d = currentDesign();
  const dyn = $('g_dynamic').checked && isDynable($('g_type').value);
  const payload = buildPayload();
  const stage = $('qrPreview');

  // placeholder quando non c'è contenuto
  if (!payload && !dyn) {
    qrPreview = null;
    stage.innerHTML = `<div class="qr-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 21v.01M17 21h.01M21 17h.01"/></svg>
      Inserisci un contenuto per vedere l'anteprima del tuo QR</div>`;
    return;
  }
  const data = dyn ? `${redirectBase()}/PREVIEW` : payload;
  const opts = qrOptions(data, d);
  if (!qrPreview) { stage.innerHTML = ''; qrPreview = new QRCodeStyling(opts); qrPreview.append(stage); }
  else qrPreview.update(opts);
}

$('applyBrandBtn').onclick = () => {
  const b = STATE.branding;
  if (b.primary_color) { $('d_fg').value = b.primary_color; $('d_fg_t').value = b.primary_color; }
  if (b.background_color) { $('d_bg').value = b.background_color; $('d_bg_t').value = b.background_color; }
  if (b.logo_url) { LOGO_DATA = b.logo_url; }
  refreshQR(); toast('Branding applicato');
};

/* ===================== EXPORT ===================== */
/* il payload attualmente mostrato in anteprima (statico o placeholder dinamico) */
function currentQRData() {
  const dyn = $('g_dynamic').checked && isDynable($('g_type').value);
  const payload = buildPayload();
  if (!payload && !dyn) return null;
  return dyn ? `${redirectBase()}/PREVIEW` : payload;
}

async function exportQR(ext) {
  const data = currentQRData();
  if (!data) { toast('Inserisci un contenuto prima di scaricare', false); return; }
  const d = currentDesign();
  const name = ($('g_title').value || 'qr').replace(/[^\w\-]+/g, '_');
  // istanza dedicata: canvas per PNG/PDF (raster), svg per SVG (vettoriale), 1024px
  const isVec = ext === 'svg';
  const inst = new QRCodeStyling({ ...qrOptions(data, d, 1024), type: isVec ? 'svg' : 'canvas' });
  try {
    if (ext === 'pdf') {
      const blob = await inst.getRawData('png');
      const url = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
      const { jsPDF } = window.jspdf; const pdf = new jsPDF();
      pdf.addImage(url, 'PNG', 60, 60, 90, 90);
      pdf.save(name + '.pdf');
    } else {
      await inst.download({ name, extension: ext });
    }
  } catch (e) { toast('Errore export: ' + (e.message || e), false); }
}
$('dlPng').onclick = () => exportQR('png');
$('dlSvg').onclick = () => exportQR('svg');
$('dlPdf').onclick = () => exportQR('pdf');

/* ===================== SAVE QR ===================== */
function randCode(n = 7) {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789'; let s = '';
  const arr = crypto.getRandomValues(new Uint8Array(n));
  for (let i = 0; i < n; i++) s += a[arr[i] % a.length]; return s;
}

$('saveQrBtn').onclick = function () {
  const type = $('g_type').value;
  const dyn = $('g_dynamic').checked && isDynable(type);
  const payload = buildPayload();
  if (type === 'file' && !FILE_URL) { toast('Carica prima un file', false); return; }
  if (!payload) { toast('Inserisci un contenuto', false); return; }
  // validazione runtime per i tipi che lo richiedono
  if ((type === 'url' || (type === 'file' && dyn)) && !isUrl(payload)) { toast('URL non valida', false); return; }
  if (type === 'email' && !isEmail(fieldVal('email'))) { toast('Email non valida', false); return; }
  if ((type === 'tel' || type === 'sms') && !isTel(fieldVal('tel'))) { toast('Numero non valido', false); return; }

  const row = {
    tenant_id: STATE.tenantId, created_by: STATE.user.id,
    title: $('g_title').value || 'QR senza titolo', type,
    is_dynamic: dyn, design: currentDesign(),
  };
  if (dyn) { row.short_code = randCode(); row.destination = payload; row.content = `${redirectBase()}/${row.short_code}`; }
  else { row.content = payload; }

  return busy(this, 'Salvataggio…', async () => {
    const { error } = await sb.from('qr_codes').insert(row);
    if (error) { toast(error.message, false); return; }
    toast('QR salvato ✓');
  });
};

/* ===================== CODES LIST ===================== */
async function loadCodes() {
  const list = $('codesList');
  // skeleton shimmer durante il fetch (mai spinner)
  list.innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton sk-card"></div>').join('');
  const { data, error } = await sb.from('qr_codes').select('*').order('created_at', { ascending: false });
  if (error) {
    list.innerHTML = `<div class="empty"><div class="empty-t">Errore di caricamento</div>
      <div>${escapeHtml(error.message)}</div></div>`; return;
  }
  if (!data.length) {
    list.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 21v.01M17 21h.01M21 17h.01"/></svg>
      <div class="empty-t">Nessun QR, per ora</div>
      <div>Crea il tuo primo QR code brandizzato.</div>
      <button id="emptyGen">✨ Genera il primo QR</button></div>`;
    $('emptyGen').onclick = () => document.querySelector('.nav[data-page="generate"]').click();
    return;
  }
  list.innerHTML = '';
  data.forEach(q => {
    const card = el('div', 'card');
    const thumb = el('div', 'qrthumb'); card.appendChild(thumb);
    new QRCodeStyling(qrOptions(q.content || ' ', q.design || currentDesign(), 150)).append(thumb);
    card.appendChild(el('div', null,
      `<h4>${escapeHtml(q.title)}</h4>
       <span class="badge ${q.is_dynamic ? 'dyn' : 'stat'}">${q.is_dynamic ? 'Dinamico' : 'Statico'}</span>
       <span class="muted" style="font-size:12px"> · ${q.type}</span>`));
    const act = el('div', 'card-actions');
    if (q.is_dynamic) {
      const aBtn = el('button', 'btn-ghost btn-sm', '📊 Analytics'); aBtn.onclick = () => showAnalytics(q); act.appendChild(aBtn);
      const eBtn = el('button', 'btn-ghost btn-sm', '✏️ Destinazione'); eBtn.onclick = () => editDestination(q); act.appendChild(eBtn);
    }
    const dBtn = el('button', 'btn-danger btn-sm', '🗑'); dBtn.onclick = () => deleteQR(q.id); act.appendChild(dBtn);
    card.appendChild(act);
    list.appendChild(card);
  });
}

async function deleteQR(id) {
  if (!await confirmModal('Eliminare questo QR?', { ok: 'Elimina' })) return;
  const { error } = await sb.from('qr_codes').delete().eq('id', id);
  if (error) return toast(error.message, false);
  toast('Eliminato'); loadCodes();
}

function editDestination(q) {
  openModal(`
    <h3 style="margin-top:0">Modifica destinazione</h3>
    <p class="muted" style="font-size:13px">Il QR stampato resta lo stesso, cambia solo dove punta.</p>
    <div class="field"><label>Nuova URL</label><input id="newDest" value="${escapeHtml(q.destination || '')}"></div>
    <div class="row"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
    <button id="saveDest">Salva</button></div>`);
  $('saveDest').onclick = async () => {
    const { error } = await sb.from('qr_codes').update({ destination: $('newDest').value }).eq('id', q.id);
    if (error) return toast(error.message, false);
    closeModal(); toast('Destinazione aggiornata ✓');
  };
}

async function showAnalytics(q) {
  openModal(`<h3 style="margin-top:0">${escapeHtml(q.title)} — Analytics</h3>
    <div class="stat-grid"><div class="stat-box"><div class="n" id="aTot">…</div><div class="l">Scansioni totali</div></div>
    <div class="stat-box"><div class="n" id="a7">…</div><div class="l">Ultimi 7 giorni</div></div>
    <div class="stat-box"><div class="n" id="aShort" style="font-size:14px">/${q.short_code}</div><div class="l">Short code</div></div></div>
    <canvas id="aChart" height="140"></canvas>
    <div style="margin-top:10px"><b style="font-size:13px">Dispositivi</b><div id="aDev" class="swatches" style="margin-top:8px"></div></div>
    <div style="margin-top:14px;text-align:right"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`);
  const { data, error } = await sb.rpc('qr_analytics', { p_qr: q.id });
  if (error) { $('aTot').textContent = '0'; return; }
  const r = Array.isArray(data) ? data[0] : data;
  $('aTot').textContent = r.total || 0; $('a7').textContent = r.last_7 || 0;
  const byDay = r.by_day || {}; const labels = Object.keys(byDay); const vals = labels.map(k => byDay[k]);
  new Chart($('aChart'), { type: 'line', data: { labels, datasets: [{ label: 'Scansioni', data: vals, borderColor: '#8b5cf6', tension: .3, fill: false }] }, options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#9aa1b2' } }, y: { ticks: { color: '#9aa1b2' }, beginAtZero: true } } } });
  const dev = r.by_device || {}; $('aDev').innerHTML = Object.keys(dev).length ? Object.entries(dev).map(([k, v]) => `<span class="chip">${k}: <b>${v}</b></span>`).join('') : '<span class="muted">Nessun dato</span>';
}

/* ===================== BULK CSV ===================== */
$('bulkRun').onclick = () => {
  const btn = $('bulkRun');
  const f = $('bulkFile').files[0]; const m = $('bulkMsg');
  if (!f) { m.className = 'msg err'; m.textContent = 'Seleziona un CSV'; return; }
  const done = (cls, txt) => { m.className = 'msg ' + cls; m.textContent = txt; btn.disabled = false; btn.textContent = 'Genera ZIP'; };
  btn.disabled = true; btn.textContent = 'Elaborazione…';
  m.className = 'msg'; m.textContent = 'Elaborazione...';
  Papa.parse(f, {
    header: true, skipEmptyLines: true,
    error: err => done('err', 'CSV illeggibile: ' + err.message),
    complete: async res => {
      const rows = res.data; const zip = new JSZip(); const dyn = $('bulkDynamic').checked;
      const d = currentDesign(); const toInsert = [];
      let i = 0, made = 0;
      for (const row of rows) {
        i++;
        const title = row.title || row.name || ('qr_' + i);
        let data = row.content || row.url || row.destination || '';
        if (!data) continue;
        made++;
        if (dyn) {
          const code = randCode();
          const rb = redirectBase();
          toInsert.push({ tenant_id: STATE.tenantId, created_by: STATE.user.id, title, type: 'url', is_dynamic: true, short_code: code, destination: data, content: `${rb}/${code}`, design: d });
          data = `${rb}/${code}`;
        }
        const blob = await new QRCodeStyling(qrOptions(data, d, 600)).getRawData('png');
        zip.file(`${title.replace(/[^\w\-]+/g, '_')}.png`, blob);
      }
      if (!made) { done('err', 'Nessuna riga valida: servono colonne title e content/url/destination.'); return; }
      if (dyn && toInsert.length) { const { error } = await sb.from('qr_codes').insert(toInsert); if (error) { done('err', error.message); return; } }
      const content = await zip.generateAsync({ type: 'blob' });
      const stamp = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a'); a.href = URL.createObjectURL(content); a.download = `qr_bulk_${stamp}.zip`; a.click();
      done('ok', `Generati ${made} QR ✓${i > made ? ` · ${i - made} righe saltate` : ''}`);
    }
  });
};

/* ===================== BRANDING ===================== */
function fillBrandingForm() {
  const b = STATE.branding || {};
  $('b_name').value = b.company_name || '';
  if (b.primary_color) { $('b_primary').value = b.primary_color; $('b_primary_t').value = b.primary_color; }
  if (b.background_color) { $('b_bg').value = b.background_color; $('b_bg_t').value = b.background_color; }
  if (b.accent_color) { $('b_accent').value = b.accent_color; $('b_accent_t').value = b.accent_color; }
  if (b.logo_url) $('b_logo_prev').innerHTML = `<img src="${b.logo_url}" style="max-height:60px;border-radius:8px;background:#fff;padding:6px">`;
}

let B_LOGO_FILE = null;
$('b_logo').onchange = e => {
  B_LOGO_FILE = e.target.files[0];
  if (B_LOGO_FILE) { const r = new FileReader(); r.onload = () => $('b_logo_prev').innerHTML = `<img src="${r.result}" style="max-height:60px;border-radius:8px;background:#fff;padding:6px">`; r.readAsDataURL(B_LOGO_FILE); }
};

$('saveBranding').onclick = function () { return busy(this, 'Salvataggio…', async () => {
  const m = $('brandMsg'); m.className = 'msg'; m.textContent = 'Salvataggio...';
  let logo_url = STATE.branding.logo_url || null;
  if (B_LOGO_FILE) {
    const path = `${STATE.tenantId}/logo_${Date.now()}_${B_LOGO_FILE.name.replace(/[^\w.\-]+/g, '_')}`;
    const { error: upErr } = await sb.storage.from('logos').upload(path, B_LOGO_FILE, { upsert: true });
    if (upErr) { m.className = 'msg err'; m.textContent = upErr.message; return; }
    logo_url = sb.storage.from('logos').getPublicUrl(path).data.publicUrl;
  }
  const payload = {
    tenant_id: STATE.tenantId, company_name: $('b_name').value,
    primary_color: $('b_primary').value, background_color: $('b_bg').value,
    accent_color: $('b_accent').value, logo_url, updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from('branding').upsert(payload, { onConflict: 'tenant_id' });
  if (error) { m.className = 'msg err'; m.textContent = error.message; return; }
  STATE.branding = { ...STATE.branding, ...payload }; $('tenantName').textContent = payload.company_name || 'La tua azienda';
  m.className = 'msg ok'; m.textContent = 'Branding salvato ✓';
}); };

/* ===================== CUSTOM DOMAIN ===================== */
function renderDomain() {
  const b = STATE.branding || {};
  const has = b.custom_domain && b.domain_status && b.domain_status !== 'none';
  $('domainNone').classList.toggle('hidden', !!has);
  $('domainPending').classList.toggle('hidden', !has);
  if (has) {
    $('dom_host').textContent = b.custom_domain;
    const badge = $('dom_badge');
    if (b.domain_status === 'active') { badge.textContent = 'attivo ✓'; badge.className = 'badge stat'; badge.style.background = 'rgba(34,197,94,.2)'; badge.style.color = '#86efac'; }
    else { badge.textContent = 'in attesa DNS'; badge.className = 'badge dyn'; badge.style.background = ''; badge.style.color = ''; }
    $('dom_name').textContent = b.custom_domain;
    $('dom_target').textContent = QR_CONFIG.CNAME_TARGET;
  }
}

async function callDomains(action, domain) {
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch('/api/domains', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, domain }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || ('Errore ' + res.status));
  return data;
}

$('dom_add').onclick = function () {
  const m = $('domMsg'); const host = $('dom_input').value.trim();
  if (!host) { m.className = 'msg err'; m.textContent = 'Inserisci un dominio'; return; }
  m.className = 'msg'; m.textContent = 'Collegamento...';
  return busy(this, 'Collegamento…', async () => {
  try {
    const r = await callDomains('add', host);
    STATE.branding.custom_domain = r.hostname; STATE.branding.domain_status = 'pending';
    renderDomain(); m.className = 'msg ok'; m.textContent = 'Dominio collegato. Aggiungi il CNAME e premi Verifica.';
  } catch (e) { m.className = 'msg err'; m.textContent = e.message; }
  });
};

$('dom_verify').onclick = function () { return busy(this, 'Verifica…', async () => {
  const m = $('domMsg'); m.className = 'msg'; m.textContent = 'Verifica...';
  try {
    const r = await callDomains('status');
    STATE.branding.domain_status = r.status; renderDomain();
    if (r.status === 'active') { m.className = 'msg ok'; m.textContent = 'Dominio attivo ✓ I nuovi QR dinamici useranno il tuo dominio.'; }
    else { m.className = 'msg'; m.textContent = 'Ancora in attesa: il DNS può richiedere qualche minuto. Riprova tra poco.'; }
  } catch (e) { m.className = 'msg err'; m.textContent = e.message; }
}); };

$('dom_remove').onclick = async function () {
  if (!await confirmModal('Rimuovere il dominio custom?', { ok: 'Rimuovi' })) return;
  const m = $('domMsg'); m.className = 'msg'; m.textContent = 'Rimozione...';
  return busy(this, 'Rimozione…', async () => {
  try {
    await callDomains('remove');
    STATE.branding.custom_domain = null; STATE.branding.domain_status = 'none';
    renderDomain(); m.className = 'msg ok'; m.textContent = 'Dominio rimosso.';
  } catch (e) { m.className = 'msg err'; m.textContent = e.message; }
  });
};

/* ---------- modal helpers ---------- */
function openModal(html) { $('modalRoot').innerHTML = `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`; }
function closeModal() { $('modalRoot').innerHTML = ''; }
function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* modal di conferma (sostituisce confirm() nativo) */
function confirmModal(msg, { ok = 'Conferma', danger = true } = {}) {
  return new Promise(resolve => {
    openModal(`<h3 style="margin-top:0">Conferma</h3>
      <p class="muted" style="font-size:14px">${escapeHtml(msg)}</p>
      <div class="row" style="margin-top:16px;justify-content:flex-end">
        <button class="btn-ghost" id="cfNo">Annulla</button>
        <button class="${danger ? 'btn-danger' : ''}" id="cfYes">${escapeHtml(ok)}</button>
      </div>`);
    $('cfNo').onclick = () => { closeModal(); resolve(false); };
    $('cfYes').onclick = () => { closeModal(); resolve(true); };
  });
}

boot();
