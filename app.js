const state = { pendingClient: null, pendingVisit: null, scanner: null, scanLocked: false, intendedView: 'home', db: null, user: null };
const $ = (selector) => document.querySelector(selector);
const privateViews = new Set(['new-card', 'scan', 'records']);

function makeId() { return `CL-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`; }
function dateLabel(date = new Date()) { return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(date); }
function escapeHtml(value) { const box = document.createElement('div'); box.textContent = value; return box.innerHTML; }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2600); }
function cardUrl(id) { return `${location.origin}${location.pathname}?tarjeta=${encodeURIComponent(id)}`; }
function qrPayload(client) { return JSON.stringify({ type: 'fidelidad-checkin', id: client.id, key: client.checkin_key }); }
function dbError(error, fallback) { console.error(error); return error?.message || fallback; }

function initSupabase() {
  const config = window.SUPABASE_CONFIG || {};
  if (window.supabase && /^https:\/\//.test(config.url || '') && config.anonKey && !config.anonKey.startsWith('PEGA_')) state.db = window.supabase.createClient(config.url, config.anonKey);
}
async function refreshSession() { if (!state.db) return; const { data } = await state.db.auth.getSession(); state.user = data.session?.user || null; }

async function go(view) {
  stopScanner();
  if (privateViews.has(view)) {
    if (!state.db) return toast('Falta conectar Supabase. Revisa supabase-config.js.');
    if (!state.user) { state.intendedView = view; view = 'login'; }
  }
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  $(`#${view}-view`).classList.add('active');
  $('#topbar-label').textContent = view === 'records' ? 'Base de datos' : 'Estudio de uñas';
  if (view === 'new-card') prepareNewClient();
  if (view === 'records') await renderRecords();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function prepareNewClient() {
  state.pendingClient = { id: makeId() };
  $('#new-client-form').reset(); $('#client-id').value = state.pendingClient.id; $('#register-date').value = dateLabel();
  setTimeout(() => $('#client-name').focus(), 100);
}
async function registerClient(event) {
  event.preventDefault(); const name = $('#client-name').value.trim(); if (!name || !state.pendingClient) return;
  const submit = event.submitter; submit.disabled = true; submit.textContent = 'Guardando…';
  const { data, error } = await state.db.rpc('create_client', { p_name: name, p_client_id: state.pendingClient.id });
  submit.disabled = false; submit.innerHTML = 'Confirmar registro <span>→</span>';
  if (error) return toast(dbError(error, 'No se pudo crear la tarjeta.'));
  const client = Array.isArray(data) ? data[0] : data;
  $('#created-client-name').textContent = client.name;
  $('#created-client-meta').textContent = `${client.id} · Registrada ${dateLabel(new Date(client.registered_at))}`;
  $('#card-url').textContent = cardUrl(client.id); $('#copy-card-link').dataset.url = cardUrl(client.id); await go('card-created');
}

function parseCode(raw) { try { const data = JSON.parse(raw); return data?.type === 'fidelidad-checkin' && data.id && data.key ? data : null; } catch { return null; } }
async function foundQr(raw) {
  if (state.scanLocked) return; const code = parseCode(raw);
  if (!code) return toast('Este código no corresponde a una tarjeta de fidelidad.');
  state.scanLocked = true; stopScanner();
  const { data, error } = await state.db.rpc('validate_checkin', { p_client_id: code.id, p_checkin_key: code.key });
  if (error || !data?.[0]) { state.scanLocked = false; return toast('El código ya no es válido.'); }
  state.pendingVisit = { ...data[0], key: code.key };
  $('#visit-client-name').textContent = state.pendingVisit.name;
  const visits = state.pendingVisit.visits; $('#visit-client-details').textContent = `${state.pendingVisit.client_id} · ${visits} visita${visits === 1 ? '' : 's'} registrada${visits === 1 ? '' : 's'}`;
  $('#visit-confirmation').classList.remove('hidden'); $('#scan-result').classList.add('hidden');
}
async function startScanner() {
  if (!window.Html5Qrcode) return toast('No fue posible cargar el lector. Puedes subir una imagen QR.');
  state.scanLocked = false; $('#visit-confirmation').classList.add('hidden');
  try { state.scanner = new Html5Qrcode('reader'); await state.scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, foundQr, () => {}); $('#start-scan').classList.add('hidden'); $('#stop-scan').classList.remove('hidden'); } catch { toast('No se pudo abrir la cámara. Revisa los permisos.'); stopScanner(); }
}
async function stopScanner() { if (state.scanner) { try { await state.scanner.stop(); } catch {} try { await state.scanner.clear(); } catch {} state.scanner = null; } $('#start-scan')?.classList.remove('hidden'); $('#stop-scan')?.classList.add('hidden'); }
async function scanFile(event) { const file = event.target.files[0]; if (!file || !window.Html5Qrcode) return; try { const scanner = new Html5Qrcode('reader'); foundQr(await scanner.scanFile(file, true)); } catch { toast('No se detectó un código QR en esta imagen.'); } finally { event.target.value = ''; } }
async function confirmVisit() {
  if (!state.pendingVisit) return; const button = $('#confirm-visit'); button.disabled = true;
  const { error } = await state.db.rpc('register_visit', { p_client_id: state.pendingVisit.client_id, p_checkin_key: state.pendingVisit.key }); button.disabled = false;
  if (error) return toast(dbError(error, 'No se pudo registrar la visita.'));
  toast(`Visita registrada para ${state.pendingVisit.name}.`); state.pendingVisit = null; state.scanLocked = false; $('#visit-confirmation').classList.add('hidden'); await go('home');
}
async function renderRecords() {
  const query = $('#record-search').value.trim().toLowerCase(); const { data, error } = await state.db.rpc('list_client_records');
  if (error) return toast(dbError(error, 'No se pudieron consultar los registros.'));
  const clients = data.filter(c => !query || c.name.toLowerCase().includes(query) || c.client_id.toLowerCase().includes(query));
  $('#record-count').textContent = `${clients.length} clienta${clients.length === 1 ? '' : 's'}`;
  $('#records-body').innerHTML = clients.map(c => `<tr><td>${c.client_id}</td><td>${escapeHtml(c.name)}</td><td><span class="pill">${c.visits_registered}</span></td><td>${c.promotions_redeemed}</td></tr>`).join(''); $('#empty-records').classList.toggle('hidden', clients.length > 0);
}
async function showPublicCard(id) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active')); $('#public-card-view').classList.add('active'); $('.topbar').style.display = 'none';
  if (!state.db) { $('#public-client-name').textContent = 'Tarjeta no configurada'; $('#public-visit-count').textContent = 'El estudio debe conectar Supabase.'; return; }
  const { data, error } = await state.db.rpc('get_public_card', { p_client_id: id }); const client = Array.isArray(data) ? data[0] : null;
  if (error || !client) { $('#public-client-name').textContent = 'Tarjeta no encontrada'; $('#public-visit-count').textContent = 'Verifica el enlace compartido.'; return; }
  $('#public-client-name').textContent = client.name.split(' ')[0]; $('#public-client-id').textContent = client.client_id; $('#public-visit-count').textContent = `${client.visits} visita${client.visits === 1 ? '' : 's'} registrada${client.visits === 1 ? '' : 's'}`;
  const target = $('#customer-qr'); target.innerHTML = ''; const renderQr = () => new QRCode(target, { text: qrPayload({ id: client.client_id, checkin_key: client.checkin_key }), width: 205, height: 205, colorDark: '#131217', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H }); if (window.QRCode) renderQr(); else setTimeout(renderQr, 500);
}
async function login(event) {
  event.preventDefault(); if (!state.db) return; const errorEl = $('#login-error'); errorEl.classList.add('hidden');
  const submit = event.submitter; submit.disabled = true; const { error } = await state.db.auth.signInWithPassword({ email: $('#login-email').value.trim(), password: $('#login-password').value }); submit.disabled = false;
  if (error) { errorEl.textContent = 'No fue posible iniciar sesión. Revisa tus datos.'; errorEl.classList.remove('hidden'); return; }
  await refreshSession(); await go(state.intendedView);
}

document.addEventListener('DOMContentLoaded', async () => {
  initSupabase(); await refreshSession(); const cardId = new URLSearchParams(location.search).get('tarjeta'); if (cardId) return showPublicCard(cardId);
  document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => go(button.dataset.go)));
  $('#new-client-form').addEventListener('submit', registerClient); $('#login-form').addEventListener('submit', login);
  $('#copy-card-link').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#copy-card-link').dataset.url); toast('Link copiado.'); } catch { toast('Copia el link mostrado arriba.'); } });
  $('#start-scan').addEventListener('click', startScanner); $('#stop-scan').addEventListener('click', stopScanner); $('#qr-file').addEventListener('change', scanFile);
  $('#cancel-visit').addEventListener('click', () => { state.pendingVisit = null; state.scanLocked = false; $('#visit-confirmation').classList.add('hidden'); }); $('#confirm-visit').addEventListener('click', confirmVisit); $('#record-search').addEventListener('input', renderRecords);
});
