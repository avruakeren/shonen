import sys, traceback

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from scraper import OtakudesuScraper
import os, json

app = Flask(__name__)
CORS(app)
scraper = OtakudesuScraper()

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

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
    return _scrape_or_error(scraper.get_ongoing)

@app.route("/api/movies", methods=["GET"])
def get_movies():
    page = request.args.get('page', 1, type=int)
    return _scrape_or_error(scraper.get_movies, page=page)

@app.route("/api/search", methods=["GET"])
def search():
    query = request.args.get("q", "")
    if not query:
        return jsonify([])
    return _scrape_or_error(scraper.search, query)

@app.route("/api/details/<anime_id>", methods=["GET"])
def get_details(anime_id):
    return _scrape_or_error(scraper.get_details, anime_id)

@app.route("/api/stream/<episode_id>", methods=["GET"])
def get_stream(episode_id):
    return _scrape_or_error(scraper.get_stream, episode_id)

@app.route("/api/schedule", methods=["GET"])
def get_schedule():
    data = _load_data('schedule.json')
    if data is not None:
        return jsonify(data)
    return _scrape_or_error(scraper.get_schedule)

if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, threaded=True, port=5000)
