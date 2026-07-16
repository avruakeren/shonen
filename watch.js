const API_BASE = "/api";
const loader = document.getElementById('loader');
const playerSkeleton = document.getElementById('playerSkeleton');
const mainVideoContainer = document.getElementById('mainVideoContainer');
const serverSelector = document.getElementById('serverSelector');
const posterContainer = document.getElementById('posterContainer');
const detailMain = document.getElementById('detailMain');
const episodeGrid = document.getElementById('episodeGrid');
const seasonTabs = document.getElementById('seasonTabs');
const downloadSection = document.getElementById('downloadSection');
const recommendedGrid = document.getElementById('recommendedGrid');
const nowPlayingIndicator = document.getElementById('nowPlayingIndicator');

let currentAnimeId = null;
let currentEpisodes = [];
let currentEpisodeId = null;

function showLoader(show) {
    if (loader) loader.style.display = show ? 'flex' : 'none';
}

function showPlayerSkeleton() {
    if (playerSkeleton) playerSkeleton.style.display = 'block';
    if (mainVideoContainer) mainVideoContainer.style.display = 'none';
}

function hidePlayerSkeleton() {
    if (playerSkeleton) playerSkeleton.style.display = 'none';
    if (mainVideoContainer) mainVideoContainer.style.display = 'block';
}

function slugToTitle(slug) {
    let clean = slug.replace(/-/g, ' ');
    clean = clean.replace(/episode\s*\d+/i, '');
    clean = clean.replace(/sub\s*indo/i, '');
    clean = clean.replace(/eps\s*\d+/i, '');
    return clean.trim().replace(/\b\w/g, c => c.toUpperCase());
}

function getEpisodeProgress(animeId) {
    try {
        const data = JSON.parse(localStorage.getItem('shonen_progress') || '{}');
        return data[animeId] || null;
    } catch { return null; }
}

function setEpisodeProgress(animeId, episodeId) {
    try {
        const data = JSON.parse(localStorage.getItem('shonen_progress') || '{}');
        data[animeId] = episodeId;
        localStorage.setItem('shonen_progress', JSON.stringify(data));
    } catch {}
}

async function initWatch() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const ep = params.get('ep');

    if (!id) {
        window.location.href = 'index.html';
        return;
    }

    currentAnimeId = id;
    showLoader(true);
    showPlayerSkeleton();

    try {
        const response = await fetch(`${API_BASE}/details/${id}`);
        if (!response.ok) throw new Error("Anime not found");
        const data = await response.json();

        if (data && !data.error) {
            renderDetails(data);
            const targetEp = ep
                ? data.episodes.find(e => e.id === ep || e.id.endsWith(ep))
                : null;
            if (targetEp) {
                playEpisode(targetEp.id);
            } else {
                const progress = getEpisodeProgress(id);
                const resumeEp = progress
                    ? data.episodes.find(e => e.id === progress || e.id.endsWith(progress))
                    : null;
                if (resumeEp) {
                    playEpisode(resumeEp.id);
                } else if (data.episodes.length > 0) {
                    const last = data.episodes[data.episodes.length - 1];
                    playEpisode(last.id);
                }
            }
        } else {
            throw new Error(data.error || "Anime not found");
        }
    } catch (error) {
        console.error("Backend failed, trying Jikan fallback:", error);
        try {
            const query = slugToTitle(id);
            const jikanRes = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`);
            const jikanData = await jikanRes.json();
            if (jikanData?.data?.length > 0) {
                const a = jikanData.data[0];
                renderFallbackDetails({
                    title: a.title_english || a.title,
                    thumb: a.images?.webp?.large_image_url || a.images?.jpg?.large_image_url || '',
                    synopsis: a.synopsis || 'Sinopsis tidak tersedia.',
                    info: {
                        status: a.status?.replace(/_/g, ' ') || 'Unknown',
                        type: a.type || 'TV',
                        score: a.score ? String(a.score) : 'N/A',
                        episodes: a.episodes ? String(a.episodes) : '?',
                        genres: a.genres ? a.genres.map(g => g.name).join(', ') : '',
                    },
                    episodes: []
                });
            } else {
                throw new Error("Jikan fallback also failed");
            }
        } catch (fallbackError) {
            console.error("Fallback failed:", fallbackError);
            document.getElementById('watchContent').innerHTML = `
                <div class="error-state glass-card">
                    <i class="fas fa-exclamation-circle"></i>
                    <h3>Failed to Load</h3>
                    <p>Can't connect to the server. Please check your connection and try again.</p>
                    <div class="error-actions">
                        <button onclick="window.location.reload()" class="hero-btn">
                            <i class="fas fa-redo"></i> Retry
                        </button>
                        <button onclick="window.location.href='index.html'" class="glass-btn">
                            <i class="fas fa-home"></i> Home
                        </button>
                    </div>
                </div>
            `;
        }
    } finally {
        showLoader(false);
    }
}

function renderDetails(anime) {
    currentEpisodes = anime.episodes || [];
    renderAnimeInfo(anime);
    renderEpisodeDropdown(anime.episodes);
    if (anime.downloads) renderDownloads(anime.downloads);
    renderRecommended(currentAnimeId);
}

function renderFallbackDetails(anime) {
    currentEpisodes = [];
    renderAnimeInfo(anime);
    renderEpisodeDropdown([]);
    renderRecommended(currentAnimeId);
}

function renderAnimeInfo(anime) {
    const isFav = isFavorite(currentAnimeId);
    const info = anime.info || {};
    const epCount = (anime.episodes || []).length;

    const posterHtml = `
        <div class="poster-frame">
            <div class="poster-inner">
                <img src="${anime.thumb}" alt="${anime.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/280x400?text=No+Image'">
                ${epCount ? `<span class="poster-ep-count">${epCount} EP</span>` : ''}
            </div>
        </div>
    `;
    posterContainer.innerHTML = posterHtml;

    const badges = [];
    if (info.score) badges.push(`<span class="info-badge score"><i class="fas fa-star"></i> ${info.score}</span>`);
    if (info.status) badges.push(`<span class="info-badge">${info.status}</span>`);
    if (info.type) badges.push(`<span class="info-badge type">${info.type}</span>`);
    if (epCount) badges.push(`<span class="info-badge eps">${epCount} EP</span>`);
    if (info.released) badges.push(`<span class="info-badge year">${info.released}</span>`);

    const genreHtml = info.genres ? `
        <div class="genre-pills">
            ${info.genres.split(',').map(g => `<span class="genre-pill">${g.trim()}</span>`).join('')}
        </div>
    ` : '';

    const metaOrder = [
        ['studio', 'Studio'],
        ['season', 'Season'],
        ['duration', 'Duration'],
        ['released_on', 'Released'],
        ['director', 'Director'],
        ['censor', 'Censor'],
        ['type', 'Type'],
        ['status', 'Status'],
    ];
    const metaHtml = metaOrder.filter(([k]) => info[k]).map(([k, label]) => `
        <div class="meta-item">
            <span class="meta-label">${label}</span>
            <span class="meta-value">${info[k]}</span>
        </div>
    `).join('');

    detailMain.innerHTML = `
        <div class="detail-header">
            <div>
                <h2 class="anime-title">${anime.title}</h2>
                <div class="badge-container">${badges.join('')}</div>
            </div>
            <button onclick='toggleFavorite(${JSON.stringify({ id: currentAnimeId, title: anime.title, thumb: anime.thumb }).replace(/'/g, "&apos;")})'
                    id="favBtn" class="glass fav-btn ${isFav ? 'active' : ''}">
                <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
            </button>
        </div>

        ${genreHtml}

        <p class="synopsis-text">${anime.synopsis || 'No synopsis available.'}</p>

        ${metaHtml ? `<div class="meta-grid">${metaHtml}</div>` : ''}
    `;
}

function renderEpisodeDropdown(episodes) {
    if (!episodes || episodes.length === 0) {
        episodeGrid.innerHTML = `
            <div class="ep-empty-state">
                <i class="fas fa-film"></i>
                <p>No episodes available yet.</p>
            </div>
        `;
        return;
    }

    const select = document.createElement('select');
    select.className = 'episode-select';
    select.innerHTML = episodes.map((ep, i) => {
        const epMatch = ep.title.match(/episode\s*(\d+)/i);
        const epNum = epMatch ? epMatch[1] : (i + 1);
        const isActive = ep.id === currentEpisodeId;
        const isWatched = getEpisodeProgress(currentAnimeId) === ep.id;
        const label = `EP ${epNum}${ep.title.replace(/episode\s*\d+/i, '').trim() ? ' - ' + ep.title.replace(/episode\s*\d+/i, '').trim() : ''}`;
        return `<option value="${ep.id}" ${isActive ? 'selected' : ''}>${isWatched ? '✓ ' : ''}${label}</option>`;
    }).join('');

    select.addEventListener('change', function () {
        playEpisode(this.value);
    });

    episodeGrid.innerHTML = '';
    episodeGrid.appendChild(select);
}

function getEpLabel(id) {
    const ep = currentEpisodes.find(e => e.id === id);
    if (!ep) return id;
    const epMatch = ep.title.match(/episode\s*(\d+)/i);
    const num = epMatch ? epMatch[1] : '';
    const clean = ep.title.replace(/episode\s*\d+/i, '').trim();
    return `EP ${num}${clean ? ' - ' + clean : ''}`;
}

async function playEpisode(id) {
    if (!id) return;
    currentEpisodeId = id;
    setEpisodeProgress(currentAnimeId, id);

    const select = document.querySelector('.episode-select');
    if (select) {
        select.value = id;
        Array.from(select.options).forEach(opt => {
            const isWatched = getEpisodeProgress(currentAnimeId) === opt.value;
            const label = opt.value === id ? opt.textContent.replace(/^\✓\s*/, '') : opt.textContent;
            opt.textContent = isWatched ? '✓ ' + label : label;
        });
    }

    showPlayerSkeleton();
    if (nowPlayingIndicator) {
        nowPlayingIndicator.innerHTML = `<i class="fas fa-play-circle"></i> ${getEpLabel(id)}`;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
        const response = await fetch(`${API_BASE}/stream/${id}`);
        const data = await response.json();

        if (data && data.streams && data.streams.length > 0) {
            renderPlayer(data, mainVideoContainer);
            renderServerSelector(data.streams);
            if (data.downloads) renderDownloads(data.downloads);
            hidePlayerSkeleton();
        } else {
            mainVideoContainer.innerHTML = `
                <div class="player-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Stream Unavailable</h3>
                    <p>This episode may be recently released or the source is down. Try another server.</p>
                </div>
            `;
            hidePlayerSkeleton();
        }
    } catch (error) {
        console.error("Error playing episode:", error);
        mainVideoContainer.innerHTML = `
            <div class="player-error">
                <i class="fas fa-wifi-slash"></i>
                <h3>Connection Error</h3>
                <p>Failed to fetch stream data. The source may be blocking the connection.</p>
                <button onclick="playEpisode('${id}')" class="hero-btn" style="margin-top:15px">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
        hidePlayerSkeleton();
    }
}

function renderPlayer(data, container) {
    const defaultStream = data.streams[0];
    const defaultMirror = defaultStream.mirrors[0];
    loadServerIntoPlayer(defaultMirror, container);
}

function loadServerIntoPlayer(mirror, container) {
    container.innerHTML = `
        <iframe src="${mirror.url}" allowfullscreen scrolling="no" allow="autoplay; encrypted-media; fullscreen" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"></iframe>
        <div class="player-source-fallback">
            <span>Player tidak muncul?</span>
            <a href="${mirror.url}" target="_blank" rel="noopener" class="glass-btn">
                <i class="fas fa-external-link-alt"></i> Buka di sumber (${mirror.host || 'server'})
            </a>
        </div>
    `;
}

function renderServerSelector(streams) {
    if (!streams || streams.length === 0) {
        serverSelector.style.display = 'none';
        return;
    }
    serverSelector.style.display = '';

    const qualities = [...new Set(streams.map(s => s.quality))];
    let activeQuality = qualities[0];

    serverSelector.innerHTML = `
        <div class="server-header">
            <i class="fas fa-satellite-dish"></i> Quality & Server
        </div>
        <div class="quality-group" id="qualityGroup">
            ${qualities.map(q => `
                <button class="quality-btn ${q === activeQuality ? 'active' : ''}" data-quality="${q}">
                    ${q}
                </button>
            `).join('')}
        </div>
        <div class="mirror-group" id="mirrorGroup">
            ${renderMirrorButtons(streams, activeQuality)}
        </div>
    `;

    document.querySelectorAll('.quality-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const q = btn.dataset.quality;
            document.getElementById('mirrorGroup').innerHTML = renderMirrorButtons(streams, q);
        });
    });
}

function renderMirrorButtons(streams, quality) {
    const filtered = streams.filter(s => s.quality === quality);
    const mirrors = filtered.flatMap(s => s.mirrors);
    if (mirrors.length === 0) return '<span class="no-mirror">No servers available</span>';
    return mirrors.map((m, i) => `
        <button class="server-btn ${i === 0 ? 'active' : ''}" onclick="changeServer(this, '${m.url.replace(/'/g, "\\'")}')">
            <i class="fas fa-server"></i> ${m.name}${m.host ? ' <span class="server-host">(' + m.host + ')</span>' : ''}
        </button>
    `).join('');
}

function changeServer(btn, url) {
    document.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadServerIntoPlayer({ url: url, host: btn.querySelector('.server-host')?.textContent.replace(/[()]/g, '') || '' }, mainVideoContainer);
}

function renderDownloads(downloads) {
    if (!downloads || downloads.length === 0) {
        downloadSection.style.display = 'none';
        return;
    }
    downloadSection.style.display = '';
    downloadSection.innerHTML = `
        <div class="download-header" onclick="this.parentElement.classList.toggle('open')">
            <i class="fas fa-download"></i> Downloads
            <i class="fas fa-chevron-down"></i>
        </div>
        <div class="download-body">
            ${downloads.map(d => `
                <div class="download-group">
                    <span class="download-res">${d.resolution}</span>
                    <div class="download-links">
                        ${d.links.map(l => `
                            <a href="${l.url}" target="_blank" rel="noopener" class="download-link">
                                <i class="fas fa-cloud-download-alt"></i> ${l.name}
                            </a>
                        `).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

async function renderRecommended(animeId) {
    try {
        const response = await fetch(`${API_BASE}/ongoing`);
        const data = await response.json();
        if (!data || data.error || !Array.isArray(data)) {
            recommendedGrid.closest('.recommended-section').style.display = 'none';
            return;
        }
        const filtered = data.filter(a => a.id !== animeId).slice(0, 10);
        if (filtered.length === 0) {
            recommendedGrid.closest('.recommended-section').style.display = 'none';
            return;
        }
        recommendedGrid.innerHTML = filtered.map((anime, i) => `
            <div class="anime-card" style="animation-delay: ${i * 0.05}s" onclick="window.location.href='watch.html?id=${anime.id}'">
                <img src="${anime.thumb}" alt="${anime.title}" class="card-thumb" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'">
                <div class="card-info">
                    <span class="ep-tag">${anime.episode || anime.status || 'NEW'}</span>
                    <h3>${anime.title}</h3>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error("Recommended fetch error:", e);
        recommendedGrid.closest('.recommended-section').style.display = 'none';
    }
}

function isFavorite(id) {
    const favs = JSON.parse(localStorage.getItem('shonen_favs') || '[]');
    return favs.some(f => f.id === id);
}

function toggleFavorite(anime) {
    let favs = JSON.parse(localStorage.getItem('shonen_favs') || '[]');
    const index = favs.findIndex(f => f.id === anime.id);
    if (index > -1) favs.splice(index, 1);
    else favs.unshift(anime);
    localStorage.setItem('shonen_favs', JSON.stringify(favs));
    const favBtn = document.getElementById('favBtn');
    if (favBtn) {
        const isFav = isFavorite(anime.id);
        favBtn.classList.toggle('active', isFav);
        favBtn.innerHTML = `<i class="${isFav ? 'fas' : 'far'} fa-heart"></i>`;
    }
}

const glow = document.getElementById('glow');
if (glow) {
    let mx = 0, my = 0, gx = 0, gy = 0;
    document.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; });
    function animateGlow() {
        gx += (mx - gx) * 0.1;
        gy += (my - gy) * 0.1;
        glow.style.left = gx + 'px';
        glow.style.top = gy + 'px';
        requestAnimationFrame(animateGlow);
    }
    animateGlow();
}

initWatch();
