import logging
logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')

try:
    import cloudscraper
except (ImportError, ModuleNotFoundError):
    cloudscraper = None
import requests
from bs4 import BeautifulSoup
import urllib.parse
import base64
import re

class OtakudesuScraper:
    BASE_URL = "https://samehadaku.li"

    @staticmethod
    def _proxy(url):
        if not url:
            return url
        if url.startswith("http"):
            return f"/api/img?u={urllib.parse.quote(url, safe='')}"
        return url

    def __init__(self):
        if cloudscraper:
            self.cs = cloudscraper.create_scraper()
        else:
            self.cs = None
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        })

    def _get_soup(self, url):
        headers = {"User-Agent": self.session.headers.get("User-Agent", "Mozilla/5.0")}
        for attempt, client in enumerate([self.cs, self.session], start=1):
            if not client:
                continue
            try:
                resp = client.get(url, timeout=15, headers=headers)
                resp.raise_for_status()
                return BeautifulSoup(resp.content, "lxml")
            except Exception as e:
                logging.warning(f"[Attempt {attempt}] {type(client).__name__} request failed for {url}: {e}")
                if isinstance(client, type(self.cs)) and "Cloudflare" in str(e):
                    logging.info("Cloudscraper challenge detected, falling back to requests session")
                    continue

        try:
            resp = requests.get(url, timeout=15, headers=headers)
            resp.raise_for_status()
            return BeautifulSoup(resp.content, "lxml")
        except Exception as e:
            print(f"Final fallback request also failed for {url}: {e}")
            return None

    def _parse_anime_item(self, item):
        a = item.find("a")
        if not a or not a.has_attr("href"):
            return None
        link = a["href"]

        title_container = item.select_one(".tt")
        title = ""
        if title_container:
            h2 = title_container.find("h2")
            if h2:
                title = h2.text.strip()
            if not title:
                title = title_container.text.strip()

        thumb_el = item.select_one(".limit img")
        thumb = ""
        if thumb_el:
            for attr in ("data-src", "data-lazy-src", "src"):
                if thumb_el.has_attr(attr) and thumb_el[attr] and not thumb_el[attr].startswith("data:image"):
                    thumb = thumb_el[attr]
                    break

        ep_el = item.select_one(".epx")
        episode = ep_el.text.strip() if ep_el else ""

        status_el = item.select_one(".status")
        status = status_el.text.strip() if status_el else ""

        slug = link.rstrip("/").split("/")[-1]
        anime_id = re.sub(r'-episode-\d+.*$', '', slug)

        return {
            "title": title or anime_id.replace("-", " ").title(),
            "link": link,
            "id": anime_id,
            "thumb": self._proxy(thumb),
            "episode": episode or status or "NEW",
        }

    def get_ongoing(self, page=1):
        url = f"{self.BASE_URL}/page/{page}/" if page > 1 else self.BASE_URL
        soup = self._get_soup(url)
        if not soup:
            return []

        items = soup.select(".listupd article.bs")
        results = []
        for item in items:
            parsed = self._parse_anime_item(item)
            if parsed:
                results.append(parsed)
        return results

    def get_movies(self, page=1):
        if page > 1:
            url = f"{self.BASE_URL}/page/{page}/"
        else:
            url = self.BASE_URL
        soup = self._get_soup(url)
        if not soup:
            return []

        items = soup.select(".listupd article.bs")
        results = []
        for item in items:
            parsed = self._parse_anime_item(item)
            if parsed:
                results.append(parsed)
        return results

    def search(self, query):
        url = f"{self.BASE_URL}/?s={urllib.parse.quote(query)}"
        soup = self._get_soup(url)
        if not soup:
            return []

        items = soup.select(".listupd article.bs")
        results = []
        for item in items:
            a = item.find("a")
            if not a or not a.has_attr("href"):
                continue
            link = a["href"]

            title_container = item.select_one(".tt")
            title = ""
            if title_container:
                h2 = title_container.find("h2")
                if h2:
                    title = h2.text.strip()
                if not title:
                    title = title_container.text.strip()

            thumb_el = item.select_one(".limit img")
            thumb = ""
            if thumb_el:
                for attr in ("data-src", "data-lazy-src", "src"):
                    if thumb_el.has_attr(attr) and thumb_el[attr] and not thumb_el[attr].startswith("data:image"):
                        thumb = thumb_el[attr]
                        break

            status_el = item.select_one(".status")
            status = status_el.text.strip() if status_el else "Unknown"

            slug = link.rstrip("/").split("/")[-1]
            anime_id = re.sub(r'-episode-\d+.*$', '', slug)

            if title and anime_id:
                results.append({
                    "title": title,
                    "link": link,
                    "id": anime_id,
                    "thumb": self._proxy(thumb),
                    "status": status,
                })
        return results

    def get_details(self, anime_id):
        print(f"DEBUG: get_details called for {anime_id}")
        anime_id = re.sub(r'-episode-\d+.*$', '', anime_id.rstrip("/"))

        soup = None
        for path in [f"anime/{anime_id}", anime_id]:
            url = f"{self.BASE_URL}/{path}/"
            print(f"DEBUG: Trying {url}")
            soup = self._get_soup(url)
            if soup and (soup.select_one(".infox") or soup.select_one(".thumbook")):
                print(f"DEBUG: Found details at {url}")
                break

        if not soup:
            print(f"DEBUG: No details found for {anime_id}")
            return None

        title_el = soup.select_one(".entry-title")
        title = title_el.text.strip() if title_el else anime_id.replace("-", " ").title()

        thumb_el = soup.select_one(".thumbook .thumb img")
        thumb = ""
        if thumb_el:
            for attr in ("data-src", "data-lazy-src", "src"):
                if thumb_el.has_attr(attr) and thumb_el[attr] and not thumb_el[attr].startswith("data:image"):
                    thumb = thumb_el[attr]
                    break

        info = {}
        for span in soup.select(".infox .spe span"):
            text = span.get_text(" ", strip=True)
            b = span.find("b")
            if b:
                key = b.get_text(strip=True).lower().replace(":", "").strip().replace(" ", "_")
                value = text.replace(b.get_text(strip=True), "", 1).strip()
                info[key] = value

        genres = [a.text.strip() for a in soup.select(".genxed a")]
        if genres:
            info["genres"] = ", ".join(genres)

        synopsis = ""
        synopsis_el = soup.select_one(".bixbox.synp .entry-content") or soup.select_one(".entry-content")
        if synopsis_el:
            synopsis = synopsis_el.get_text(strip=True)

        episodes = []
        ep_container = soup.select_one(".bxcl.epcheck ul") or soup.select_one("#singlepisode .episodelist ul")
        if ep_container:
            for li in ep_container.find_all("li"):
                a = li.find("a")
                if not a or not a.has_attr("href"):
                    continue
                link = a["href"]
                ep_id = link.rstrip("/").split("/")[-1]

                title_el = li.select_one(".epl-title") or li.select_one(".playinfo h3") or li.find("h3") or a
                ep_title = title_el.get_text(strip=True) if title_el else a.get_text(strip=True)

                date_el = li.select_one(".epl-date") or li.select_one(".playinfo span")
                date = date_el.get_text(strip=True) if date_el else ""

                episodes.append({
                    "title": ep_title,
                    "link": link,
                    "id": ep_id,
                    "date": date,
                })

        title_fallback = anime_id.replace("-", " ").title()
        return {
            "title": info.get("judul", title),
            "thumb": self._proxy(thumb),
            "synopsis": synopsis,
            "info": info,
            "episodes": episodes,
        }

    def get_schedule(self):
        return []

    # --- embed helpers -------------------------------------------------
    @staticmethod
    def _decode_embed(value):
        """Decode a base64 encoded ``<iframe src="...">`` blob into its src."""
        if not value:
            return ""
        raw = value.strip()
        # HTML-embedded blobs are often unpadded; b64decode needs a 4-char tail.
        raw += "=" * (-len(raw) % 4)
        for decoder in (base64.b64decode, base64.urlsafe_b64decode):
            try:
                decoded = decoder(raw).decode("utf-8", "replace")
            except Exception:
                continue
            if "<" not in decoded and "http" not in decoded:
                continue
            if "<" in decoded:
                tmp = BeautifulSoup(decoded, "html.parser")
                iframe = tmp.find("iframe")
                if iframe and iframe.has_attr("src"):
                    return iframe["src"].strip()
            # Some providers hand back a bare URL rather than an iframe tag.
            match = re.search(r'https?://[^\s"\'<>]+', decoded)
            if match:
                return match.group(0).strip()
        return ""

    @staticmethod
    def _iframe_src(iframe):
        """Resolve an iframe's real src, skipping lazy-load placeholders."""
        # LiteSpeed/WordPress lazy-load keeps the real URL in data-* attrs
        # while ``src`` is a placeholder like "about:blank".
        for attr in ("src", "data-litespeed-src", "data-src", "data-lazy-src"):
            val = iframe.get(attr)
            if isinstance(val, list):
                val = " ".join(val)
            if not val:
                continue
            val = val.strip()
            if val.startswith("http") and val.lower() not in ("about:blank", "javascript:void(0)"):
                return val
        return ""

    @staticmethod
    def _quality_from(label, url=""):
        """Extract a ``720p`` style label, else fall back to a group name."""
        res_match = re.search(r'(\d{3,4})\s*p', label or "", re.IGNORECASE)
        if res_match:
            return f"{res_match.group(1)}p"
        return "HD"

    def get_stream(self, episode_id):
        print(f"DEBUG: get_stream called for {episode_id}")
        episode_id = episode_id.strip("/")

        url = f"{self.BASE_URL}/{episode_id}/"
        soup = self._get_soup(url)
        if not soup:
            return None
        print(f"DEBUG: Found stream page at {url}")

        streams = []
        seen_urls = set()

        def add_stream(quality, name, url_):
            if not url_ or not url_.startswith("http"):
                return
            if url_.lower() in ("about:blank", "javascript:void(0)"):
                return
            if url_ in seen_urls:
                return
            seen_urls.add(url_)
            host = urllib.parse.urlparse(url_).netloc.replace("www.", "")
            # Only trust the *label* for quality, never the URL: embed URLs are
            # long random tokens that can accidentally contain digits + "p".
            quality = self._quality_from(name, url_) if quality is None else quality
            existing = next((s for s in streams if s["quality"] == quality), None)
            mirror_data = {"name": name or host or "Server", "url": url_, "host": host}
            if existing:
                existing["mirrors"].append(mirror_data)
            else:
                streams.append({"quality": quality, "mirrors": [mirror_data]})

        # 1) Current layout: .aspd-server buttons carry a base64 <iframe> blob
        #    (data-embed) plus a fallback direct URL (data-url).
        for btn in soup.select(".aspd-server"):
            label = (btn.get("data-label") or btn.get_text(" ", strip=True) or "Server").strip()
            iframe_src = self._decode_embed(btn.get("data-embed", ""))
            if not iframe_src:
                iframe_src = (btn.get("data-url") or "").strip()
            if iframe_src:
                add_stream(self._quality_from(label), label, iframe_src)

        # 2) The player iframe itself (lazy-loaded: real URL in data-* attrs).
        for iframe in soup.select("#embed_holder iframe, .responsive-embed iframe, .mirrorx iframe, .player-embed iframe"):
            src = self._iframe_src(iframe)
            if src:
                add_stream(None, "Server", src)

        # 3) Legacy layout: <select class="mirror"> with base64 encoded options.
        for opt in soup.select("select.mirror option"):
            val = (opt.get("value") or "").strip()
            if not val:
                continue
            iframe_src = self._decode_embed(val)
            if iframe_src:
                label = re.sub(r'\s*\d{3,4}p\s*', '', opt.text.strip()).strip() or "Server"
                add_stream(self._quality_from(opt.text.strip()), label, iframe_src)

        # 4) Last resort: any other player iframe on the page.
        if not streams:
            for iframe in soup.select("iframe"):
                src = self._iframe_src(iframe)
                if src and "doubleclick" not in src:
                    add_stream(None, "Server", src)
                    break

        downloads = self._parse_downloads(soup)

        return {"streams": streams, "downloads": downloads}

    @staticmethod
    def _parse_downloads(soup):
        downloads = []

        # Current layout: flat .aspd-download anchors, e.g. "720P" -> pixeldrain.
        grouped = {}
        for a in soup.select(".aspd-download"):
            href = a.get("href", "").strip()
            if not href.startswith("http"):
                continue
            res = a.get_text(" ", strip=True) or "Download"
            res = re.sub(r'^download\s*', '', res, flags=re.IGNORECASE) or "Download"
            host = urllib.parse.urlparse(href).netloc.replace("www.", "")
            bucket = grouped.setdefault(res, {"resolution": res, "links": []})
            if href not in [l["url"] for l in bucket["links"]]:
                bucket["links"].append({"name": host or "Download", "url": href})
        downloads.extend(grouped.values())

        # Legacy layout: <div class="download"><li><strong>720P</strong><a>.
        dl_container = soup.select_one(".download")
        if dl_container:
            for li in dl_container.select("li"):
                strong = li.select_one("strong")
                if not strong:
                    continue
                res = strong.text.strip()
                links = [
                    {"name": a.text.strip(), "url": a["href"]}
                    for a in li.select("a") if a.has_attr("href")
                ]
                if links:
                    downloads.append({"resolution": res, "links": links})

        return downloads

