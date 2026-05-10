import requests
from bs4 import BeautifulSoup
import urllib.parse
import base64
import re

class OtakudesuScraper:
    BASE_URL = "https://otakudesu.fit"

    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": self.BASE_URL
        }

    def _get_soup(self, url):
        try:
            # Reverting to verify=True but with a more modern User-Agent
            # If it still fails with 525, we will try verify=False as a fallback
            response = requests.get(url, headers=self.headers, timeout=15)
            print(f"DEBUG: Fetched {url} - Status: {response.status_code}")
            response.raise_for_status()
            return BeautifulSoup(response.content, "html.parser")
        except Exception as e:
            print(f"Error fetching {url}: {e}")
            # Try fallback with verify=False if it was an SSL error
            if "SSL" in str(e) or "handshake" in str(e) or "525" in str(e):
                try:
                    print(f"DEBUG: SSL Error detected, retrying {url} with verify=False")
                    response = requests.get(url, headers=self.headers, timeout=15, verify=False)
                    return BeautifulSoup(response.content, "html.parser")
                except: pass
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
        # Search results use article.bs
        items = soup.select("article.bs") or soup.select(".chivz ul li")
        
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
        # If it looks like an episode link, try to resolve it to a series link
        if "-episode-" in anime_id or "-eps-" in anime_id:
            ep_url = f"{self.BASE_URL}/{anime_id}/"
            print(f"DEBUG: Resolving episode link {ep_url}")
            soup = self._get_soup(ep_url)
            if soup:
                # Find the series link - usually in the breadcrumb or a specific link
                series_link = soup.find("a", href=lambda x: x and "/series/" in x)
                if series_link:
                    anime_id = series_link["href"].split("/")[-2]
                    print(f"DEBUG: Resolved to series ID {anime_id}")

        # Try /series/ first, then /anime/
        soup = None
        for path in ["series", "anime"]:
            url = f"{self.BASE_URL}/{path}/{anime_id}/"
            print(f"DEBUG: Trying {url}")
            soup = self._get_soup(url)
            if soup and (soup.select_one(".infox") or soup.select_one(".infozin")):
                print(f"DEBUG: Found details at {url}")
                break
        else:
            print(f"DEBUG: No details found for {anime_id}")
            return None

        # Info block
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

        # Thumbnail
        thumb_div = soup.select_one(".fotoanime img") or soup.select_one(".thumb img") or soup.select_one(".thumbook img")
        thumb = thumb_div["src"] if thumb_div and thumb_div.has_attr("src") else ""
        
        # Synopsis
        synopsis = ""
        sinop_div = soup.select_one(".sinop") or soup.select_one(".entry-content") or soup.select_one(".mindesc")
        if sinop_div:
            synopsis = sinop_div.text.strip()

        # Episode List
        episodes = []
        # Themes vary: .episodelist or .eplister
        ep_container = soup.select_one(".episodelist") or soup.select_one(".eplister")
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
        # Try different container patterns
        day_containers = soup.select(".bixbox.schedulepage")
        
        if not day_containers:
            # Fallback: Find days by h3 tags and collect next until next h3
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

    def get_stream(self, episode_id):
        print(f"DEBUG: get_stream called for {episode_id}")
        url = f"{self.BASE_URL}/{episode_id}/"
        soup = self._get_soup(url)
        if not soup: return None

        # --- Streaming Mirrors ---
        # New Otakudesu uses select.mirror with Base64-encoded iframe HTML as option values.
        # Each option represents one streaming server.
        # Quality tabs (360p/480p/720p) appear as separate .mvelement blocks inside .megavid.
        streams = []
        quality_labels = ["360p", "480p", "720p", "1080p", "480p", "360p"]

        # Each .mvelement block = one quality level
        mvelements = soup.select(".megavid .mvelement")
        if not mvelements:
            # Fallback: treat the whole page as one quality group
            mvelements = [soup]

        for q_idx, mvel in enumerate(mvelements):
            # Try to detect quality from heading/label text in this block
            block_quality = ""
            label_el = mvel.select_one(".quality-label, .res-label, [class*='quality'], [class*='res']")
            if label_el:
                block_quality = label_el.text.strip()
            
            # If not found in label_el, use index as fallback
            if not block_quality:
                block_quality = quality_labels[q_idx] if q_idx < len(quality_labels) else f"Q{q_idx+1}"

            mirrors_in_block = []
            for opt in mvel.select("select.mirror option"):
                val = opt.get("value", "").strip()
                if not val:
                    continue
                label = opt.text.strip()
                
                # IMPORTANT: Check if the label contains quality (e.g., "Gdrive - 720p")
                # If so, we might need to override the block_quality
                current_quality = block_quality
                res_match = re.search(r'(\d{3,4}p)', label)
                if res_match:
                    current_quality = res_match.group(1)
                    # Clean the label to remove quality info for cleaner UI
                    label = label.replace(current_quality, "").replace("-", "").strip()

                server_idx = opt.get("data-index", str(len(mirrors_in_block) + 1))
                try:
                    decoded_html = base64.b64decode(val).decode("utf-8")
                    tmp = BeautifulSoup(decoded_html, "html.parser")
                    iframe = tmp.find("iframe")
                    iframe_src = iframe["src"] if iframe and iframe.has_attr("src") else ""
                except Exception:
                    iframe_src = ""

                if iframe_src:
                    # Check if this quality already exists in streams
                    existing_stream = next((s for s in streams if s["quality"] == current_quality), None)
                    mirror_data = {
                        "name": label or f"Server {server_idx}",
                        "url": iframe_src
                    }
                    
                    if existing_stream:
                        existing_stream["mirrors"].append(mirror_data)
                    else:
                        streams.append({
                            "quality": current_quality,
                            "mirrors": [mirror_data]
                        })

        # If we got nothing from mvelements, use the first iframe on the page
        if not streams:
            iframe = soup.select_one("iframe")
            if iframe and iframe.has_attr("src"):
                streams.append({
                    "quality": "360p",
                    "mirrors": [{"name": "Server 1", "url": iframe["src"]}]
                })

        # --- Download Links ---
        downloads = []

        # NEW structure: look for external download anchor links (GoFile, Mega, GDrive, etc.)
        download_patterns = re.compile(
            r'gofile\.io|mega\.nz|drive\.google|1drv\.ms|mediafire|zippyshare|pixeldrain|acefile|solidfiles',
            re.IGNORECASE
        )
        seen_urls = set()
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if download_patterns.search(href) and href not in seen_urls:
                seen_urls.add(href)
                link_text = a.get_text(strip=True) or "Download"
                downloads.append({
                    "resolution": "Download",
                    "links": [{"name": link_text, "url": href}]
                })

        # OLD structure fallback: .download li with strong tags
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

        return {
            "streams": streams,
            "downloads": downloads
        }


if __name__ == "__main__":
    scraper = OtakudesuScraper()
    print("Testing Ongoing...")
    ongoing = scraper.get_ongoing()
    print(f"Found {len(ongoing)} ongoing anime.")
    if ongoing:
        print(f"First one: {ongoing[0]['title']}")
    
    print("\nTesting Search 'One Piece'...")
    search_res = scraper.search("One Piece")
    print(f"Found {len(search_res)} results.")
    if search_res:
        print(f"First result: {search_res[0]['title']}")
        print(f"Details for {search_res[0]['id']}...")
        details = scraper.get_details(search_res[0]['id'])
        if details:
            print(f"Episodes: {len(details['episodes'])}")
