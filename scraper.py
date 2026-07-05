import cloudscraper
import requests
from bs4 import BeautifulSoup
import urllib.parse
import base64
import re

class OtakudesuScraper:
    BASE_URL = "https://otakudesu.blog"

    def __init__(self):
        self.cs = cloudscraper.create_scraper()
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        })

    def _get_soup(self, url):
        try:
            resp = self.cs.get(url, timeout=15)
            resp.raise_for_status()
            return BeautifulSoup(resp.content, "lxml")
        except Exception as e1:
            print(f"cloudscraper failed: {e1}")
            try:
                resp = self.session.get(url, timeout=15)
                resp.raise_for_status()
                return BeautifulSoup(resp.content, "lxml")
            except Exception as e2:
                print(f"requests fallback also failed: {e2}")
                return None

    def get_ongoing(self, page=1):
        url = f"{self.BASE_URL}/ongoing-anime/page/{page}/" if page > 1 else f"{self.BASE_URL}/ongoing-anime/"
        soup = self._get_soup(url)
        if not soup: return []

        anime_list = []
        items = soup.select(".venz ul li") or soup.select(".post-show ul li") or soup.select(".listupd .bs")

        if not items:
            items = soup.find_all("article", class_="bs")

        for item in items:
            try:
                if item.name == "article":
                    title = item.find("h2").text.strip() if item.find("h2") else ""
                    link = item.find("a")["href"] if item.find("a") else ""
                    thumb = item.find("img")["src"] if item.find("img") else ""
                    ep = item.find("span", class_="epx").text.strip() if item.find("span", class_="epx") else ""
                else:
                    title = item.find("h2").text.strip() if item.find("h2") else ""
                    link = item.find("a")["href"] if item.find("a") else ""
                    thumb = item.find("img")["src"] if item.find("img") else ""
                    ep = item.find("div", class_="epz").text.strip() if item.find("div", class_="epz") else ""

                if title and link:
                    anime_id = link.split("/")[-2]
                    anime_list.append({
                        "title": title,
                        "link": link,
                        "id": anime_id,
                        "thumb": thumb,
                        "episode": ep
                    })
            except Exception as e:
                print(f"Error parsing item: {e}")

        return anime_list

    def get_movies(self, page=1):
        url = f"{self.BASE_URL}/complete-anime/page/{page}/" if page > 1 else f"{self.BASE_URL}/complete-anime/"
        soup = self._get_soup(url)
        if not soup: return []

        anime_list = []
        items = soup.select(".venz ul li") or soup.select(".post-show ul li") or soup.select(".listupd .bs")

        for item in items:
            try:
                title = item.find("h2").text.strip() if item.find("h2") else ""
                link = item.find("a")["href"] if item.find("a") else ""
                thumb = item.find("img")["src"] if item.find("img") else ""

                if title and link:
                    anime_id = link.split("/")[-2]
                    anime_list.append({
                        "title": title,
                        "link": link,
                        "id": anime_id,
                        "thumb": thumb
                    })
            except Exception as e:
                print(f"Error parsing movie item: {e}")
        return anime_list

    def search(self, query):
        search_url = f"{self.BASE_URL}/?s={urllib.parse.quote(query)}&post_type=anime"
        soup = self._get_soup(search_url)
        if not soup: return []

        results = []
        items = soup.select("article.bs") or soup.select("ul.chivsrc li")

        for item in items:
            try:
                title = item.find("h2").text.strip() if item.find("h2") else ""
                link = item.find("a")["href"] if item.find("a") else ""
                thumb = item.find("img")["src"] if item.find("img") else ""

                status = item.find("div", class_="status").text.strip() if item.find("div", class_="status") else "Unknown"

                if title and link:
                    anime_id = link.split("/")[-2]
                    results.append({
                        "title": title,
                        "link": link,
                        "id": anime_id,
                        "thumb": thumb,
                        "status": status
                    })
            except Exception as e:
                print(f"Error parsing search item: {e}")
        return results

    def get_details(self, anime_id):
        print(f"DEBUG: get_details called for {anime_id}")
        if "-episode-" in anime_id or "-eps-" in anime_id:
            for ep_path in [f"episode/{anime_id}", anime_id]:
                test_url = f"{self.BASE_URL}/{ep_path}/"
                soup = self._get_soup(test_url)
                if soup:
                    print(f"DEBUG: Resolving episode link {test_url}")
                    series_link = soup.find("a", href=lambda x: x and ("/series/" in x or "/anime/" in x))
                    if series_link:
                        anime_id = series_link["href"].split("/")[-2]
                        print(f"DEBUG: Resolved to series ID {anime_id}")
                    break
        
        # Fallback regex guess if still has episode pattern
        if "-episode-" in anime_id:
            anime_id = re.sub(r'-episode-\d+', '', anime_id)
            print(f"DEBUG: Regex resolved to series ID {anime_id}")
        elif "-eps-" in anime_id:
            anime_id = re.sub(r'-eps-\d+', '', anime_id)
            print(f"DEBUG: Regex resolved to series ID {anime_id}")

        soup = None
        for path in ["series", "anime"]:
            url = f"{self.BASE_URL}/{path}/{anime_id}/"
            print(f"DEBUG: Trying {url}")
            soup = self._get_soup(url)
            if soup and (soup.select_one(".infox") or soup.select_one(".infozin")):
                print(f"DEBUG: Found details at {url}")
                break
        if not soup:
            print(f"DEBUG: No details found for {anime_id}")
            return None

        info_div = soup.select_one(".infox .spe") or soup.select_one(".infozin")
        if not info_div:
            info_div = soup.select_one(".infox")

        info = {}
        if info_div:
            for p in info_div.find_all(["p", "span"]):
                text = p.text.strip()
                if ":" in text:
                    parts = text.split(":", 1)
                    if len(parts) == 2:
                        key, val = parts
                        info[key.strip().lower().replace(" ", "_")] = val.strip()

        thumb_div = soup.select_one(".fotoanime img") or soup.select_one(".thumb img") or soup.select_one(".thumbook img")
        thumb = thumb_div["src"] if thumb_div and thumb_div.has_attr("src") else ""

        synopsis = ""
        sinop_div = soup.select_one(".sinopc") or soup.select_one(".sinop") or soup.select_one(".entry-content") or soup.select_one(".mindesc")
        if sinop_div:
            synopsis = sinop_div.text.strip()

        episodes = []
        ep_container = None
        for container in soup.select(".episodelist"):
            if container.find_all("li"):
                ep_container = container
                break
        if not ep_container:
            ep_container = soup.select_one(".eplister")
        if ep_container:
            for li in ep_container.find_all("li"):
                a = li.find("a")
                if a:
                    title_tag = a.select_one(".epl-title")
                    title = title_tag.text.strip() if title_tag else a.text.strip()
                    link = a["href"]
                    episodes.append({
                        "title": title,
                        "link": link,
                        "id": link.split("/")[-2],
                        "date": li.find("span", class_=["zeebr", "epl-date"]).text.strip() if li.find("span", class_=["zeebr", "epl-date"]) else ""
                    })

        title_fallback = anime_id.replace('-', ' ').title()

        return {
            "title": info.get("judul", title_fallback),
            "thumb": thumb,
            "synopsis": synopsis,
            "info": info,
            "episodes": episodes
        }

    def get_schedule(self):
        url = f"{self.BASE_URL}/jadwal-rilis/"
        soup = self._get_soup(url)
        if not soup: return []

        schedule = []
        day_containers = soup.select(".kgjdwl321 > .kglist321")
        if day_containers:
            for container in day_containers:
                day_el = container.select_one("h2")
                if not day_el:
                    continue
                day_name = day_el.text.strip()
                anime_in_day = []
                for a in container.select("ul li a"):
                    href = a.get("href", "")
                    title = a.text.strip()
                    if title and href:
                        anime_id = href.split("/")[-2] if href.endswith("/") else href.split("/")[-1]
                        anime_in_day.append({
                            "title": title,
                            "id": anime_id,
                            "link": href
                        })
                if anime_in_day:
                    schedule.append({"day": day_name, "anime": anime_in_day})
            return schedule

        day_containers = soup.select(".bixbox.schedulepage")

        if not day_containers:
            for h3 in soup.find_all("h3"):
                day_name = h3.text.strip()
                if day_name.lower() in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"]:
                    anime_in_day = []
                    curr = h3.find_next_sibling()
                    while curr and curr.name != "h3":
                        for a in curr.find_all("a", href=True):
                            title = a.text.strip()
                            href = a["href"]
                            if title and "/series/" in href:
                                clean_title = re.sub(r'^\d+:\d+\s+\d+\s+', '', title).strip()
                                anime_in_day.append({
                                    "title": clean_title or title,
                                    "id": href.split("/")[-2],
                                    "link": href
                                })
                        curr = curr.find_next_sibling()

                    if anime_in_day:
                        schedule.append({"day": day_name, "anime": anime_in_day})
        else:
            for container in day_containers:
                day_el = container.select_one("h3") or container.select_one(".sett")
                day_name = day_el.text.strip() if day_el else "Unknown"

                anime_in_day = []
                for a in container.select(".listupd a") or container.select("a"):
                    title = a.text.strip()
                    href = a.get("href", "")
                    if title and "/series/" in href:
                        clean_title = re.sub(r'^\d+:\d+\s+\d+\s+', '', title).strip()
                        anime_in_day.append({
                            "title": clean_title or title,
                            "id": href.split("/")[-2],
                            "link": href
                        })

                if anime_in_day:
                    schedule.append({"day": day_name, "anime": anime_in_day})

        return schedule

    def _resolve_desustream(self, desustream_url):
        if not desustream_url:
            return ""
        if "desustream.info" not in desustream_url:
            return desustream_url
        try:
            json_url = f"{desustream_url}&mode=json"
            resp = self.session.get(json_url, timeout=10)
            if resp.ok:
                data = resp.json()
                video_url = data.get("video", "")
                if video_url:
                    print(f"DEBUG: Resolved desustream to direct URL")
                    return video_url
        except Exception as e:
            print(f"Error resolving desustream URL: {e}")
        return desustream_url

    def get_stream(self, episode_id):
        print(f"DEBUG: get_stream called for {episode_id}")
        soup = None
        for path in [f"episode/{episode_id}", episode_id]:
            url = f"{self.BASE_URL}/{path}/"
            soup = self._get_soup(url)
            if soup:
                print(f"DEBUG: Found stream page at {url}")
                break
        if not soup: return None

        streams = []

        mirror_groups = soup.select(".mirrorstream ul[class^='m']")
        if mirror_groups:
            main_iframe = soup.select_one(".responsive-embed-stream iframe") or soup.select_one("#embed_holder iframe")
            desustream_url = main_iframe["src"] if main_iframe and main_iframe.has_attr("src") else ""
            direct_url = self._resolve_desustream(desustream_url)

            for group in mirror_groups:
                classes = group.get("class", [])
                quality = "480p"
                for cls in classes:
                    if cls.startswith("m") and len(cls) > 1:
                        quality = cls[1:]
                        break
                mirrors = []
                for a in group.select("li a"):
                    name = a.text.strip()
                    if name:
                        mirrors.append({"name": name, "url": direct_url})
                if mirrors:
                    streams.append({"quality": quality, "mirrors": mirrors})

        if not streams:
            quality_labels = ["360p", "480p", "720p", "1080p", "480p", "360p"]
            mvelements = soup.select(".megavid .mvelement")
            if not mvelements:
                mvelements = [soup]

            for q_idx, mvel in enumerate(mvelements):
                block_quality = ""
                label_el = mvel.select_one(".quality-label, .res-label, [class*='quality'], [class*='res']")
                if label_el:
                    block_quality = label_el.text.strip()
                if not block_quality:
                    block_quality = quality_labels[q_idx] if q_idx < len(quality_labels) else f"Q{q_idx+1}"

                for opt in mvel.select("select.mirror option"):
                    val = opt.get("value", "").strip()
                    if not val:
                        continue
                    label = opt.text.strip()
                    current_quality = block_quality
                    res_match = re.search(r'(\d{3,4}p)', label)
                    if res_match:
                        current_quality = res_match.group(1)
                        label = label.replace(current_quality, "").replace("-", "").strip()
                    server_idx = opt.get("data-index", "1")
                    try:
                        decoded_html = base64.b64decode(val).decode("utf-8")
                        tmp = BeautifulSoup(decoded_html, "html.parser")
                        iframe = tmp.find("iframe")
                        iframe_src = iframe["src"] if iframe and iframe.has_attr("src") else ""
                        iframe_src = self._resolve_desustream(iframe_src)
                    except Exception:
                        iframe_src = ""

                    if iframe_src:
                        existing_stream = next((s for s in streams if s["quality"] == current_quality), None)
                        mirror_data = {"name": label or f"Server {server_idx}", "url": iframe_src}
                        if existing_stream:
                            existing_stream["mirrors"].append(mirror_data)
                        else:
                            streams.append({"quality": current_quality, "mirrors": [mirror_data]})

        if not streams:
            iframe = soup.select_one("iframe")
            if iframe and iframe.has_attr("src"):
                url = self._resolve_desustream(iframe["src"])
                streams.append({"quality": "480p", "mirrors": [{"name": "Server 1", "url": url}]})

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
