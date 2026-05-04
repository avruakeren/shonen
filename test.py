import requests
from bs4 import BeautifulSoup
url = "https://otakudesu.fit"
headers = {"User-Agent": "Mozilla/5.0"}
soup = BeautifulSoup(requests.get(url, headers=headers).content, "html.parser")
items = soup.select(".venz ul li")
print(f"Items found (.venz ul li): {len(items)}")
if items:
    print(items[0].prettify())
else:
    print("Trying other selectors...")
    items = soup.select(".post-show ul li") or soup.select(".listupd .bs")
    print(f"Items found: {len(items)}")
    if items:
        print(items[0].prettify())
