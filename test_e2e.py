# -*- coding: utf-8 -*-
import sys, io, json, time, re, requests, urllib.parse
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

# The homepage badges the newest episode, but a series page lags one behind
# and leaves it out of its own list -- so watch.html used to open one episode
# short of the card that was clicked. scraper._follow_newest_episodes() walks
# the episode pages' rel="next" chain to close that gap. Sample a few badged
# titles: the detail list has to reach the number on the card.
print("\n=== Detail list reaches the homepage badge ===")
sampled = matched = 0
for item in items:
    if sampled >= 3:
        break
    badge = int(re.sub(r"\D", "", item.get("episode", "")) or 0)
    if badge < 2:
        continue
    code, d = get("/api/details/" + urllib.parse.quote(item["id"], safe=""), timeout=90)
    eps = (d or {}).get("episodes") or []
    sampled += 1
    matched += 1 if len(eps) >= badge else 0
    head(f"{item['id'][:40]} -> {len(eps)} eps, badge says {item['episode']}",
         code == 200 and len(eps) >= badge)

head(f"{matched}/{sampled} sampled titles reach their badge", sampled > 0 and matched == sampled)

print("\n=== A listing's episode survives the details round trip ===")
# watch.html arrives with the episode the card advertised (?ep=) and a ?t=
# cache-buster, and the API has to hand that episode back -- fresh, once.
card = next((it for it in items if it.get("episode_id")), None)
if card:
    query = "/api/details/%s?t=1&ep=%s" % (
        urllib.parse.quote(card["id"], safe=""),
        urllib.parse.quote(card["episode_id"], safe=""),
    )
    code, d = get(query, timeout=120)
    eps = (d or {}).get("episodes") or []
    ids = [e["id"] for e in eps]
    head(f"hinted {card['id'][:30]} -> {len(eps)} eps, hint present",
         code == 200 and card["episode_id"] in ids)
    head("hinted list has no duplicate episodes", len(ids) == len(set(ids)))
    head(f"hint is the newest row ({ids[-1][-30:] if ids else '-'})",
         bool(ids) and ids[-1] == card["episode_id"])
else:
    head("a listing card carried episode_id", False)

code, d = get("/api/search?q=one+piece")
head(f"/api/search -> {code}, {len(d) if isinstance(d, list) else d}", code == 200 and isinstance(d, list) and len(d) > 0)

print("\n=== Frontend asset check ===")
# Read the expected version from the source so bumping it in sw.js doesn't
# silently make these assertions go stale.
with open("sw.js", encoding="utf-8") as fh:
    version = re.search(r"VERSION\s*=\s*'([^']+)'", fh.read()).group(1)

# The pages ask for style.css?v=... so a worker still holding the previous
# cache misses rather than answering with the old stylesheet. That only holds
# while the number in the HTML matches the one in sw.js.
for page, script in (("index.html", "script.js"), ("watch.html", "watch.js")):
    with open(page, encoding="utf-8") as fh:
        html = fh.read()
    wanted = [f"style.css?v={version}", f"{script}?v={version}"]
    head(f"{page} asks for v={version}", all(w in html for w in wanted))

for path, needle in [("/", "seasonalGrid"), ("/", "topGrid"), ("/script.js", "loadMalSection"),
                     ("/watch.js", "playEpisode"), ("/watch.js", "setEpisodeCountBadge"),
                     ("/sw.js", f"VERSION = '{version}'")]:
    try:
        r = requests.get(BASE + path, timeout=15)
        found = needle in r.text
        head(f"{path} contains '{needle}'", r.status_code == 200 and found)
    except Exception as e:
        head(f"{path} -> {e}", False)

print("\n=== Only the frontend's own files are served ===")
# The catch-all used to hand out the whole deploy directory, source included.
for path, expect in [("/index.html", 200), ("/style.css", 200), ("/watch.js", 200),
                     ("/sw.js", 200), ("/manifest.json", 200), ("/icon.png", 200),
                     ("/app.py", 404), ("/scraper.py", 404), ("/mal.py", 404),
                     ("/requirements.txt", 404), ("/vercel.json", 404),
                     ("/.gitignore", 404), ("/.git/config", 404),
                     ("/test_css.py", 404), ("/deploy.bat", 404)]:
    try:
        r = requests.get(BASE + path, timeout=15)
        head(f"{path} -> {r.status_code} (want {expect})", r.status_code == expect)
    except Exception as e:
        head(f"{path} -> {e}", False)

print("\n=== /api/img is not an open proxy ===")
for label, target in [("loopback service", "http://127.0.0.1:5000/api/test"),
                      ("unrelated host", "http://example.com/"),
                      ("non-http scheme", "file:///etc/passwd"),
                      ("cloud metadata", "http://169.254.169.254/latest/meta-data/")]:
    r = requests.get(BASE + "/api/img", params={"u": target}, timeout=25)
    head(f"{label} refused -> {r.status_code}", r.status_code == 403)

thumb = next((it.get("thumb", "") for it in items if str(it.get("thumb", "")).startswith("/api/img")), "")
if thumb:
    r = requests.get(BASE + thumb, timeout=40)
    ctype = r.headers.get("Content-Type", "")
    head(f"a real thumbnail still proxies ({ctype})", r.status_code == 200 and ctype.startswith("image/"))
else:
    head("no proxied thumbnail to sample", False)

print("\n=== A missing title is a 404, not a 502 ===")
for path in ["/api/details/this-title-does-not-exist-9f3a2b",
             "/api/stream/this-episode-does-not-exist-9f3a2b"]:
    code, _d = get(path, timeout=90)
    head(f"{path[:52]} -> {code}", code == 404)

print("\n=== /api/library and /api/schedule ===")
code, d = get("/api/library?page=2", timeout=90)
lib = d if isinstance(d, list) else []
head(f"/api/library?page=2 -> {code}, {len(lib)} items", code == 200 and len(lib) > 0)

code, d = get("/api/schedule", timeout=90)
sched = d if isinstance(d, list) else []
days = [row.get("day", "") for row in sched if isinstance(row, dict)]
total = sum(len(row.get("anime") or []) for row in sched if isinstance(row, dict))
head(f"/api/schedule -> {code}, {len(sched)} days / {total} entries", code == 200 and len(sched) >= 5)
print(f"        days: {days}")
