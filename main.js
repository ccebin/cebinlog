import { DataSet, Network } from 'vis-network/standalone';

// --- STATE ---
let currentUser = JSON.parse(localStorage.getItem('nexus_user')) || null;
let currentToken = localStorage.getItem('nexus_token') || null;
let activeView = 'dashboard';
let people = [];
let network = null;

const API_BASE = 'http://localhost:3001/api';

// --- UTILS ---
const $ = (id) => document.getElementById(id);
const hide = (el) => el.style.display = 'none';
const show = (el, flex = false) => el.style.display = flex ? 'flex' : 'block';

// --- AUTH ---
function updateAuthUI() {
  if (currentUser) {
    $('login-screen').classList.remove('active');
    $('main-layout').classList.add('active');
    $('user-name').textContent = currentUser.display_name;
    $('user-role').textContent = currentUser.role === 'admin' ? 'Yönetici' : 'Operatör';
    renderView(activeView);
  } else {
    $('login-screen').classList.add('active');
    $('main-layout').classList.remove('active');
  }
}

async function handleAuth(mode) {
  const username = $('login-username').value;
  const password = $('login-password').value;
  const display_name = $('login-displayname').value;

  const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
  const body = { username, password, display_name };

  try {
    const res = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    if (mode === 'login') {
      currentUser = data.user;
      currentToken = data.token;
      localStorage.setItem('nexus_user', JSON.stringify(currentUser));
      localStorage.setItem('nexus_token', currentToken);
      updateAuthUI();
    } else {
      alert('Kayıt başarılı! Şimdi giriş yapabilirsiniz.');
      toggleAuthMode(false);
    }
  } catch (err) {
    alert(err.message);
  }
}

function toggleAuthMode(isRegister) {
  const submitBtn = $('auth-submit');
  const toggleLink = $('toggle-auth');
  const displayNameGroup = $('display-name-group');

  if (isRegister) {
    submitBtn.textContent = 'Kayıt Ol';
    toggleLink.textContent = 'Giriş Yap';
    displayNameGroup.style.display = 'block';
    submitBtn.onclick = () => handleAuth('register');
  } else {
    submitBtn.textContent = 'Giriş Yap';
    toggleLink.textContent = 'Kayıt Ol';
    displayNameGroup.style.display = 'none';
    submitBtn.onclick = () => handleAuth('login');
  }
}

// --- API WRAPPER ---
async function api(endpoint, method = 'GET', body = null) {
  const headers = { 'Authorization': `Bearer ${currentToken}` };
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(API_BASE + endpoint, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });
  if (res.status === 401) {
    logout();
    return null;
  }
  return res.json();
}

function logout() {
  currentUser = null;
  currentToken = null;
  localStorage.removeItem('nexus_user');
  localStorage.removeItem('nexus_token');
  updateAuthUI();
}

// --- VIEWS ---
async function renderView(view) {
  activeView = view;
  const container = $('view-container');
  container.innerHTML = '<div class="loading">Yükleniyor...</div>';

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  switch (view) {
    case 'dashboard':
      await renderDashboard(container);
      break;
    case 'people':
      await renderPeople(container);
      break;
    case 'gallery':
      await renderGallery(container);
      break;
    case 'graph':
      renderGraph(container);
      break;
    case 'logs':
      await renderGlobalLogs(container);
      break;
    case 'settings':
      renderSettings(container);
      break;
  }
}

async function renderDashboard(container) {
  const data = await api('/people');
  people = data || [];
  container.innerHTML = `
    <h2 style="margin-bottom: 24px;">Son İstihbarat Dosyaları</h2>
    <div class="target-grid" id="dashboard-grid"></div>
  `;
  const grid = $('dashboard-grid');
  people.slice(0, 6).forEach(p => grid.appendChild(createTargetCard(p)));
}

async function renderPeople(container) {
  const data = await api('/people');
  people = data || [];
  container.innerHTML = `
    <h2 style="margin-bottom: 24px;">Tüm Hedefler (${people.length})</h2>
    <div class="target-grid" id="people-grid"></div>
  `;
  const grid = $('people-grid');
  people.forEach(p => grid.appendChild(createTargetCard(p)));
}

function createTargetCard(p) {
  const card = document.createElement('div');
  card.className = 'target-card glass';
  const banner = p.banner ? `https://cdn.discordapp.com/banners/${p.id}/${p.banner}.png?size=600` : '';
  const avatar = p.avatar ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png?size=128` : 'https://cdn.discordapp.com/embed/avatars/0.png';
  
  card.innerHTML = `
    <div class="banner-preview" style="background-image: url('${banner}')"></div>
    <div class="target-card-header">
      <img src="${avatar}" class="target-avatar">
      <div class="target-info">
        <h3>${p.display_name || p.username}</h3>
        <div class="username">@${p.username}</div>
      </div>
    </div>
    <div style="font-size: 12px; color: var(--text-dim); margin-top: 8px;">
      ID: ${p.id}
    </div>
  `;
  card.onclick = () => renderTargetDetail(p.id);
  return card;
}

async function renderTargetDetail(id) {
  const p = people.find(x => x.id === id);
  const logs = await api(`/logs/${id}`);
  const media = await api(`/media/${id}`);

  const overlay = $('modal-overlay');
  const content = $('modal-content');
  show(overlay, true);

  const banner = p.banner ? `https://cdn.discordapp.com/banners/${p.id}/${p.banner}.png?size=1024` : '';
  const avatar = p.avatar ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png?size=256` : 'https://cdn.discordapp.com/embed/avatars/0.png';

  content.innerHTML = `
    <div class="profile-header">
      <div class="profile-banner" style="height: 120px; background: url('${banner}') center/cover; border-radius: 12px; margin-bottom: -40px;"></div>
      <div style="display: flex; align-items: flex-end; gap: 20px; padding: 0 20px;">
        <img src="${avatar}" style="width: 80px; height: 80px; border-radius: 50%; border: 4px solid var(--bg-dark); z-index: 1;">
        <div style="padding-bottom: 10px;">
          <h2 style="margin: 0;">${p.display_name}</h2>
          <span style="color: var(--text-dim);">@${p.username} | ${p.id}</span>
        </div>
      </div>
    </div>
    
    <div class="tabs" style="margin-top: 32px; display: flex; gap: 20px; border-bottom: 1px solid var(--glass-border);">
      <button class="tab active" data-tab="notes">Notlar</button>
      <button class="tab" data-tab="media">Medya</button>
      <button class="tab" data-tab="connections">Bağlantılar</button>
    </div>

    <div id="tab-content" style="margin-top: 24px; min-height: 300px;">
      <!-- Tab content will be rendered here -->
    </div>

    <div style="margin-top: 32px; display: flex; justify-content: flex-end; gap: 12px;">
      <button class="btn-ghost" onclick="$('modal-overlay').style.display='none'">Kapat</button>
      <button class="btn-primary" style="width: auto;" id="refresh-discord-btn">Verileri Güncelle</button>
    </div>
  `;

  const renderTab = (tabName) => {
    const tabContainer = $('tab-content');
    if (tabName === 'notes') {
      tabContainer.innerHTML = `
        <div class="input-group">
          <textarea id="note-input" placeholder="Yeni not ekle..." style="width: 100%; height: 80px; background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); border-radius: 8px; color: white; padding: 12px;"></textarea>
          <button class="btn-primary" style="margin-top: 8px; width: auto;" id="save-note-btn">Notu Kaydet</button>
        </div>
        <div class="log-list" style="margin-top: 24px;">
          ${logs.map(l => `
            <div class="log-item glass" style="padding: 12px; margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim); margin-bottom: 4px;">
                <span>${l.author}</span>
                <span>${new Date(l.timestamp).toLocaleString()}</span>
              </div>
              <div style="font-size: 14px;">${l.content}</div>
            </div>
          `).join('')}
        </div>
      `;
      $('save-note-btn').onclick = async () => {
        const content = $('note-input').value;
        if (!content) return;
        await api('/logs', 'POST', { target_id: id, content });
        renderTargetDetail(id); // Reload
      };
    } else if (tabName === 'media') {
      tabContainer.innerHTML = `
        <div class="input-group">
          <input type="text" id="media-url" placeholder="Görsel URL (veya Base64)">
          <input type="text" id="media-note" placeholder="Not ekle..." style="margin-top: 8px;">
          <button class="btn-primary" style="margin-top: 8px; width: auto;" id="save-media-btn">Ekle</button>
        </div>
        <div class="gallery-grid" style="margin-top: 24px;">
          ${media.map(m => `
            <div class="gallery-item glass">
              <img src="${m.url}">
              <div class="gallery-info">${m.note || ''}</div>
            </div>
          `).join('')}
        </div>
      `;
      $('save-media-btn').onclick = async () => {
        const url = $('media-url').value;
        const note = $('media-note').value;
        if (!url) return;
        await api('/media', 'POST', { target_id: id, url, note });
        renderTargetDetail(id);
      };
    } else if (tabName === 'connections') {
      tabContainer.innerHTML = `
        <div class="input-group">
          <select id="conn-target" style="width: 100%; padding: 12px; background: #222; color: white; border-radius: 8px;">
            ${people.filter(x => x.id !== id).map(x => `<option value="${x.id}">${x.display_name}</option>`).join('')}
          </select>
          <input type="text" id="conn-type" placeholder="İlişki Tipi (Örn: Arkadaş, Düşman)" style="margin-top: 8px;">
          <button class="btn-primary" style="margin-top: 8px; width: auto;" id="save-conn-btn">Bağlantı Kur</button>
        </div>
      `;
      $('save-conn-btn').onclick = async () => {
        const to_id = $('conn-target').value;
        const type = $('conn-type').value;
        if (!to_id) return;
        await api('/connections', 'POST', { from_id: id, to_id, type });
        renderTargetDetail(id);
      };
    }
  };

  renderTab('notes');

  document.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      renderTab(t.dataset.tab);
    };
  });

  $('refresh-discord-btn').onclick = () => syncDiscordData(id);
}

// --- SYNC ---
async function syncDiscordData(id) {
  const data = await api(`/discord/user/${id}`);
  if (!data) return;

  await api('/people', 'POST', {
    id: data.id,
    username: data.username,
    display_name: data.global_name || data.username,
    avatar: data.avatar,
    banner: data.banner,
    decoration: data.avatar_decoration_data?.asset,
    guilds: [],
    bio: data.bio || ''
  });
  
  if (activeView === 'people' || activeView === 'dashboard') renderView(activeView);
  renderTargetDetail(id);
}

// --- GRAPH ---
async function renderGraph(container) {
  container.innerHTML = `
    <h2 style="margin-bottom: 24px;">İlişki Ağ Haritası</h2>
    <div id="network-graph" class="glass" style="height: calc(100vh - 200px);"></div>
  `;

  const allPeople = await api('/people');
  const connections = await api('/connections');

  const nodes = new DataSet(allPeople.map(p => ({
    id: p.id,
    label: p.display_name,
    shape: 'circularImage',
    image: p.avatar ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png?size=128` : 'https://cdn.discordapp.com/embed/avatars/0.png',
    color: { border: '#7c4dff', background: '#0a0a0c' },
    font: { color: '#ffffff' }
  })));

  const edges = new DataSet(connections.map(c => ({
    from: c.from_id,
    to: c.to_id,
    label: c.type,
    arrows: 'to',
    color: { color: '#7c4dff', opacity: 0.5 },
    font: { color: '#a0a0ab', size: 10, align: 'top' }
  })));

  const graphContainer = $('network-graph');
  const data = { nodes, edges };
  const options = {
    nodes: { borderWidth: 2, size: 30 },
    edges: { smooth: { type: 'continuous' } },
    physics: { barnesHut: { gravitationalConstant: -2000 } }
  };
  network = new Network(graphContainer, data, options);
}

// --- GLOBAL GALLERY ---
async function renderGallery(container) {
  const media = await api('/media');
  container.innerHTML = `
    <h2 style="margin-bottom: 24px;">Genel Kanıt Galerisi</h2>
    <div class="gallery-grid">
      ${media.map(m => `
        <div class="gallery-item glass">
          <img src="${m.url}">
          <div class="gallery-info">
            <div style="display:flex; align-items:center; gap:8px;">
              <img src="https://cdn.discordapp.com/avatars/${m.target_id}/${m.target_avatar}.png?size=32" style="width:20px; height:20px; border-radius:50%;">
              <span>${m.target_name}</span>
            </div>
            <div style="font-size: 10px; color: var(--text-dim); margin-top: 4px;">Ekle: ${m.author}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// --- GLOBAL LOGS ---
async function renderGlobalLogs(container) {
  const logs = await api('/logs');
  container.innerHTML = `
    <h2 style="margin-bottom: 24px;">Tüm Sistem Etkinlikleri</h2>
    <div class="log-list">
      ${logs.map(l => `
        <div class="log-item glass" style="padding: 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 16px;">
          <img src="https://cdn.discordapp.com/avatars/${l.target_id}/${l.target_avatar}.png?size=64" style="width:40px; height:40px; border-radius:50%;">
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-dim);">
              <span><strong>${l.author}</strong> -> ${l.target_name}</span>
              <span>${new Date(l.timestamp).toLocaleString()}</span>
            </div>
            <div style="margin-top: 4px;">${l.content}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// --- MODALS ---
$('add-target-btn').onclick = () => {
  const overlay = $('modal-overlay');
  const content = $('modal-content');
  show(overlay, true);
  content.innerHTML = `
    <h2>Yeni Hedef Ekle</h2>
    <p style="color: var(--text-dim); margin-bottom: 24px;">Discord ID girerek verileri otomatik çekin.</p>
    <div class="input-group">
      <label>Discord ID</label>
      <input type="text" id="new-target-id" placeholder="159985870458322944">
    </div>
    <div style="margin-top: 32px; display: flex; justify-content: flex-end; gap: 12px;">
      <button class="btn-ghost" onclick="$('modal-overlay').style.display='none'">İptal</button>
      <button class="btn-primary" style="width: auto;" id="confirm-add-target">Kişiyi Çek ve Kaydet</button>
    </div>
  `;
  $('confirm-add-target').onclick = async () => {
    const id = $('new-target-id').value;
    if (!id) return;
    await syncDiscordData(id);
    $('modal-overlay').style.display = 'none';
    renderView('people');
  };
};

// --- INIT ---
document.querySelectorAll('.nav-item').forEach(el => {
  el.onclick = () => renderView(el.dataset.view);
});

$('logout-btn').onclick = logout;
$('toggle-auth').onclick = () => toggleAuthMode(true);
$('auth-submit').onclick = () => handleAuth('login');

updateAuthUI();
if (currentUser) renderView('dashboard');
