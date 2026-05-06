from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from scraper import OtakudesuScraper
import os

app = Flask(__name__)
CORS(app)
scraper = OtakudesuScraper()

@app.route("/")
def index():
    return send_from_directory('.', 'index.html')

@app.route("/<path:path>")
def static_proxy(path):
    return send_from_directory('.', path)

@app.route("/api/ongoing", methods=["GET"])
def get_ongoing():
    page = request.args.get('page', 1, type=int)
    data = scraper.get_ongoing(page=page)
    return jsonify(data)

@app.route("/api/movies", methods=["GET"])
def get_movies():
    page = request.args.get('page', 1, type=int)
    data = scraper.get_movies(page=page)
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
    data = scraper.get_schedule()
    return jsonify(data)

if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5000)
