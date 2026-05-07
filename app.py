from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from scraper import OtakudesuScraper
import os

from scraper import OtakudesuScraper
import os
import time

app = Flask(__name__)
CORS(app)
scraper = OtakudesuScraper()

# Simple Cache System
cache = {}
CACHE_TIMEOUT = 1800 # 30 minutes

def get_cached_data(key, scraper_func, *args, **kwargs):
    now = time.time()
    if key in cache and (now - cache[key]['timestamp']) < CACHE_TIMEOUT:
        print(f"DEBUG: Returning cached data for {key}")
        return cache[key]['data']
    
    print(f"DEBUG: Fetching fresh data for {key}")
    data = scraper_func(*args, **kwargs)
    if data:
        cache[key] = {
            'data': data,
            'timestamp': now
        }
    return data

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
    cache_key = f"ongoing_{page}"
    data = get_cached_data(cache_key, scraper.get_ongoing, page=page)
    return jsonify(data)

@app.route("/api/movies", methods=["GET"])
def get_movies():
    page = request.args.get('page', 1, type=int)
    cache_key = f"movies_{page}"
    data = get_cached_data(cache_key, scraper.get_movies, page=page)
    return jsonify(data)

@app.route("/api/search", methods=["GET"])
def search():
    query = request.args.get("q", "")
    if not query:
        return jsonify([])
    data = scraper.search(query)
    return jsonify(data)

@app.route("/api/details/<anime_id>", methods=["GET"])
def get_details(anime_id):
    data = scraper.get_details(anime_id)
    if not data:
        return jsonify({"error": "Anime not found"}), 404
    return jsonify(data)

@app.route("/api/stream/<episode_id>", methods=["GET"])
def get_stream(episode_id):
    data = scraper.get_stream(episode_id)
    if not data:
        return jsonify({"error": "Stream not found"}), 404
    return jsonify(data)

@app.route("/api/schedule", methods=["GET"])
def get_schedule():
    data = get_cached_data("schedule", scraper.get_schedule)
    return jsonify(data)

if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5000)
