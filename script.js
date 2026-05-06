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
    search: document.getElementById('searchView'),
    detail: document.getElementById('detailView')
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
        const data = await response.json();
        renderAnime(data, ongoingGrid);
    } catch (error) {
        console.error("Error fetching ongoing:", error);
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

async function showDetails(id) {
    showLoader(true);
    currentAnimeId = id;
    try {
        const response = await fetch(`${API_BASE}/details/${id}`);
        if (!response.ok) throw new Error("Anime not found");
        const data = await response.json();
        if (data && !data.error) {
            currentEpisodes = data.episodes;
            renderDetails(data);
            showView('detail');
            window.scrollTo(0, 0);
        } else {
            alert("Could not load anime details.");
        }
    } catch (error) {
        console.error("Error fetching details:", error);
        alert("Error connecting to server.");
    } finally {
        showLoader(false);
    }
}

document.getElementById('backBtn').onclick = () => {
    window.history.back();
};

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
        card.style.animationDelay = `${index * 0.05}s`;
        card.innerHTML = `
            <img src="${anime.thumb}" alt="${anime.title}" class="card-thumb" loading="lazy" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'">
            <div class="card-info">
                <span class="ep-tag">${anime.episode || anime.status || 'NEW'}</span>
                <h3>${anime.title}</h3>
            </div>
        `;
        card.onclick = () => showDetails(anime.id);
        container.appendChild(card);
    });
}

function renderDetails(anime) {
    const isFav = isFavorite(currentAnimeId);
    detailContainer.innerHTML = `
        <div class="detail-layout">
            <div class="detail-left">
                <img src="${anime.thumb}" alt="${anime.title}" class="detail-thumb">
                <div style="margin-top: 20px;">
                    ${Object.entries(anime.info).map(([k, v]) => `<p><strong>${k.replace(/_/g, ' ')}:</strong> ${v}</p>`).join('')}
                </div>
            </div>
            <div class="detail-right">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 15px;">
                    <h2>${anime.title}</h2>
                    <button onclick='toggleFavorite(${JSON.stringify({ id: currentAnimeId, title: anime.title, thumb: anime.thumb }).replace(/'/g, "&apos;")})' 
                            id="favBtn" class="glass" 
                            style="padding: 10px 15px; border-radius: 12px; border: 1px solid var(--border); color: ${isFav ? '#f43f5e' : '#fff'}; cursor: pointer; transition: all 0.3s;">
                        <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
                    </button>
                </div>
                <p style="margin: 15px 0; color: #94a3b8; line-height: 1.6;">${anime.synopsis}</p>
                <div class="episodes-list">
                    <h3>Episodes</h3>
                    ${anime.episodes.map(ep => `
                        <div onclick="playEpisode('${ep.id}')" class="ep-item" style="cursor: pointer;">
                            <span><i class="fas fa-play-circle" style="color: var(--primary); margin-right: 10px;"></i> ${ep.title}</span>
                            <span style="color: #6366f1;">${ep.date}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

function isFavorite(id) {
    const favs = JSON.parse(localStorage.getItem('shonen_favs') || '[]');
    return favs.some(f => f.id === id);
}

function toggleFavorite(anime) {
    let favs = JSON.parse(localStorage.getItem('shonen_favs') || '[]');
    const index = favs.findIndex(f => f.id === anime.id);
    
    if (index > -1) {
        favs.splice(index, 1);
    } else {
        favs.unshift(anime);
    }
    
    localStorage.setItem('shonen_favs', JSON.stringify(favs));
    showDetails(anime.id); // Re-render to update heart icon
}

// Include existing helper functions for Mal, Stream, etc. (Condensed)
async function fetchMalData() {
    try {
        const [seasonal, top] = await Promise.all([
            fetch('https://api.jikan.moe/v4/seasons/now?limit=10').then(r => r.json()),
            fetch('https://api.jikan.moe/v4/top/anime?limit=10').then(r => r.json())
        ]);
        renderMalGrid(seasonal.data, document.getElementById('seasonalGrid'));
        renderMalGrid(top.data, document.getElementById('topGrid'));
    } catch (e) { console.error(e); }
}

function renderMalGrid(data, container) {
    container.innerHTML = '';
    data.forEach(anime => {
        const card = document.createElement('div');
        card.className = 'anime-card';
        card.onclick = () => {
            window.location.hash = `#/search?q=${encodeURIComponent(anime.title)}`;
            searchAnime(anime.title);
        };
        card.innerHTML = `
            <img src="${anime.images.webp.large_image_url}" class="card-thumb" loading="lazy">
            <div class="card-info">
                <span class="ep-tag">${anime.score || 'N/A'} ★</span>
                <h3>${anime.title}</h3>
            </div>
        `;
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
                    <button onclick="showDetails('${anime.id}')" 
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

// MyAnimeList Data Fetching
async function fetchMalData() {
    try {
        // Fetch Seasonal
        const seasonalRes = await fetch("https://api.jikan.moe/v4/seasons/now?limit=10");
        const seasonalData = await seasonalRes.json();

        if (seasonalData.data && seasonalData.data.length > 0) {
            const firstAnime = seasonalData.data[0];
            if (firstAnime.season && firstAnime.year) {
                const seasonStr = firstAnime.season.charAt(0).toUpperCase() + firstAnime.season.slice(1);
                document.getElementById('seasonalTitle').innerHTML = `<i class="fas fa-leaf" style="color: #10b981; margin-right: 8px;"></i> Seasonal Anime (${seasonStr} ${firstAnime.year})`;
            }
        }

        renderMalAnime(seasonalData.data, 'seasonalGrid');

        // Fetch Top
        // Add a slight delay to avoid rate limit
        setTimeout(async () => {
            const topRes = await fetch("https://api.jikan.moe/v4/top/anime?limit=10");
            const topData = await topRes.json();
            renderMalAnime(topData.data, 'topGrid');
        }, 1000);

    } catch (error) {
        console.error("Error fetching MAL data:", error);
    }
}

function renderMalAnime(list, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    list.forEach((anime, index) => {
        const title = anime.title_english || anime.title;
        const card = document.createElement('div');
        card.className = 'anime-card';
        card.style.animationDelay = `${index * 0.05}s`;
        card.innerHTML = `
            <img src="${anime.images.webp.large_image_url}" alt="${title}" class="card-thumb">
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
    searchOverlay.style.display = 'flex';
    setTimeout(() => searchInput.focus(), 100);
}

if (searchToggle) searchToggle.onclick = openSearch;
if (mobileSearchBtn) mobileSearchBtn.onclick = openSearch;
if (closeSearch) closeSearch.onclick = () => searchOverlay.style.display = 'none';

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
    } catch (e) { console.error(e); }
    showLoader(false);
}

function renderFavorites() {
    const favs = JSON.parse(localStorage.getItem('favorites') || '[]');
    renderAnime(favs, favoritesGrid);
}

// Initial load
handleRoute();
fetchOngoing();
fetchMalData();

// Interactive Glow Background
const glow = document.getElementById('glow');
if (glow) {
    document.addEventListener('mousemove', (e) => {
        requestAnimationFrame(() => {
            glow.style.left = e.clientX + 'px';
            glow.style.top = e.clientY + 'px';
        });
    });
}
