/**
 * KINGUSIA LED STUDIO — Główna logika aplikacji
 */

// ── State ──────────────────────────────────────────────────────
const state = {
  rooms: [],
  activeRoomId: null,
  products: { strips: [], profiles: [], psus: [] },
  chatHistory: []
};

const ROOM_TYPES = [
  { icon: '🛋️', name: 'Salon' },
  { icon: '🛏️', name: 'Sypialnia' },
  { icon: '🍳', name: 'Kuchnia' },
  { icon: '🛁', name: 'Łazienka' },
  { icon: '🏢', name: 'Biuro' },
  { icon: '🚪', name: 'Przedpokój' },
  { icon: '📚', name: 'Gabinet' },
  { icon: '🎮', name: 'Pokój gier' },
  { icon: '🛠️', name: 'Warsztat' },
  { icon: '🌿', name: 'Taras/Ogród' }
];

// ── Storage ────────────────────────────────────────────────────
function saveState() {
  try {
    localStorage.setItem('kingusia-state', JSON.stringify({
      rooms: state.rooms,
      activeRoomId: state.activeRoomId
    }));
  } catch (e) { }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem('kingusia-state') || '{}');
    if (Array.isArray(saved.rooms)) state.rooms = saved.rooms;
    if (saved.activeRoomId) state.activeRoomId = saved.activeRoomId;
  } catch (e) { }
}

// ── Products ───────────────────────────────────────────────────
async function loadProducts() {
  try {
    const res = await fetch('./data/products.json');
    const data = await res.json();
    state.products.strips = data.filter(p => p.type === 'led_strip');
    state.products.profiles = data.filter(p => p.type === 'profile');
    state.products.psus = data.filter(p => p.type === 'psu');
  } catch (e) {
    console.warn('Nie można załadować produktów:', e);
  }
}

// ── Rooms ──────────────────────────────────────────────────────
function createRoom(name, icon) {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    name: name || 'Pomieszczenie',
    icon: icon || '🛋️',
    length: 3,
    stripId: '',
    profileId: '',
    notes: ''
  };
}

function addRoom(name, icon) {
  const room = createRoom(name, icon);
  state.rooms.push(room);
  state.activeRoomId = room.id;
  saveState();
  renderAll();
}

function deleteRoom(id) {
  state.rooms = state.rooms.filter(r => r.id !== id);
  if (state.activeRoomId === id) {
    state.activeRoomId = state.rooms.length ? state.rooms[state.rooms.length - 1].id : null;
  }
  saveState();
  renderAll();
}

function setActiveRoom(id) {
  state.activeRoomId = id;
  saveState();
  renderAll();
}

function getActiveRoom() {
  return state.rooms.find(r => r.id === state.activeRoomId) || null;
}

function updateRoom(id, field, value) {
  const room = state.rooms.find(r => r.id === id);
  if (!room) return;
  room[field] = value;
  saveState();
  renderAll();
}

function cycleIcon(id) {
  const room = state.rooms.find(r => r.id === id);
  if (!room) return;
  const idx = ROOM_TYPES.findIndex(t => t.icon === room.icon);
  room.icon = ROOM_TYPES[(idx + 1) % ROOM_TYPES.length].icon;
  saveState();
  renderAll();
}

// ── Calculations ───────────────────────────────────────────────
function calcRoom(room) {
  const strip = state.products.strips.find(s => s.id === room.stripId) || null;
  const profile = state.products.profiles.find(p => p.id === room.profileId) || null;
  const len = parseFloat(room.length) || 0;

  if (!strip) return { watts: 0, amps: 0, lumens: 0, totalCost: 0, strip: null, profile, psuNeeded: null };

  const watts = strip.wattsPerMeter * len;
  const amps = watts / strip.voltage;
  const lumens = strip.lumensPerMeter * len;
  const stripCost = strip.pricePerMeter * len;
  const profileCost = profile ? profile.pricePerMeter * len : 0;

  const wattNeeded = watts * 1.2;
  const compatiblePsus = state.products.psus.filter(p => p.voltage === strip.voltage && p.watts >= wattNeeded);
  const psuNeeded = compatiblePsus.length > 0
    ? compatiblePsus.reduce((a, b) => a.watts < b.watts ? a : b)
    : null;

  const totalCost = stripCost + profileCost + (psuNeeded ? psuNeeded.price : 0);
  return { watts, amps, lumens, totalCost, stripCost, profileCost, strip, profile, psuNeeded };
}

function calcTotal() {
  return state.rooms.reduce((sum, room) => sum + (calcRoom(room).totalCost || 0), 0);
}

// ── Rendering ──────────────────────────────────────────────────
function renderAll() {
  renderSidebar();
  renderMain();
  updateSummaryBar();
}

function renderSidebar() {
  const list = document.getElementById('rooms-list');
  if (!list) return;

  if (state.rooms.length === 0) {
    list.innerHTML = `<div style="padding:24px 12px;text-align:center;color:var(--text-3);font-size:12px;">
      Brak pomieszczeń.<br/>Kliknij <strong>+</strong> aby dodać pierwsze.
    </div>`;
  } else {
    list.innerHTML = '';
    state.rooms.forEach(room => {
      const calc = calcRoom(room);
      const isActive = room.id === state.activeRoomId;
      const card = document.createElement('div');
      card.className = `room-card ${isActive ? 'active' : ''}`;
      card.innerHTML = `
        <div class="room-icon">${room.icon}</div>
        <div class="room-info">
          <div class="room-name">${escHtml(room.name)}</div>
          <div class="room-meta">${room.length}m · ${calc.strip ? calc.strip.kelvinLabel : 'brak taśmy'}</div>
        </div>
        <button class="room-delete" title="Usuń">✕</button>`;
      card.addEventListener('click', () => setActiveRoom(room.id));
      card.querySelector('.room-delete').addEventListener('click', e => {
        e.stopPropagation();
        deleteRoom(room.id);
      });
      list.appendChild(card);
    });
  }

  const total = calcTotal();
  const totalEl = document.getElementById('sidebar-total');
  if (totalEl) totalEl.textContent = `${total.toFixed(2)} zł`;
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderMain() {
  const wrap = document.getElementById('main-content');
  if (!wrap) return;

  const room = getActiveRoom();
  if (!room) {
    wrap.innerHTML = `<div class="empty-state">
      <div class="empty-icon">💡</div>
      <div class="empty-title">Brak wybranego pomieszczenia</div>
      <div class="empty-desc">Dodaj pomieszczenie po lewej i skonfiguruj oświetlenie LED.</div>
      <button class="empty-action" id="empty-add-btn">+ Dodaj pomieszczenie</button>
    </div>`;
    document.getElementById('empty-add-btn').addEventListener('click', openAddModal);
    return;
  }

  const calc = calcRoom(room);
  const strip = calc.strip;
  const lightColor = strip ? strip.color : '#333';
  const rgb = strip ? hexToRgb(lightColor) : '80,80,80';

  wrap.innerHTML = `<div class="room-config">
    <div class="config-header">
      <div class="config-room-icon" id="cycle-icon-btn" title="Kliknij aby zmienić">${room.icon}</div>
      <div class="config-room-name">
        <input id="room-name-input" value="${escHtml(room.name)}" placeholder="Nazwa pomieszczenia"/>
      </div>
    </div>

    <div class="visualizer">
      <div class="visualizer-label">⚡ Podgląd oświetlenia</div>
      <div class="led-preview">
        ${strip ? `
          <div class="led-glow" style="background:radial-gradient(ellipse at bottom,rgba(${rgb},0.35) 0%,transparent 70%)"></div>
          <div class="led-strip-visual" style="background:${lightColor};box-shadow:0 0 12px 4px rgba(${rgb},0.6)"></div>
          <div class="led-dots">${Array(22).fill(0).map(() =>
    `<div class="led-dot" style="background:${lightColor};box-shadow:0 0 6px ${lightColor}"></div>`).join('')}
          </div>` :
      '<span class="no-strip-msg">Wybierz taśmę LED aby zobaczyć podgląd</span>'}
      </div>
      <div class="stats-row">
        <div class="stat-box">
          <span class="stat-label">Długość</span>
          <span class="stat-value">${room.length}</span>
          <span class="stat-unit">metrów</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">Moc</span>
          <span class="stat-value">${calc.watts.toFixed(0)}</span>
          <span class="stat-unit">Watt</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">Strumień</span>
          <span class="stat-value">${calc.lumens.toFixed(0)}</span>
          <span class="stat-unit">lumen</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">Koszt</span>
          <span class="stat-value" style="color:var(--orange)">${calc.totalCost.toFixed(0)}</span>
          <span class="stat-unit">PLN</span>
        </div>
      </div>
    </div>

    <div class="config-grid">
      <div class="config-section">
        <div class="section-title">💡 Taśma LED</div>
        <div class="config-field">
          <div class="field-label">Długość instalacji</div>
          <div class="length-slider-wrap">
            <input type="range" id="len-slider" min="0.5" max="20" step="0.5" value="${room.length}"/>
            <span class="length-val" id="len-val">${room.length}m</span>
          </div>
        </div>
        <div class="config-field">
          <div class="field-label">Model taśmy</div>
          <select class="field-control" id="strip-select">
            <option value="">— Wybierz taśmę LED —</option>
            ${state.products.strips.map(s =>
        `<option value="${s.id}" ${s.id === room.stripId ? 'selected' : ''}>${escHtml(s.name)} | ${s.voltage}V | IP${s.ip}</option>`
      ).join('')}
          </select>
        </div>
        ${strip ? `<div style="margin-top:10px;padding:10px;background:var(--bg-4);border-radius:8px;font-size:12px;color:var(--text-2)">
          🌡️ ${strip.kelvinLabel} &nbsp;|&nbsp; ⚡ ${strip.voltage}V &nbsp;|&nbsp; 💡 ${strip.wattsPerMeter}W/m &nbsp;|&nbsp; 🔒 IP${strip.ip}
        </div>` : ''}
      </div>

      <div class="config-section">
        <div class="section-title">🔧 Profil i zasilacz</div>
        <div class="config-field">
          <div class="field-label">Profil aluminiowy</div>
          <select class="field-control" id="profile-select">
            <option value="">— Bez profilu —</option>
            ${state.products.profiles.map(p =>
        `<option value="${p.id}" ${p.id === room.profileId ? 'selected' : ''}>${escHtml(p.name)}</option>`
      ).join('')}
          </select>
        </div>
        <div class="config-field">
          <div class="field-label">Zalecany zasilacz</div>
          ${calc.psuNeeded
      ? `<div style="background:var(--bg-4);border:1px solid var(--glass-border);border-radius:8px;padding:10px 12px;font-size:13px;">
                <strong>⚡ ${escHtml(calc.psuNeeded.name)}</strong>
                <div style="font-size:11px;color:var(--text-3);margin-top:4px">Moc: ${calc.psuNeeded.watts}W | Cena: ${calc.psuNeeded.price} zł <span style="color:var(--success)">✓ Kompatybilny</span></div>
              </div>`
      : `<div style="background:var(--bg-4);border-radius:8px;padding:10px 12px;font-size:13px;color:var(--text-3)">
                ${strip ? '⚠️ Dobierz zasilacz ręcznie' : 'Wybierz taśmę aby dobrać zasilacz'}
              </div>`}
        </div>
        <div class="config-field">
          <div class="field-label">Notatka</div>
          <textarea class="field-control" id="room-notes" rows="2" style="resize:none"
            placeholder="np. listwa podwieszana, akcentowe...">${escHtml(room.notes || '')}</textarea>
        </div>
      </div>
    </div>
  </div>`;

  // Attach events
  document.getElementById('cycle-icon-btn').addEventListener('click', () => cycleIcon(room.id));

  document.getElementById('room-name-input').addEventListener('change', function () {
    updateRoom(room.id, 'name', this.value);
  });

  const lenSlider = document.getElementById('len-slider');
  lenSlider.addEventListener('input', function () {
    document.getElementById('len-val').textContent = this.value + 'm';
  });
  lenSlider.addEventListener('change', function () {
    updateRoom(room.id, 'length', parseFloat(this.value));
  });

  document.getElementById('strip-select').addEventListener('change', function () {
    updateRoom(room.id, 'stripId', this.value);
  });

  document.getElementById('profile-select').addEventListener('change', function () {
    updateRoom(room.id, 'profileId', this.value);
  });

  document.getElementById('room-notes').addEventListener('change', function () {
    updateRoom(room.id, 'notes', this.value);
  });
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function updateSummaryBar() {
  const rooms = state.rooms;
  const totalLen = rooms.reduce((s, r) => s + (parseFloat(r.length) || 0), 0);
  let totalW = 0, totalCost = 0;
  for (const r of rooms) {
    const c = calcRoom(r);
    totalW += c.watts;
    totalCost += c.totalCost || 0;
  }
  const el = id => document.getElementById(id);
  if (el('sum-rooms')) el('sum-rooms').textContent = rooms.length;
  if (el('sum-length')) el('sum-length').textContent = totalLen.toFixed(1) + ' m';
  if (el('sum-power')) el('sum-power').textContent = totalW.toFixed(0) + ' W';
  if (el('sum-cost')) el('sum-cost').textContent = totalCost.toFixed(2) + ' zł';
}

// ── Modal ──────────────────────────────────────────────────────
function openAddModal() {
  document.getElementById('modal-overlay').classList.add('open');
  const nameInput = document.getElementById('modal-room-name');
  nameInput.value = '';
  setTimeout(() => nameInput.focus(), 80);

  const picker = document.getElementById('icon-picker');
  picker.innerHTML = '';
  ROOM_TYPES.forEach((rt, i) => {
    const div = document.createElement('div');
    div.className = `icon-opt ${i === 0 ? 'selected' : ''}`;
    div.dataset.icon = rt.icon;
    div.dataset.name = rt.name;
    div.title = rt.name;
    div.textContent = rt.icon;
    div.addEventListener('click', () => {
      picker.querySelectorAll('.icon-opt').forEach(e => e.classList.remove('selected'));
      div.classList.add('selected');
      if (!nameInput.value.trim()) nameInput.value = rt.name;
    });
    picker.appendChild(div);
  });
}

function closeAddModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function confirmAddRoom() {
  const nameInput = document.getElementById('modal-room-name');
  const selectedIcon = document.querySelector('#icon-picker .icon-opt.selected');
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  const icon = selectedIcon ? selectedIcon.dataset.icon : '🛋️';
  closeAddModal();
  addRoom(name, icon);
}

// ── Chat ───────────────────────────────────────────────────────
function appendMessage(role, text) {
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = `
    <div class="msg-avatar">${role === 'ai' ? '✨' : '👤'}</div>
    <div class="msg-bubble">${String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function showTyping() {
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.id = 'typing-indicator';
  div.className = 'chat-msg ai';
  div.innerHTML = `<div class="msg-avatar">✨</div>
    <div class="msg-bubble"><div class="typing-indicator">
      <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
    </div></div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}
function hideTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = '';

  appendMessage('user', text);
  state.chatHistory.push({ role: 'user', content: text });

  const sendBtn = document.getElementById('chat-send');
  sendBtn.disabled = true;
  showTyping();

  try {
    const room = getActiveRoom();
    const ctx = room ? `[Pomieszczenie: "${room.name}" ${room.icon}, długość: ${room.length}m, taśma: ${calcRoom(room).strip?.name || 'brak'}]` : '';
    const msgs = ctx
      ? [{ role: 'user', content: ctx }, { role: 'assistant', content: 'Rozumiem kontekst, pomagam.' }, ...state.chatHistory]
      : [...state.chatHistory];

    hideTyping();
    const aiEl = appendMessage('ai', '');
    const bubble = aiEl.querySelector('.msg-bubble');
    let full = '';

    const gen = OllamaClient.chat(msgs, (token, accumulated) => {
      full = accumulated;
      bubble.innerHTML = accumulated.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
      document.getElementById('chat-messages').scrollTop = 99999;
    });

    // consume async generator
    for await (const _ of gen) { /* streaming handled via callback */ }

    if (!full) {
      bubble.innerHTML = '⚠️ Pusta odpowiedź — sprawdź czy model Ollama jest załadowany.';
    }

    state.chatHistory.push({ role: 'assistant', content: full || '' });
    if (state.chatHistory.length > 20) state.chatHistory = state.chatHistory.slice(-16);

  } catch (err) {
    hideTyping();
    const errMsg = OllamaClient.isOnline()
      ? `Błąd AI: ${err.message}`
      : '⚠️ Ollama offline.\n\nUruchom: `ollama serve`\nPotem wróć i odśwież stronę.';
    appendMessage('ai', errMsg);
  }

  sendBtn.disabled = false;
}

function sendQuickPrompt(text) {
  document.getElementById('chat-input').value = text;
  sendChat();
}

// ── Export ────────────────────────────────────────────────────
function exportQuote() {
  if (state.rooms.length === 0) { alert('Brak pomieszczeń do wyeksportowania!'); return; }
  let totalCost = 0;
  const lines = [
    '═══════════════════════════════════════',
    '   KINGUSIA LED STUDIO — Wycena LED',
    `   ${new Date().toLocaleDateString('pl-PL')}`,
    '═══════════════════════════════════════', ''
  ];
  for (const room of state.rooms) {
    const c = calcRoom(room);
    lines.push(`${room.icon} ${room.name} (${room.length}m)`);
    lines.push(`   Taśma:    ${c.strip ? c.strip.name : 'brak'}`);
    lines.push(`   Profil:   ${c.profile ? c.profile.name : 'brak'}`);
    lines.push(`   Zasilacz: ${c.psuNeeded ? c.psuNeeded.name : '—'}`);
    lines.push(`   Moc: ${c.watts.toFixed(0)}W  Strumień: ${c.lumens.toFixed(0)} lm`);
    lines.push(`   Koszt: ${c.totalCost.toFixed(2)} zł`);
    if (room.notes) lines.push(`   Notatka: ${room.notes}`);
    lines.push('');
    totalCost += c.totalCost || 0;
  }
  lines.push('───────────────────────────────────────');
  lines.push(`ŁĄCZNIE: ${totalCost.toFixed(2)} zł`);
  lines.push('═══════════════════════════════════════');
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `led-wycena-${new Date().toISOString().slice(0, 10)}.txt` });
  a.click();
  URL.revokeObjectURL(url);
}

// ── Ollama Status ──────────────────────────────────────────────
async function updateOllamaStatus() {
  const status = await OllamaClient.checkStatus();
  const dot = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  const badge = document.getElementById('model-badge');
  const banner = document.getElementById('ollama-offline-banner');
  if (status.online && status.activeModel) {
    dot.className = 'status-dot online';
    label.textContent = 'Ollama online';
    badge.textContent = status.activeModel;
    banner.classList.remove('visible');
  } else {
    dot.className = 'status-dot offline';
    label.textContent = 'Ollama offline';
    badge.textContent = 'brak modelu';
    banner.classList.add('visible');
  }
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  loadState();
  await loadProducts();
  renderAll();
  updateOllamaStatus();
  setInterval(updateOllamaStatus, 30000);

  // Chat input
  const chatInput = document.getElementById('chat-input');
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
  chatInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
  });

  // Modal
  document.getElementById('modal-room-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmAddRoom();
    if (e.key === 'Escape') closeAddModal();
  });

  // Buttons
  document.getElementById('add-room-btn')?.addEventListener('click', openAddModal);
  document.getElementById('add-room-header-btn')?.addEventListener('click', openAddModal);
  document.getElementById('export-btn')?.addEventListener('click', exportQuote);
  document.getElementById('chat-send')?.addEventListener('click', sendChat);
  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeAddModal();
  });
  document.getElementById('modal-cancel-btn')?.addEventListener('click', closeAddModal);
  document.getElementById('modal-confirm-btn')?.addEventListener('click', confirmAddRoom);
}

document.addEventListener('DOMContentLoaded', init);
