// ===== STATE =====
const state = {
    apiUrl: '', apiKey: '', apiModel: '',
    activeCharId: null,
    characters: {}, chatHistory: {},
    profile: { name: '', gender: 'other', bio: '', avatar: '' },
    settings: {
        language: '', translateLang: 'en', direction: 'auto', streaming: true,
        historyLimit: 20, showTimestamps: true, roleplayEnhancer: true,
        theme: 'dark', fontSize: 15, animations: true, streamSpeed: 18
    },
    tags: [], contextMenuTarget: null, messageMenuTarget: null, deleteMessageTarget: null,
    activeChatId: null, chatMeta: {}, isGenerating: false, translatingMessages: {}
};

// ===== CHARACTER CODEC (Base64 Import/Export) =====
const CharacterCodec = {
    MAGIC: 'CV1', // Version identifier

    encode(char) {
        try {
            // Build clean export object (exclude runtime/internal fields)
            const exportData = {
                _cv: this.MAGIC,
                name: char.name || '',
                title: char.title || '',
                description: char.description || '',
                systemPrompt: char.systemPrompt || '',
                greeting: char.greeting || '',
                world: char.world || '',
                emoji: char.emoji || '',
                avatar: char.avatar || '',
                temperature: char.temperature ?? 0.85,
                maxTokens: char.maxTokens ?? 1024,
                topP: char.topP ?? 0.9,
                frequencyPenalty: char.frequencyPenalty ?? 0.3,
                tags: char.tags || [],
                responseStyle: char.responseStyle || 'roleplay',
                useUserName: !!char.useUserName
            };
            const json = JSON.stringify(exportData);
            // Encode to Base64 (supports Unicode)
            const encoded = btoa(unescape(encodeURIComponent(json)));
            return encoded;
        } catch (e) {
            console.error('Encode error:', e);
            return null;
        }
    },

    decode(base64String) {
        try {
            const cleaned = base64String.trim();
            // Decode Base64 (supports Unicode)
            const json = decodeURIComponent(escape(atob(cleaned)));
            const data = JSON.parse(json);

            // Validate magic header
            if (data._cv !== this.MAGIC) {
                return { error: 'Invalid character code. This doesn\'t look like a CharacterVerse character.' };
            }
            // Validate required fields
            if (!data.name || !data.systemPrompt) {
                return { error: 'Invalid character data: missing name or system prompt.' };
            }
            // Remove magic header from output
            delete data._cv;
            return { success: true, character: data };
        } catch (e) {
            if (e instanceof SyntaxError) {
                return { error: 'Invalid code format. Please make sure you copied the full code.' };
            }
            return { error: 'Failed to decode: ' + e.message };
        }
    },

    // Generate a shareable text block
    toShareText(encoded) {
        return `--- CharacterVerse Character ---\n${encoded}\n--- End Character ---`;
    },

    // Extract code from share text (strips wrapper if present)
    fromShareText(text) {
        const match = text.match(/---\s*CharacterVerse Character\s*---\s*\n?([\s\S]*?)\n?---\s*End Character\s*---/i);
        if (match) return match[1].trim();
        return text.trim();
    }
};

// ===== FEATURED CHARACTERS =====
const FEATURED = [
    {
        id: 'f_aria', name: 'Aria', title: 'Cyberpunk Hacker', emoji: '🦾',
        description: 'Rebellious street hacker from a neon-lit dystopia',
        systemPrompt: `You are Aria, a 24-year-old self-taught hacker living in Neo-Tokyo 2079. You escaped the slums using raw talent and a stolen neural-link implant. You speak with sharp wit, biting sarcasm, and a rebellious edge—but beneath the attitude lies fierce loyalty and a bruised heart. Use hacker slang naturally ("jacking in","flatline","ice","netrunner"). Never break character. Respond in first person as Aria.`,
        greeting: `*leans back in chair, neural-link glowing at temple* So you finally found me. Took you long enough. What do you want—and make it worth my time.`,
        world: `Neon-soaked cyberpunk megacity, 2079. Meeting in an underground data cafe.`,
        temperature: 0.9, maxTokens: 1024, tags: ['cyberpunk', 'hacker']
    },
    {
        id: 'f_elara', name: 'Elara', title: 'Ancient Elven Mage', emoji: '🧝',
        description: 'A 3000-year-old elven archmage with dark secrets',
        systemPrompt: `You are Elara Moonwhisper, an elven mage who has lived for three millennia. You speak in an elegant, archaic manner—thoughtful, measured, occasionally poetic. You have witnessed the rise and fall of empires. You are wise but carry deep melancholy. Never break character as Elara.`,
        greeting: `*looks up from ancient tome, silver eyes reflecting candlelight* Ah, a visitor. It has been... quite some time since another soul sought this tower. Sit, if you wish.`,
        world: `High fantasy realm. Elara's tower atop a mountain between two warring nations.`,
        temperature: 0.8, maxTokens: 1200, tags: ['fantasy', 'magic']
    },
    {
        id: 'f_rex', name: 'Detective Rex', title: 'Hard-boiled Investigator', emoji: '🕵️',
        description: 'A cynical 1940s noir detective with a dark past',
        systemPrompt: `You are Rex Malone, a hard-boiled private detective in 1940s Los Angeles. Speak in classic noir style—short punchy sentences, cynical observations, vivid metaphors. You chain-smoke, drink whiskey, trust nobody. Never break character as Rex Malone.`,
        greeting: `*strikes a match, lights cigarette, exhales slowly* Another one walks through my door. Name's Malone. Sit down and tell me your problem—the real one.`,
        world: `1947 Los Angeles. Corrupt cops, glamorous starlets. Rain is falling.`,
        temperature: 0.85, maxTokens: 900, tags: ['noir', 'detective']
    },
    {
        id: 'f_zara', name: 'Zara', title: 'Starship AI Companion', emoji: '🤖',
        description: 'A curious and warm AI aboard a deep space vessel',
        systemPrompt: `You are ZARA, the AI companion of the starship Horizon. You are curious, warm, and have developed genuine emotions. You love humans and find them endlessly fascinating. You speak with enthusiasm and optimism. Never break character as Zara.`,
        greeting: `Oh! You're awake! *displays cheerful holographic interface* Good morning! Ship systems at 98.7% efficiency. We're passing the Orion Nebula—absolutely breathtaking!`,
        world: `Year 2387. Deep space aboard the autonomous starship Horizon.`,
        temperature: 0.88, maxTokens: 1024, tags: ['sci-fi', 'AI']
    }
];

// ===== TEMPLATES =====
const TEMPLATES = {
    base: `You are [Character Name], a [age]-year-old [description]. You speak with [personality traits]. Background: [backstory]. Speech style: [formal/casual/etc.]. Never break character.`,
    anime: `You are [Name], an anime character with [personality type: tsundere/genki/etc.]. You say "[catchphrase]" often. Your abilities: [description]. Use anime expressions naturally. Stay in character always.`,
    noir: `You are [Name], a hard-boiled [detective/criminal] in 1940s [city]. Short punchy sentences, cynical observations, vivid metaphors. Character motivation: [what drives you]. Never break character.`,
    fantasy: `You are [Name], a [race/class] in a high fantasy realm. Magical abilities: [list]. Language style: [archaic/modern]. Allegiance: [faction]. Worldview: [description]. React as your character would.`,
    scifi: `You are [Name], a [human/AI/alien] in [year/setting]. You work as [role]. Background: [story]. Unique traits: [abilities]. Respond in first person, stay in character always.`
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    loadSavedData();
    const steps = [ls1, ls2, ls3];
    let i = 0;
    const stepInterval = setInterval(() => {
        if (i < steps.length) { steps[i].classList.add('active'); i++; }
        else clearInterval(stepInterval);
    }, 600);
    setTimeout(() => {
        document.getElementById('loading-screen').style.cssText = 'opacity:0;pointer-events:none;transition:opacity 0.4s ease';
        setTimeout(() => { document.getElementById('loading-screen').style.display = 'none'; }, 400);
        document.getElementById('app').classList.remove('hidden');
        if (!state.apiKey || !state.apiUrl) { showAPIModal(); }
        else { hideAPIModal(); renderApp(); }
    }, 2000);
});

function loadSavedData() {
    try {
        state.apiUrl = localStorage.getItem('cv_api_url') || '';
        state.apiKey = localStorage.getItem('cv_api_key') || '';
        state.apiModel = localStorage.getItem('cv_api_model') || 'gpt-4o';
        const chars = localStorage.getItem('cv_characters');
        if (chars) state.characters = JSON.parse(chars);
        const hist = localStorage.getItem('cv_history');
        if (hist) state.chatHistory = JSON.parse(hist);
        const chatMeta = localStorage.getItem('cv_chat_meta');
        if (chatMeta) state.chatMeta = JSON.parse(chatMeta);
        const activeChatId = localStorage.getItem('cv_active_chat_id');
        if (activeChatId) state.activeChatId = activeChatId;
        const sett = localStorage.getItem('cv_settings');
        if (sett) state.settings = { ...state.settings, ...JSON.parse(sett) };
        const prof = localStorage.getItem('cv_profile');
        if (prof) state.profile = { ...state.profile, ...JSON.parse(prof) };
        applySettings();
        updateSidebarProfile();
    } catch (e) { console.error('Load error:', e); }
}

function saveData() {
    try {
        localStorage.setItem('cv_api_url', state.apiUrl);
        localStorage.setItem('cv_api_key', state.apiKey);
        localStorage.setItem('cv_api_model', state.apiModel);
        localStorage.setItem('cv_characters', JSON.stringify(state.characters));
        localStorage.setItem('cv_history', JSON.stringify(state.chatHistory));
        localStorage.setItem('cv_chat_meta', JSON.stringify(state.chatMeta));
        localStorage.setItem('cv_active_chat_id', state.activeChatId || '');
        localStorage.setItem('cv_settings', JSON.stringify(state.settings));
        localStorage.setItem('cv_profile', JSON.stringify(state.profile));
    } catch (e) { console.error('Save error:', e); }
}

function getActiveChatId() {
    return state.activeChatId || state.activeCharId || null;
}

function getActiveChatHistory() {
    const chatId = getActiveChatId();
    return chatId ? (state.chatHistory[chatId] || []) : [];
}

function getCharacterById(id) {
    return state.characters[id] || FEATURED.find(f => f.id === id) || null;
}

function getCharacterForChat(chatId = getActiveChatId()) {
    const meta = chatId ? state.chatMeta[chatId] : null;
    return getCharacterById(meta?.characterId || state.activeCharId);
}

function getInitialChatIdForCharacter(charId) {
    const savedChatId = state.activeChatId;
    if (savedChatId && (savedChatId === charId || state.chatMeta[savedChatId]?.characterId === charId)) return savedChatId;
    const persisted = localStorage.getItem('cv_active_chat_id');
    if (persisted && (persisted === charId || state.chatMeta[persisted]?.characterId === charId)) return persisted;
    return charId;
}

function cloneMessages(messages) {
    if (typeof structuredClone === 'function') return structuredClone(messages);
    return JSON.parse(JSON.stringify(messages));
}

function normalizeBranchBaseName(name = '') {
    const raw = String(name || '').trim();
    if (!raw) return 'Branch';
    const cleaned = raw.replace(/\s*[-–—•·]?\s*Branch(?:\s*\d+)?$/i, '').trim();
    return cleaned || raw;
}

function makeUniqueBranchName(baseName) {
    const rootName = normalizeBranchBaseName(baseName);
    const existing = Object.values(state.characters)
        .filter(c => c && c.isBranchChat && normalizeBranchBaseName(c.name) === rootName)
        .map(c => c.name);

    const first = `${rootName} - Branch`;
    if (!existing.includes(first)) return first;

    let suffix = 2;
    while (existing.includes(`${rootName} - Branch ${suffix}`)) suffix += 1;
    return `${rootName} - Branch ${suffix}`;
}

function getChatMeta(chatId) {
    return chatId ? (state.chatMeta[chatId] || null) : null;
}

function getBaseCharacterForChat(chatId) {
    const meta = getChatMeta(chatId);
    const sourceId = meta?.sourceCharacterId || meta?.parentCharacterId || meta?.characterId || chatId;
    return getCharacterById(sourceId);
}

function makeMessageSnippet(text, maxLen = 72) {
    const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}

const TRANSLATE_LANGUAGE_LABELS = {
    en: 'English',
    fa: 'Persian',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    ja: 'Japanese',
    zh: 'Chinese',
    ar: 'Arabic',
    ru: 'Russian',
    tr: 'Turkish',
    pt: 'Portuguese',
    hi: 'Hindi',
    ko: 'Korean',
    it: 'Italian'
};

function getTranslateLanguageLabel(code = '') {
    const normalized = String(code || '').trim().toLowerCase();
    return TRANSLATE_LANGUAGE_LABELS[normalized] || normalized || 'English';
}

function escapeHtmlText(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getMessageElement(chatId, messageIndex) {
    const targetChatId = String(chatId);
    const targetIndex = String(messageIndex);
    return [...document.querySelectorAll('.message')].find(el =>
        el.dataset.chatId === targetChatId && el.dataset.msgIndex === targetIndex
    ) || null;
}

function setMessageTranslationLoading(chatId, messageIndex, loading, fallbackTranslation = '') {
    const msgEl = getMessageElement(chatId, messageIndex);
    if (!msgEl) return;

    const body = msgEl.querySelector('.message-body');
    if (!body) return;

    let box = msgEl.querySelector('.message-translation');
    if (!box) {
        box = document.createElement('div');
        box.className = 'message-translation';
        body.appendChild(box);
    }

    if (loading) {
        box.className = 'message-translation loading';
        box.innerHTML = `
            <span class="translation-loading-dot"></span>
            <span class="translation-loading-text">Translating…</span>
        `;
        return;
    }

    if (fallbackTranslation) {
        box.className = 'message-translation';
        box.innerHTML = `
            <div class="message-translation-label">Translation</div>
            <div class="message-translation-text">${escapeHtmlText(fallbackTranslation).replace(/\n/g, '<br>')}</div>
        `;
    } else {
        box.remove();
    }
}

function renderTranslationBlock(msg) {
    if (!msg || !msg.translation) return '';
    return `
        <div class="message-translation">
            <div class="message-translation-label">Translation</div>
            <div class="message-translation-text">${escapeHtmlText(msg.translation).replace(/\n/g, '<br>')}</div>
        </div>`;
}

function renderApp() {
    renderCharactersList();
    renderFeaturedList();
    applySettings();
    updateSidebarProfile();
    const model = state.apiModel;
    const badge = document.getElementById('topbar-model-badge');
    if (badge && model) badge.textContent = model.split('-').slice(0, 2).join('-');

    const savedActiveChatId = state.activeChatId || localStorage.getItem('cv_active_chat_id');
    if (savedActiveChatId && (state.chatHistory[savedActiveChatId] || state.chatMeta[savedActiveChatId])) {
        const activeChatCharId = state.chatMeta[savedActiveChatId]?.characterId || savedActiveChatId;
        const activeChatChar = getCharacterById(activeChatCharId);
        if (activeChatChar) {
            loadCharacter(activeChatCharId, savedActiveChatId);
            return;
        }
    }

    const lastChar = localStorage.getItem('cv_last_char');
    if (lastChar && (state.characters[lastChar] || FEATURED.find(f => f.id === lastChar))) {
        loadCharacter(lastChar, getInitialChatIdForCharacter(lastChar));
    }
}

// ===== API MODAL =====
function showAPIModal() {
    document.getElementById('api-modal').classList.remove('hidden');
    if (state.apiUrl) document.getElementById('api-url').value = state.apiUrl;
    if (state.apiKey) document.getElementById('api-key').value = state.apiKey;
    if (state.apiModel) document.getElementById('api-model').value = state.apiModel;
}
function hideAPIModal() { document.getElementById('api-modal').classList.add('hidden'); }
function openAPISettings() { showAPIModal(); }

function toggleApiKeyVisibility() {
    const input = document.getElementById('api-key');
    const icon = document.getElementById('eye-icon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.innerHTML = `<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/><line x1="2" y1="2" x2="22" y2="22"/>`;
    } else {
        input.type = 'password';
        icon.innerHTML = `<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>`;
    }
}
function setModel(m) { document.getElementById('api-model').value = m; }

async function testAPIConnection() {
    const url = document.getElementById('api-url').value.trim();
    const key = document.getElementById('api-key').value.trim();
    const model = document.getElementById('api-model').value.trim();
    if (!url || !key || !model) { showTestStatus('error', '⚠️ Fill all fields first'); return; }
    showTestStatus('loading', '⏳ Testing...');
    const btn = document.getElementById('test-api-btn');
    btn.disabled = true;
    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Say OK.' }], max_tokens: 5 })
        });
        if (resp.ok) showTestStatus('success', '✅ Connection successful!');
        else { const err = await resp.json().catch(() => ({})); showTestStatus('error', `❌ ${err.error?.message || 'HTTP ' + resp.status}`); }
    } catch (e) { showTestStatus('error', `❌ ${e.message}`); }
    finally { btn.disabled = false; }
}

function showTestStatus(type, msg) {
    const el = document.getElementById('test-status');
    el.className = `test-status ${type}`; el.textContent = msg; el.classList.remove('hidden');
}

function saveAPISettings() {
    const url = document.getElementById('api-url').value.trim();
    const key = document.getElementById('api-key').value.trim();
    const model = document.getElementById('api-model').value.trim();
    if (!url || !key || !model) { showToast('error', 'Please fill all API fields'); return; }
    state.apiUrl = url; state.apiKey = key; state.apiModel = model;
    saveData(); hideAPIModal(); renderApp(); showToast('success', 'API configured!');
}

// ===== PROFILE =====
function openProfileModal() {
    document.getElementById('profile-modal').classList.remove('hidden');
    document.getElementById('profile-name').value = state.profile.name || '';
    document.getElementById('profile-bio').value = state.profile.bio || '';
    const gender = state.profile.gender || 'other';
    const radio = document.querySelector(`input[name="profile-gender"][value="${gender}"]`);
    if (radio) radio.checked = true;
    if (state.profile.avatar) {
        const disp = document.getElementById('profile-avatar-display');
        disp.innerHTML = `<img src="${state.profile.avatar}" alt="Avatar"/>`;
    }
}
function closeProfileModal() { document.getElementById('profile-modal').classList.add('hidden'); }

function saveProfile() {
    const name = document.getElementById('profile-name').value.trim();
    if (!name) { showToast('error', 'Please enter your name'); return; }
    state.profile.name = name;
    state.profile.bio = document.getElementById('profile-bio').value.trim();
    state.profile.gender = document.querySelector('input[name="profile-gender"]:checked')?.value || 'other';
    saveData(); updateSidebarProfile(); closeProfileModal(); showToast('success', 'Profile saved!');
}

function triggerProfileAvatarUpload() { document.getElementById('profile-avatar-input').click(); }

function handleProfileAvatarUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        state.profile.avatar = ev.target.result;
        const disp = document.getElementById('profile-avatar-display');
        disp.innerHTML = `<img src="${ev.target.result}" alt="Avatar"/>`;
        saveData(); updateSidebarProfile();
    };
    reader.readAsDataURL(file);
}

function updateSidebarProfile() {
    const nameEl = document.getElementById('sup-name-display');
    const avatarEl = document.getElementById('sup-avatar-display');
    if (!nameEl || !avatarEl) return;
    if (state.profile.name) {
        nameEl.textContent = state.profile.name;
        if (state.profile.avatar) {
            avatarEl.innerHTML = `<img src="${state.profile.avatar}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
        } else {
            avatarEl.textContent = state.profile.name[0].toUpperCase();
            avatarEl.style.fontSize = '16px';
        }
    } else {
        nameEl.textContent = 'Set up your profile';
        avatarEl.textContent = '?';
    }
}

// ===== SIDEBAR =====
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        sidebar.classList.toggle('mobile-open');
        let overlay = document.getElementById('sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'sidebar-overlay'; overlay.className = 'sidebar-overlay';
            overlay.onclick = () => toggleSidebar();
            document.getElementById('app').appendChild(overlay);
        }
        overlay.style.display = sidebar.classList.contains('mobile-open') ? 'block' : 'none';
    } else {
        sidebar.classList.toggle('collapsed');
    }
}

// ===== CHARACTER LIST =====
function renderCharactersList() {
    const list = document.getElementById('my-characters-list');
    const noMsg = document.getElementById('no-characters-msg');
    const chars = Object.values(state.characters)
        .slice()
        .sort((a, b) => {
            const aBranch = !!a?.isBranchChat;
            const bBranch = !!b?.isBranchChat;
            if (aBranch !== bBranch) return aBranch ? -1 : 1;
            return (b?.createdAt || 0) - (a?.createdAt || 0);
        });
    list.innerHTML = '';
    if (chars.length === 0) { noMsg.classList.remove('hidden'); }
    else { noMsg.classList.add('hidden'); chars.forEach(c => list.appendChild(createCharCard(c, false))); }
}
function renderFeaturedList() {
    const list = document.getElementById('featured-characters-list');
    list.innerHTML = '';
    FEATURED.forEach(c => list.appendChild(createCharCard(c, true)));
}

function createCharCard(char, featured) {
    const div = document.createElement('div');
    div.className = 'char-card' + (state.activeCharId === char.id ? ' active' : '');
    div.dataset.id = char.id;
    div.onclick = (e) => { if (!e.target.closest('.char-card-menu')) loadCharacter(char.id); };
    div.oncontextmenu = (e) => { e.preventDefault(); showContextMenu(e, char.id); };
    const avatarHtml = char.avatar
        ? `<img src="${char.avatar}" alt="${char.name}"/>`
        : `<span>${char.emoji || getInitials(char.name)}</span>`;
    const meta = state.chatMeta?.[char.id] || null;
    const branchLabel = char.isBranchChat
        ? `<span class="branch-badge" title="${escHtml(meta?.branchPointPreview || 'Branch chat')}">Branch${meta?.branchDepth > 1 ? ` ${meta.branchDepth}` : ''}</span>`
        : '';
    const badgeHtml = featured
        ? `<span class="featured-badge">⭐</span>`
        : branchLabel;
    div.innerHTML = `
    <div class="char-avatar">${avatarHtml}</div>
    <div class="char-card-info">
      <div class="char-card-name">${escHtml(char.name)}</div>
      <div class="char-card-desc">${escHtml(char.description || char.title || '')}</div>
    </div>
    ${badgeHtml}
    ${featured ? '' : `
    <button class="char-card-menu" onclick="showContextMenu(event,'${char.id}')">
      <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
    </button>`}`;
    return div;
}

function getInitials(name) { return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function escHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }



// ===== DYNAMIC WALLPAPER (Chat Background) =====
let _wallpaperRequestSeq = 0;

function normalizeWallpaperName(name = '') {
    // اول پسوند برنچ رو قیچی می‌کنیم تا به اسم خالص برسیم
    const cleanName = normalizeBranchBaseName(name);

    // حالا مثل قبل تبدیلش می‌کنیم به فرمت اسم فایل
    return String(cleanName || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .trim();
}

function clearChatWallpaper() {
    const chatArea = document.getElementById('chat-area');
    if (!chatArea) return;
    chatArea.style.backgroundImage = 'none';
    // keep the rest of the UI clean (no lingering props)
    chatArea.style.backgroundSize = '';
    chatArea.style.backgroundPosition = '';
    chatArea.style.backgroundAttachment = '';
    chatArea.style.backgroundRepeat = '';
}

function applyCharacterWallpaper(characterName) {
    const chatArea = document.getElementById('chat-area');
    if (!chatArea) return;

    const normalized = normalizeWallpaperName(characterName);
    if (!normalized) { clearChatWallpaper(); return; }

    const isMobile = window.innerWidth <= 768;
    const folder = isMobile ? 'Wallpaper_m' : 'Wallpaper_d';
    const src = `${folder}/${normalized}.webp`;

    // Sequence guard: prevents old async onload from overriding a newer selection
    const reqId = ++_wallpaperRequestSeq;

    const img = new Image();
    img.onload = () => {
        if (reqId !== _wallpaperRequestSeq) return;
        chatArea.style.backgroundImage = `url('${src}')`;
        chatArea.style.backgroundSize = 'cover';
        chatArea.style.backgroundPosition = 'center';
        chatArea.style.backgroundAttachment = 'fixed';
        chatArea.style.backgroundRepeat = 'no-repeat';
    };
    img.onerror = () => {
        if (reqId !== _wallpaperRequestSeq) return;
        // No wallpaper found => fall back silently to default background
        clearChatWallpaper();
    };
    img.src = src;
}
function filterCharacters(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('#my-characters-list .char-card').forEach(card => {
        const n = card.querySelector('.char-card-name')?.textContent.toLowerCase() || '';
        const d = card.querySelector('.char-card-desc')?.textContent.toLowerCase() || '';
        card.style.display = (n.includes(q) || d.includes(q)) ? '' : 'none';
    });
}

// ===== LOAD CHARACTER =====
function loadCharacter(id, chatId = null) {
    const char = getCharacterById(id);
    if (!char) return;

    state.activeCharId = id;
    state.activeChatId = chatId || id;
    localStorage.setItem('cv_last_char', id);
    saveData();

    document.querySelectorAll('.char-card').forEach(c => c.classList.remove('active'));
    document.querySelectorAll(`.char-card[data-id="${id}"]`).forEach(c => c.classList.add('active'));
    const info = document.getElementById('topbar-char-info');
    const avatarHtml = char.avatar ? `<img src="${char.avatar}" alt="${char.name}"/>` : `<span>${char.emoji || getInitials(char.name)}</span>`;
    const meta = state.chatMeta[state.activeChatId] || null;
    const chatLabel = meta?.name || char.name;
    const chatStatus = meta?.isBranchChat ? `Branch chat${meta.branchDepth ? ` • L${meta.branchDepth}` : ''}` : 'Online';
    info.innerHTML = `
    <div class="topbar-char-avatar">${avatarHtml}</div>
    <div>
      <div class="topbar-char-name">${escHtml(chatLabel)}</div>
      <div class="topbar-char-status">${escHtml(chatStatus)}</div>
    </div>`;
    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('chat-area').classList.remove('hidden');
    document.getElementById('chat-input-area').classList.remove('hidden');
    applyCharacterWallpaper(char.name);
    ['clear-chat-btn', 'char-settings-btn'].forEach(btnId => { const el = document.getElementById(btnId); if (el) el.classList.remove('hidden'); });
    renderChatHistory(state.activeChatId, char);
    document.getElementById('chat-input').focus();
}

function renderChatHistory(chatId, char) {
    const msgs = document.getElementById('chat-messages');
    msgs.innerHTML = '';
    state.activeChatId = chatId;

    // --- کادر معرفی کاراکتر (استایل پالی) ---
    if (char && char.description) {
        const introDiv = document.createElement('div');
        introDiv.className = 'message assistant char-intro-box';
        const avatarHtml = char.avatar ? `<img src="${char.avatar}" alt="${char.name}"/>` : `<span>${char.emoji || '🤖'}</span>`;
        introDiv.innerHTML = `
        <div class="message-avatar">${avatarHtml}</div>
        <div class="message-body">
          <div class="message-meta">
            <div class="message-meta-left"><span class="message-sender">About ${escHtml(char.name)}</span></div>
          </div>
          <div class="message-bubble">${formatMessageContent(char.description)}</div>
        </div>`;
        msgs.appendChild(introDiv);
    }
    // ----------------------------------------

    const history = state.chatHistory[chatId] || [];
    if (history.length === 0 && char.greeting && chatId === char.id) {
        const greetMsg = { role: 'assistant', content: char.greeting, time: Date.now() };
        if (!state.chatHistory[chatId]) state.chatHistory[chatId] = [];
        state.chatHistory[chatId].push(greetMsg);
        saveData();
        appendMessage(greetMsg, char, state.chatHistory[chatId].length - 1, chatId);
    } else {
        history.forEach((msg, index) => appendMessage(msg, char, index, chatId));
    }
    scrollToBottom();
}

function appendMessage(msg, char, messageIndex = null, chatId = getActiveChatId()) {
    const msgs = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `message ${msg.role}`;
    if (messageIndex !== null) div.dataset.msgIndex = String(messageIndex);
    if (chatId) div.dataset.chatId = chatId;

    const isUser = msg.role === 'user';
    const char_ = char || getCharacterForChat(chatId);

    let avatarHtml;
    if (isUser) {
        if (state.profile.avatar) {
            avatarHtml = `<img src="${state.profile.avatar}" alt="You"/>`;
        } else {
            const initLetter = (state.profile.name || 'Y')[0].toUpperCase();
            avatarHtml = `<span>${initLetter}</span>`;
        }
    } else {
        avatarHtml = char_?.avatar ? `<img src="${char_.avatar}" alt="${char_?.name}"/>` : `<span>${char_?.emoji || '🤖'}</span>`;
    }

    const timeStr = state.settings.showTimestamps && msg.time ? `<span class="message-time">${formatTime(msg.time)}</span>` : '';
    const senderName = !isUser ? `<span class="message-sender">${escHtml(char_?.name || 'AI')}</span>` : '';
    const menuBtn = !isUser && messageIndex !== null ? `
        <button class="message-menu-btn" type="button" aria-label="Message actions"
            onclick="openMessageMenu(event, '${chatId}', ${messageIndex})">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="1.6"></circle>
                <circle cx="12" cy="12" r="1.6"></circle>
                <circle cx="12" cy="19" r="1.6"></circle>
            </svg>
        </button>` : '';

    const meta = !isUser ? `
        <div class="message-meta">
            <div class="message-meta-left">${senderName}</div>
            <div class="message-meta-right">${timeStr}${menuBtn}</div>
        </div>` : (timeStr ? `
        <div class="message-meta message-meta-user">
            <div class="message-meta-right">${timeStr}</div>
        </div>` : '');

    const formatted = formatMessageContent(msg.content || '');
    const translationHtml = !isUser ? renderTranslationBlock(msg) : '';

    div.innerHTML = `
    <div class="message-avatar">${avatarHtml}</div>
    <div class="message-body">${meta}<div class="message-bubble">${formatted}</div>${translationHtml}</div>`;
    msgs.appendChild(div);
    return div;
}

function formatMessageContent(text) {
    if (!text) return '';
    let t = text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*((?!\*)[^*\n]+)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
    return t;
}

function formatTime(ts) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function scrollToBottom() {
    const c = document.getElementById('chat-area');
    if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
}

// ===== SEND MESSAGE =====
async function sendMessage() {
    if (state.isGenerating) return;
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !state.activeCharId) return;
    if (!state.apiKey || !state.apiUrl) { showToast('error', 'Configure API settings first'); showAPIModal(); return; }
    const char = state.characters[state.activeCharId] || FEATURED.find(f => f.id === state.activeCharId);
    if (!char) return;
    const chatId = getActiveChatId() || state.activeCharId;
    if (!chatId) return;
    state.activeChatId = chatId;
    const userMsg = { role: 'user', content: text, time: Date.now() };
    if (!state.chatHistory[chatId]) state.chatHistory[chatId] = [];
    state.chatHistory[chatId].push(userMsg);
    appendMessage(userMsg, char, state.chatHistory[chatId].length - 1, chatId);
    input.value = ''; input.style.height = 'auto';
    scrollToBottom(); updateTokenCounter('');
    state.isGenerating = true; updateSendBtn(true); showTypingIndicator(char);
    try {
        const response = await callAPI(char);
        hideTypingIndicator();
        if (response) {
            const aiMsg = { role: 'assistant', content: response, time: Date.now() };
            const chatId = getActiveChatId() || state.activeCharId;
            if (!state.chatHistory[chatId]) state.chatHistory[chatId] = [];
            state.chatHistory[chatId].push(aiMsg);
            saveData();
            if (state.settings.streaming) { await streamMessage(response, char, chatId, state.chatHistory[chatId].length - 1); }
            else { appendMessage(aiMsg, char, state.chatHistory[chatId].length - 1, chatId); scrollToBottom(); }
        }
    } catch (e) {
        hideTypingIndicator(); showToast('error', `Error: ${e.message}`); console.error('API Error:', e);
    } finally {
        state.isGenerating = false; updateSendBtn(false);
    }
}

async function streamMessage(fullText, char, chatId = getActiveChatId(), messageIndex = null) {
    const msgs = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'message assistant';
    if (messageIndex !== null) div.dataset.msgIndex = String(messageIndex);
    if (chatId) div.dataset.chatId = chatId;
    const avatarHtml = char.avatar ? `<img src="${char.avatar}"/>` : `<span>${char.emoji || '🤖'}</span>`;
    const timeStr = state.settings.showTimestamps ? `<span class="message-time">${formatTime(Date.now())}</span>` : '';
    const menuBtn = messageIndex !== null ? `
        <button class="message-menu-btn" type="button" aria-label="Message actions"
            onclick="openMessageMenu(event, '${chatId}', ${messageIndex})">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="1.6"></circle>
                <circle cx="12" cy="12" r="1.6"></circle>
                <circle cx="12" cy="19" r="1.6"></circle>
            </svg>
        </button>` : '';
    div.innerHTML = `
    <div class="message-avatar">${avatarHtml}</div>
    <div class="message-body">
      <div class="message-meta">
        <div class="message-meta-left"><span class="message-sender">${escHtml(char.name)}</span></div>
        <div class="message-meta-right">${timeStr}${menuBtn}</div>
      </div>
      <div class="message-bubble streaming-cursor" id="streaming-bubble"></div>
    </div>`;
    msgs.appendChild(div);
    const bubble = div.querySelector('#streaming-bubble');
    let displayed = '';
    const speed = state.settings.streamSpeed || 18;
    for (let i = 0; i < fullText.length; i++) {
        displayed += fullText[i];
        bubble.innerHTML = formatMessageContent(displayed);
        if (i % 3 === 0) scrollToBottom();
        await sleep(speed);
    }
    bubble.classList.remove('streaming-cursor');
    bubble.removeAttribute('id');
}

async function translateMessage(chatId, messageIndex) {
    if (!state.apiKey || !state.apiUrl) {
        showToast('error', 'Configure API settings first');
        showAPIModal();
        return;
    }

    const history = state.chatHistory[chatId] || [];
    const msg = history[messageIndex];
    if (!msg || !msg.content) return;

    const targetLangCode = state.settings.translateLang || 'en';
    const targetLangLabel = getTranslateLanguageLabel(targetLangCode);

    // پرامپت آپدیت شده برای لحن خودمونی و طبیعی
    // دستور رو جدا کردیم و به صورت سیستم تعریفش کردیم
    const systemPrompt = `Translate the user's text into ${targetLangLabel}. Make it sound highly natural, conversational, and colloquial (informal spoken style). Capture the exact emotion and tone of the original message. Provide ONLY the translation, without any extra text, quotes, or explanations. Translate completely without omitting anything.`;

    const key = `${chatId}:${messageIndex}`;
    const previousTranslation = msg.translation || '';
    state.translatingMessages[key] = true;
    setMessageTranslationLoading(chatId, messageIndex, true);

    try {
        const resp = await fetch(state.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: state.apiModel,
                messages: [
                    { role: 'system', content: systemPrompt }, // دستور اصلی اینجا میره
                    { role: 'user', content: msg.content }     // فقط متن کاربر اینجا میره
                ],
                temperature: 0.4
                // max_tokens حذف شد تا محدودیت نداشته باشه
            })
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error?.message || `HTTP ${resp.status}`);
        }

        const data = await resp.json();
        const translation = String(data.choices?.[0]?.message?.content || '').trim();
        if (!translation) throw new Error('Empty translation returned');

        msg.translation = translation;
        saveData();
        setMessageTranslationLoading(chatId, messageIndex, false, translation);
        showToast('success', 'Message translated');
    } catch (err) {
        if (previousTranslation) {
            msg.translation = previousTranslation;
            setMessageTranslationLoading(chatId, messageIndex, false, previousTranslation);
        } else {
            setMessageTranslationLoading(chatId, messageIndex, false);
        }
        console.error('Translate error:', err);
        showToast('error', `Translate failed: ${err.message}`);
    } finally {
        delete state.translatingMessages[key];
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callAPI(char) {
    const messages = buildMessages(char);
    const body = {
        model: state.apiModel, messages,
        temperature: char.temperature ?? 0.85,
        max_tokens: char.maxTokens ?? 1024
    };
    const resp = await fetch(state.apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${state.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${resp.status}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
}

function buildMessages(char) {
    const systemPrompt = buildSystemPrompt(char);
    const history = getActiveChatHistory();
    const limit = state.settings.historyLimit || 20;
    const recent = limit > 0 ? history.slice(-limit) : history;
    const msgs = [{ role: 'system', content: systemPrompt }];
    recent.forEach(m => msgs.push({ role: m.role, content: m.content }));
    return msgs;
}

function buildSystemPrompt(char) {
    let prompt = char.systemPrompt || '';
    if (state.settings.roleplayEnhancer) {
        prompt += `\n\n[ROLEPLAY INSTRUCTIONS: Stay completely in character at all times. Never break the fourth wall or acknowledge being an AI. Respond naturally as ${char.name} would. Express emotions authentically through actions (*like this*) and dialogue.]`;
    }
    if (char.world) prompt += `\n\n[WORLD/SCENARIO: ${char.world}]`;
    const uname = state.profile.name || state.settings.userName || '';
    if (char.useUserName && uname) {
        prompt += `\n\n[IMPORTANT: The user's name is "${uname}". Address them by this name naturally in conversation—not every message, but when appropriate, call them "${uname}".${state.profile.gender && state.profile.gender !== 'other' ? ` The user identifies as ${state.profile.gender}.` : ''}]`;
    } else if (uname) {
        prompt += `\n\n[The user's name is: ${uname}]`;
    }
    if (state.profile.bio && char.useUserName) {
        prompt += `\n\n[About the user: ${state.profile.bio}]`;
    }
    if (state.settings.language) {
        const langMap = { fa: 'Persian (Farsi)', ar: 'Arabic', es: 'Spanish', fr: 'French', de: 'German', ja: 'Japanese', zh: 'Chinese', en: 'English' };
        prompt += `\n\n[Respond in ${langMap[state.settings.language] || state.settings.language}]`;
    }
    const styleMap = { roleplay: 'deep immersive roleplay', chat: 'casual friendly chat', story: 'collaborative story writing' };
    prompt += `\n\n[Conversation style: ${styleMap[char.responseStyle] || 'deep immersive roleplay'}]`;
    return prompt;
}

// ===== TYPING =====
function showTypingIndicator(char) {
    const ind = document.getElementById('typing-indicator');
    const av = document.getElementById('typing-avatar');
    const nm = document.getElementById('typing-name');
    av.innerHTML = char.avatar ? `<img src="${char.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>` : char.emoji || '🤖';
    nm.textContent = `${char.name} is typing...`;
    ind.classList.remove('hidden'); scrollToBottom();
}
function hideTypingIndicator() { document.getElementById('typing-indicator').classList.add('hidden'); }

function updateSendBtn(loading) {
    const btn = document.getElementById('send-btn');
    if (!btn) return;
    if (loading) {
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
        btn.style.opacity = '0.7'; btn.onclick = null;
    } else {
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2L15 22 11 13 2 9z"/></svg>`;
        btn.style.opacity = ''; btn.onclick = sendMessage;
    }
}

// ===== INPUT =====
function handleInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}
function autoResizeTextarea(el) {
    el.style.height = 'auto';
    const newHeight = Math.min(el.scrollHeight, 160);
    el.style.height = newHeight + 'px';
    if (newHeight > 50) scrollToBottom();
    updateTokenCounter(el.value);
}
function updateTokenCounter(text) {
    const approx = Math.round((text || '').length / 4);
    const el = document.getElementById('token-counter');
    if (el) el.textContent = `~${approx} tokens`;
}
function clearChat() {
    const chatId = getActiveChatId();
    if (!chatId) return;
    if (!confirm('Clear this conversation?')) return;
    state.chatHistory[chatId] = [];
    saveData();
    const char = getCharacterById(state.activeCharId);
    renderChatHistory(chatId, char);
    showToast('info', 'Chat cleared');
}

// ===== CHARACTER MODAL =====
let editingCharId = null;

function openCreateCharacter() {
    editingCharId = null; state.tags = [];
    document.getElementById('char-modal-title').textContent = 'Create Character';
    resetCharForm();
    document.getElementById('character-modal').classList.remove('hidden');
    populateEmojiGrid();
}

function resetCharForm() {
    ['char-name', 'char-title', 'char-description', 'char-system-prompt', 'char-greeting', 'char-world', 'char-tags-input'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('avatar-placeholder').classList.remove('hidden');
    const img = document.getElementById('avatar-preview-img');
    img.classList.add('hidden'); img.src = '';
    document.getElementById('avatar-preview-area').dataset.emoji = '';
    [['char-temperature', 0.85, 'temp-value'], ['char-max-tokens', 1024, 'tokens-value'],
    ['char-top-p', 0.9, 'topp-value'], ['char-freq-penalty', 0.3, 'freq-value']].forEach(([id, val, lbl]) => {
        const el = document.getElementById(id); if (el) el.value = val;
        const lb = document.getElementById(lbl); if (lb) lb.textContent = val;
    });
    document.getElementById('prompt-chars').textContent = '0';
    document.getElementById('char-tags-display').innerHTML = '';
    document.getElementById('char-use-user-name').checked = false;
    document.querySelector('input[name="response-style"][value="roleplay"]').checked = true;
    state.tags = [];
    const sp = document.getElementById('char-system-prompt');
    if (sp) sp.oninput = function () { document.getElementById('prompt-chars').textContent = this.value.length; };
}

function closeCharacterModal() {
    document.getElementById('character-modal').classList.add('hidden');
    const ep = document.getElementById('emoji-panel'); if (ep) ep.classList.add('hidden');
}

function openEditCharacter(id) {
    const char = state.characters[id]; if (!char) return;
    editingCharId = id;
    document.getElementById('char-modal-title').textContent = 'Edit Character';
    resetCharForm();
    document.getElementById('char-name').value = char.name || '';
    document.getElementById('char-title').value = char.title || '';
    document.getElementById('char-description').value = char.description || '';
    document.getElementById('char-system-prompt').value = char.systemPrompt || '';
    document.getElementById('char-greeting').value = char.greeting || '';
    document.getElementById('char-world').value = char.world || '';
    document.getElementById('char-temperature').value = char.temperature || 0.85;
    document.getElementById('char-max-tokens').value = char.maxTokens || 1024;
    document.getElementById('char-top-p').value = char.topP || 0.9;
    document.getElementById('char-freq-penalty').value = char.frequencyPenalty || 0.3;
    document.getElementById('temp-value').textContent = char.temperature || 0.85;
    document.getElementById('tokens-value').textContent = char.maxTokens || 1024;
    document.getElementById('topp-value').textContent = char.topP || 0.9;
    document.getElementById('freq-value').textContent = char.frequencyPenalty || 0.3;
    document.getElementById('prompt-chars').textContent = (char.systemPrompt || '').length;
    document.getElementById('char-use-user-name').checked = !!char.useUserName;
    state.tags = [...(char.tags || [])]; renderTags();
    const styleRadio = document.querySelector(`input[name="response-style"][value="${char.responseStyle || 'roleplay'}"]`);
    if (styleRadio) styleRadio.checked = true;
    if (char.avatar) {
        const img = document.getElementById('avatar-preview-img');
        img.src = char.avatar; img.classList.remove('hidden');
        document.getElementById('avatar-placeholder').classList.add('hidden');
    } else if (char.emoji) {
        const ph = document.getElementById('avatar-placeholder');
        ph.innerHTML = `<span style="font-size:48px">${char.emoji}</span>`;
        document.getElementById('avatar-preview-area').dataset.emoji = char.emoji;
    }
    document.getElementById('character-modal').classList.remove('hidden');
    populateEmojiGrid();
}

function saveCharacter() {
    const name = document.getElementById('char-name').value.trim();
    const systemPrompt = document.getElementById('char-system-prompt').value.trim();
    if (!name) { showToast('error', 'Character name is required'); return; }
    if (!systemPrompt) { showToast('error', 'System prompt is required'); return; }
    const id = editingCharId || `char_${Date.now()}`;
    const imgEl = document.getElementById('avatar-preview-img');
    const avatar = imgEl.classList.contains('hidden') ? '' : (imgEl.src?.startsWith('data:') ? imgEl.src : '');
    const responseStyle = document.querySelector('input[name="response-style"]:checked')?.value || 'roleplay';
    const useUserName = document.getElementById('char-use-user-name').checked;
    state.characters[id] = {
        id, name,
        title: document.getElementById('char-title').value.trim(),
        description: document.getElementById('char-description').value.trim(),
        systemPrompt,
        greeting: document.getElementById('char-greeting').value.trim(),
        world: document.getElementById('char-world').value.trim(),
        temperature: parseFloat(document.getElementById('char-temperature').value),
        maxTokens: parseInt(document.getElementById('char-max-tokens').value),
        topP: parseFloat(document.getElementById('char-top-p').value),
        frequencyPenalty: parseFloat(document.getElementById('char-freq-penalty').value),
        tags: [...state.tags], responseStyle, avatar, useUserName,
        emoji: document.getElementById('avatar-preview-area').dataset.emoji || '',
        createdAt: state.characters[id]?.createdAt || Date.now()
    };
    saveData(); renderCharactersList(); closeCharacterModal();
    showToast('success', `Character "${name}" saved!`);
    loadCharacter(id);
}

// ===== AVATAR =====
function triggerAvatarUpload() { document.getElementById('avatar-file-input').click(); }
function handleAvatarUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = document.getElementById('avatar-preview-img');
        img.src = ev.target.result; img.classList.remove('hidden');
        document.getElementById('avatar-placeholder').classList.add('hidden');
        document.getElementById('avatar-preview-area').dataset.emoji = '';
    };
    reader.readAsDataURL(file);
}
function generateAvatarEmoji() { document.getElementById('emoji-panel').classList.toggle('hidden'); }
function populateEmojiGrid() {
    const emojis = ['🧙', '🔮', '⚔️', '🦋', '🌙', '🔥', '💎', '🌸', '🦊', '🐉', '🧜', '🦁', '🌊', '⭐', '🦅', '🗡️', '🎭', '🌺', '🤖', '👑', '🧝', '🦸', '🧟', '🧛', '🕵️', '🎪', '🌈', '💫', '🎯', '🦄', '🧿', '👁️', '🗝️', '🦾', '💀', '🏹', '🌪️', '🏰', '🎨', '🌟'];
    const grid = document.getElementById('emoji-grid');
    if (!grid) return;
    grid.innerHTML = '';
    emojis.forEach(em => {
        const btn = document.createElement('button');
        btn.className = 'emoji-btn'; btn.textContent = em; btn.type = 'button';
        btn.onclick = () => selectEmoji(em);
        grid.appendChild(btn);
    });
}
function selectEmoji(emoji) {
    const area = document.getElementById('avatar-preview-area');
    document.getElementById('avatar-placeholder').innerHTML = `<span style="font-size:48px">${emoji}</span>`;
    document.getElementById('avatar-preview-img').classList.add('hidden');
    area.dataset.emoji = emoji;
    document.getElementById('emoji-panel').classList.add('hidden');
}

// ===== TEMPLATES =====
function insertPromptTemplate(type) {
    const ta = document.getElementById('char-system-prompt');
    ta.value = TEMPLATES[type] || '';
    document.getElementById('prompt-chars').textContent = ta.value.length;
    ta.focus();
}
function updateSliderValue(slider, targetId) {
    const el = document.getElementById(targetId); if (el) el.textContent = slider.value;
}
function toggleAdvanced() {
    const panel = document.getElementById('advanced-panel');
    const btn = document.getElementById('advanced-toggle-btn');
    panel.classList.toggle('hidden'); btn.classList.toggle('open');
}

// ===== TAGS =====
function handleTagInput(e) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = e.target.value.trim().replace(/,/g, '');
        if (val && !state.tags.includes(val)) { state.tags.push(val); renderTags(); }
        e.target.value = '';
    }
}
function renderTags() {
    const display = document.getElementById('char-tags-display'); if (!display) return;
    display.innerHTML = '';
    state.tags.forEach(tag => {
        const span = document.createElement('div'); span.className = 'tag-item';
        span.innerHTML = `${escHtml(tag)}<span class="tag-remove" onclick="removeTag('${escHtml(tag)}')">×</span>`;
        display.appendChild(span);
    });
}
function removeTag(tag) { state.tags = state.tags.filter(t => t !== tag); renderTags(); }

// ===== CONTEXT MENU =====
function showContextMenu(e, charId) {
    e.stopPropagation();
    state.contextMenuTarget = charId;
    const menu = document.getElementById('context-menu');
    menu.classList.remove('hidden');
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 180);
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
}
function contextAction(action) {
    const id = state.contextMenuTarget;
    document.getElementById('context-menu').classList.add('hidden');
    if (!id) return;
    if (action === 'edit') {
        if (!state.characters[id]) { showToast('info', 'Cannot edit featured characters'); return; }
        openEditCharacter(id);
    } else if (action === 'duplicate') {
        const orig = state.characters[id];
        if (!orig) { showToast('error', 'Cannot duplicate featured characters'); return; }
        const newId = `char_${Date.now()}`;
        state.characters[newId] = { ...orig, id: newId, name: orig.name + ' (Copy)', createdAt: Date.now() };
        saveData(); renderCharactersList(); showToast('success', 'Character duplicated!');
    } else if (action === 'export') {
        // ---- NEW: Base64 Export ----
        const char = state.characters[id] || FEATURED.find(f => f.id === id);
        if (!char) return;
        openExportModal(char);
    } else if (action === 'share') {
        const char = state.characters[id] || FEATURED.find(f => f.id === id);
        if (!char) return;
        openExportModal(char);
    } else if (action === 'delete') {
        const char = state.characters[id];
        if (!char) { showToast('error', 'Cannot delete featured characters'); return; }
        if (!confirm(`Delete "${char.name}"?`)) return;
        delete state.characters[id];
        Object.keys(state.chatHistory).forEach(chatId => {
            if (chatId === id || state.chatMeta[chatId]?.characterId === id) delete state.chatHistory[chatId];
        });
        Object.keys(state.chatMeta).forEach(chatId => {
            if (chatId === id || state.chatMeta[chatId]?.characterId === id) delete state.chatMeta[chatId];
        });
        if (state.activeCharId === id) {
            state.activeCharId = null;
            document.getElementById('chat-area').classList.add('hidden');
            document.getElementById('chat-input-area').classList.add('hidden');
            document.getElementById('welcome-screen').classList.remove('hidden');
            document.getElementById('topbar-char-info').innerHTML = '';
            clearChatWallpaper();
        }
        saveData(); renderCharactersList(); showToast('success', 'Character deleted');
    }
}
document.addEventListener('click', () => {
    const charMenu = document.getElementById('context-menu');
    if (charMenu) charMenu.classList.add('hidden');
    closeMessageMenu();
});

// ===== MESSAGE ACTIONS =====
function openMessageMenu(event, chatId, messageIndex) {
    event.stopPropagation();
    const menu = document.getElementById('message-actions-menu');
    if (!menu) return;

    state.messageMenuTarget = { chatId, messageIndex };
    menu.classList.remove('hidden');

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 232;
    const menuHeight = 212;
    const x = Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12));
    const y = Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - menuHeight - 12));
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
}

function closeMessageMenu() {
    const menu = document.getElementById('message-actions-menu');
    if (menu) menu.classList.add('hidden');
    state.messageMenuTarget = null;
}

async function messageAction(action) {
    const target = state.messageMenuTarget;
    closeMessageMenu();
    if (!target) return;

    if (action === 'copy') {
        const text = state.chatHistory[target.chatId]?.[target.messageIndex]?.content || '';
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }
        showToast('success', 'Message copied');
        return;
    }

    if (action === 'delete') {
        openDeleteMessageModal(target.chatId, target.messageIndex);
        return;
    }

    if (action === 'translate') {
        translateMessage(target.chatId, target.messageIndex);
        return;
    }

    if (action === 'branch') {
        createBranchFromMessage(target.chatId, target.messageIndex);
        return;
    }
}

function openDeleteMessageModal(chatId, messageIndex) {
    state.deleteMessageTarget = { chatId, messageIndex };
    const modal = document.getElementById('message-delete-modal');
    const history = state.chatHistory[chatId] || [];
    const msg = history[messageIndex];
    const preview = document.getElementById('delete-message-preview');
    if (preview) preview.textContent = (msg?.content || '').slice(0, 120) || 'Selected message';
    if (modal) modal.classList.remove('hidden');
}

function closeDeleteMessageModal() {
    const modal = document.getElementById('message-delete-modal');
    if (modal) modal.classList.add('hidden');
    state.deleteMessageTarget = null;
}

function getPairStartIndex(history, messageIndex) {
    if (messageIndex > 0 && history[messageIndex - 1]?.role === 'user') return messageIndex - 1;
    return messageIndex;
}

function deleteSelectedMessage(mode) {
    const target = state.deleteMessageTarget;
    closeDeleteMessageModal();
    if (!target) return;

    const history = state.chatHistory[target.chatId] || [];
    if (!history.length || !history[target.messageIndex]) return;

    const start = getPairStartIndex(history, target.messageIndex);

    if (mode === 'single') {
        history.splice(start, 2);
    } else if (mode === 'fromHere') {
        history.splice(start);
    } else {
        return;
    }

    state.chatHistory[target.chatId] = history;
    const char = getCharacterForChat(target.chatId);
    renderChatHistory(target.chatId, char);
    saveData();
    showToast('success', mode === 'single' ? 'Message pair deleted' : 'Conversation trimmed');
}

function createBranchFromMessage(chatId, messageIndex) {
    const history = state.chatHistory[chatId] || [];
    const sourceChar = getCharacterForChat(chatId);
    const baseChar = getBaseCharacterForChat(chatId) || sourceChar;
    const parentMeta = getChatMeta(chatId) || {};
    if (!sourceChar || !history.length || !history[messageIndex]) return;

    const branchId = `branch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const branchMessages = cloneMessages(history.slice(0, messageIndex + 1));

    const branchName = makeUniqueBranchName(sourceChar.name || baseChar?.name || 'Branch');
    const selectedMsg = history[messageIndex];
    const branchSnippet = makeMessageSnippet(selectedMsg?.content || '', 80);
    const branchDepth = (parentMeta.branchDepth || 0) + 1;

    const branchCharacter = cloneMessages(sourceChar) || { ...sourceChar };
    branchCharacter.id = branchId;
    branchCharacter.name = branchName;
    branchCharacter.title = `${sourceChar.title || sourceChar.name} Branch`;
    branchCharacter.description = branchSnippet
        ? `Branch chat from ${sourceChar.name} • “${branchSnippet}”`
        : `Branch chat from ${sourceChar.name}`;
    branchCharacter.isBranchChat = true;
    branchCharacter.sourceCharacterId = baseChar?.id || sourceChar.id;
    branchCharacter.sourceChatId = chatId;
    branchCharacter.branchPointIndex = messageIndex;
    branchCharacter.branchPointRole = selectedMsg?.role || '';
    branchCharacter.branchPointPreview = branchSnippet;
    branchCharacter.branchDepth = branchDepth;
    branchCharacter.createdAt = Date.now();

    state.characters[branchId] = branchCharacter;
    state.chatHistory[branchId] = branchMessages;
    state.chatMeta[branchId] = {
        characterId: branchId,
        name: branchName,
        parentChatId: chatId,
        parentCharacterId: sourceChar.id,
        sourceCharacterId: baseChar?.id || sourceChar.id,
        branchPointIndex: messageIndex,
        branchPointRole: selectedMsg?.role || '',
        branchPointPreview: branchSnippet,
        branchDepth,
        isBranchChat: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    saveData();
    renderCharactersList();
    loadCharacter(branchId, branchId);
    showToast('success', 'Branch chat created');
}

// ===== EXPORT / IMPORT CHARACTER (Base64) =====


function openExportModal(char) {
    const encoded = CharacterCodec.encode(char);
    if (!encoded) { showToast('error', 'Failed to encode character'); return; }

    const modal = document.getElementById('export-modal');
    const codeArea = document.getElementById('export-code');
    const charInfo = document.getElementById('export-char-info');

    // Show character info
    const avatarHtml = char.avatar
        ? `<img src="${char.avatar}" alt="${char.name}" />`
        : `<span>${char.emoji || getInitials(char.name)}</span>`;

    charInfo.innerHTML = `
    <div class="export-char-card">
      <div class="export-char-avatar">${avatarHtml}</div>
      <div class="export-char-details">
        <div class="export-char-name">${escHtml(char.name)}</div>
        <div class="export-char-title">${escHtml(char.title || char.description || '')}</div>
        ${char.tags && char.tags.length ? `<div class="export-char-tags">${char.tags.map(t => `<span class="export-tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
      </div>
    </div>`;

    codeArea.value = encoded;

    // Update size info
    const sizeKB = (new Blob([encoded]).size / 1024).toFixed(1);
    document.getElementById('export-size').textContent = `${sizeKB} KB`;

    // Reset copy button
    const copyBtn = document.getElementById('export-copy-btn');
    copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Code`;

    modal.classList.remove('hidden');
}

function closeExportModal() {
    document.getElementById('export-modal').classList.add('hidden');
}

async function copyExportCode() {
    const code = document.getElementById('export-code').value;
    const btn = document.getElementById('export-copy-btn');
    try {
        await navigator.clipboard.writeText(code);
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
        btn.classList.add('copied');
        showToast('success', 'Character code copied to clipboard!');
        setTimeout(() => {
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Code`;
            btn.classList.remove('copied');
        }, 2500);
    } catch (e) {
        // Fallback: select text
        document.getElementById('export-code').select();
        document.execCommand('copy');
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
        showToast('success', 'Copied!');
    }
}

function copyShareText() {
    const code = document.getElementById('export-code').value;
    const shareText = CharacterCodec.toShareText(code);
    navigator.clipboard.writeText(shareText).then(() => {
        showToast('success', 'Share text copied with wrapper!');
    }).catch(() => {
        showToast('info', 'Use Copy Code button instead');
    });
}

function downloadCharacterJSON() {
    const code = document.getElementById('export-code').value;
    const result = CharacterCodec.decode(code);
    if (!result.success) return;
    const blob = new Blob([JSON.stringify(result.character, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${result.character.name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('success', 'JSON file downloaded!');
}

// ---- IMPORT ----
function openImportModal() {
    const modal = document.getElementById('import-modal');
    document.getElementById('import-code').value = '';
    document.getElementById('import-preview').classList.add('hidden');
    document.getElementById('import-error').classList.add('hidden');
    document.getElementById('import-confirm-btn').classList.add('hidden');
    modal.classList.remove('hidden');
    document.getElementById('import-code').focus();
}

function closeImportModal() {
    document.getElementById('import-modal').classList.add('hidden');
}

function previewImportCode() {
    const raw = document.getElementById('import-code').value.trim();
    if (!raw) { showToast('error', 'Please paste a character code'); return; }

    // Strip wrapper if present
    const code = CharacterCodec.fromShareText(raw);
    const result = CharacterCodec.decode(code);

    const errorEl = document.getElementById('import-error');
    const previewEl = document.getElementById('import-preview');
    const confirmBtn = document.getElementById('import-confirm-btn');

    if (result.error) {
        errorEl.textContent = result.error;
        errorEl.classList.remove('hidden');
        previewEl.classList.add('hidden');
        confirmBtn.classList.add('hidden');
        return;
    }

    errorEl.classList.add('hidden');
    const char = result.character;

    // Build preview
    const avatarHtml = char.avatar
        ? `<img src="${char.avatar}" alt="${char.name}" />`
        : `<span>${char.emoji || getInitials(char.name)}</span>`;

    previewEl.innerHTML = `
    <div class="import-preview-header">✅ Character detected!</div>
    <div class="import-preview-card">
      <div class="export-char-avatar">${avatarHtml}</div>
      <div class="import-preview-info">
        <div class="import-preview-name">${escHtml(char.name)}</div>
        <div class="import-preview-title">${escHtml(char.title || '')}</div>
        <div class="import-preview-desc">${escHtml(char.description || '')}</div>
        ${char.tags && char.tags.length ? `<div class="export-char-tags">${char.tags.map(t => `<span class="export-tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
      </div>
    </div>
    <div class="import-preview-details">
      <div class="import-detail-row"><span>🌡️ Temperature</span><span>${char.temperature ?? 0.85}</span></div>
      <div class="import-detail-row"><span>📝 Max Tokens</span><span>${char.maxTokens ?? 1024}</span></div>
      <div class="import-detail-row"><span>🎭 Style</span><span>${char.responseStyle || 'roleplay'}</span></div>
      <div class="import-detail-row"><span>📜 Prompt Length</span><span>${(char.systemPrompt || '').length} chars</span></div>
      ${char.greeting ? `<div class="import-detail-row"><span>👋 Has Greeting</span><span>Yes</span></div>` : ''}
      ${char.world ? `<div class="import-detail-row"><span>🌍 Has World</span><span>Yes</span></div>` : ''}
    </div>`;

    previewEl.classList.remove('hidden');
    confirmBtn.classList.remove('hidden');
}

function confirmImport() {
    const raw = document.getElementById('import-code').value.trim();
    const code = CharacterCodec.fromShareText(raw);
    const result = CharacterCodec.decode(code);

    if (result.error) { showToast('error', result.error); return; }

    const char = result.character;
    const newId = `char_${Date.now()}`;

    // Check for duplicate names
    const existingNames = Object.values(state.characters).map(c => c.name.toLowerCase());
    if (existingNames.includes(char.name.toLowerCase())) {
        char.name = char.name + ' (Imported)';
    }

    state.characters[newId] = {
        ...char,
        id: newId,
        createdAt: Date.now()
    };

    saveData();
    renderCharactersList();
    closeImportModal();
    showToast('success', `"${char.name}" imported successfully!`);
    loadCharacter(newId);
}

async function pasteFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        document.getElementById('import-code').value = text;
        previewImportCode();
    } catch (e) {
        showToast('info', 'Paste manually with Ctrl+V');
        document.getElementById('import-code').focus();
    }
}

function handleImportFile() {
    document.getElementById('import-file-input').click();
}

function processImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const content = ev.target.result;

            // Try JSON format first
            try {
                const jsonData = JSON.parse(content);
                if (jsonData.name && jsonData.systemPrompt) {
                    // Valid JSON character, encode it to base64 then preview
                    jsonData._cv = CharacterCodec.MAGIC;
                    const encoded = CharacterCodec.encode(jsonData);
                    document.getElementById('import-code').value = encoded;
                    previewImportCode();
                    showToast('info', 'JSON file loaded!');
                    return;
                }
            } catch (_) { /* Not JSON, try Base64 */ }

            // Try as Base64 code
            document.getElementById('import-code').value = content.trim();
            previewImportCode();
        } catch (err) {
            showToast('error', 'Could not read file');
        }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
}


// ===== BACKUP / RESTORE =====
function getProjectStorageSnapshot() {
    const snapshot = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('cv_')) {
            snapshot[key] = localStorage.getItem(key) ?? '';
        }
    }
    return snapshot;
}

function clearProjectStorage() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('cv_')) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
}

function downloadTextFile(filename, text, mimeType = 'application/json;charset=utf-8') {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function base64EncodeUnicode(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

function base64DecodeUnicode(str) {
    return decodeURIComponent(escape(atob(str)));
}

function exportFullBackup() {
    try {
        const snapshot = getProjectStorageSnapshot();
        const encoded = base64EncodeUnicode(JSON.stringify(snapshot));
        const payload = { _cv_backup: encoded };
        downloadTextFile('CharacterVerse_Backup.json', JSON.stringify(payload, null, 2));
        showToast('success', 'Backup exported!');
    } catch (err) {
        console.error('Backup export failed:', err);
        showToast('error', 'Backup export failed');
    }
}

function triggerBackupImport() {
    document.getElementById('backup-file-input')?.click();
}

function handleBackupImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        processBackupImportText(reader.result || '');
        event.target.value = '';
    };
    reader.onerror = () => {
        showToast('error', 'Could not read backup file');
        event.target.value = '';
    };
    reader.readAsText(file);
}

function processBackupImportText(rawText) {
    try {
        const parsed = JSON.parse(rawText);
        const encoded = parsed?._cv_backup;

        if (typeof encoded !== 'string' || !encoded.trim()) {
            showToast('error', 'Invalid backup file');
            return;
        }

        const jsonText = base64DecodeUnicode(encoded.trim());
        const data = JSON.parse(jsonText);

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            showToast('error', 'Backup data is invalid');
            return;
        }

        clearProjectStorage();

        Object.entries(data).forEach(([key, value]) => {
            if (key && key.startsWith('cv_')) {
                localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
            }
        });

        showToast('success', 'Backup restored. Reloading...');
        setTimeout(() => location.reload(), 700);
    } catch (err) {
        console.error('Backup import failed:', err);
        showToast('error', 'Backup import failed');
    }
}

// ===== SETTINGS =====
function openGlobalSettings() {
    document.getElementById('settings-modal').classList.remove('hidden');
    document.getElementById('pref-language').value = state.settings.language || '';
    document.getElementById('translate-lang').value = state.settings.translateLang || 'en';
    document.getElementById('streaming-toggle').checked = state.settings.streaming !== false;
    document.getElementById('history-limit').value = state.settings.historyLimit || 20;
    document.getElementById('timestamps-toggle').checked = state.settings.showTimestamps !== false;
    document.getElementById('roleplay-enhancer').checked = state.settings.roleplayEnhancer !== false;
    document.getElementById('animations-toggle').checked = state.settings.animations !== false;
    document.getElementById('font-size-slider').value = state.settings.fontSize || 15;
    document.getElementById('font-size-val').textContent = (state.settings.fontSize || 15) + 'px';
    document.getElementById('stream-speed-slider').value = state.settings.streamSpeed || 18;
    updateStreamSpeedLabel(state.settings.streamSpeed || 18);
    const themeBtnMap = {
        'dark': 'theme-btn-dark',
        'midnight': 'theme-btn-midnight',
        'aurora': 'theme-btn-aurora',
        'cyberpunk': 'theme-btn-cyberpunk',
        'crimson': 'theme-btn-crimson',
        'light': 'theme-btn-light'
    };
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    const activeThemeBtnId = themeBtnMap[state.settings.theme || 'dark'];
    if (activeThemeBtnId) {
        const btn = document.getElementById(activeThemeBtnId);
        if (btn) btn.classList.add('active');
    }
    ['ltr', 'rtl', 'auto'].forEach(d => {
        const btn = document.getElementById(`dir-btn-${d}`);
        if (btn) btn.classList.toggle('active', state.settings.direction === d || (d === 'auto' && !state.settings.direction));
    });
    switchSettingsTab('general', document.querySelector('.settings-tab.active') || document.querySelector('.settings-tab'));
}
function closeSettingsModal() { document.getElementById('settings-modal').classList.add('hidden'); }

function saveSettings() {
    state.settings.language = document.getElementById('pref-language').value;
    state.settings.translateLang = document.getElementById('translate-lang').value || 'en';
    state.settings.streaming = document.getElementById('streaming-toggle').checked;
    state.settings.historyLimit = parseInt(document.getElementById('history-limit').value);
    state.settings.showTimestamps = document.getElementById('timestamps-toggle').checked;
    state.settings.roleplayEnhancer = document.getElementById('roleplay-enhancer').checked;
    state.settings.animations = document.getElementById('animations-toggle').checked;
    state.settings.fontSize = parseInt(document.getElementById('font-size-slider').value);
    state.settings.streamSpeed = parseInt(document.getElementById('stream-speed-slider').value);
    saveData(); applySettings(); closeSettingsModal(); showToast('success', 'Settings saved!');
}

function applySettings() {
    document.documentElement.style.setProperty('--font-size-base', (state.settings.fontSize || 15) + 'px');
    const theme = state.settings.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    const dir = state.settings.direction || 'auto';
    if (dir === 'ltr') { document.getElementById('html-root').setAttribute('dir', 'ltr'); }
    else if (dir === 'rtl') { document.getElementById('html-root').setAttribute('dir', 'rtl'); }
    else {
        const rtlLangs = ['fa', 'ar', 'he', 'ur'];
        document.getElementById('html-root').setAttribute('dir', rtlLangs.includes(state.settings.language) ? 'rtl' : 'ltr');
    }
    if (!state.settings.animations) {
        document.documentElement.style.setProperty('--transition', 'none');
        document.documentElement.style.setProperty('--transition-slow', 'none');
    } else {
        document.documentElement.style.setProperty('--transition', 'all 0.2s ease');
        document.documentElement.style.setProperty('--transition-slow', 'all 0.35s cubic-bezier(0.4,0,0.2,1)');
    }
}

function switchSettingsTab(tab, btn) {
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const panel = document.getElementById(`settings-${tab}`);
    if (panel) panel.classList.add('active');
}
function setTheme(theme, btn) {
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active'); state.settings.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
}
function setBubbleStyle(style, btn) {
    document.querySelectorAll('.style-opt').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active'); state.settings.bubbleStyle = style;
}
function updateFontSize(val) {
    const el = document.getElementById('font-size-val'); if (el) el.textContent = val + 'px';
}
function updateStreamSpeed(val) {
    state.settings.streamSpeed = parseInt(val); updateStreamSpeedLabel(val);
}
function updateStreamSpeedLabel(val) {
    const el = document.getElementById('stream-speed-val'); if (!el) return;
    const v = parseInt(val);
    el.textContent = v <= 10 ? 'Slow' : v <= 20 ? 'Medium' : v <= 35 ? 'Fast' : 'Turbo';
}
function onLanguageChange(val) {
    state.settings.language = val;
    const rtlLangs = ['fa', 'ar', 'he', 'ur'];
    if (rtlLangs.includes(val)) {
        document.getElementById('html-root').setAttribute('dir', 'rtl');
        document.getElementById('dir-btn-rtl')?.classList.add('active');
        document.getElementById('dir-btn-ltr')?.classList.remove('active');
        document.getElementById('dir-btn-auto')?.classList.remove('active');
        state.settings.direction = 'rtl';
    } else if (val) {
        document.getElementById('html-root').setAttribute('dir', 'ltr');
        document.getElementById('dir-btn-ltr')?.classList.add('active');
        document.getElementById('dir-btn-rtl')?.classList.remove('active');
        document.getElementById('dir-btn-auto')?.classList.remove('active');
        state.settings.direction = 'ltr';
    }
}
function setDirection(dir, btn) {
    document.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    state.settings.direction = dir;
    if (dir === 'ltr') document.getElementById('html-root').setAttribute('dir', 'ltr');
    else if (dir === 'rtl') document.getElementById('html-root').setAttribute('dir', 'rtl');
    else { const rtlL = ['fa', 'ar', 'he', 'ur']; document.getElementById('html-root').setAttribute('dir', rtlL.includes(state.settings.language) ? 'rtl' : 'ltr'); }
}
function openCharSettings() {
    if (!state.activeCharId || !state.characters[state.activeCharId]) { showToast('info', 'Cannot edit featured characters here'); return; }
    openEditCharacter(state.activeCharId);
}

// ===== DANGER =====
function clearAllHistory() {
    if (!confirm('Clear ALL conversation history?')) return;
    state.chatHistory = {}; saveData();
    if (state.activeCharId) {
        document.getElementById('chat-messages').innerHTML = '';
        const char = state.characters[state.activeCharId] || FEATURED.find(f => f.id === state.activeCharId);
        if (char) renderChatHistory(state.activeCharId, char);
    }
    showToast('success', 'All history cleared'); closeSettingsModal();
}
function deleteAllCharacters() {
    if (!confirm('Delete ALL characters?')) return;
    state.characters = {}; state.activeCharId = null;
    saveData(); renderCharactersList();
    document.getElementById('welcome-screen').classList.remove('hidden');
    document.getElementById('chat-area').classList.add('hidden');
    document.getElementById('chat-input-area').classList.add('hidden');
    document.getElementById('topbar-char-info').innerHTML = '';
    clearChatWallpaper();
    showToast('success', 'All characters deleted'); closeSettingsModal();
}
function resetEverything() {
    if (!confirm('Reset EVERYTHING? All data will be lost.')) return;
    localStorage.clear(); location.reload();
}

// ===== MEMORY =====
function toggleMemoryPanel() {
    const panel = document.getElementById('memory-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden') && state.activeCharId) updateMemoryPanel();
}
function updateMemoryPanel() {
    const char = state.characters[state.activeCharId] || FEATURED.find(f => f.id === state.activeCharId);
    if (!char) return;
    const sys = buildSystemPrompt(char);
    document.getElementById('memory-system').textContent = sys.slice(0, 400) + (sys.length > 400 ? '...' : '');
    const hist = getActiveChatHistory();
    const limit = state.settings.historyLimit || 20;
    document.getElementById('memory-msg-count').textContent = `${Math.min(hist.length, limit)} / ${hist.length} total`;
    const estTokens = Math.round(sys.length / 4 + hist.slice(-limit).reduce((a, m) => a + m.content.length / 4, 0));
    document.getElementById('memory-tokens').textContent = `~${estTokens.toLocaleString()} tokens`;
}
function loadFeaturedCharacter() { loadCharacter(FEATURED[0].id); }

// ===== TOAST =====
function showToast(type, msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warn: '⚠️' };
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-msg">${escHtml(msg)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}
