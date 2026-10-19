import logging

try:
    import cloudscraper
except (ImportError, ModuleNotFoundError):
    cloudscraper = None
import requests
from bs4 import BeautifulSoup
import urllib.parse
import base64
import re


class NotFound(Exception):
    """The source answered, and the page it was asked for does not exist.

    This is deliberately separate from a scraper failure: a missing title is a
    404 for the caller, while an outage has to stay a 502 so it gets retried
    instead of looking like an empty result.
    """


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

    def _fetch(self, url):
        """Fetch ``url`` as ``(soup, status)``.

        ``soup`` is None when the request failed. ``status`` is the last HTTP
        status seen, or None when no response ever arrived (DNS failure,
        timeout, ...). get_details()/get_stream() rely on that difference to
        tell "this page does not exist" apart from "the source is down".
        """
        headers = {"User-Agent": self.session.headers.get("User-Agent", "Mozilla/5.0")}
        status = None
        for attempt, client in enumerate([self.cs, self.session], start=1):
            if not client:
                continue
            try:
                resp = client.get(url, timeout=15, headers=headers)
                status = resp.status_code
                resp.raise_for_status()
                return BeautifulSoup(resp.content, "lxml"), status
            except Exception as e:
                # raise_for_status() parks the response on the exception; after
                # a connection error there is nothing new to read, so the last
                # status we did see is the best answer available.
                status = getattr(getattr(e, "response", None), "status_code", status)
                logging.warning(f"[Attempt {attempt}] {type(client).__name__} request failed for {url}: {e}")
                if isinstance(client, type(self.cs)) and "Cloudflare" in str(e):
                    logging.info("Cloudscraper challenge detected, falling back to requests session")
                    continue

        try:
            resp = requests.get(url, timeout=15, headers=headers)
            status = resp.status_code
            resp.raise_for_status()
            return BeautifulSoup(resp.content, "lxml"), status
        except Exception as e:
            status = getattr(getattr(e, "response", None), "status_code", status)
            logging.warning(f"Final fallback request also failed for {url}: {e}")
            return None, status

    def _get_soup(self, url):
        """The parsed page, or None. Callers that need to know *why* it is None
        should use _fetch() instead."""
        return self._fetch(url)[0]

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
        """Newest posts, one page at a time.

        Page 1 is the home listing; later pages are the site-wide archive. The
        Library view pages through exactly this, which is why there is no
        separate "movies" listing -- samehadaku.li has no such page (its menu
        only offers Home / AZ List / Random), so /api/library reuses this.
        """
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

    @staticmethod
    def _episode_number(li):
        """Episode number from a list row, or None when the site omits it."""
        num_el = li.select_one(".epl-num")
        match = re.search(r'\d+', num_el.get_text(strip=True) if num_el else "")
        return int(match.group(0)) if match else None

    @staticmethod
    def _same_series(link, anime_id):
        """Guard for following rel="next": never leave the series we started on."""
        return urllib.parse.unquote(anime_id) in urllib.parse.unquote(link)

    def _follow_newest_episodes(self, episodes, anime_id, max_hops=3):
        """Append the episodes the series page has not listed yet.

        A series page lags one episode behind the homepage: it advertises a
        "New Episode" in .lastend that its own .eplister list still lacks, so
        the newest episode never reaches watch.html. Episode pages chain with
        <a rel="next">, and that chain is scoped to the series -- the newest
        episode of a series carries no rel="next" even while newer posts exist
        elsewhere on the site -- so walking it completes the list.
        """
        if not episodes:
            return episodes

        seen = {ep["link"] for ep in episodes}
        page = self._get_soup(episodes[-1]["link"])
        for _ in range(max_hops):
            if not page:
                break
            anchor = page.select_one('a[rel="next"]')
            link = (anchor.get("href") if anchor and anchor.has_attr("href") else "").strip()
            # Stop at the end of the chain, on a repeat, or if it ever drifts
            # out of this series.
            if not link or link in seen or not self._same_series(link, anime_id):
                break
            seen.add(link)

            page = self._get_soup(link)
            if not page:
                break
            title_el = page.select_one(".entry-title")
            episodes.append({
                "title": title_el.get_text(strip=True) if title_el else link,
                "link": link,
                "id": link.rstrip("/").split("/")[-1],
                # Only the series list carries a date; an episode page has none.
                "date": "",
            })
        return episodes

    def get_details(self, anime_id):
        anime_id = re.sub(r'-episode-\d+.*$', '', anime_id.rstrip("/"))

        soup = None
        statuses = []
        for path in [f"anime/{anime_id}", anime_id]:
            url = f"{self.BASE_URL}/{path}/"
            candidate, status = self._fetch(url)
            statuses.append(status)
            if candidate and (candidate.select_one(".infox") or candidate.select_one(".thumbook")):
                soup = candidate
                break

        if soup is None:
            # A 404/410 -- or a 200 that turns out not to be a series page --
            # means the title does not exist. Anything else (timeout, 5xx,
            # Cloudflare block) means we could not tell, and that has to stay a
            # 502 so the caller retries rather than caching a phantom miss.
            if all(s in (200, 404, 410) for s in statuses):
                raise NotFound(anime_id)
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
                    # Ordering only; stripped again before this is returned.
                    "_num": self._episode_number(li),
                })

        # The rows are written oldest-first today, but _follow_newest_episodes
        # needs the newest last, so order by number instead of trusting the
        # markup. The sort is stable, so a legacy layout with no numbers keeps
        # whatever order it arrived in.
        episodes.sort(key=lambda ep: (ep["_num"] is None, ep["_num"] or 0))
        episodes = self._follow_newest_episodes(episodes, anime_id)
        for ep in episodes:
            ep.pop("_num", None)

        return {
            "title": info.get("judul", title),
            "thumb": self._proxy(thumb),
            "synopsis": synopsis,
            "info": info,
            "episodes": episodes,
        }

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
    def _quality_from(label):
        """Extract a ``720p`` style label, else fall back to a generic ``HD``."""
        res_match = re.search(r'(\d{3,4})\s*p', label or "", re.IGNORECASE)
        if res_match:
            return f"{res_match.group(1)}p"
        return "HD"

    def get_stream(self, episode_id):
        episode_id = episode_id.strip("/")

        url = f"{self.BASE_URL}/{episode_id}/"
        soup, status = self._fetch(url)
        if not soup:
            if status in (404, 410):
                raise NotFound(episode_id)
            return None

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
            quality = self._quality_from(name) if quality is None else quality
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

