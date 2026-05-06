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
        <div id="playerSection"></div>
        <div class="detail-layout">
            <div class="detail-left">
                <img src="${anime.thumb}" alt="${anime.title}" class="detail-thumb">
                <div style="margin-top: 20px;">
                    ${Object.entries(anime.info).map(([k, v]) => `<p style="margin-bottom: 8px; font-size: 0.9rem;"><strong style="color: var(--primary); text-transform: uppercase;">${k.replace(/_/g, ' ')}:</strong> ${v}</p>`).join('')}
                </div>
            </div>
            <div class="detail-right">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 15px;">
                    <h2 style="font-size: 2.2rem; line-height: 1.2;">${anime.title}</h2>
                    <button onclick='toggleFavorite(${JSON.stringify({ id: currentAnimeId, title: anime.title, thumb: anime.thumb }).replace(/'/g, "&apos;")})' 
                            id="favBtn" class="glass" 
                            style="padding: 10px 15px; border-radius: 12px; border: 1px solid var(--border); color: ${isFav ? '#f43f5e' : '#fff'}; cursor: pointer; transition: all 0.3s; flex-shrink: 0;">
                        <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
                    </button>
                </div>
                <div class="gradient-text" style="font-weight: 600; margin-top: 10px; font-size: 1rem;">
                    ${anime.info.status || 'Ongoing'} • ${anime.info.type || 'TV'}
                </div>
                <p style="margin: 25px 0; color: #94a3b8; line-height: 1.8; font-size: 1.05rem; border-left: 4px solid var(--primary); padding-left: 20px;">${anime.synopsis}</p>
                
                <div class="episodes-list" style="margin-top: 40px;">
                    <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 12px; font-size: 1.4rem;">
                        <i class="fas fa-list-ul" style="color: var(--primary);"></i> Daftar Episode
                    </h3>
                    <div style="max-height: 600px; overflow-y: auto; padding-right: 10px; border-radius: 12px;">
                        ${anime.episodes.map(ep => `
                            <div onclick="playEpisode('${ep.id}')" class="ep-item" style="cursor: pointer;">
                                <span><i class="fas fa-play-circle" style="color: var(--primary); margin-right: 12px; font-size: 1.2rem;"></i> ${ep.title}</span>
                                <span style="color: #6366f1; font-size: 0.85rem; font-weight: 600;">${ep.date}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function playEpisode(id) {
    const playerSection = document.getElementById('playerSection');
    if (!playerSection) return;

    playerSection.innerHTML = `
        <div class="video-container" style="display: flex; align-items: center; justify-content: center;">
            <div class="loader" style="display: block;"></div>
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
                <div class="video-container" style="display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 15px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2.5rem; color: #f43f5e;"></i>
                    <p style="color: #f43f5e; font-weight: 600;">Stream tidak tersedia untuk episode ini.</p>
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
        <div class="video-container" id="mainVideoContainer">
            <iframe src="${defaultMirror.url}" allowfullscreen scrolling="no" allow="autoplay; encrypted-media"></iframe>
        </div>
        
        <div class="server-selector">
            <div style="width: 100%; margin-bottom: 12px; font-size: 0.9rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-server" style="color: var(--primary);"></i> Pilih Server & Kualitas
            </div>
            ${data.streams.map((stream, sIdx) => 
                stream.mirrors.map((mirror, mIdx) => `
                    <button class="server-btn ${sIdx === 0 && mIdx === 0 ? 'active' : ''}" 
                            onclick="changeServer(this, '${mirror.url}')">
                        <span class="quality-badge">${stream.quality}</span> ${mirror.name}
                    </button>
                `).join('')
            ).join('')}
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
