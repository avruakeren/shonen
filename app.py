import sys, traceback, time

from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS
from scraper import OtakudesuScraper
import os, json, requests

app = Flask(__name__)
CORS(app)
scraper = OtakudesuScraper()

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

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

def _load_data(filename):
    path = os.path.join(DATA_DIR, filename)
    try:
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                print(f"Loaded {filename} ({len(data)} items)")
                return data
    except Exception as e:
        print(f"Error loading {path}: {e}")
    print(f"FALLBACK: scraping {filename}")
    return None

def _scrape_or_error(fn, *args, **kwargs):
    try:
        result = fn(*args, **kwargs)
        if result is None:
            return jsonify({"error": "No data returned from source", "data": None}), 502
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        print(f"Scraper error: {e}", file=sys.stderr)
        return jsonify({"error": f"Scraping failed: {str(e)}", "data": None}), 502

@app.route("/api/test")
def test_api():
    return jsonify({"status": "ok", "message": "API is reachable"})

@app.route("/api/img")
def proxy_image():
    u = request.args.get("u", "")
    if not u or not u.startswith("http"):
        return jsonify({"error": "invalid url"}), 400
    # Strip query string (?resize= dll) agar mengambil gambar original
    clean_url = u.split("?")[0]
    try:
        r = requests.get(
            clean_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://samehadaku.li/",
                "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*",
            },
            timeout=25,
        )
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

@app.route("/<path:path>")
def static_proxy(path):
    return send_from_directory('.', path)

@app.route("/api/ongoing", methods=["GET"])
def get_ongoing():
    page = request.args.get('page', 1, type=int)
    if page > 1:
        return _scrape_or_error(scraper.get_ongoing, page=page)
    data = _load_data('ongoing.json')
    if data is not None:
        return jsonify(data)
    return _scrape_or_error(lambda: _cached(scraper.get_ongoing, "ongoing_1"))

@app.route("/api/movies", methods=["GET"])
def get_movies():
    page = request.args.get('page', 1, type=int)
    if page > 1:
        return _scrape_or_error(lambda: _cached(scraper.get_movies, f"movies_{page}", page=page))
    return _scrape_or_error(lambda: _cached(scraper.get_movies, "movies_1", page=1))

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
    data = _load_data('schedule.json')
    if data is not None:
        return jsonify(data)
    return _scrape_or_error(lambda: _cached(scraper.get_schedule, "schedule"))

if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, threaded=True, port=5000)
