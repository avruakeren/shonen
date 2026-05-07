const API_BASE = "/api";
const searchInput = document.getElementById('searchInput');
const searchOverlay = document.getElementById('searchOverlay');
const ongoingGrid = document.getElementById('ongoingGrid');
const searchGrid = document.getElementById('searchGrid');
const libraryGrid = document.getElementById('libraryGrid');
const favoritesGrid = document.getElementById('favoritesGrid');
const scheduleContainer = document.getElementById('scheduleContainer');
const loader = document.getElementById('loader');

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

function showView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    if (views[viewName]) {
        views[viewName].classList.add('active');
    }
}

async function fetchOngoing() {
    showLoader(true);
    try {
        const response = await fetch(`${API_BASE}/ongoing`);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const data = await response.json();
        
        if (data.length === 0) {
            ongoingGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px;">
                    <i class="fas fa-ghost" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 20px;"></i>
                    <h3 style="color: #fff; margin-bottom: 10px;">Gagal Mengambil Data</h3>
                    <p style="color: #94a3b8;">Situs sumber (Otakudesu) mungkin sedang memblokir koneksi dari server. Coba lagi nanti atau gunakan VPN.</p>
                </div>
            `;
            return;
        }
        
        renderAnime(data, ongoingGrid);
    } catch (error) {
        console.error("Error fetching ongoing:", error);
        if (ongoingGrid) ongoingGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: #f43f5e;">Gagal memuat anime terbaru. Pastikan backend jalan.</p>';
    }
    showLoader(false);
}

async function searchAnime(query) {
    if (!query) return;
    
    showLoader(true);
    showView('search');
    const queryDisplay = document.getElementById('searchQueryText');
    const grid = document.getElementById('searchGrid');
    
    if (queryDisplay) queryDisplay.innerText = query;
    if (grid) grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Searching for "' + query + '"...</p>';
    
    if (searchOverlay) searchOverlay.style.display = 'none'; 
    
    try {
        console.log("Searching for:", query);
        const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error("Server error: " + response.status);
        const data = await response.json();
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

function renderAnime(list, container) {
    if (!container) return;
    container.innerHTML = '';
    if (list.length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No anime found.</p>';
        return;
    }

    list.forEach((anime, index) => {
        const card = document.createElement('div');
        card.className = 'anime-card';
        // Staggered delay yang lebih terasa
        card.style.animationDelay = `${index * 0.1}s`;
        card.innerHTML = `
            <img src="${anime.thumb}" alt="${anime.title}" class="card-thumb" loading="lazy" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'">
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
        // Fetch Seasonal with cache check or delay to avoid 429
        const seasonalRes = await fetch("https://api.jikan.moe/v4/seasons/now?limit=10");
        const seasonalData = await seasonalRes.json();

        if (seasonalData.data) {
            const firstAnime = seasonalData.data[0];
            if (firstAnime && firstAnime.season) {
                const seasonStr = firstAnime.season.charAt(0).toUpperCase() + firstAnime.season.slice(1);
                const titleEl = document.getElementById('seasonalTitle');
                if (titleEl) titleEl.innerHTML = `<i class="fas fa-leaf" style="color: #10b981;"></i> Seasonal Anime (${seasonStr} ${firstAnime.year || ''})`;
            }
            renderMalAnime(seasonalData.data, 'seasonalGrid');
        }

        // Delay for Top Rated to respect Jikan API limits
        setTimeout(async () => {
            try {
                const topRes = await fetch("https://api.jikan.moe/v4/top/anime?limit=10");
                const topData = await topRes.json();
                if (topData.data) renderMalAnime(topData.data, 'topGrid');
            } catch (e) { console.error("Top MAL Error:", e); }
        }, 1200);

    } catch (error) {
        console.error("MAL Fetch Error:", error);
    }
}

function renderMalAnime(list, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    list.forEach((anime, index) => {
        const title = anime.title_english || anime.title;
        const card = document.createElement('div');
        card.className = 'anime-card';
        card.style.animationDelay = `${index * 0.05}s`;
        card.innerHTML = `
            <img src="${anime.images.webp.large_image_url}" alt="${title}" class="card-thumb" loading="lazy">
            <div class="card-info">
                <span class="ep-tag" style="background: rgba(99, 102, 241, 0.1); color: var(--primary); border-color: rgba(99, 102, 241, 0.2);"><i class="fas fa-star"></i> ${anime.score || 'N/A'}</span>
                <h3>${title}</h3>
            </div>
        `;
        card.onclick = () => {
            window.location.hash = `#/search?q=${encodeURIComponent(title)}`;
        };
        container.appendChild(card);
    });
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
                    <button onclick="window.location.href='watch.html?id=${anime.id}'" 
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
if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchAnime(searchInput.value);
        }
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
        fetchLibrary();
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

async function fetchLibrary() {
    showLoader(true);
    try {
        const response = await fetch(`${API_BASE}/movies`);
        const data = await response.json();
        renderAnime(data, libraryGrid);
    } catch (e) { console.error(e); }
    showLoader(false);
}

async function fetchSchedule() {
    showLoader(true);
    try {
        const response = await fetch(`${API_BASE}/schedule`);
        const data = await response.json();
        renderSchedule(data, scheduleContainer);
    } catch (e) { 
        console.error(e); 
        if (scheduleContainer) scheduleContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: #f43f5e;">Gagal memuat jadwal. Pastikan backend jalan.</p>';
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
    fetch(`${API_BASE}/test`).then(r => r.json()).catch(() => {});
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
