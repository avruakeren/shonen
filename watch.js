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
            detailContainer.innerHTML = `
                <div class="glass-card" style="margin: 50px auto; max-width: 600px; text-align: center; padding: 40px;">
                    <i class="fas fa-search" style="font-size: 3rem; color: var(--primary); margin-bottom: 20px;"></i>
                    <h3 style="color: #fff; margin-bottom: 10px;">Anime Tidak Ditemukan</h3>
                    <p style="color: #94a3b8; margin-bottom: 25px;">Data untuk anime ini tidak tersedia atau link sudah kadaluarsa.</p>
                    <button onclick="window.location.href='index.html'" class="glass" style="padding: 10px 20px; border-radius: 12px; color: white; cursor: pointer;">Kembali ke Beranda</button>
                </div>
            `;
        }
    } catch (error) {
        console.error("Error fetching details:", error);
        detailContainer.innerHTML = `
            <div class="glass-card" style="margin: 50px auto; max-width: 600px; text-align: center; padding: 40px;">
                <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #f43f5e; margin-bottom: 20px;"></i>
                <h3 style="color: #fff; margin-bottom: 10px;">Gagal Menghubungkan ke Server</h3>
                <p style="color: #94a3b8; margin-bottom: 25px;">Pastikan koneksi internet stabil atau coba ganti ke domain lain di scraper.py.</p>
                <button onclick="window.location.reload()" class="glass" style="padding: 10px 20px; border-radius: 12px; color: white; cursor: pointer;">Coba Lagi</button>
                <button onclick="window.location.href='index.html'" class="glass" style="padding: 10px 20px; border-radius: 12px; color: #94a3b8; cursor: pointer; margin-left: 10px;">Kembali</button>
            </div>
        `;
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
                    <div class="poster-wrapper">
                        <img src="${anime.thumb}" alt="${anime.title}">
                    </div>
                    <div class="stats-grid">
                        ${Object.entries(anime.info).map(([k, v], idx) => `
                            <div class="stat-item" style="animation-delay: ${idx * 0.05}s">
                                <span class="stat-label">${k.replace(/_/g, ' ')}</span>
                                <p class="stat-value" title="${v}">${v}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Middle Column: Title & Synopsis -->
                <div class="detail-main glass-card">
                    <div class="detail-header">
                        <h2 class="anime-title">${anime.title}</h2>
                        <button onclick='toggleFavorite(${JSON.stringify({ id: currentAnimeId, title: anime.title, thumb: anime.thumb }).replace(/'/g, "&apos;")})' 
                                id="favBtn" class="glass fav-btn ${isFav ? 'active' : ''}">
                            <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
                        </button>
                    </div>
                    
                    <div class="badge-container">
                        <span class="info-badge">${anime.info.status || 'Ongoing'}</span>
                        <span class="info-badge">${anime.info.type || 'TV'}</span>
                        <span class="info-badge">${anime.info.score || 'N/A'}</span>
                    </div>

                    <h3 class="section-subtitle">Synopsis</h3>
                    <p class="synopsis-text">${anime.synopsis}</p>
                </div>

                <!-- Right Column: Episode List -->
                <div class="detail-right glass-card">
                    <h3 class="episode-list-title">
                        <i class="fas fa-list-ul"></i> Episode List
                    </h3>
                    <div class="episode-list">
                        ${anime.episodes.map(ep => `
                            <div onclick="playEpisode('${ep.id}', this)" class="ep-item">
                                <span class="ep-title-wrapper">
                                    <i class="fas fa-play"></i> 
                                    <span class="ep-title-text">${ep.title}</span>
                                </span>
                                <span class="ep-date">${ep.date}</span>
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
            
            <div class="server-selector glass-card">
                <div class="server-header">
                    <i class="fas fa-satellite-dish"></i> Sources & Mirrors
                </div>
                <div class="server-list">
                    ${data.streams.map((stream, sIdx) => 
                        stream.mirrors.map((mirror, mIdx) => `
                            <button class="server-btn ${sIdx === 0 && mIdx === 0 ? 'active' : ''}" 
                                    onclick="changeServer(this, '${mirror.url}')">
                                <span class="quality-badge">${stream.quality}</span>
                                <span>${mirror.name}</span>
                            </button>
                        `).join('')
                    ).join('')}
                </div>
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
