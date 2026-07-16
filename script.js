const API_BASE = "/api";
const searchInput = document.getElementById('searchInput');
const searchOverlay = document.getElementById('searchOverlay');
const ongoingGrid = document.getElementById('ongoingGrid');
const searchGrid = document.getElementById('searchGrid');
const libraryGrid = document.getElementById('libraryGrid');
const favoritesGrid = document.getElementById('favoritesGrid');
const scheduleContainer = document.getElementById('scheduleContainer');
const loader = document.getElementById('loader');
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

function showLoader(show) {
    if (loader) loader.style.display = show ? 'flex' : 'none';
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

function showView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    if (views[viewName]) {
        views[viewName].classList.add('active');
    }
}

async function fetchOngoing() {
    renderSkeleton(ongoingGrid, 12);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch(`${API_BASE}/ongoing`, { signal: controller.signal });
        const data = await response.json();

        // Handle new error response format from backend
        if (data.error) {
            ongoingGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px;">
                    <i class="fas fa-ghost" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 20px;"></i>
                    <h3 style="color: #fff; margin-bottom: 10px;">Gagal Mengambil Data</h3>
                    <p style="color: #94a3b8;">Situs sumber (Samehadaku) mungkin sedang memblokir koneksi dari server. Coba lagi nanti atau gunakan VPN.</p>
                    <p style="color: #64748b; font-size: 0.8rem; margin-top: 8px;">${data.error}</p>
                </div>
            `;
            return;
        }

        if (!data || (Array.isArray(data) && data.length === 0)) {
            ongoingGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px;">
                    <i class="fas fa-ghost" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 20px;"></i>
                    <h3 style="color: #fff; margin-bottom: 10px;">Gagal Mengambil Data</h3>
                    <p style="color: #94a3b8;">Situs sumber (Samehadaku) mungkin sedang memblokir koneksi dari server. Coba lagi nanti atau gunakan VPN.</p>
                </div>
            `;
            return;
        }

        renderHeroCarousel(data.slice(0, 5));
        renderAnime(data.slice(0, 18), ongoingGrid);
    } catch (error) {
        const msg = error.name === 'AbortError' ? 'Server timeout. Coba refresh.' : 'Gagal memuat anime terbaru. Pastikan backend jalan.';
        console.error("Error fetching ongoing:", error);
        if (ongoingGrid) ongoingGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: #f43f5e;">${msg}</p>`;
    } finally {
        clearTimeout(timeout);
        showLoader(false);
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
                    <a href="watch.html?id=${item.id}" class="hero-btn">
                        <i class="fas fa-play"></i> Watch Now
                    </a>
                </div>
            </div>
        `;
    });

    track.innerHTML = slidesHtml;

    if (dotsContainer) {
        dotsContainer.innerHTML = items.map((_, i) =>
            `<button class="hero-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>`
        ).join('');
    }

    setupHeroNav(items.length);
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

    showLoader(true);
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
        renderAnime(data, searchGrid);
    } catch (error) {
        console.error("Error searching anime:", error);
        if (grid) grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: #f43f5e;">Error: ' + error.message + '. Pastikan backend (app.py) sudah jalan.</p>';
    }
    showLoader(false);
}

let currentAnimeId = null;
let currentEpisodes = [];

function renderAnime(list, container, append = false) {
    if (!container) return;
    if (!append) container.innerHTML = '';
    
    if (list.length === 0 && !append) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
                <div style="font-size: 4rem; margin-bottom: 16px; animation: searchBounce 2s ease-in-out infinite;">
                    <i class="fas fa-search" style="color: var(--primary);"></i>
                </div>
                <h3 style="color: #fff; margin-bottom: 6px; font-size: 1.2rem;">Anime Not Found</h3>
                <p style="color: #94a3b8; font-size: 0.9rem;">Sorry, coba searching manual pake judul bahasa Jepangnya.</p>
            </div>
        `;
        return;
    }

    list.forEach((anime, index) => {
        const card = document.createElement('div');
        card.className = 'anime-card';
        // Staggered delay yang lebih terasa
        card.style.animationDelay = `${index * 0.1}s`;
        card.innerHTML = `
            <img src="${anime.thumb}" alt="${anime.title}" class="card-thumb" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'">
            <div class="card-info">
                <span class="ep-tag">${anime.episode || anime.status || 'NEW'}</span>
                <h3>${anime.title}</h3>
            </div>
        `;
        card.onclick = () => {
            console.log("Navigating to anime:", anime.id);
            window.location.href = `watch.html?id=${anime.id}`;
        };
        container.appendChild(card);
    });
}


// Consolidated MyAnimeList Logic
async function fetchMalData() {
    try {
        const seasonalRes = await fetch("https://api.jikan.moe/v4/seasons/now?limit=10");
        const seasonalData = await seasonalRes.json();

        if (seasonalData.data) {
            const firstAnime = seasonalData.data[0];
            if (firstAnime && firstAnime.season) {
                const seasonStr = firstAnime.season.charAt(0).toUpperCase() + firstAnime.season.slice(1);
                const titleEl = document.getElementById('seasonalTitle');
                if (titleEl) titleEl.innerHTML = `<i class="fas fa-leaf" style="color: #10b981;"></i> Seasonal Anime (${seasonStr} ${firstAnime.year || ''})`;
            }
            renderMalAnime(seasonalData.data, 'seasonalGrid', false);
        }

        // Delay for Top Rated to respect Jikan API limits
        setTimeout(async () => {
            try {
                const topRes = await fetch("https://api.jikan.moe/v4/top/anime?limit=10");
                const topData = await topRes.json();
                if (topData.data) renderMalAnime(topData.data, 'topGrid', true);
            } catch (e) { console.error("Top MAL Error:", e); }
        }, 1200);

    } catch (error) {
        console.error("MAL Fetch Error:", error);
    }
}

function renderMalAnime(list, containerId, showRank = true) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    list.forEach((anime, index) => {
        const title = anime.title_english || anime.title;
        const card = document.createElement('div');
        card.className = showRank ? 'anime-card anime-card-rank' : 'anime-card';
        card.style.animationDelay = `${index * 0.05}s`;

        const rankHtml = showRank ? `
            <span class="rank-number">${String(anime.rank || (index + 1)).padStart(2, '0')}</span>
        ` : '';

        const innerHtml = showRank ? `
            ${rankHtml}
            <div class="rank-card-content">
                <img src="${anime.images.webp.large_image_url}" alt="${title}" class="card-thumb" loading="lazy">
                <div class="card-info">
                    <span class="ep-tag" style="background: rgba(99, 102, 241, 0.1); color: var(--primary); border-color: rgba(99, 102, 241, 0.2);"><i class="fas fa-star"></i> ${anime.score || 'N/A'}</span>
                    <h3>${title}</h3>
                </div>
            </div>
        ` : `
            <img src="${anime.images.webp.large_image_url}" alt="${title}" class="card-thumb" loading="lazy">
            <div class="card-info">
                <span class="ep-tag" style="background: rgba(99, 102, 241, 0.1); color: var(--primary); border-color: rgba(99, 102, 241, 0.2);"><i class="fas fa-star"></i> ${anime.score || 'N/A'}</span>
                <h3>${title}</h3>
            </div>
        `;

        card.innerHTML = innerHtml;
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
    container.innerHTML = '';
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
    container.style.gap = '20px';
    const currentDay = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());

    data.forEach(item => {
        const isToday = item.day.toLowerCase() === currentDay.toLowerCase();
        const dayDiv = document.createElement('div');
        dayDiv.className = 'glass';
        dayDiv.style.padding = '20px';
        dayDiv.style.borderRadius = '20px';
        dayDiv.style.border = isToday ? '2px solid var(--primary)' : '1px solid var(--glass-border)';
        dayDiv.style.background = isToday ? 'rgba(99, 102, 241, 0.1)' : 'var(--glass)';

        dayDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
                <h3 style="color: ${isToday ? 'var(--primary)' : 'white'}; font-size: 1.2rem; font-weight: 800;">
                    ${item.day} ${isToday ? '<span style="font-size: 0.7rem; background: var(--primary); color: white; padding: 2px 8px; border-radius: 99px; margin-left: 8px; vertical-align: middle;">TODAY</span>' : ''}
                </h3>
                <i class="fas fa-calendar-check" style="color: ${isToday ? 'var(--primary)' : 'var(--text-muted)'};"></i>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                ${item.anime.map(anime => `
                    <button onclick="scheduleSearch('${anime.title.replace(/'/g, "\\'")}', this)" 
                            style="text-align: left; background: rgba(255,255,255,0.03); color: var(--text-main); border: 1px solid var(--border); padding: 10px 14px; border-radius: 10px; cursor: pointer; font-size: 0.88rem; transition: all 0.25s; display: flex; align-items: center; gap: 10px;"
                            onmouseover="this.style.background='var(--primary)';this.style.borderColor='var(--primary)';this.style.transform='translateX(5px)'"
                            onmouseout="this.style.background='rgba(255,255,255,0.03)';this.style.borderColor='var(--border)';this.style.transform='translateX(0)'">
                        <i class="fas fa-play-circle" style="font-size: 0.8rem; opacity: 0.6;"></i>
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${anime.title}</span>
                    </button>
                `).join('')}
            </div>
        `;
        scheduleContainer.appendChild(dayDiv);
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
    if (!append) showLoader(true);
    if (loadMoreBtn) { loadMoreBtn.disabled = true; loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...'; }

    try {
        const response = await fetch(`${API_BASE}/movies?page=${page}`);
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
        }
    } catch (e) { 
        console.error(e); 
        if (libraryGrid && !append) libraryGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: #f43f5e;">Gagal memuat library. ' + e.message + '</p>';
    } finally {
        if (!append) showLoader(false);
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
    renderAnime(sorted, libraryGrid);
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

async function fetchSchedule() {
    showLoader(true);
    try {
        const response = await fetch('https://api.jikan.moe/v4/schedules');
        const json = await response.json();
        if (json.error) throw new Error(json.error);

        const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
        const schedule = days.map(day => ({
            day: day.charAt(0).toUpperCase() + day.slice(1),
            anime: (json.data || [])
                .filter(ep => (ep.broadcast?.day || '').toLowerCase() === day)
                .map(ep => ({
                    title: ep.title_english || ep.title,
                    mal_id: ep.mal_id,
                    id: '',
                }))
        })).filter(d => d.anime.length > 0);

        renderSchedule(schedule, scheduleContainer);
    } catch (e) {
        console.error(e);
        if (scheduleContainer) scheduleContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: #f43f5e;">Gagal memuat jadwal. ' + e.message + '</p>';
    }
    showLoader(false);
}

function renderFavorites() {
    const favs = JSON.parse(localStorage.getItem('shonen_favs') || '[]');
    renderAnime(favs, favoritesGrid);
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

// Interactive Glow Background with Smoothing
let mouseX = 0, mouseY = 0;
let glowX = 0, glowY = 0;

document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

function animateGlow() {
    const lerp = 0.1; // Kelembutan pergerakan
    glowX += (mouseX - glowX) * lerp;
    glowY += (mouseY - glowY) * lerp;

    if (glow) {
        glow.style.left = `${glowX}px`;
        glow.style.top = `${glowY}px`;
    }
    requestAnimationFrame(animateGlow);
}
animateGlow();
