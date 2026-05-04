import requests
from bs4 import BeautifulSoup
import urllib.parse

class OtakudesuScraper:
    BASE_URL = "https://otakudesu.fit"

    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
            "Referer": self.BASE_URL
        }

    def _get_soup(self, url):
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            print(f"DEBUG: Fetched {url} - Status: {response.status_code} - Length: {len(response.content)}")
            response.raise_for_status()
            return BeautifulSoup(response.content, "html.parser")
        except Exception as e:
            print(f"Error fetching {url}: {e}")
            return None

    def get_ongoing(self):
        soup = self._get_soup(self.BASE_URL)
        if not soup: return []

        anime_list = []
        # The homepage usually has "Latest Release"
        # Based on the markdown, it's a list of links with titles
        # Let's try to find elements that contain "Episode" and a link
        
        # New selector based on typical AnimeRocket theme
        items = soup.select(".venz ul li") or soup.select(".post-show ul li") or soup.select(".listupd .bs")
        
        if not items:
            # Fallback: search for any article with class 'bs'
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

        return {
            "title": info.get("judul", anime_id),
            "thumb": thumb,
            "synopsis": synopsis,
            "info": info,
            "episodes": episodes
        }

    def get_stream(self, episode_id):
        print(f"DEBUG: get_stream called for {episode_id}")
        url = f"{self.BASE_URL}/{episode_id}/"
        soup = self._get_soup(url)
        if not soup: return None
        
        stream_url = None
        iframe = soup.select_one(".responsive-embed-stream iframe") or soup.select_one(".player iframe") or soup.select_one("iframe")
        if iframe and iframe.has_attr("src"):
            stream_url = iframe["src"]
            
        # Download Links
        downloads = []
        dl_container = soup.select_one(".download")
        if dl_container:
            for li in dl_container.select("li"):
                strong = li.select_one("strong")
                if not strong: continue
                res = strong.text.strip()
                links = [{"name": a.text.strip(), "url": a["href"]} for a in li.select("a") if a.has_attr("href")]
                if links:
                    downloads.append({"resolution": res, "links": links})

        return {
            "stream_url": stream_url,
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
