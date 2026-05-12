# Shonen Anime ⚡

Watch Anime Ads Free with Premium Experience. A modern, lightweight, and high-performance anime streaming platform built with Python and Vanilla Web Technologies.

![Shonen Anime Icon](icon.png)

## 🚀 Quick Start

Ensure you have Python installed, then run the following commands:

```bash
# Install dependencies
pip install -r requirements.txt

# Run the development server
npm run dev
```

The application will be available at `http://localhost:5000`.

## ✨ Features

- **Ads-Free Experience**: Pure streaming without annoying pop-ups or redirections.
- **PWA Ready**: Installable on mobile and desktop for a native-like experience.
- **Robust Scraping**: Powered by a custom `OtakudesuScraper` supporting:
  - Ongoing & Complete Anime series.
  - Advanced Search functionality.
  - Detailed metadata and episode lists.
  - Real-time Release Schedule.
  - Multiple streaming mirrors with quality selection (360p, 480p, 720p).
  - Direct download links.
- **Premium UI**: Dark mode "Liquid Glass" design with smooth animations.
- **Smart Caching**: Efficient data fetching with internal caching to reduce load times.

## 🛠️ Tech Stack

- **Backend**: Python 3.14+ (Flask, BeautifulSoup4, Requests)
- **Frontend**: HTML5, Vanilla CSS3 (Modern Flex/Grid), JavaScript (ES6+)
- **Mobile**: Progressive Web App (PWA) with Service Worker and Manifest.
- **Environment**: Compatible with Windows (`py` command) and Linux/macOS.

## 📁 Project Structure

```text
├── app.py              # Flask Server & API Routes
├── scraper.py          # Core Scraping Logic (Otakudesu)
├── requirements.txt    # Python Dependencies
├── package.json        # NPM Scripts & Metadata
├── index.html          # Main Landing Page
├── watch.html          # Video Player Page
├── style.css           # Global Styles & Design System
├── script.js           # Main Frontend Logic
├── sw.js               # Service Worker for PWA
└── manifest.json       # PWA Configuration
```

## ⚙️ Configuration

The server runs on port `5000` by default. You can modify the host and port in `app.py`:

```python
if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5000)
```

## 📜 License

ISC License. Built for educational and personal use.
