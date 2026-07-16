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

    def get_stream(self, episode_id):
        print(f"DEBUG: get_stream called for {episode_id}")
        episode_id = episode_id.strip("/")

        soup = None
        for path in [episode_id]:
            url = f"{self.BASE_URL}/{path}/"
            soup = self._get_soup(url)
            if soup:
                print(f"DEBUG: Found stream page at {url}")
                break
        if not soup:
            return None

        streams = []

        mirror_select = soup.select_one("select.mirror")
        if mirror_select:
            for opt in mirror_select.find_all("option"):
                val = opt.get("value", "").strip()
                if not val:
                    continue
                label = opt.text.strip()
                iframe_src = ""
                try:
                    decoded_html = base64.b64decode(val).decode("utf-8")
                    tmp = BeautifulSoup(decoded_html, "html.parser")
                    iframe = tmp.find("iframe")
                    iframe_src = iframe["src"] if iframe and iframe.has_attr("src") else ""
                except Exception:
                    iframe_src = ""

                if iframe_src:
                    quality = "480p"
                    res_match = re.search(r'(\d{3,4}p)', label)
                    if res_match:
                        quality = res_match.group(1)
                    existing = next((s for s in streams if s["quality"] == quality), None)
                    mirror_data = {"name": label or "Server 1", "url": iframe_src}
                    if existing:
                        existing["mirrors"].append(mirror_data)
                    else:
                        streams.append({"quality": quality, "mirrors": [mirror_data]})

        if not streams:
            iframe = soup.select_one("#embed_holder iframe")
            if iframe and iframe.has_attr("src"):
                streams.append({
                    "quality": "480p",
                    "mirrors": [{"name": "Server 1", "url": iframe["src"]}],
                })

        downloads = []
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

        return {"streams": streams, "downloads": downloads}

