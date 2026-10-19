"""Seasonal & top-rated anime metadata for the home page.

Both sections are fed from MyAnimeList data, but we deliberately support two
upstream providers because neither is reachable everywhere:

- **AniList** (GraphQL) is tried first: it is keyless, CORS-open, and very
  reliable from most networks.
- **Jikan** (the unofficial MyAnimeList API) is the fallback, since it is the
  source the frontend was originally written against but it is frequently
  unreachable or rate-limited depending on the network / region.

Whatever provider answers, the payload is normalised into the MyAnimeList
shape the frontend already renders:

    {
      "title": "...",
      "title_english": "...",
      "images": {"webp": {"large_image_url": "..."}},
      "score": 85.0,          # 0-10 scale, None when unknown
      "rank": 1,
      "season": "fall",       # seasonal list only
      "year": 2026            # seasonal list only
    }
"""

import datetime
import logging

import requests

log = logging.getLogger(__name__)

ANILIST_URL = "https://graphql.anilist.co"
JIKAN_URL = "https://api.jikan.moe/v4"
TIMEOUT = 12
LIMIT = 12
# Both providers page their responses and a single page never covers a whole
# week, so the schedule is assembled from a bounded number of pages.
SCHEDULE_ANILIST_PAGES = 2  # AniList caps perPage at 50
SCHEDULE_JIKAN_PAGES = 4    # Jikan caps perPage at 25
_SCHEDULE_DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
# Anime air times are the source of truth for "which day is this on", and the
# schedule view means the Japanese broadcast day -- so times are read in JST.
_JST = datetime.timezone(datetime.timedelta(hours=9))

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Content-Type": "application/json",
}

_SEASONAL_QUERY = """
query ($season: MediaSeason, $year: Int, $perPage: Int) {
  Page(page: 1, perPage: $perPage) {
    media(
      season: $season,
      seasonYear: $year,
      type: ANIME,
      sort: POPULARITY_DESC,
      status_in: [RELEASING, NOT_YET_RELEASED]
    ) {
      id
      title { romaji english }
      coverImage { large extraLarge }
      averageScore
      episodes
      format
      status
      season
      seasonYear
    }
  }
}
"""

_TOP_QUERY = """
query ($perPage: Int) {
  Page(page: 1, perPage: $perPage) {
    media(type: ANIME, sort: SCORE_DESC, isAdult: false) {
      id
      title { romaji english }
      coverImage { large extraLarge }
      averageScore
      meanScore
      popularity
    }
  }
}
"""

# Each currently airing show contributes its next episode, which between them
# cover the coming week -- a lot cheaper than paging every airing in it.
_SCHEDULE_QUERY = """
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC) {
      id
      title { romaji english }
      airingSchedule(notYetAired: true, perPage: 1) {
        nodes { airingAt }
      }
    }
  }
}
"""


def _current_season():
    """Map the current month to the anime season (WINTER/SPRING/SUMMER/FALL)."""
    now = datetime.datetime.now(datetime.UTC)
    season = ["WINTER", "SPRING", "SUMMER", "FALL"][(now.month % 12) // 3]
    return season, now.year


def _normalise(title_romaji, title_english, image, score, rank, season=None, year=None):
    english = (title_english or "").strip()
    romaji = (title_romaji or "").strip()
    return {
        "title": english or romaji,
        "title_english": english or None,
        "images": {"webp": {"large_image_url": image or ""}},
        "score": score,
        "rank": rank,
        "season": season,
        "year": year,
    }


def _anilist_page(query, variables=None):
    resp = requests.post(
        ANILIST_URL,
        json={"query": query, "variables": variables or {}},
        headers=_HEADERS,
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    payload = resp.json()
    if payload.get("errors"):
        raise ValueError("AniList error: " + str(payload["errors"])[:200])
    return payload.get("data", {}).get("Page") or {}


def _anilist_request(query, variables=None):
    return _anilist_page(query, variables).get("media") or []


def _anilist_seasonal(limit):
    season, year = _current_season()
    media = _anilist_request(_SEASONAL_QUERY, {"season": season, "year": year, "perPage": limit})
    items = []
    for i, m in enumerate(media[:limit]):
        title = m.get("title") or {}
        cover = m.get("coverImage") or {}
        raw_score = m.get("averageScore")
        items.append(_normalise(
            title_romaji=title.get("romaji"),
            title_english=title.get("english"),
            image=cover.get("extraLarge") or cover.get("large"),
            score=round(raw_score / 10.0, 2) if raw_score else None,
            rank=i + 1,
            season=season.lower(),
            year=year,
        ))
    return items


def _anilist_top(limit):
    media = _anilist_request(_TOP_QUERY, {"perPage": limit})
    items = []
    for i, m in enumerate(media[:limit]):
        title = m.get("title") or {}
        cover = m.get("coverImage") or {}
        raw_score = m.get("averageScore") or m.get("meanScore")
        items.append(_normalise(
            title_romaji=title.get("romaji"),
            title_english=title.get("english"),
            image=cover.get("extraLarge") or cover.get("large"),
            score=round(raw_score / 10.0, 2) if raw_score else None,
            rank=i + 1,
        ))
    return items


def _jikan_payload(path, params):
    resp = requests.get(JIKAN_URL + path, params=params, headers=_HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()
    payload = resp.json()
    if payload.get("status") and int(payload["status"]) >= 400:
        raise ValueError("Jikan error: " + str(payload.get("message"))[:200])
    return payload


def _jikan_request(path, params):
    return _jikan_payload(path, params).get("data") or []


def _jikan_seasonal(limit):
    season, year = _current_season()
    media = _jikan_request("/seasons/now", {"limit": limit})
    items = []
    for i, m in enumerate(media[:limit]):
        images = m.get("images") or {}
        webp = images.get("webp") or {}
        jpg = images.get("jpg") or {}
        items.append(_normalise(
            title_romaji=m.get("title"),
            title_english=m.get("title_english"),
            image=webp.get("large_image_url") or jpg.get("large_image_url"),
            score=m.get("score"),
            rank=i + 1,
            season=(m.get("season") or season).lower(),
            year=m.get("year") or year,
        ))
    return items


def _jikan_top(limit):
    media = _jikan_request("/top/anime", {"limit": limit})
    items = []
    for i, m in enumerate(media[:limit]):
        images = m.get("images") or {}
        webp = images.get("webp") or {}
        jpg = images.get("jpg") or {}
        items.append(_normalise(
            title_romaji=m.get("title"),
            title_english=m.get("title_english"),
            image=webp.get("large_image_url") or jpg.get("large_image_url"),
            score=m.get("score"),
            rank=m.get("rank") or i + 1,
        ))
    return items


def _anilist_schedule(limit=LIMIT):
    """The coming week, bucketed by Japanese broadcast day.

    Which day an episode belongs to is a timezone question, so airing times are
    converted to JST first -- the day the show actually airs in Japan, which is
    also what the Jikan fallback reports, so the two providers agree.
    """
    buckets = {day: [] for day in _SCHEDULE_DAYS}
    seen = set()
    for page in range(1, SCHEDULE_ANILIST_PAGES + 1):
        media = _anilist_request(_SCHEDULE_QUERY, {"page": page, "perPage": 50})
        if not media:
            break
        for m in media:
            nodes = (m.get("airingSchedule") or {}).get("nodes") or []
            title = m.get("title") or {}
            name = (title.get("english") or title.get("romaji") or "").strip()
            airing_at = nodes[0].get("airingAt") if nodes else None
            if not name or not airing_at or name in seen:
                continue
            seen.add(name)
            day = datetime.datetime.fromtimestamp(airing_at, _JST).strftime("%A").lower()
            if day in buckets:
                buckets[day].append({"title": name, "id": ""})

    return [
        {"day": day.capitalize(), "anime": buckets[day]}
        for day in _SCHEDULE_DAYS if buckets[day]
    ]


def _jikan_schedule(limit=LIMIT):
    """The weekly broadcast schedule, grouped the way the schedule view draws it."""
    buckets = {day: [] for day in _SCHEDULE_DAYS}
    for page in range(1, SCHEDULE_JIKAN_PAGES + 1):
        payload = _jikan_payload("/schedules", {"page": page})
        rows = payload.get("data") or []
        if not rows:
            break
        for ep in rows:
            day = ((ep.get("broadcast") or {}).get("day") or "").lower()
            if day not in buckets:
                continue
            buckets[day].append({
                "title": ep.get("title_english") or ep.get("title") or "",
                # Samehadaku is keyed by slug, not by MAL id, so the view
                # searches by title rather than linking straight to a series.
                "id": "",
            })
        if not (payload.get("pagination") or {}).get("has_next_page"):
            break

    return [
        {"day": day.capitalize(), "anime": buckets[day]}
        for day in _SCHEDULE_DAYS if buckets[day]
    ]


def _pick(fetchers, limit):
    """Try each provider in order; return the first non-empty result."""
    last_error = None
    for fetcher in fetchers:
        try:
            items = fetcher(limit)
            if items:
                return items
            log.warning("%s returned no items", fetcher.__name__)
        except Exception as exc:  # network / rate-limit / schema failures
            last_error = exc
            log.warning("%s failed: %s", fetcher.__name__, exc)
    if last_error is not None:
        log.error("every metadata provider failed: %s", last_error)
    return None


def get_seasonal(limit=LIMIT):
    """Currently airing seasonal anime, newest season first."""
    return _pick([_anilist_seasonal, _jikan_seasonal], limit)


def get_top(limit=LIMIT):
    """All-time top rated anime."""
    return _pick([_anilist_top, _jikan_top], limit)


def get_schedule(limit=LIMIT):
    """Weekly broadcast schedule (Monday..Sunday, days without airings dropped).

    AniList leads because it is keyless and reliable, matching the other two
    sections; Jikan fills in where Jikan is reachable and AniList is not.
    """
    return _pick([_anilist_schedule, _jikan_schedule], limit)
