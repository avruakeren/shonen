import ipaddress, json, logging, socket, sys, time
import urllib.parse

import requests
from flask import Flask, Response, abort, jsonify, request, send_from_directory
from flask_cors import CORS

import mal
from scraper import NotFound, OtakudesuScraper

# The Windows console defaults to cp1252, and a single "★" in a scraped title
# used to raise inside a print() and surface as a 502. Logging downgrades
# undecodable characters instead of raising, and reconfiguring the streams
# keeps anything else that prints from taking the request down with it.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="backslashreplace")
    except (AttributeError, ValueError, OSError):
        pass

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(name)s: %(message)s")

app = Flask(__name__)
CORS(app)
scraper = OtakudesuScraper()

# Simple cache: in-memory + /tmp file (Vercel serverless is read-only after
# deploy, so persistent cache lives in the ephemeral /tmp per instance).
CACHE_TTL = 900  # 15 minutes
_mem_cache = {}
CACHE_DIR = "/tmp/shonen_cache"


def _cache_get(key):
    # in-memory first
    if key in _mem_cache:
        ts, val = _mem_cache[key]
        if time.time() - ts < CACHE_TTL:
            return val
    # file cache
    try:
        path = os.path.join(CACHE_DIR, key + ".json")
        if os.path.exists(path):
            ts = os.path.getmtime(path)
            if time.time() - ts < CACHE_TTL:
                with open(path, 'r', encoding='utf-8') as f:
                    val = json.load(f)
                    _mem_cache[key] = (ts, val)
                    return val
    except Exception:
        pass
    return None


def _cache_set(key, val):
    _mem_cache[key] = (time.time(), val)
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(os.path.join(CACHE_DIR, key + ".json"), 'w', encoding='utf-8') as f:
            json.dump(val, f)
    except Exception:
        pass


def _cached(fn, key, *args, **kwargs):
    cached = _cache_get(key)
    if cached is not None:
        return cached
    result = fn(*args, **kwargs)
    if result is not None:
        _cache_set(key, result)
    return result

def _scrape_or_error(fn, *args, **kwargs):
    try:
        result = fn(*args, **kwargs)
    except NotFound as e:
        # The source answered and the page is not there, so this is a genuine
        # 404 rather than the 502 an upstream outage produces.
        return jsonify({"error": f"not found: {e}", "data": None}), 404
    except Exception as e:
        logging.exception("scraper error")
        return jsonify({"error": f"Scraping failed: {str(e)}", "data": None}), 502
    if result is None:
        return jsonify({"error": "No data returned from source", "data": None}), 502
    return jsonify(result)

@app.route("/api/test")
def test_api():
    return jsonify({"status": "ok", "message": "API is reachable"})

# The proxy is reachable by anyone, so it must not double as an open relay into
# the deployment's own network. Only the image hosts the scraper actually emits
# are allowed: samehadaku's own host, and the Jetpack CDN (i0-i3.wp.com) it
# serves most thumbnails through.
ALLOWED_IMAGE_HOSTS = ("samehadaku.li", "wp.com")
IMAGE_MAX_REDIRECTS = 3


def _image_url_allowed(raw):
    """True only for an http(s) URL on an allowed host that resolves publicly.

    The address check is what stops ``u=http://<allowed-host>`` from being
    pointed at an internal name, and it also covers hostnames that resolve to
    private ranges rather than spelling them out.
    """
    try:
        parts = urllib.parse.urlsplit(raw)
    except ValueError:
        return False
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return False
    host = parts.hostname.lower()
    if not any(host == allowed or host.endswith("." + allowed) for allowed in ALLOWED_IMAGE_HOSTS):
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False
    return True


@app.route("/api/img")
def proxy_image():
    u = request.args.get("u", "")
    if not u:
        return jsonify({"error": "invalid url"}), 400
    # Strip query string (?resize= dll) agar mengambil gambar original
    clean_url = u.split("?")[0]
    if not _image_url_allowed(clean_url):
        return jsonify({"error": "url not allowed"}), 403
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://samehadaku.li/",
        "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*",
    }
    try:
        # Chase redirects by hand so every hop is checked too -- requests would
        # otherwise follow one straight to an internal address.
        url = clean_url
        for _ in range(IMAGE_MAX_REDIRECTS):
            r = requests.get(url, headers=headers, timeout=25, allow_redirects=False)
            if not r.is_redirect:
                break
            url = urllib.parse.urljoin(url, r.headers.get("Location", ""))
            if not _image_url_allowed(url):
                return jsonify({"error": "redirect not allowed"}), 403
        else:
            return jsonify({"error": "too many redirects"}), 502
        r.raise_for_status()
        resp = Response(
            r.content,
            content_type=r.headers.get("Content-Type", "image/jpeg"),
        )
        resp.headers["Cache-Control"] = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800"
        return resp
    except Exception as e:
        return jsonify({"error": f"image proxy failed: {str(e)}"}), 502

@app.route("/")
def index():
    return send_from_directory('.', 'index.html')

@app.route("/watch.html")
def watch():
    return send_from_directory('.', 'watch.html')

# The frontend only ever asks for these by name. Everything else sitting in the
# deploy directory -- scraper.py, app.py, requirements.txt, .git/, the test
# suites -- used to be downloadable straight off the site by this catch-all.
PUBLIC_FILES = frozenset({
    "index.html", "watch.html",
    "style.css", "script.js", "watch.js", "sw.js",
    "manifest.json", "icon.png",
})


@app.route("/<path:path>")
def static_proxy(path):
    if path not in PUBLIC_FILES:
        abort(404)
    return send_from_directory('.', path)

@app.route("/api/ongoing", methods=["GET"])
def get_ongoing():
    page = request.args.get('page', 1, type=int)
    return _scrape_or_error(lambda: _cached(scraper.get_ongoing, f"ongoing_{page}", page=page))

@app.route("/api/library", methods=["GET"])
def get_library():
    """The Library view ("See All Anime") pages the site-wide archive, which is
    the same listing /api/ongoing reads -- there is no separate movies feed."""
    page = request.args.get('page', 1, type=int)
    return _scrape_or_error(lambda: _cached(scraper.get_ongoing, f"library_{page}", page=page))

@app.route("/api/search", methods=["GET"])
def search():
    query = request.args.get("q", "")
    if not query:
        return jsonify([])
    return _scrape_or_error(lambda: _cached(scraper.search, "search_" + query, query))

@app.route("/api/details/<anime_id>", methods=["GET"])
def get_details(anime_id):
    return _scrape_or_error(lambda: _cached(scraper.get_details, "details_" + anime_id, anime_id))

@app.route("/api/stream/<episode_id>", methods=["GET"])
def get_stream(episode_id):
    return _scrape_or_error(lambda: _cached(scraper.get_stream, "stream_" + episode_id, episode_id))

@app.route("/api/schedule", methods=["GET"])
def get_schedule():
    return _scrape_or_error(lambda: _cached(mal.get_schedule, "schedule"))

@app.route("/api/seasonal", methods=["GET"])
def get_seasonal():
    # Seasonal/top-rated are MyAnimeList metadata (AniList/Jikan), not scraped
    # from Samehadaku, so they are cached separately from scraper results.
    return _scrape_or_error(lambda: _cached(mal.get_seasonal, "seasonal"))

@app.route("/api/top", methods=["GET"])
def get_top():
    return _scrape_or_error(lambda: _cached(mal.get_top, "top_rated"))

if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, threaded=True, port=5000)
