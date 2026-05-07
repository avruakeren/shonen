const API_BASE = "/api";
const loader = document.getElementById('loader');
const detailContainer = document.getElementById('detailContainer');

let currentAnimeId = null;

function showLoader(show) {
    if (loader) loader.style.display = show ? 'flex' : 'none';
}

async function initWatch() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    
    if (!id) {
        window.location.href = 'index.html';
        return;
    }

    currentAnimeId = id;
    showLoader(true);
    
    try {
        const response = await fetch(`${API_BASE}/details/${id}`);
        if (!response.ok) throw new Error("Anime not found");
        const data = await response.json();
        
        if (data && !data.error) {
            renderDetails(data);
            // Autoplay first episode if needed or just wait for click
        } else {
            alert("Could not load anime details.");
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error("Error fetching details:", error);
        alert("Error connecting to server.");
    } finally {
        showLoader(false);
    }
}

function renderDetails(anime) {
    const isFav = isFavorite(currentAnimeId);
    detailContainer.innerHTML = `
        <div class="watch-container">
            <div id="playerSection"></div>
            
            <div class="detail-grid">
                <!-- Left Column: Poster & Stats -->
                <div class="detail-left glass-card">
                    <img src="${anime.thumb}" alt="${anime.title}" style="width: 100%; border-radius: 16px; margin-bottom: 20px; box-shadow: 0 10px 20px rgba(0,0,0,0.3);">
                    <div class="stats-grid" style="display: grid; gap: 12px;">
                        ${Object.entries(anime.info).map(([k, v]) => `
                            <div class="stat-item">
                                <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">${k.replace(/_/g, ' ')}</span>
                                <p style="font-size: 0.9rem; font-weight: 500;">${v}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Middle Column: Title & Synopsis -->
                <div class="detail-main glass-card">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 15px; margin-bottom: 15px;">
                        <h2 style="font-size: 2.5rem; line-height: 1.1; font-weight: 800;">${anime.title}</h2>
                        <button onclick='toggleFavorite(${JSON.stringify({ id: currentAnimeId, title: anime.title, thumb: anime.thumb }).replace(/'/g, "&apos;")})' 
                                id="favBtn" class="glass" 
                                style="width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 15px; border: 1px solid var(--border); color: ${isFav ? '#f43f5e' : '#fff'}; cursor: pointer; transition: all 0.3s;">
                            <i class="${isFav ? 'fas' : 'far'} fa-heart" style="font-size: 1.2rem;"></i>
                        </button>
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-bottom: 25px;">
                        <span class="info-badge">${anime.info.status || 'Ongoing'}</span>
                        <span class="info-badge">${anime.info.type || 'TV'}</span>
                        <span class="info-badge">${anime.info.score || 'N/A'}</span>
                    </div>

                    <h3 style="margin-bottom: 12px; font-size: 1.1rem; color: var(--primary);">Synopsis</h3>
                    <p style="color: #cbd5e1; line-height: 1.8; font-size: 1.05rem;">${anime.synopsis}</p>
                </div>

                <!-- Right Column: Episode List -->
                <div class="detail-right glass-card">
                    <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 12px; font-size: 1.2rem; font-weight: 700;">
                        <i class="fas fa-list-ul" style="color: var(--primary);"></i> Episode List
                    </h3>
                    <div style="max-height: 500px; overflow-y: auto; padding-right: 8px;">
                        ${anime.episodes.map(ep => `
                            <div onclick="playEpisode('${ep.id}', this)" class="ep-item">
                                <span style="display: flex; align-items: center; gap: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                    <i class="fas fa-play" style="font-size: 0.8rem; color: var(--primary);"></i> 
                                    <span style="font-weight: 500;">${ep.title}</span>
                                </span>
                                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">${ep.date}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function playEpisode(id, el) {
    // UI Feedback for active episode
    document.querySelectorAll('.ep-item').forEach(item => item.classList.remove('active'));
    if (el) el.classList.add('active');

    const playerSection = document.getElementById('playerSection');
    if (!playerSection) return;

    playerSection.innerHTML = `
        <div class="player-wrapper">
            <div class="video-container" style="display: flex; align-items: center; justify-content: center; background: #000;">
                <div class="loader" style="display: block;"></div>
            </div>
        </div>
    `;
    
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
        const response = await fetch(`${API_BASE}/stream/${id}`);
        const data = await response.json();

        if (data && data.streams && data.streams.length > 0) {
            renderPlayer(data, playerSection);
        } else {
            playerSection.innerHTML = `
                <div class="player-wrapper" style="padding: 100px 20px;">
                    <div style="text-align: center;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #f43f5e; margin-bottom: 20px;"></i>
                        <h3 style="color: #fff; margin-bottom: 10px;">Stream Unavailable</h3>
                        <p style="color: #94a3b8;">This episode might be recently released or the source is down.</p>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error("Error playing episode:", error);
    }
}

function renderPlayer(data, container) {
    const defaultStream = data.streams[0];
    const defaultMirror = defaultStream.mirrors[0];

    container.innerHTML = `
        <div class="player-wrapper">
            <div class="video-container" id="mainVideoContainer">
                <iframe src="${defaultMirror.url}" allowfullscreen scrolling="no" allow="autoplay; encrypted-media"></iframe>
            </div>
            
            <div class="server-selector glass-card" style="margin: 20px; border-radius: 16px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center;">
                <div style="width: 100%; margin-bottom: 5px; font-size: 0.8rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;">
                    <i class="fas fa-satellite-dish" style="color: var(--primary); margin-right: 8px;"></i> Sources & Mirrors
                </div>
                ${data.streams.map((stream, sIdx) => 
                    stream.mirrors.map((mirror, mIdx) => `
                        <button class="server-btn ${sIdx === 0 && mIdx === 0 ? 'active' : ''}" 
                                onclick="changeServer(this, '${mirror.url}')"
                                style="display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 12px;">
                            <span class="quality-badge">${stream.quality}</span>
                            <span>${mirror.name}</span>
                        </button>
                    `).join('')
                ).join('')}
            </div>
        </div>
    `;
}

function changeServer(btn, url) {
    document.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const iframe = document.querySelector('#mainVideoContainer iframe');
    if (iframe) iframe.src = url;
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
    
    const favBtn = document.getElementById('favBtn');
    if (favBtn) {
        const isFav = isFavorite(anime.id);
        favBtn.style.color = isFav ? '#f43f5e' : '#fff';
        favBtn.innerHTML = `<i class="${isFav ? 'fas' : 'far'} fa-heart"></i>`;
    }
}

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

// Initialize
initWatch();
