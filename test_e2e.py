# -*- coding: utf-8 -*-
import sys, io, json, time, re, requests
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE = "http://127.0.0.1:5000"

# Wait for the dev server to come up (Flask boots in a couple of seconds).
for _ in range(60):
    try:
        requests.get(BASE + "/api/test", timeout=2)
        break
    except Exception:
        time.sleep(1)
else:
    print("SERVER NEVER CAME UP")
    sys.exit(1)

def get(path, timeout=40):
    try:
        r = requests.get(BASE + path, timeout=timeout)
        return r.status_code, r.json()
    except Exception as e:
        return None, {"error": f"{type(e).__name__}: {e}"}

def head(label, ok):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}")

print("=== API smoke test ===")

code, d = get("/api/test")
head(f"/api/test -> {code}", code == 200 and d.get("status") == "ok")

code, d = get("/api/seasonal")
items = d if isinstance(d, list) else []
head(f"/api/seasonal -> {code}, {len(items)} items", code == 200 and len(items) >= 5)
if items:
    print(f"        e.g. {items[0]['title']} | score={items[0]['score']} | season={items[0]['season']}")

code, d = get("/api/top")
items = d if isinstance(d, list) else []
head(f"/api/top -> {code}, {len(items)} items", code == 200 and len(items) >= 5)
if items:
    print(f"        e.g. #{items[0]['rank']} {items[0]['title']} | score={items[0]['score']}")

# second call should hit cache (fast)
t0 = time.time(); get("/api/top"); dt = time.time() - t0
head(f"/api/top cached ({dt:.2f}s)", dt < 2)

code, d = get("/api/ongoing")
items = d if isinstance(d, list) else []
head(f"/api/ongoing -> {code}, {len(items)} items", code == 200 and len(items) > 0)

if items:
    ep_link = items[0]["link"].rstrip("/")
    ep_id = ep_link.rsplit("/", 1)[-1]
    anime_id = items[0]["id"]

    code, d = get(f"/api/details/{anime_id}")
    head(f"/api/details/{anime_id} -> {code}", code == 200 and isinstance(d, dict) and d.get("episodes"))
    eps = (d or {}).get("episodes", [])
    if eps:
        target = eps[-1]["id"]
    else:
        target = ep_id
        code, d = get(f"/api/details/{ep_id}")

    code, d = get(f"/api/stream/{target}")
    streams = (d or {}).get("streams", [])
    mirrors = [m for q in streams for m in q["mirrors"]]
    good = any(m["url"].startswith("http") and "about:blank" not in m["url"] for m in mirrors)
    head(f"/api/stream/{target[:50]} -> {code}, {len(streams)} quality groups, {len(mirrors)} mirrors", code == 200 and good)
    for q in streams:
        for m in q["mirrors"]:
            print(f"        {q['quality']} / {m['name']} -> {m['url'][:88]}")
    if (d or {}).get("downloads"):
        print(f"        downloads: {[(x['resolution'], len(x['links'])) for x in d['downloads']]}")

code, d = get("/api/search?q=one+piece")
head(f"/api/search -> {code}, {len(d) if isinstance(d, list) else d}", code == 200 and isinstance(d, list) and len(d) > 0)

print("\n=== Frontend asset check ===")
# Read the expected cache name from the source so bumping CACHE_NAME in
# sw.js doesn't silently make this assertion go stale.
with open("sw.js", encoding="utf-8") as fh:
    cache_name = re.search(r"CACHE_NAME\s*=\s*'([^']+)'", fh.read()).group(1)

for path, needle in [("/", "seasonalGrid"), ("/", "topGrid"), ("/script.js", "loadMalSection"),
                     ("/watch.js", "playEpisode"), ("/watch.js", "setEpisodeCountBadge"),
                     ("/sw.js", cache_name)]:
    try:
        r = requests.get(BASE + path, timeout=15)
        found = needle in r.text
        head(f"{path} contains '{needle}'", r.status_code == 200 and found)
    except Exception as e:
        head(f"{path} -> {e}", False)
