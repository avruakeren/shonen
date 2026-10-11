# -*- coding: utf-8 -*-
"""Sanity checks for the watch-page CSS/JS tidy-up."""
import sys, io, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

css = open("style.css", encoding="utf-8").read()
stripped = re.sub(r"/\*.*?\*/", "", css, flags=re.S)

fails = []
def check(label, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}{(' -- ' + detail) if detail else ''}")
    if not ok:
        fails.append(label)


def top_level_heads(text, media_depth=0):
    """Yield (selector, body, media_depth) for every rule in the stylesheet.

    Tracks brace depth so @media blocks are identified correctly, and keeps
    the full selector list so grouped rules are visible. media_depth > 0 means
    the rule lives inside at least one responsive block."""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    i, start = 0, None
    while i < len(text):
        ch = text[i]
        if ch == "{":
            head = text[start:i].strip() if start is not None else ""
            j, d = i, 0
            while j < len(text):
                if text[j] == "{":
                    d += 1
                elif text[j] == "}":
                    d -= 1
                    if d == 0:
                        break
                j += 1
            body = text[i + 1:j]
            if head.startswith("@media"):
                for item in top_level_heads(body, media_depth + 1):
                    yield item
            elif head and not head.startswith("@"):
                yield head, body, media_depth
            start = None
            i = j + 1
            continue
        if ch in "};":
            start = None
            i += 1
            continue
        if start is None:
            start = i
        i += 1


HEADS = list(top_level_heads(css))


def body_of(sel, media=False):
    for h, b, m in HEADS:
        if h == sel and m == media:
            return b
    return None


print("=== 1. Brace balance (no truncated rule) ===")
check(f"{{ {stripped.count('{')} == }} {stripped.count('}')}",
      stripped.count("{") == stripped.count("}"))
depth, negative = 0, False
for ch in stripped:
    if ch == "{":
        depth += 1
    elif ch == "}":
        depth -= 1
        if depth < 0:
            negative = True
check("no stray closing braces", not negative)
check("ends at depth 0", depth == 0, f"depth={depth}")

print("\n=== 2. No duplicate BASE selectors (the original bug) ===")
# A "base definition" = exact single selector, no pseudo-class, no combinator,
# not inside @media. Grouped and responsive rules are legitimate -> skipped.
for sel in [".server-selector", ".server-btn", ".server-header", ".video-container",
            ".episode-section", ".download-section", ".recommended-section", ".detail-main"]:
    hits = [h for h, _b, media in HEADS if h == sel and not media]
    check(f"{sel} defined once at top level", len(hits) == 1, f"found {len(hits)}")

print("\n=== 3. Dead CSS removed ===")
check(".server-list removed", ".server-list" not in stripped)
check(".episode-grid removed", ".episode-grid" not in stripped)

print("\n=== 4. The actual visual fixes landed ===")
body = body_of(".server-selector") or ""
check("no `margin: 20px` on .server-selector", "margin: 20px" not in body,
      body.strip().replace("\n", " ")[:80])
check("no `margin-bottom: 30px` anywhere in CSS", "margin-bottom: 30px" not in stripped)

body = body_of(".video-container") or ""
check(".video-container has position: relative", "position: relative" in body)
check(".video-container has no margin-bottom", "margin-bottom" not in body)
check(".video-container has no border/box-shadow", "box-shadow" not in body and "border:" not in body)

body = body_of(".detail-main")
check(".detail-main has a rule", body is not None)
check(".detail-main has min-width: 0", bool(body) and "min-width: 0" in body)

print("\n=== 5. Section rhythm (all four share the same card + spacing) ===")
SHARED = {".server-selector", ".episode-section", ".download-section", ".recommended-section"}
grouped = [h for h, _b, m in HEADS
           if not m and set(s.strip() for s in h.split(",")) >= SHARED]
check("shared glass-card rule covers all 4 sections", bool(grouped))
if grouped:
    gb = next(b for h, b, m in HEADS if h == grouped[0])
    check("shared rule has margin-bottom: 20px", "margin-bottom: 20px" in gb)
    check("shared rule has NO padding (download would double up)", "padding" not in gb)
    check("shared rule has the glass surface", "var(--glass)" in gb and "border-radius: 20px" in gb)

# every section must inherit that spacing (i.e. not override it to something else)
for sel in [".server-selector", ".episode-section", ".download-section", ".recommended-section"]:
    b = body_of(sel) or ""
    check(f"{sel} does not override margin-bottom", "margin-bottom" not in b)

print("\n=== 6. Every touched selector still has a consumer (no orphans) ===")
html = open("watch.html", encoding="utf-8").read() + open("index.html", encoding="utf-8").read()
js = open("watch.js", encoding="utf-8").read() + open("script.js", encoding="utf-8").read()
for sel, hint in [
    (".server-selector", "watch.html serverSelector"),
    (".server-btn", "watch.js renderMirrorButtons"),
    (".server-header", "watch.js renderServerSelector"),
    (".video-container", "watch.html mainVideoContainer"),
    (".detail-main", "watch.html detailMain"),
    (".episode-section", "watch.html episodeSection"),
    (".recommended-section", "watch.html recommendedSection"),
    (".download-section", "watch.html downloadSection"),
    (".ep-count-badge", "watch.js setEpisodeCountBadge"),
]:
    cls = sel.lstrip(".")
    check(f"{sel} -> {hint}", cls in html or cls in js)

print("\n=== 7. Badge wired up in JS ===")
check("watch.js defines setEpisodeCountBadge", "function setEpisodeCountBadge" in js)
check("renderEpisodeDropdown calls it", "setEpisodeCountBadge(episodes" in js)
check("badge cleared when count is 0", "if (!count)" in js)

print("\n=== 8. Minimalist layout: controls under the player, info in a modal ===")
watch_html = open("watch.html", encoding="utf-8").read()

# In-flow order: player -> control bar -> download -> recommended.
flow = ["id=\"playerSection\"", "id=\"controlBar\"",
        "id=\"downloadSection\"", "id=\"recommendedSection\""]
pos = [watch_html.find(t) for t in flow]
check("all flow landmarks present", all(p != -1 for p in pos),
      str([t for t, p in zip(flow, pos) if p == -1]))
check("flow landmarks appear in order", pos == sorted(pos), str(pos))

overlay_start = watch_html.find("id=\"infoOverlay\"")
check("infoOverlay exists", overlay_start != -1)
check("infoOverlay sits after the flow, not between controls and download",
      overlay_start > max(pos))
check("#animeInfo lives inside the overlay rather than in the page flow",
      watch_html.find("id=\"animeInfo\"") > overlay_start)

# server + episode must be siblings inside the control bar.
# Slice up to the next landmark rather than the first `</div>`, which would be
# the closer of .episode-header and cut the block short.
cb_block = watch_html[watch_html.find("id=\"controlBar\""):watch_html.find("id=\"recommendedSection\"")]
check("controlBar contains serverSelector", "id=\"serverSelector\"" in cb_block)
check("controlBar contains episodeSection", "id=\"episodeSection\"" in cb_block)
check("controlBar contains downloadSection", "id=\"downloadSection\"" in cb_block)

# JS must still be able to reach every id it uses
for js_id in ["serverSelector", "posterContainer", "detailMain", "episodeGrid",
              "downloadSection", "favBtn", "infoToggle", "infoOverlay",
              "infoModalClose"]:
    check(f"JS id {js_id} still in watch.html", f'id="{js_id}"' in watch_html)

print("\n=== 9. Control-bar CSS ===")
body = body_of(".control-bar")
check(".control-bar rule exists", body is not None)
check("is flex with wrapping (a rigid grid would leave a hole when\n"
      "      renderServerSelector() hides #serverSelector)",
      bool(body) and "display: flex" in body and "flex-wrap: wrap" in body)
check("no grid-template-columns", bool(body) and "grid-template-columns" not in body)
check("margin-bottom: 20px (matches section rhythm)",
      bool(body) and "margin-bottom: 20px" in body)
check("no glass surface on the wrapper (panels own it)",
      bool(body) and "var(--glass)" not in body)

for sel in [".control-bar > .server-selector",
            ".control-bar > .episode-section",
            ".control-bar > .download-section"]:
    b = body_of(sel)
    check(f"{sel} exists", b is not None)
    check(f"{sel} margin pinned to 0 so the cards share a baseline",
          bool(b) and "margin-bottom: 0" in b)

srv = body_of(".control-bar > .server-selector") or ""
ep = body_of(".control-bar > .episode-section") or ""
dl = body_of(".control-bar > .download-section") or ""
check("only the server panel soaks up spare width", "flex: 1 1" in srv)
check("episode panel capped so a wide row can't stretch the dropdown",
      "max-width" in ep)
check("collapsed download stays a slim chip", "flex: 0 1" in dl)

open_dl = body_of(".control-bar > .download-section.open")
check("opened download takes the whole row",
      bool(open_dl) and "flex: 1 1 100%" in open_dl)
check("...and stretches so the panel isn't a stub",
      bool(open_dl) and "align-self: stretch" in open_dl)

single = body_of(".control-bar.is-single > .episode-section")
check("server panel missing: episode owns the row",
      bool(single) and "flex: 1 1 100%" in single and "max-width: none" in single)
check("watch.js flags that state via .is-single",
      "classList.add('is-single')" in js and "classList.remove('is-single')" in js)

# .control-bar > .x is (0,2,0); the mobile grouped rule is (0,1,0), so these
# win on specificity alone and don't depend on source order.
required = {".control-bar > .server-selector",
            ".control-bar > .episode-section",
            ".control-bar > .download-section"}
present = {h for h, _b, m in HEADS if not m and h.startswith(".control-bar >")}
check("all three panel rules present at top level",
      required <= present, str(sorted(present)))

mobile = [b for h, b, m in HEADS
          if m and h == ".control-bar" and "margin-bottom: 20px" in b]
check("control-bar follows the mobile section rhythm", bool(mobile))

m_dl = [b for h, b, m in HEADS
        if m and h == ".control-bar > .download-section" and "flex: 1 1 100%" in b]
check("mobile spans the download across the row", bool(m_dl))

print("\n=== 10. Headers match (they are side by side now) ===")
sh = body_of(".server-header") or ""
eh = body_of(".episode-header") or ""
eh3 = body_of(".episode-header h3") or ""
for prop, label in [("font-size: 0.7rem", "font-size"),
                    ("text-transform: uppercase", "uppercase"),
                    ("letter-spacing: 1.5px", "tracking"),
                    ("color: var(--text-muted)", "muted colour")]:
    check(f"episode header matches server header on {label}",
          prop in sh and prop in eh3)
sh_mb = re.search(r"margin-bottom:\s*([^;]+);", sh)
eh_mb = re.search(r"margin-bottom:\s*([^;]+);", eh)
check("both headers share the same margin-bottom (their rows must align)",
      bool(sh_mb) and bool(eh_mb) and sh_mb.group(1) == eh_mb.group(1),
      f"{sh_mb and sh_mb.group(1).strip()} vs {eh_mb and eh_mb.group(1).strip()}")
check("episode h3 is no longer oversized (1.15rem)", "1.15rem" not in eh3)

print("\n=== 11. Labels: text where it is needed, icons where it is not ===")
# Section labels must be readable again -- an ambiguous icon (fa-rays) or a
# lone download chip is not self-explanatory.
for label, needle in [
    ("server label", "fa-satellite-dish\"></i> Server"),
    ("episode label", "fa-list-ul\"></i> Episode"),
    ("download label", "fa-download\"></i> Downloads"),
    ("recommended label", "fa-rays\"></i> Recommended"),
]:
    check(f"{label} restored", needle in watch_html or needle in js)

# All four labels must read as one family, not four different heading styles.
for sel, why in [(".server-header", "server"), (".episode-header h3", "episode"),
                 (".download-header", "download"),
                 (".recommended-section .section-header h3", "recommended")]:
    b = body_of(sel) or ""
    check(f"{why} label uses the shared 0.7rem uppercase style",
          "font-size: 0.7rem" in b and "text-transform: uppercase" in b)

# Nothing may rescale one of them on small screens.
check("no stale mobile rescale of the recommended label",
      not any(m and h == ".recommended-section .section-header h3"
              for h, _b, m in HEADS))

for icon in ["fa-arrow-left", "fa-list-ul", "fa-rays", "fa-satellite-dish",
             "fa-download", "fa-chevron-down", "fa-circle-info"]:
    check(f"{icon} still present", icon in watch_html or icon in js)

topbar = watch_html[watch_html.find("watch-topbar"):watch_html.find("watchContent")]
check("topbar buttons carry title tooltips", topbar.count("title=\"") >= 2)


def first_button_html(marker):
    """Return the whole <button> markup for the first button holding `marker`.

    Backs up to the element start -- slicing from the attribute itself would
    cut the opening tag off, leaving it to look like stray text below.
    """
    s = topbar.rfind("<button", 0, topbar.find(marker))
    return topbar[s:topbar.find("</button>", s)]


# An arrow and a heart are unambiguous, so those stay icon-only -- but they
# must hold nothing but the icon element. Strip the tags; any leftover text
# means a label crept back in.
for marker, what in [('id="favBtn"', "favBtn"), ('id="infoToggle"', "infoToggle")]:
    el = first_button_html(marker)
    leftover = re.sub(r"<[^>]*>", "", el).strip()
    check(f"{what} is icon-only", "<i class=" in el and leftover == "",
          repr(leftover))

# Favourite must now live in the topbar, with no duplicate inside the panel.
check("favBtn lives in the topbar", 'id="favBtn"' in topbar)
check("infoToggle lives in the topbar", 'id="infoToggle"' in topbar)
check("renderAnimeInfo no longer renders a second fav button",
      'id="favBtn" class="glass fav-btn' not in js)
check("watch.js drives the topbar fav button instead",
      "favBtn.onclick" in js and "toggleFavorite({" in js)

print("\n=== 12. Info modal wiring ===")
check("watch.js defines openInfo", "function openInfo" in js)
check("watch.js defines closeInfo", "function closeInfo" in js)
check("infoToggle opens it", "infoToggle.addEventListener('click', openInfo)" in js)
check("close button wired", "infoModalClose.addEventListener('click', closeInfo)" in js)
check("backdrop click dismisses", "e.target === infoOverlay" in js)
check("Escape key dismisses", "e.key === 'Escape'" in js)
check("overlay starts hidden in markup",
      'class="info-overlay" style="display:none;"' in watch_html)
check("modal is labelled for screen readers",
      'role="dialog"' in watch_html and 'aria-modal="true"' in watch_html)

ob = body_of(".info-overlay")
check(".info-overlay rule exists", ob is not None)
check("fixed full-bleed backdrop", bool(ob) and "position: fixed" in ob and "inset: 0" in ob)
check("hidden by default", bool(ob) and "display: none" in ob)
check("backdrop convention matches .search-overlay",
      bool(ob) and "blur(20px)" in (body_of(".search-overlay") or ""))

mb = body_of(".info-modal")
check(".info-modal rule exists", mb is not None)
check("scrolls internally so long synopses still fit",
      bool(mb) and "overflow-y: auto" in mb)

# The modal must stay 2-up until the phone breakpoint even though the plain
# .info-grid collapses at 1024px -- higher specificity wins, not source order.
mg = body_of(".info-modal .info-grid")
check(".info-modal .info-grid exists", mg is not None)
check("modal grid overrides the 1024px collapse",
      bool(mg) and "grid-template-columns" in mg)
check("close button clears the title", "padding-right: 44px" in (body_of(".info-modal .detail-header") or ""))

tb = body_of(".topbar-actions")
check(".topbar-actions pins the buttons right", bool(tb) and "margin-left: auto" in tb)
check(".icon-btn rule exists", body_of(".icon-btn") is not None)
check("mobile raises the info panel as a bottom sheet",
      any(m and h == ".info-overlay" and "flex-end" in b for h, b, m in HEADS))

print("\n=== 13. Compaction pass ===")
# Every section moved off the old 28px rhythm.
check("no rule still uses the old 28px margin rhythm",
      "margin-bottom: 28px" not in stripped)
for sel in [".server-selector", ".episode-section", ".recommended-section"]:
    check(f"{sel} uses the tighter 14px 18px padding",
          "padding: 14px 18px" in (body_of(sel) or ""))
check("topbar gap to the player cut to 16px",
      "margin-bottom: 16px" in (body_of(".watch-topbar") or ""))
check("player gap to the controls cut to 20px",
      "margin-bottom: 20px" in (body_of("#playerSection") or ""))
for sel in [".icon-btn", ".fav-btn"]:
    check(f"{sel} shrunk to 40px", "width: 40px" in (body_of(sel) or ""))
check("episode dropdown tightened",
      "padding: 10px 14px" in (body_of(".episode-select") or ""))
check("download header tightened",
      "padding: 12px 16px" in (body_of(".download-header") or ""))

# .horizontal-scroll is shared with the home grids, which keep 200px cards.
shared_cards = body_of(".horizontal-scroll .anime-card") or ""
check("shared home-page cards untouched at 200px", "200px" in shared_cards)
watch_cards = body_of(".recommended-section .horizontal-scroll .anime-card")
check("watch-page cards scoped down to 170px",
      bool(watch_cards) and "170px" in watch_cards)

print("\n" + ("ALL CHECKS PASSED" if not fails else f"FAILED: {fails}"))
sys.exit(1 if fails else 0)
