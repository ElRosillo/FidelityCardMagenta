const DB_KEY = 'fidelidad-nails-db-v1';
const state = { pendingClient: null, pendingVisit: null, scanner: null, scanLocked: false };
const $ = (selector) => document.querySelector(selector);

function getClients() { return JSON.parse(localStorage.getItem(DB_KEY) || '[]'); }
function saveClients(clients) { localStorage.setItem(DB_KEY, JSON.stringify(clients)); }
function makeId() {
  const existingIds = new Set(getClients().map(client => client.id));
  let id;
  do { id = `CL-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`; } while (existingIds.has(id));
  return id;
}
function dateLabel(date = new Date()) { return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(date); }
function escapeHtml(value) { const box = document.createElement('div'); box.textContent = value; return box.innerHTML; }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2600); }
function cardUrl(id) { return `${location.origin}${location.pathname}?tarjeta=${encodeURIComponent(id)}`; }
function qrPayload(client) { return JSON.stringify({ type: 'fidelidad-checkin', id: client.id, key: client.checkinKey }); }

function go(view) {
  stopScanner();
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  $(`#${view}-view`).classList.add('active');
  $('#topbar-label').textContent = view === 'records' ? 'Base de datos' : 'Estudio de uñas';
  if (view === 'new-card') prepareNewClient();
  if (view === 'records') renderRecords();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function prepareNewClient() {
  state.pendingClient = { id: makeId(), registeredAt: new Date().toISOString() };
  $('#new-client-form').reset();
  $('#client-id').value = state.pendingClient.id;
  $('#register-date').value = dateLabel(new Date(state.pendingClient.registeredAt));
  setTimeout(() => $('#client-name').focus(), 100);
}

function registerClient(event) {
  event.preventDefault();
  const name = $('#client-name').value.trim();
  if (!name || !state.pendingClient) return;
  const client = { ...state.pendingClient, name, visits: 0, promotionsRedeemed: 0, checkinKey: crypto.randomUUID() };
  const clients = getClients();
  clients.push(client); saveClients(clients);
  $('#created-client-name').textContent = client.name;
  $('#created-client-meta').textContent = `${client.id} · Registrada ${dateLabel(new Date(client.registeredAt))}`;
  $('#card-url').textContent = cardUrl(client.id);
  $('#copy-card-link').dataset.url = cardUrl(client.id);
  go('card-created');
}

function parseCode(raw) {
  try { const data = JSON.parse(raw); return data?.type === 'fidelidad-checkin' && data.id && data.key ? data : null; } catch { return null; }
}
function foundQr(raw) {
  if (state.scanLocked) return;
  const data = parseCode(raw);
  if (!data) { toast('Este código no corresponde a una tarjeta de fidelidad.'); return; }
  const client = getClients().find(c => c.id === data.id && c.checkinKey === data.key);
  if (!client) { toast('El código ya no es válido.'); return; }
  state.scanLocked = true; state.pendingVisit = client; stopScanner();
  $('#visit-client-name').textContent = client.name;
  $('#visit-client-details').textContent = `${client.id} · ${client.visits} visita${client.visits === 1 ? '' : 's'} registrada${client.visits === 1 ? '' : 's'}`;
  $('#visit-confirmation').classList.remove('hidden');
  $('#scan-result').classList.add('hidden');
}
async function startScanner() {
  if (!window.Html5Qrcode) { toast('No fue posible cargar el lector. Puedes subir una imagen QR.'); return; }
  state.scanLocked = false; $('#visit-confirmation').classList.add('hidden');
  try { state.scanner = new Html5Qrcode('reader'); await state.scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, foundQr, () => {}); $('#start-scan').classList.add('hidden'); $('#stop-scan').classList.remove('hidden'); } catch { toast('No se pudo abrir la cámara. Revisa los permisos.'); stopScanner(); }
}
async function stopScanner() {
  if (state.scanner) { try { await state.scanner.stop(); } catch {} try { await state.scanner.clear(); } catch {} state.scanner = null; }
  $('#start-scan')?.classList.remove('hidden'); $('#stop-scan')?.classList.add('hidden');
}
async function scanFile(event) {
  const file = event.target.files[0]; if (!file) return;
  if (!window.Html5Qrcode) { toast('El lector no está disponible.'); return; }
  try { const scanner = new Html5Qrcode('reader'); const decoded = await scanner.scanFile(file, true); foundQr(decoded); } catch { toast('No se detectó un código QR en esta imagen.'); } finally { event.target.value = ''; }
}
function confirmVisit() {
  if (!state.pendingVisit) return;
  const clients = getClients(); const index = clients.findIndex(c => c.id === state.pendingVisit.id);
  if (index < 0) return toast('No encontramos esta clienta.');
  clients[index].visits += 1; saveClients(clients);
  toast(`Visita registrada para ${clients[index].name}.`); state.pendingVisit = null; state.scanLocked = false;
  $('#visit-confirmation').classList.add('hidden'); go('home');
}
function renderRecords() {
  const query = $('#record-search').value.trim().toLowerCase();
  const clients = getClients().filter(c => !query || c.name.toLowerCase().includes(query) || c.id.toLowerCase().includes(query));
  $('#record-count').textContent = `${clients.length} clienta${clients.length === 1 ? '' : 's'}`;
  $('#records-body').innerHTML = clients.map(c => `<tr><td>${c.id}</td><td>${escapeHtml(c.name)}</td><td><span class="pill">${c.visits}</span></td><td>${c.promotionsRedeemed}</td></tr>`).join('');
  $('#empty-records').classList.toggle('hidden', clients.length > 0);
}
function showPublicCard(id) {
  const client = getClients().find(c => c.id === id);
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  $('#public-card-view').classList.add('active'); $('.topbar').style.display = 'none';
  if (!client) { $('#public-client-name').textContent = 'Tarjeta no encontrada'; $('#public-visit-count').textContent = 'Verifica el enlace compartido.'; return; }
  $('#public-client-name').textContent = client.name.split(' ')[0]; $('#public-client-id').textContent = client.id;
  $('#public-visit-count').textContent = `${client.visits} visita${client.visits === 1 ? '' : 's'} registrada${client.visits === 1 ? '' : 's'}`;
  const target = $('#customer-qr'); target.innerHTML = ''; const renderQr = () => new QRCode(target, { text: qrPayload(client), width: 205, height: 205, colorDark: '#131217', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H });
  if (window.QRCode) renderQr(); else setTimeout(renderQr, 500);
}

document.addEventListener('DOMContentLoaded', () => {
  const cardId = new URLSearchParams(location.search).get('tarjeta'); if (cardId) return showPublicCard(cardId);
  document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => go(button.dataset.go)));
  $('#new-client-form').addEventListener('submit', registerClient);
  $('#copy-card-link').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#copy-card-link').dataset.url); toast('Link copiado.'); } catch { toast('Copia el link mostrado arriba.'); } });
  $('#start-scan').addEventListener('click', startScanner); $('#stop-scan').addEventListener('click', stopScanner); $('#qr-file').addEventListener('change', scanFile);
  $('#cancel-visit').addEventListener('click', () => { state.pendingVisit = null; state.scanLocked = false; $('#visit-confirmation').classList.add('hidden'); }); $('#confirm-visit').addEventListener('click', confirmVisit);
  $('#record-search').addEventListener('input', renderRecords);
});
