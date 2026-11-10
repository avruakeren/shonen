const API_BASE = "/api";
const searchInput = document.getElementById('searchInput');
const searchOverlay = document.getElementById('searchOverlay');
const ongoingGrid = document.getElementById('ongoingGrid');
const searchGrid = document.getElementById('searchGrid');
const libraryGrid = document.getElementById('libraryGrid');
const favoritesGrid = document.getElementById('favoritesGrid');
const scheduleContainer = document.getElementById('scheduleContainer');
let libraryPage = 1;
let libraryData = [];
let currentSort = 'latest';


// Views
const views = {
    home: document.getElementById('homeView'),
    library: document.getElementById('libraryView'),
    favorites: document.getElementById('favoritesView'),
    schedule: document.getElementById('scheduleView'),
    search: document.getElementById('searchView')
};

function esc(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* One shape for every "nothing here" case: a tile with an icon, a short
   reason, and -- only when retrying can help -- an action. Keeping it in one
   helper stops each grid from inventing its own centred paragraph. */
function renderEmptyState(container, { icon = 'fa-inbox', title = 'Nothing here yet', message = '', actions = '' } = {}) {
    if (!container) return;
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon"><i class="fas ${icon}"></i></div>
            <h3>${esc(title)}</h3>
            ${message ? `<p>${esc(message)}</p>` : ''}
            ${actions ? `<div class="empty-actions">${actions}</div>` : ''}
        </div>
    `;
}

function retryButton(fnName) {
    return `<button type="button" class="glass-btn" onclick="${fnName}()"><i class="fas fa-redo"></i> Coba lagi</button>`;
}

/* Posters fade in on decode, not on insertion. Doing it from JS instead of an
   inline onload also covers the image that was already in the cache before
   the node existed -- its load event has come and gone. */
function hydrateThumb(img) {
    if (!img) return;
    const done = () => img.classList.add('is-loaded');
    if (img.complete) done();
    else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
    }
}

function renderSkeleton(container, count = 12) {
    if (!container) return;
    container.innerHTML = Array.from({ length: count }).map(() => `
        <div class="card-skeleton">
            <div class="skel-thumb"></div>
            <div class="skel-body">
                <div class="skel-line short"></div>
                <div class="skel-line"></div>
            </div>
        </div>
    `).join('');
}

/* The banner's poster is a background-image, so the browser gives us no load
   event for it. A throwaway Image() preloads the same URL and flips .is-ready
   on the div, which is what the CSS fade listens for. */
function revealHeroPoster(slide) {
    const bg = slide && slide.querySelector('.hero-bg');
    if (!bg || bg.classList.contains('is-ready')) return;
    const raw = (bg.style.backgroundImage || '').trim();
    const url = raw.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
    if (!url) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = img.onerror = () => bg.classList.add('is-ready');
    img.src = url;
}

function renderHeroSkeleton() {
    const track = document.getElementById('heroTrack');
    if (!track) return;
    document.getElementById('hero')?.classList.add('is-loading');
    track.innerHTML = `
        <div class="hero-slide hero-skeleton" aria-hidden="true">
            <div class="hero-skel-block">
                <div class="skel skel-badge"></div>
                <div class="skel skel-title"></div>
                <div class="skel skel-synopsis"></div>
                <div class="skel skel-synopsis short"></div>
                <div class="skel skel-btn"></div>
            </div>
        </div>
    `;
}

/* When the feed cannot answer there is no poster to show, but the banner is
   still the first thing on the page -- a pulsing skeleton would read as
   "loading forever". A plain title plus a way forward is honest and quiet. */
function renderHeroFallback() {
    const track = document.getElementById('heroTrack');
    if (!track) return;
    const hero = document.getElementById('hero');
    hero?.classList.remove('is-loading');
    hero?.classList.add('is-empty');
    track.innerHTML = `
        <div class="hero-slide is-active">
            <div class="hero-content">
                <h2 class="hero-title">Shonen</h2>
                <a href="#/library" class="hero-btn"><i class="fas fa-film"></i> Browse Library</a>
            </div>
        </div>
    `;
    const dots = document.getElementById('heroDots');
    if (dots) dots.innerHTML = '';
}

function showView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    if (views[viewName]) {
        views[viewName].classList.add('active');
    }
}

async function fetchOngoing() {
    renderSkeleton(ongoingGrid, 12);
    renderHeroSkeleton();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch(`${API_BASE}/ongoing`, { signal: controller.signal });
        const data = await response.json();

        // Handle new error response format from backend
        if (data.error) {
            renderHeroFallback();
            renderEmptyState(ongoingGrid, {
                icon: 'fa-ghost',
                title: 'Gagal mengambil data',
                message: 'Situs sumber mungkin sedang memblokir koneksi dari server. Coba lagi nanti atau gunakan VPN.',
                actions: retryButton('fetchOngoing')
            });
            return;
        }

        if (!data || (Array.isArray(data) && data.length === 0)) {
            renderHeroFallback();
            renderEmptyState(ongoingGrid, {
                icon: 'fa-ghost',
                title: 'Belum ada update',
                message: 'Sumber tidak mengembalikan anime apa pun. Coba lagi beberapa saat lagi.',
                actions: retryButton('fetchOngoing')
            });
            return;
        }

        renderHeroCarousel(data.slice(0, 5));
        renderAnime(data.slice(0, 18), ongoingGrid);
    } catch (error) {
        const msg = error.name === 'AbortError'
            ? 'Server tidak menjawab. Coba muat ulang halaman.'
            : 'Gagal memuat anime terbaru. Pastikan backend berjalan.';
        console.error("Error fetching ongoing:", error);
        renderHeroFallback();
        renderEmptyState(ongoingGrid, {
            icon: 'fa-wifi',
            title: 'Tidak bisa terhubung',
            message: msg,
            actions: retryButton('fetchOngoing')
        });
    } finally {
        clearTimeout(timeout);
    }
}

/* --- HERO CAROUSEL --- */
let heroIndex = 0;
let heroTimer = null;

function renderHeroCarousel(items) {
    const track = document.getElementById('heroTrack');
    const dotsContainer = document.getElementById('heroDots');
    if (!track) return;

    heroIndex = 0;

    let slidesHtml = '';
    items.forEach((item, i) => {
        slidesHtml += `
            <div class="hero-slide">
                <div class="hero-bg" style="background-image: url('${item.thumb}')"></div>
                <div class="hero-content">
                    <h2 class="hero-title">${item.title}</h2>
                    <a href="watch.html?id=${item.id}${item.episode_id ? '&ep=' + encodeURIComponent(item.episode_id) : ''}" class="hero-btn">
                        <i class="fas fa-play"></i> Watch Now
                    </a>
                </div>
            </div>
        `;
    });

    track.innerHTML = slidesHtml;
    const hero = document.getElementById('hero');
    hero?.classList.remove('is-loading');
    hero?.classList.remove('is-empty');

    const slides = track.querySelectorAll('.hero-slide');
    if (slides[0]) {
        slides[0].classList.add('is-active');
        revealHeroPoster(slides[0]);
        // One ahead is enough: it is the next advance, and prefetching all
        // five would put four full posters on the critical path.
        revealHeroPoster(slides[1]);
    }
    setHeroAmbient(track, 0);

    if (dotsContainer) {
        dotsContainer.innerHTML = items.map((_, i) =>
            `<button class="hero-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>`
        ).join('');
    }

    setupHeroNav(items.length);
}

/* Hands the ambient wash behind the page the poster that is on screen right
   now. CSS cannot transition background-image between slides, so the swap
   happens here; the layer is blurred to 90px first, which is why a hard cut
   reads as a change of light rather than a change of picture. */
function setHeroAmbient(track, index) {
    const slide = track.children[index];
    const bg = slide && slide.querySelector('.hero-bg');
    if (bg && bg.style.backgroundImage) {
        document.documentElement.style.setProperty('--hero-ambient', bg.style.backgroundImage);
    }
}

function setupHeroNav(total) {
    const track = document.getElementById('heroTrack');
    const prev = document.getElementById('heroPrev');
    const next = document.getElementById('heroNext');

    if (!track || total < 1) return;

    function goTo(index) {
        if (index < 0) index = total - 1;
        if (index >= total) index = 0;
        heroIndex = index;
        track.style.left = `-${index * 100}%`;

        const slides = track.querySelectorAll('.hero-slide');
        slides.forEach((slide, i) => slide.classList.toggle('is-active', i === index));
        if (slides[index]) revealHeroPoster(slides[index]);
        setHeroAmbient(track, index);

        document.querySelectorAll('.hero-dot').forEach(dot => {
            dot.classList.toggle('active', parseInt(dot.dataset.index) === index);
        });

        resetAutoSlide();
    }

    function nextSlide() { goTo(heroIndex + 1); }
    function prevSlide() { goTo(heroIndex - 1); }

    if (prev) prev.onclick = prevSlide;
    if (next) next.onclick = nextSlide;

    document.querySelectorAll('.hero-dot').forEach(dot => {
        dot.onclick = () => goTo(parseInt(dot.dataset.index));
    });

    function resetAutoSlide() {
        clearInterval(heroTimer);
        if (total > 1) {
            heroTimer = setInterval(nextSlide, 6000);
        }
    }

    resetAutoSlide();
}

async function searchAnime(query) {
    if (!query) return;

    showView('search');
    const queryDisplay = document.getElementById('searchQueryText');
    const grid = document.getElementById('searchGrid');

    if (queryDisplay) queryDisplay.innerText = query;
    if (grid) renderSkeleton(grid, 10);

    if (searchOverlay) searchOverlay.style.display = 'none';

    try {
        console.log("Searching for:", query);
        const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        if (data && data.error) {
            throw new Error(data.error);
        }
        console.log("Search results:", data);
        renderAnime(data, searchGrid, false, {
            icon: 'fa-search',
            title: 'Anime tidak ditemukan',
            message: `Tidak ada hasil untuk "${query}". Coba kata kunci lain atau judul bahasa Jepangnya.`
        });
    } catch (error) {
        console.error("Error searching anime:", error);
        renderEmptyState(grid, {
            icon: 'fa-triangle-exclamation',
            title: 'Pencarian gagal',
            message: `${error.message}. Pastikan backend berjalan, lalu coba lagi.`,
            actions: `<button type="button" class="glass-btn" data-query="${esc(query)}" onclick="searchAnime(this.dataset.query)"><i class="fas fa-redo"></i> Coba lagi</button>`
        });
    }
}

let currentAnimeId = null;
let currentEpisodes = [];

function renderAnime(list, container, append = false, empty = {}) {
    if (!container) return;
    if (!append) container.innerHTML = '';

    if (!list || list.length === 0) {
        if (!append) {
            renderEmptyState(container, {
                icon: empty.icon || 'fa-search',
                title: empty.title || 'Anime tidak ditemukan',
                message: empty.message || 'Coba kata kunci lain, atau pakai judul bahasa Jepangnya.',
                actions: empty.actions || ''
            });
        }
        return;
    }

    list.forEach((anime, index) => {
        const card = document.createElement('div');
        card.className = 'anime-card';
        // Cap the cascade: after the twelfth card the eye has already read the
        // row, and a longer queue just makes the last poster look late.
        card.style.animationDelay = `${Math.min(index, 12) * 45}ms`;
        card.innerHTML = `
            <img src="${anime.thumb}" alt="${anime.title}" class="card-thumb" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'">
            <div class="card-info">
                <span class="ep-tag">${anime.episode || anime.status || 'NEW'}</span>
                <h3>${anime.title}</h3>
            </div>
        `;
        hydrateThumb(card.querySelector('.card-thumb'));
        card.onclick = () => {
            console.log("Navigating to anime:", anime.id);
            const epParam = anime.episode_id ? `&ep=${encodeURIComponent(anime.episode_id)}` : '';
            window.location.href = `watch.html?id=${anime.id}${epParam}`;
        };
        container.appendChild(card);
    });
}


// Consolidated MyAnimeList Logic
async function fetchMalJson(url, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

function malItems(payload) {
    // Backend returns a bare array; direct Jikan/AniList calls return {data}.
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.items)) return payload.items;
    return null;
}

/**
 * Fetch one MAL section. Order of preference:
 *   1. our backend  /api/seasonal | /api/top   (server-side, cached, multi-provider)
 *   2. Jikan direct (legacy, may be rate-limited/blocked)
 * Returns the item array, or null when every source failed.
 */
async function loadMalSection(section) {
    const endpoints = section === 'seasonal'
        ? [`${API_BASE}/seasonal`, "https://api.jikan.moe/v4/seasons/now?limit=12"]
        : [`${API_BASE}/top`, "https://api.jikan.moe/v4/top/anime?limit=12"];

    for (const url of endpoints) {
        try {
            const items = malItems(await fetchMalJson(url));
            if (items && items.length > 0) return items;
        } catch (e) {
            console.warn(`MAL ${section} source failed (${url}):`, e.message || e);
        }
    }
    return null;
}

function renderMalFallback(containerId, icon, message) {
    renderEmptyState(document.getElementById(containerId), {
        icon,
        title: 'Data belum tersedia',
        message
    });
}

function setSeasonalTitle(items) {
    const titleEl = document.getElementById('seasonalTitle');
    if (!titleEl || !items || !items[0]) return;
    const first = items.find(i => i.season);
    if (!first || !first.season) return;
    const seasonStr = first.season.charAt(0).toUpperCase() + first.season.slice(1);
    titleEl.innerHTML = `<i class="fas fa-leaf"></i> Seasonal Anime (${seasonStr} ${first.year || ''})`;
}

async function fetchMalData() {
    // Each section is loaded independently so a failure in one cannot
    // prevent the other from rendering (the old code chained them).
    const [seasonal, top] = await Promise.all([
        loadMalSection('seasonal'),
        loadMalSection('top')
    ]);

    if (seasonal) {
        setSeasonalTitle(seasonal);
        renderMalAnime(seasonal, 'seasonalGrid', false);
    } else {
        renderMalFallback('seasonalGrid', 'fa-leaf', 'Seasonal data unavailable. Coba refresh beberapa saat lagi.');
    }

    if (top) {
        renderMalAnime(top, 'topGrid', true);
    } else {
        renderMalFallback('topGrid', 'fa-trophy', 'Top Rated data unavailable. Coba refresh beberapa saat lagi.');
    }
}

function renderMalAnime(list, containerId, showRank = true) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    list.forEach((anime, index) => {
        const title = anime.title_english || anime.title || 'Unknown';
        const thumb = anime.images?.webp?.large_image_url
            || anime.images?.jpg?.large_image_url
            || '';
        const score = anime.score != null ? anime.score : 'N/A';
        const card = document.createElement('div');
        card.className = showRank ? 'anime-card anime-card-rank' : 'anime-card';
        card.style.animationDelay = `${Math.min(index, 12) * 40}ms`;

        const rankHtml = showRank ? `
            <span class="rank-number">${String(anime.rank || (index + 1)).padStart(2, '0')}</span>
        ` : '';

        const infoHtml = `
            <div class="card-info">
                <span class="ep-tag"><i class="fas fa-star"></i> ${score}</span>
                <h3>${title}</h3>
            </div>
        `;

        const imgHtml = `<img src="${thumb}" alt="${title}" class="card-thumb" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'">`;

        const innerHtml = showRank ? `
            ${rankHtml}
            <div class="rank-card-content">
                ${imgHtml}
                ${infoHtml}
            </div>
        ` : `
            ${imgHtml}
            ${infoHtml}
        `;

        card.innerHTML = innerHtml;
        hydrateThumb(card.querySelector('.card-thumb'));
        card.onclick = async () => {
            try {
                const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(title)}`);
                const data = await res.json();
                if (data?.length > 0) {
                    window.location.href = `watch.html?id=${data[0].id}`;
                } else {
                    window.location.hash = `#/search?q=${encodeURIComponent(title)}`;
                }
            } catch {
                window.location.hash = `#/search?q=${encodeURIComponent(title)}`;
            }
        };
        container.appendChild(card);
    });
}

async function scheduleSearch(title, btn) {
    const origText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(title)}`);
        const data = await res.json();
        if (data && data.length > 0) {
            window.location.href = `watch.html?id=${data[0].id}`;
        } else {
            btn.innerHTML = '<i class="fas fa-times" style="color:#f43f5e"></i> Not found';
            setTimeout(() => { btn.innerHTML = origText; }, 2000);
        }
    } catch {
        btn.innerHTML = origText;
    }
}

function renderSchedule(data, container) {
    if (!container) return;
    container.classList.add('schedule-grid');
    container.innerHTML = '';

    if (!data || data.length === 0) {
        renderEmptyState(container, {
            icon: 'fa-calendar-xmark',
            title: 'Jadwal belum tersedia',
            message: 'Sumber jadwal tidak mengembalikan data. Coba muat ulang beberapa saat lagi.',
            actions: retryButton('fetchSchedule')
        });
        return;
    }

    const currentDay = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());

    data.forEach(item => {
        const isToday = item.day.toLowerCase() === currentDay.toLowerCase();
        const dayDiv = document.createElement('div');
        dayDiv.className = isToday ? 'schedule-day is-today' : 'schedule-day';

        dayDiv.innerHTML = `
            <div class="schedule-day-head">
                <h3>
                    ${item.day} ${isToday ? '<span class="schedule-today">Today</span>' : ''}
                </h3>
                <i class="fas fa-calendar-check"></i>
            </div>
            <div class="schedule-list">
                ${item.anime.map(anime => `
                    <button onclick="scheduleSearch('${anime.title.replace(/'/g, "\\'")}', this)" class="schedule-item">
                        <i class="fas fa-play-circle"></i>
                        <span>${anime.title}</span>
                    </button>
                `).join('')}
            </div>
        `;
        container.appendChild(dayDiv);
    });
}


// Search Events
function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

const debouncedSearch = debounce((q) => {
    if (q && q.trim().length >= 2) searchAnime(q.trim());
}, 500);

if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchAnime(searchInput.value);
        }
    });
    searchInput.addEventListener('input', (e) => {
        debouncedSearch(e.target.value);
    });
}

const executeSearch = document.getElementById('executeSearch');
if (executeSearch) {
    executeSearch.onclick = () => searchAnime(searchInput.value);
}

const searchToggle = document.getElementById('searchToggle');
const mobileSearchBtn = document.getElementById('mobileSearchBtn');
const closeSearch = document.getElementById('closeSearch');

function openSearch() {
    if (!searchOverlay) return;
    searchOverlay.style.display = 'flex';
    searchOverlay.style.opacity = '0';
    requestAnimationFrame(() => {
        searchOverlay.style.transition = 'opacity 0.3s ease';
        searchOverlay.style.opacity = '1';
    });
    setTimeout(() => {
        if (searchInput) searchInput.focus();
    }, 200);
}

function closeSearchUI() {
    if (!searchOverlay) return;
    searchOverlay.style.opacity = '0';
    setTimeout(() => {
        searchOverlay.style.display = 'none';
    }, 300);
}

if (searchToggle) searchToggle.onclick = openSearch;
if (mobileSearchBtn) mobileSearchBtn.onclick = openSearch;
if (closeSearch) closeSearch.onclick = closeSearchUI;

// Routing
function handleRoute() {
    const hash = window.location.hash || '#/';

    if (hash.startsWith('#/search')) {
        const params = new URLSearchParams(hash.split('?')[1]);
        const q = params.get('q');
        if (q) searchAnime(q);
    } else if (hash === '#/library') {
        showView('library');
        libraryPage = 1;
        fetchLibrary(1, false);
    } else if (hash === '#/schedule') {
        showView('schedule');
        fetchSchedule();
    } else if (hash === '#/favorites') {
        showView('favorites');
        renderFavorites();
    } else {
        showView('home');
    }

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('href') === hash.split('?')[0]);
    });
}

window.addEventListener('hashchange', handleRoute);

async function fetchLibrary(page = 1, append = false) {
    const loadMoreBtn = document.getElementById('loadMoreLibrary');
    if (!append) renderSkeleton(libraryGrid, 12);
    if (loadMoreBtn) { loadMoreBtn.disabled = true; loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...'; }

    try {
        const response = await fetch(`${API_BASE}/library?page=${page}`);
        const data = await response.json();
        
        if (data && data.error) throw new Error(data.error);
        
        if (data.length > 0) {
            if (append) {
                libraryData = libraryData.concat(data);
            } else {
                libraryData = data;
            }
            libraryPage = page;
            applySort();
        } else {
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
            if (!append) {
                libraryData = [];
                applySort();
            }
        }
    } catch (e) { 
        console.error(e); 
        if (!append) {
            renderEmptyState(libraryGrid, {
                icon: 'fa-triangle-exclamation',
                title: 'Gagal memuat library',
                message: `${e.message}. Periksa koneksi lalu coba lagi.`,
                actions: retryButton('fetchLibrary')
            });
        }
    } finally {
        if (loadMoreBtn) { loadMoreBtn.disabled = false; loadMoreBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Load More Anime'; }
    }
}

function applySort() {
    const sorted = [...libraryData];
    if (currentSort === 'az') {
        sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else if (currentSort === 'za') {
        sorted.sort((a, b) => b.title.localeCompare(a.title));
    }
    renderAnime(sorted, libraryGrid, false, {
        icon: 'fa-film',
        title: 'Library masih kosong',
        message: 'Arsip tidak mengembalikan anime apa pun. Coba muat ulang halaman.',
        actions: retryButton('fetchLibrary')
    });
}

document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentSort = this.dataset.sort;
        applySort();
    });
});

const loadMoreLibrary = document.getElementById('loadMoreLibrary');
if (loadMoreLibrary) {
    loadMoreLibrary.onclick = () => {
        fetchLibrary(libraryPage + 1, true);
    };
}

/**
 * Weekly schedule. Same order of preference as loadMalSection: our backend
 * first (server-side, cached, survives a blocked Jikan), then Jikan directly
 * as the legacy fallback, reshaped into the same [{day, anime}] form.
 */
async function loadSchedule() {
    try {
        const fromApi = await fetchMalJson(`${API_BASE}/schedule`);
        if (Array.isArray(fromApi) && fromApi.length > 0) return fromApi;
    } catch (e) {
        console.warn('Schedule from API failed:', e.message || e);
    }

    const json = await fetchMalJson('https://api.jikan.moe/v4/schedules');
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    return days.map(day => ({
        day: day.charAt(0).toUpperCase() + day.slice(1),
        anime: (json.data || [])
            .filter(ep => (ep.broadcast?.day || '').toLowerCase() === day)
            .map(ep => ({
                title: ep.title_english || ep.title,
                id: '',
            }))
    })).filter(d => d.anime.length > 0);
}

async function fetchSchedule() {
    try {
        const schedule = await loadSchedule();
        if (!schedule.length) throw new Error('Jadwal sedang tidak tersedia');
        renderSchedule(schedule, scheduleContainer);
    } catch (e) {
        console.error(e);
        renderEmptyState(scheduleContainer, {
            icon: 'fa-calendar-xmark',
            title: 'Gagal memuat jadwal',
            message: `${e.message}. Coba lagi beberapa saat lagi.`,
            actions: retryButton('fetchSchedule')
        });
    }
}

function renderFavorites() {
    const favs = JSON.parse(localStorage.getItem('shonen_favs') || '[]');
    renderAnime(favs, favoritesGrid, false, {
        icon: 'fa-heart',
        title: 'Belum ada favorit',
        message: 'Tekan ikon hati di halaman tonton untuk menyimpan anime ke sini.',
        actions: '<a class="glass-btn" href="index.html"><i class="fas fa-compass"></i> Jelajahi anime</a>'
    });
}

// Initial load
async function initApp() {
    handleRoute();

    // Parallelize core fetches for speed
    try {
        await Promise.all([
            fetchOngoing(),
            fetchMalData()
        ]);
    } catch (e) {
        console.error("Initialization error:", e);
    }

    // Check API connectivity in background
    fetch(`${API_BASE}/test`).then(r => r.json()).catch(() => { });
}

initApp();
