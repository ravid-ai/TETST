// CharacterVerse Gallery (lazy-loaded + randomized)

const state = {
  codes: [],
  cursor: 0,
  batchDesktop: 6,
  batchMobile: 4,
  isLoading: false,
  totalLoaded: 0
};

const CharacterCodec = {
  MAGIC: 'CV1',
  decode(base64String) {
    try {
      const cleaned = (base64String || '').trim();
      const json = decodeURIComponent(escape(atob(cleaned)));
      const data = JSON.parse(json);
      if (data._cv !== this.MAGIC) return { error: 'Invalid character code (wrong format).' };
      if (!data.name || !data.systemPrompt) return { error: 'Invalid character data (missing name/prompt).' };
      delete data._cv;
      return { success: true, character: data };
    } catch (e) {
      return { error: 'Failed to decode: ' + (e?.message || e) };
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  loadGallery().catch(err => {
    console.error(err);
    showEmpty('Failed to load gallery.json');
  });
});

async function loadGallery() {
  const resp = await fetch('./gallery.json', { cache: 'no-store' });
  if (!resp.ok) throw new Error('gallery.json not found (HTTP ' + resp.status + ')');
  const data = await resp.json();

  const arr = Array.isArray(data) ? data : (Array.isArray(data?.characters) ? data.characters : []);
  if (!arr.length) { showEmpty('No character codes in gallery.json'); return; }

  // Randomize without repeats (Fisher-Yates)
  state.codes = fisherYatesShuffle(arr.slice());
  state.cursor = 0;

  // Initial load
  renderNextBatch();

  // Lazy-load sentinel
  const sentinel = document.getElementById('gallery-sentinel');
  const obs = new IntersectionObserver((entries) => {
    const e = entries[0];
    if (e.isIntersecting) renderNextBatch();
  }, { root: null, threshold: 0.1, rootMargin: '200px' });
  obs.observe(sentinel);

  window.addEventListener('resize', () => updateSentinelText());
  updateSentinelText();
}

function fisherYatesShuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getBatchSize() {
  return (window.innerWidth <= 560) ? state.batchMobile : state.batchDesktop;
}

function updateSentinelText() {
  const txt = document.getElementById('sentinel-text');
  if (!txt) return;
  if (state.cursor >= state.codes.length) txt.textContent = 'That’s everything ✨';
  else txt.textContent = 'Scroll to load more…';
}

function renderNextBatch() {
  if (state.isLoading) return;
  if (state.cursor >= state.codes.length) { updateSentinelText(); return; }
  state.isLoading = true;

  const batch = getBatchSize();
  const slice = state.codes.slice(state.cursor, state.cursor + batch);
  state.cursor += slice.length;

  const grid = document.getElementById('gallery-grid');
  slice.forEach((code) => {
    const decoded = CharacterCodec.decode(code);
    if (!decoded.success) return; // skip invalid entries silently
    const card = createCard(decoded.character, code);
    grid.appendChild(card);
    state.totalLoaded++;
  });

  document.getElementById('gt-count').textContent = `${state.totalLoaded} loaded`;
  updateSentinelText();

  // Empty state if nothing rendered
  if (!grid.children.length) showEmpty('No valid character codes found');

  state.isLoading = false;
}

function createCard(char, code) {
  const el = document.createElement('article');
  el.className = 'gcard';

  const avatarHtml = char.avatar
    ? `<img src="${escAttr(char.avatar)}" alt="${escAttr(char.name)}" />`
    : `<span>${escHtml(char.emoji || getInitials(char.name))}</span>`;

  const tagsHtml = (Array.isArray(char.tags) && char.tags.length)
    ? `<div class="gcard-tags">${char.tags.slice(0, 6).map(t => `<span class="gtag">${escHtml(t)}</span>`).join('')}</div>`
    : '';

  el.innerHTML = `
    <div class="gcard-top">
      <div class="gcard-avatar">${avatarHtml}</div>
      <div>
        <div class="gcard-name">${escHtml(char.name)}</div>
        <div class="gcard-title">${escHtml(char.title || '')}</div>
      </div>
    </div>
    <div class="gcard-desc">${escHtml(char.description || char.world || '')}</div>
    ${tagsHtml}
    <div class="gcard-actions">
      <button class="gbtn" data-action="copy">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <rect x="9" y="9" width="13" height="13" rx="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        Copy code
      </button>
      <button class="gbtn primary" data-action="add">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14"></path>
        </svg>
        Add to chat
      </button>
    </div>
  `;

  el.querySelector('[data-action="copy"]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      showToast('success', 'Code copied to clipboard');
    } catch (e) {
      showToast('error', 'Clipboard blocked — copy manually');
    }
  });

  el.querySelector('[data-action="add"]').addEventListener('click', () => {
    const res = addCharacterToLocalStorage(char);
    if (!res.success) {
      showToast('error', res.error || 'Failed to add character');
      return;
    }
    // Open chat with this character
    localStorage.setItem('cv_last_char', res.id);
    showToast('success', 'Added! Redirecting…');
    setTimeout(() => { location.href = 'index.html'; }, 350);
  });

  return el;
}

function addCharacterToLocalStorage(char) {
  try {
    const raw = localStorage.getItem('cv_characters');
    const characters = raw ? JSON.parse(raw) : {};

    const newId = `char_${Date.now()}`;

    // Avoid duplicate names
    const existingNames = Object.values(characters).map(c => (c.name || '').toLowerCase());
    let name = (char.name || '').trim() || 'Imported Character';
    if (existingNames.includes(name.toLowerCase())) name = name + ' (Imported)';

    characters[newId] = {
      ...char,
      name,
      id: newId,
      createdAt: Date.now()
    };

    localStorage.setItem('cv_characters', JSON.stringify(characters));
    return { success: true, id: newId };
  } catch (e) {
    console.error(e);
    return { success: false, error: e?.message || String(e) };
  }
}

function showEmpty(msg) {
  const empty = document.getElementById('gallery-empty');
  const sub = empty?.querySelector('.gallery-empty-sub');
  if (sub && msg) sub.textContent = msg;
  document.getElementById('gallery-empty')?.classList.remove('hidden');
  document.getElementById('gallery-sentinel')?.classList.add('hidden');
}

function getInitials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(s) {
  return escHtml(s).replace(/'/g, '&#39;');
}

// Minimal toast (reuses CSS from style.css)
function showToast(type, message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️');
  t.innerHTML = `<span class="toast-icon">${icon}</span><span>${escHtml(message)}</span>`;
  container.appendChild(t);

  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(24px) scale(0.96)'; }, 2600);
  setTimeout(() => { t.remove(); }, 3100);
}
