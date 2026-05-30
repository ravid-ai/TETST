// ===== CharacterVerse Gallery — Lazy-loaded & Randomized =====

(function () {
    'use strict';

    // ===== CONFIG =====
    const BATCH_DESKTOP = 6;
    const BATCH_MOBILE = 4;
    const MOBILE_BREAKPOINT = 768;
    const SCROLL_THRESHOLD = 300; // px from bottom to trigger load

    // ===== STATE =====
    let allCharacters = [];   // Shuffled array of decoded characters
    let allCodes = [];        // Parallel array of raw Base64 codes
    let cursor = 0;           // How many characters have been rendered
    let isLoading = false;
    let allLoaded = false;

    // ===== CHARACTER CODEC (mirrors main app) =====
    const CharacterCodec = {
        MAGIC: 'CV1',

        decode(base64String) {
            try {
                const cleaned = base64String.trim();
                const json = decodeURIComponent(escape(atob(cleaned)));
                const data = JSON.parse(json);
                if (data._cv !== this.MAGIC) return { error: 'Invalid character code.' };
                if (!data.name || !data.systemPrompt) return { error: 'Missing name or system prompt.' };
                delete data._cv;
                return { success: true, character: data };
            } catch (e) {
                return { error: 'Failed to decode: ' + e.message };
            }
        }
    };

    // ===== FISHER-YATES SHUFFLE =====
    function fisherYatesShuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // ===== HELPERS =====
    function isMobile() {
        return window.innerWidth <= MOBILE_BREAKPOINT;
    }

    function getBatchSize() {
        return isMobile() ? BATCH_MOBILE : BATCH_DESKTOP;
    }

    function getInitials(name) {
        return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    }

    function escHtml(s) {
        return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ===== TOAST =====
    function showToast(type, msg) {
        const container = document.getElementById('gallery-toast-container');
        const toast = document.createElement('div');
        toast.className = `gallery-toast ${type}`;
        const icons = { success: '✅', error: '❌', info: 'ℹ️' };
        toast.innerHTML = `<span class="gallery-toast-icon">${icons[type] || 'ℹ️'}</span><span class="gallery-toast-msg">${escHtml(msg)}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('gallery-toast-fadeout');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ===== BUILD CARD HTML =====
    function createCard(char, code, index) {
        const card = document.createElement('div');
        card.className = 'gallery-card';
        card.style.animationDelay = `${(index % getBatchSize()) * 0.07}s`;

        const avatarHtml = char.avatar
            ? `<img src="${char.avatar}" alt="${escHtml(char.name)}" />`
            : `<span>${char.emoji || getInitials(char.name)}</span>`;

        const tagsHtml = (char.tags && char.tags.length)
            ? `<div class="gallery-card-tags">${char.tags.map(t => `<span class="gallery-tag">${escHtml(t)}</span>`).join('')}</div>`
            : '';

        const greetingHtml = char.greeting
            ? `<div class="gallery-card-greeting">${escHtml(char.greeting.slice(0, 120))}${char.greeting.length > 120 ? '…' : ''}</div>`
            : '';

        const cardId = `card-${Date.now()}-${index}`;

        card.innerHTML = `
            <div class="gallery-card-top">
                <div class="gallery-card-avatar">${avatarHtml}</div>
                <div class="gallery-card-header">
                    <div class="gallery-card-name">${escHtml(char.name)}</div>
                    <div class="gallery-card-title">${escHtml(char.title || '')}</div>
                </div>
            </div>
            <div class="gallery-card-body">
                <div class="gallery-card-desc">${escHtml(char.description || '')}</div>
                ${greetingHtml}
            </div>
            ${tagsHtml}
            <div class="gallery-card-stats">
                <div class="gallery-stat">🌡️ <span class="gallery-stat-val">${char.temperature ?? 0.85}</span></div>
                <div class="gallery-stat">📝 <span class="gallery-stat-val">${char.maxTokens ?? 1024}</span></div>
                <div class="gallery-stat">🎭 <span class="gallery-stat-val">${char.responseStyle || 'roleplay'}</span></div>
            </div>
            <div class="gallery-card-actions">
                <button class="gallery-btn gallery-btn-copy" id="copy-${cardId}" title="Copy character code">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="9" y="9" width="13" height="13" rx="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    Copy Code
                </button>
                <button class="gallery-btn gallery-btn-add" id="add-${cardId}" title="Add to your characters and start chatting">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    Add to Chat
                </button>
            </div>
        `;

        // --- Event: Copy Code ---
        card.querySelector(`#copy-${cardId}`).addEventListener('click', async () => {
            const btn = card.querySelector(`#copy-${cardId}`);
            try {
                await navigator.clipboard.writeText(code);
                btn.classList.add('copied');
                btn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                    Copied!
                `;
                showToast('success', `${char.name}'s code copied!`);
                setTimeout(() => {
                    btn.classList.remove('copied');
                    btn.innerHTML = `
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <rect x="9" y="9" width="13" height="13" rx="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Copy Code
                    `;
                }, 2000);
            } catch (e) {
                // Fallback
                const ta = document.createElement('textarea');
                ta.value = code;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
                showToast('success', 'Copied!');
            }
        });

        // --- Event: Add to Chat ---
        card.querySelector(`#add-${cardId}`).addEventListener('click', () => {
            const btn = card.querySelector(`#add-${cardId}`);
            try {
                // Load existing characters from localStorage
                let characters = {};
                try {
                    const saved = localStorage.getItem('cv_characters');
                    if (saved) characters = JSON.parse(saved);
                } catch (_) { /* empty */ }

                // Check for duplicate names
                const existingNames = Object.values(characters).map(c => c.name.toLowerCase());
                const charData = { ...char };
                if (existingNames.includes(charData.name.toLowerCase())) {
                    charData.name = charData.name + ' (Gallery)';
                }

                // Create new entry
                const newId = `char_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                characters[newId] = {
                    ...charData,
                    id: newId,
                    createdAt: Date.now()
                };

                // Save to localStorage
                localStorage.setItem('cv_characters', JSON.stringify(characters));
                localStorage.setItem('cv_last_char', newId);

                // Visual feedback
                btn.classList.add('added');
                btn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                    Added!
                `;
                showToast('success', `${char.name} added! Redirecting...`);

                // Redirect to main app
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 800);
            } catch (e) {
                showToast('error', 'Failed to add character: ' + e.message);
            }
        });

        return card;
    }

    // ===== RENDER BATCH =====
    function renderBatch() {
        if (isLoading || allLoaded) return;
        isLoading = true;

        const grid = document.getElementById('gallery-grid');
        const loader = document.getElementById('gallery-loader');
        const batchSize = getBatchSize();
        const end = Math.min(cursor + batchSize, allCharacters.length);

        if (cursor >= allCharacters.length) {
            allLoaded = true;
            loader.classList.add('hidden');
            document.getElementById('gallery-end').classList.remove('hidden');
            isLoading = false;
            return;
        }

        loader.classList.remove('hidden');

        // Small delay for visual feedback
        setTimeout(() => {
            for (let i = cursor; i < end; i++) {
                const card = createCard(allCharacters[i], allCodes[i], i);
                grid.appendChild(card);
            }
            cursor = end;

            // Check if we've loaded everything
            if (cursor >= allCharacters.length) {
                allLoaded = true;
                loader.classList.add('hidden');
                document.getElementById('gallery-end').classList.remove('hidden');
            } else {
                loader.classList.add('hidden');
            }

            isLoading = false;
        }, 200);
    }

    // ===== SCROLL HANDLER =====
    function onScroll() {
        if (allLoaded || isLoading) return;
        const scrollPos = window.innerHeight + window.scrollY;
        const docHeight = document.documentElement.scrollHeight;

        if (docHeight - scrollPos < SCROLL_THRESHOLD) {
            renderBatch();
        }
    }

    // ===== INIT =====
    async function init() {
        const loader = document.getElementById('gallery-loader');

        try {
            // Fetch gallery data
            const response = await fetch('gallery.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (!data.characters || !Array.isArray(data.characters)) {
                throw new Error('Invalid gallery.json format');
            }

            // Decode all characters and filter valid ones
            const validEntries = [];
            for (const entry of data.characters) {
                const result = CharacterCodec.decode(entry.code);
                if (result.success) {
                    validEntries.push({
                        character: result.character,
                        code: entry.code
                    });
                } else {
                    console.warn(`Skipped invalid character (${entry.id}):`, result.error);
                }
            }

            if (validEntries.length === 0) {
                throw new Error('No valid characters found in gallery');
            }

            // Fisher-Yates shuffle
            const shuffled = fisherYatesShuffle(validEntries);

            // Populate parallel arrays
            allCharacters = shuffled.map(e => e.character);
            allCodes = shuffled.map(e => e.code);

            // Render first batch
            renderBatch();

            // Attach scroll listener
            window.addEventListener('scroll', onScroll, { passive: true });

            // Also listen for resize (batch size may change)
            window.addEventListener('resize', () => {
                // If resizing revealed more space and we're near bottom, load more
                onScroll();
            }, { passive: true });

        } catch (e) {
            console.error('Gallery init error:', e);
            loader.innerHTML = `
                <div style="color: var(--accent-red); text-align: center; padding: 40px;">
                    <p style="font-size: 16px; margin-bottom: 8px;">❌ Failed to load gallery</p>
                    <p style="font-size: 13px; color: var(--text-muted);">${escHtml(e.message)}</p>
                    <button onclick="location.reload()" style="margin-top: 16px; padding: 10px 20px; background: var(--grad-main); color: #fff; border: none; border-radius: 12px; cursor: pointer; font-size: 14px;">
                        Retry
                    </button>
                </div>
            `;
        }
    }

    // ===== START =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();