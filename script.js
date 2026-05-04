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

async function showDetails(id) {
    showLoader(true);
    currentAnimeId = id;
    try {
        const response = await fetch(`${API_BASE}/details/${id}`);
        if (!response.ok) throw new Error("Anime not found");
        const data = await response.json();
        if (data && !data.error) {
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
    detailContainer.innerHTML = `
        <div class="detail-layout">
            <div class="detail-left">
                <img src="${anime.thumb}" alt="${anime.title}" class="detail-thumb">
                <div style="margin-top: 20px;">
                    ${Object.entries(anime.info).map(([k, v]) => `<p><strong>${k.replace(/_/g, ' ')}:</strong> ${v}</p>`).join('')}
                </div>
            </div>
            <div class="detail-right">
                <h2>${anime.title}</h2>
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

async function playEpisode(epId) {
    showLoader(true);
    try {
        const response = await fetch(`${API_BASE}/stream/${epId}`);
        if (!response.ok) throw new Error("Stream not found");
        const data = await response.json();

        const playerHtml = `
            <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 12px; margin-bottom: 20px; background: #000; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                <iframe src="${data.stream_url}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border:0;" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true"></iframe>
            </div>
            
            <div class="downloads-section" style="margin: 30px 0; background: var(--glass); padding: 20px; border-radius: 16px; border: 1px solid var(--glass-border);">
                <h3 style="margin-bottom: 15px; display: flex; align-items: center; gap: 8px;"><i class="fas fa-download" style="color: #10b981;"></i> Download Episode</h3>
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    ${data.downloads && data.downloads.length > 0 ? data.downloads.map(dl => `
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <span style="font-weight: 600; color: var(--primary);">${dl.resolution}</span>
                            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                                ${dl.links.map(link => `
                                    <a href="${link.url}" target="_blank" style="background: rgba(255,255,255,0.1); color: #fff; text-decoration: none; padding: 5px 12px; border-radius: 6px; font-size: 0.85rem; transition: background 0.3s;" onmouseover="this.style.background='var(--primary)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">${link.name}</a>
                                `).join('')}
                            </div>
                        </div>
                    `).join('') : '<p style="color: var(--text-dim);">gatau cok, nanti dah coming soon</p>'}
                </div>
            </div>

            <button onclick="showDetails(currentAnimeId)" style="background: var(--primary); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; transition: all 0.3s ease;" onmouseover="this.style.transform='translateX(-5px)'" onmouseout="this.style.transform='translateX(0)'">
                <i class="fas fa-arrow-left"></i> Back to Episodes
            </button>
        `;
        detailContainer.innerHTML = playerHtml;
    } catch (error) {
        console.error("Error fetching stream:", error);
        alert("Error loading video stream.");
    } finally {
        showLoader(false);
    }
}

function showLoader(show) {
    loader.style.display = show ? 'block' : 'none';
}

searchBtn.onclick = () => searchAnime(searchInput.value);
searchInput.onkeypress = (e) => {
    if (e.key === 'Enter') searchAnime(searchInput.value);
};

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
