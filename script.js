const API_BASE = "/api";
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const sectionTitle = document.getElementById('sectionTitle');
const animeGrid = document.getElementById('animeGrid');
const homeView = document.getElementById('homeView');
const detailView = document.getElementById('detailView');
const detailContainer = document.getElementById('detailContainer');
const backBtn = document.getElementById('backBtn');
const loader = document.getElementById('loader');
const scheduleBtn = document.getElementById('scheduleBtn');
const scheduleSection = document.getElementById('scheduleSection');
const scheduleContainer = document.getElementById('scheduleContainer');

async function fetchOngoing() {
    showLoader(true);
    try {
        const response = await fetch(`${API_BASE}/ongoing`);
        const data = await response.json();
        renderAnime(data);
        sectionTitle.innerText = "Latest Releases";
    } catch (error) {
        console.error("Error fetching ongoing:", error);
    }
    showLoader(false);
}

async function searchAnime(query) {
    if (!query) {
        document.getElementById('mal-sections').style.display = 'block';
        fetchOngoing();
        return;
    }
    showLoader(true);
    try {
        const response = await fetch(`${API_BASE}/search?q=${query}`);
        const data = await response.json();
        renderAnime(data);
        sectionTitle.innerText = `Search Results for "${query}"`;
        document.getElementById('mal-sections').style.display = 'none';
    } catch (error) {
        console.error("Error searching anime:", error);
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
            // Switch views
            homeView.style.display = 'none';
            detailView.style.display = 'block';
            window.scrollTo(0, 0); // Scroll to top
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

backBtn.onclick = () => {
    detailView.style.display = 'none';
    homeView.style.display = 'block';
    // Clear player if needed
    if (detailContainer.innerHTML.includes('<iframe')) {
        showDetails(currentAnimeId); // Re-render details to kill iframe
    }
};

function renderAnime(list) {
    animeGrid.innerHTML = '';
    if (list.length === 0) {
        animeGrid.innerHTML = '<p>No anime found.</p>';
        return;
    }

    list.forEach((anime, index) => {
        const card = document.createElement('div');
        card.className = 'anime-card';
        card.style.animationDelay = `${index * 0.05}s`;
        card.innerHTML = `
            <img src="${anime.thumb}" alt="${anime.title}" class="card-thumb" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'">
            <div class="card-info">
                <span class="ep-tag">${anime.episode || anime.status || ''}</span>
                <h3>${anime.title}</h3>
            </div>
        `;
        card.onclick = () => showDetails(anime.id);
        animeGrid.appendChild(card);
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

// Favorites Logic
function getFavorites() {
    return JSON.parse(localStorage.getItem('shonen_favs') || '[]');
}

function isFavorite(id) {
    return getFavorites().some(fav => fav.id === id);
}

function toggleFavorite(anime) {
    let favs = getFavorites();
    const index = favs.findIndex(f => f.id === anime.id);
    
    if (index > -1) {
        favs.splice(index, 1);
    } else {
        favs.unshift(anime);
    }
    
    localStorage.setItem('shonen_favs', JSON.stringify(favs));
    
    // Update button UI if in details
    const favBtn = document.getElementById('favBtn');
    if (favBtn) {
        const isNowFav = isFavorite(anime.id);
        favBtn.style.color = isNowFav ? '#f43f5e' : '#fff';
        favBtn.querySelector('i').className = isNowFav ? 'fas fa-heart' : 'far fa-heart';
    }
    
    renderFavorites();
}

function renderFavorites() {
    const favs = getFavorites();
    const section = document.getElementById('favoritesSection');
    const grid = document.getElementById('favoritesGrid');
    
    if (favs.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    grid.innerHTML = '';
    
    favs.forEach((anime, index) => {
        const card = document.createElement('div');
        card.className = 'anime-card';
        card.style.animationDelay = `${index * 0.05}s`;
        card.innerHTML = `
            <img src="${anime.thumb}" alt="${anime.title}" class="card-thumb">
            <div class="card-info">
                <h3>${anime.title}</h3>
            </div>
        `;
        card.onclick = () => showDetails(anime.id);
        grid.appendChild(card);
    });
}

// Active stream state
let activeQualityIdx = 0;
let activeServerIdx = 0;
let currentStreams = [];

async function playEpisode(epId) {
    showLoader(true);
    try {
        const response = await fetch(`${API_BASE}/stream/${epId}`);
        if (!response.ok) throw new Error("Stream not found");
        const data = await response.json();

        // Support both old {stream_url} and new {streams} API response
        if (data.stream_url && !data.streams) {
            data.streams = [{ quality: "360p", mirrors: [{ name: "Server 1", url: data.stream_url }] }];
        }

        currentStreams = data.streams || [];
        activeQualityIdx = 0;
        activeServerIdx = 0;

        const currentIndex = currentEpisodes.findIndex(ep => ep.id === epId);
        const nextEpisode = currentEpisodes[currentIndex - 1];

        renderPlayer(data, nextEpisode);
        window.scrollTo(0, 0);
    } catch (error) {
        console.error("Error fetching stream:", error);
        alert("Error loading video stream.");
    } finally {
        showLoader(false);
    }
}

function renderPlayer(data, nextEpisode) {
    const streams = currentStreams;

    // Build quality tabs HTML
    const qualityTabsHtml = streams.length > 1 ? `
        <div id="qualityTabs" style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
            ${streams.map((s, i) => `
                <button
                    id="qtab-${i}"
                    onclick="switchQuality(${i})"
                    style="padding: 6px 14px; border-radius: 8px; border: 1px solid ${i === activeQualityIdx ? 'var(--primary)' : 'var(--border)'}; 
                           background: ${i === activeQualityIdx ? 'var(--primary)' : 'var(--glass)'}; 
                           color: white; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.25s;">
                    ${s.quality}
                </button>
            `).join('')}
        </div>
    ` : '';

    // Build server selector HTML for the active quality
    const activeMirrors = streams[activeQualityIdx]?.mirrors || [];
    const serverSelectorHtml = activeMirrors.length > 1 ? `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
            <span style="font-size: 0.82rem; color: var(--text-dim); white-space: nowrap;"><i class="fas fa-server" style="margin-right: 5px;"></i>Server:</span>
            <div id="serverBtns" style="display: flex; gap: 6px; flex-wrap: wrap;">
                ${activeMirrors.map((m, i) => `
                    <button
                        id="srv-${i}"
                        onclick="switchServer(${i})"
                        style="padding: 5px 12px; border-radius: 6px; border: 1px solid ${i === activeServerIdx ? 'var(--primary)' : 'var(--border)'}; 
                               background: ${i === activeServerIdx ? 'rgba(99,102,241,0.25)' : 'var(--glass)'}; 
                               color: white; font-size: 0.8rem; cursor: pointer; transition: all 0.2s;">
                        ${m.name}
                    </button>
                `).join('')}
            </div>
        </div>
    ` : '';

    // Active iframe URL
    const activeUrl = activeMirrors[activeServerIdx]?.url || '';

    // Downloads section
    const downloadsHtml = data.downloads && data.downloads.length > 0
        ? data.downloads.map(dl => `
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <span style="font-weight: 600; color: var(--primary); font-size: 0.9rem;">${dl.resolution}</span>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    ${dl.links.map(link => `
                        <a href="${link.url}" target="_blank" rel="noopener"
                           style="background: rgba(255,255,255,0.08); color: #fff; text-decoration: none; padding: 6px 14px; border-radius: 8px; font-size: 0.83rem; border: 1px solid var(--border); transition: all 0.25s; display: inline-flex; align-items: center; gap: 6px;"
                           onmouseover="this.style.background='var(--primary)';this.style.borderColor='var(--primary)'"
                           onmouseout="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='var(--border)'">
                            <i class="fas fa-cloud-download-alt"></i>${link.name}
                        </a>
                    `).join('')}
                </div>
            </div>
        `).join('')
        : '<p style="color: var(--text-dim); font-size: 0.9rem;">No download links available.</p>';

    const playerHtml = `
        ${qualityTabsHtml}
        ${serverSelectorHtml}

        <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 12px; margin-bottom: 20px; background: #000; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <iframe id="streamFrame" src="${activeUrl}"
                style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border:0;"
                allowfullscreen webkitallowfullscreen mozallowfullscreen
                sandbox="allow-scripts allow-pointer-lock allow-forms allow-same-origin allow-presentation">
            </iframe>
        </div>

        <div style="display: flex; gap: 10px; margin-bottom: 24px; flex-wrap: wrap;">
            <button onclick="showDetails(currentAnimeId)" class="glass"
                style="color: white; border: 1px solid var(--border); padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 600; display: inline-flex; align-items: center; gap: 8px;">
                <i class="fas fa-list"></i> Episodes
            </button>
            ${nextEpisode ? `
                <button onclick="playEpisode('${nextEpisode.id}')"
                    style="background: var(--primary); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; flex-grow: 1; justify-content: center;">
                    Next: ${nextEpisode.title} <i class="fas fa-chevron-right"></i>
                </button>
            ` : ''}
        </div>

        <div class="downloads-section" style="background: var(--glass); padding: 20px; border-radius: 16px; border: 1px solid var(--glass-border);">
            <h3 style="margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-download" style="color: #10b981;"></i> Download Episode
            </h3>
            <div style="display: flex; flex-direction: column; gap: 14px;">
                ${downloadsHtml}
            </div>
        </div>
    `;

    detailContainer.innerHTML = playerHtml;
}

function switchQuality(idx) {
    if (idx === activeQualityIdx) return;
    activeQualityIdx = idx;
    activeServerIdx = 0;

    // Update quality tab styles
    currentStreams.forEach((_, i) => {
        const btn = document.getElementById(`qtab-${i}`);
        if (!btn) return;
        const active = i === idx;
        btn.style.background = active ? 'var(--primary)' : 'var(--glass)';
        btn.style.borderColor = active ? 'var(--primary)' : 'var(--border)';
    });

    // Rebuild server buttons for new quality
    const mirrors = currentStreams[idx]?.mirrors || [];
    const serverBtns = document.getElementById('serverBtns');
    if (serverBtns) {
        serverBtns.innerHTML = mirrors.map((m, i) => `
            <button id="srv-${i}" onclick="switchServer(${i})"
                style="padding: 5px 12px; border-radius: 6px; border: 1px solid ${i === 0 ? 'var(--primary)' : 'var(--border)'};
                       background: ${i === 0 ? 'rgba(99,102,241,0.25)' : 'var(--glass)'};
                       color: white; font-size: 0.8rem; cursor: pointer; transition: all 0.2s;">
                ${m.name}
            </button>
        `).join('');
    }

    // Switch iframe
    const frame = document.getElementById('streamFrame');
    if (frame && mirrors[0]) frame.src = mirrors[0].url;
}

function switchServer(idx) {
    if (idx === activeServerIdx) return;
    activeServerIdx = idx;

    // Update server button styles
    const mirrors = currentStreams[activeQualityIdx]?.mirrors || [];
    mirrors.forEach((_, i) => {
        const btn = document.getElementById(`srv-${i}`);
        if (!btn) return;
        const active = i === idx;
        btn.style.background = active ? 'rgba(99,102,241,0.25)' : 'var(--glass)';
        btn.style.borderColor = active ? 'var(--primary)' : 'var(--border)';
    });

    // Switch iframe
    const frame = document.getElementById('streamFrame');
    const url = mirrors[idx]?.url;
    if (frame && url) frame.src = url;
}

function showLoader(show) {
    loader.style.display = show ? 'block' : 'none';
    if (show) {
        // If we are on home view, show skeletons
        if (homeView.style.display !== 'none') {
            showSkeletons();
        }
    }
}

function showSkeletons() {
    const skeletonHtml = Array(12).fill(0).map(() => `
        <div class="anime-card" style="pointer-events: none; border-color: transparent;">
            <div class="skeleton-card"></div>
            <div class="skeleton-text"></div>
            <div class="skeleton-text" style="width: 60%;"></div>
        </div>
    `).join('');
    animeGrid.innerHTML = skeletonHtml;
}

searchBtn.onclick = () => searchAnime(searchInput.value);
searchInput.onkeypress = (e) => {
    if (e.key === 'Enter') searchAnime(searchInput.value);
};

// Schedule Logic
scheduleBtn.onclick = async () => {
    if (scheduleSection.style.display === 'none') {
        await fetchSchedule();
        scheduleSection.style.display = 'block';
        scheduleSection.scrollIntoView({ behavior: 'smooth' });
    } else {
        scheduleSection.style.display = 'none';
    }
};

async function fetchSchedule() {
    if (scheduleContainer.innerHTML.trim() !== '') return; // Already loaded
    
    showLoader(true);
    try {
        const response = await fetch(`${API_BASE}/schedule`);
        const data = await response.json();
        renderSchedule(data);
    } catch (error) {
        console.error("Error fetching schedule:", error);
    } finally {
        showLoader(false);
    }
}

function renderSchedule(data) {
    scheduleContainer.innerHTML = '';
    data.forEach(item => {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'glass';
        dayDiv.style.padding = '20px';
        dayDiv.style.borderRadius = '16px';
        dayDiv.style.border = '1px solid var(--glass-border)';
        
        dayDiv.innerHTML = `
            <h3 style="color: var(--primary); margin-bottom: 12px; font-size: 1.1rem; border-bottom: 1px solid var(--border); padding-bottom: 8px;">${item.day}</h3>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                ${item.anime.map(anime => `
                    <button onclick="showDetails('${anime.id}')" 
                            style="background: rgba(255,255,255,0.05); color: #fff; border: 1px solid var(--border); padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; transition: all 0.3s;"
                            onmouseover="this.style.background='var(--primary)';this.style.borderColor='var(--primary)'"
                            onmouseout="this.style.background='rgba(255,255,255,0.05)';this.style.borderColor='var(--border)'">
                        ${anime.title}
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
        card.onclick = () => searchAndShowDetails(title);
        container.appendChild(card);
    });
}

async function searchAndShowDetails(title) {
    showLoader(true);
    try {
        const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(title)}`);
        const data = await response.json();
        if (data && data.length > 0) {
            // Found it on Otakudesu!
            showDetails(data[0].id);
        } else {
            alert(`Cari manual di search bar yaa`);
        }
    } catch (error) {
        console.error("Error searching MAL anime:", error);
        alert("Error connecting to server.");
    } finally {
        showLoader(false);
    }
}

// Initial load
fetchOngoing();
fetchMalData();
renderFavorites();

// Interactive Glow Background
const glow = document.getElementById('glow');
if (glow) {
    document.addEventListener('mousemove', (e) => {
        // Use requestAnimationFrame for smoother performance
        requestAnimationFrame(() => {
            glow.style.left = e.clientX + 'px';
            glow.style.top = e.clientY + 'px';
        });
    });
}
