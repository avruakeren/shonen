import requests
from bs4 import BeautifulSoup

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
}

url = 'http://otakudesu.blog/jadwal-rilis/'
r = requests.get(url, headers=headers)
soup = BeautifulSoup(r.content, 'html.parser')

print(f"Status Code: {r.status_code}")
print(f"Content Length: {len(r.content)}")

# Look for all h1, h2, h3
print("\n--- Header Tags ---")
for h in soup.find_all(['h1', 'h2', 'h3', 'h4']):
    print(f"Tag: {h.name}, Text: {h.text.strip()}")

# Look for any container that looks like a schedule
print("\n--- Containers with many links ---")
for div in soup.find_all('div'):
    links = div.find_all('a')
    if len(links) > 20:
        classes = div.get('class', [])
        print(f"Div with {len(links)} links, classes: {classes}")
        # Show first 5 links
        for a in links[:5]:
            print(f"  Link: {a.text.strip()} -> {a.get('href')}")
