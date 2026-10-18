"""Build the Live Previews gallery and the viewer data from scripts/showcase.json.

Usage (from the repo root):  python scripts/build-showcase.py [--clean]

Writes between <!-- SHOWCASE:START --> and <!-- SHOWCASE:END --> in index.html:
the gallery section (stores with "gallery": true) and a JSON block the viewer
reads for every store. Stores with "gallery": false are previewable only from
their case-study card in "Stores We've Built" (pitch-deck.js adds a Live
Preview button to any card whose Visit Store link points at the same host).
Then renumbers every section by position.

It refuses to build when the data and the files disagree: a URL that is not a
bare https://host/, a tile whose pixel size differs from showcase.json, a
missing thumbnail, an extra tile past the last listed one, or files in
assets/previews for stores that are no longer in showcase.json (--clean
deletes those orphans instead of failing).

Order: capture-previews.py, then this, then build-pdf.py.
Never paste a store link carrying key=, _bt= or preview_theme_id tokens.
"""
import html
import json
import pathlib
import re
import sys
from urllib.parse import urlparse

from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from sections import renumber  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "scripts" / "showcase.json").read_text(encoding="utf-8"))
INDEX = ROOT / "index.html"
PREVIEWS = ROOT / "assets" / "previews"
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
CLEAN = "--clean" in sys.argv
e = html.escape
problems = []


def icon(name, cls="ico"):
    return f'<svg class="{cls}" aria-hidden="true"><use href="#i-{name}" /></svg>'


slugs = [s["slug"] for s in DATA["stores"]]
for s in DATA["stores"]:
    if not SLUG_RE.match(s["slug"]):
        problems.append(f"{s['slug']!r}: slug must be lowercase letters, digits and dashes")
    u = urlparse(s["url"])
    if (u.scheme != "https" or not u.hostname or u.username or u.password or u.port or u.params
            or u.query or u.fragment or u.path not in ("", "/")):
        problems.append(f"{s['slug']}: url must be a bare https://host/ (no path, query, credentials or port)")
if len(set(slugs)) != len(slugs):
    problems.append("duplicate slugs in showcase.json")

stores = [s for s in DATA["stores"] if s.get("desktop") and s.get("mobile") and not s.get("capture_error")]
skipped = [s["slug"] for s in DATA["stores"] if s not in stores]
for s in stores:
    s["host"] = urlparse(s["url"]).hostname.removeprefix("www.")
    for kind in ("desktop", "mobile"):
        shot = s[kind]
        for i, h in enumerate(shot["tiles"], start=1):
            f = PREVIEWS / f"{s['slug']}-{kind}-{i}.webp"
            if not f.exists():
                problems.append(f"missing {f.name}; run scripts/capture-previews.py {s['slug']}")
                continue
            with Image.open(f) as im:
                if im.size != (shot["w"], h):
                    problems.append(f"{f.name} is {im.size[0]}x{im.size[1]}, showcase.json says {shot['w']}x{h}")
        extra = PREVIEWS / f"{s['slug']}-{kind}-{len(shot['tiles']) + 1}.webp"
        if extra.exists():
            problems.append(f"{extra.name} exists past the last listed tile; tiles and showcase.json disagree")
    if s.get("gallery") and not (PREVIEWS / f"{s['slug']}-thumb.webp").exists():
        problems.append(f"missing {s['slug']}-thumb.webp")

published = {s["slug"] for s in stores}
orphans = [f for f in PREVIEWS.glob("*.webp")
           if re.sub(r"-(?:desktop|mobile)-\d+\.webp$|-thumb\.webp$", "", f.name) not in published]
if orphans and CLEAN:
    for f in orphans:
        f.unlink()
    print(f"Deleted {len(orphans)} orphan preview files")
elif orphans:
    problems.append(f"{len(orphans)} files in assets/previews belong to no published store (e.g. {orphans[0].name}); "
                    "rerun with --clean to delete them")

if problems:
    raise SystemExit("Not built:\n  " + "\n  ".join(problems))

gallery = [s for s in stores if s.get("gallery")]
platforms = sorted({s["platform"] for s in gallery})


def card(s):
    return f"""<li class="gcard reveal" data-platform="{e(s['platform'])}">
<button class="gcard-shot" type="button" data-preview="{e(s['slug'])}" tabindex="-1" aria-hidden="true">
<span class="gcard-chrome" aria-hidden="true"><i></i><i></i><i></i><span>{e(s['host'])}</span></span>
<img src="assets/previews/{e(s['slug'])}-thumb.webp" width="960" height="600" loading="lazy" decoding="async" alt="">
<span class="gcard-cta" aria-hidden="true">{icon('eye')}Live Preview</span>
</button>
<div class="gcard-body">
<p class="work-niche">{e(s['niche'])}<span class="gcard-platform">{e(s['platform'])}</span></p>
<h3 class="gcard-name">{e(s['name'])}</h3>
<div class="gcard-actions">
<button class="btn btn-primary btn-xs" type="button" data-preview="{e(s['slug'])}" aria-label="Live preview of {e(s['name'])}">{icon('eye')}Live Preview</button>
<a class="work-link" href="{e(s['url'])}" target="_blank" rel="noopener" aria-label="Visit {e(s['name'])} (opens in a new tab)">Visit store{icon('arrow-up-right')}</a>
</div>
</div>
</li>"""


filters = ""
if len(platforms) > 1 and all(sum(1 for s in gallery if s["platform"] == p) >= 2 for p in platforms):
    chips = "".join(f'<button class="gfilter" type="button" data-filter="{e(p)}" aria-pressed="false">{e(p)}</button>' for p in platforms)
    filters = (f'<div class="gallery-filters reveal" role="group" aria-label="Filter stores by platform">'
               f'<button class="gfilter" type="button" data-filter="all" aria-pressed="true">All</button>{chips}</div>')

viewer_data = {"stores": []}
for s in stores:
    entry = {k: s.get(k) for k in ("slug", "name", "niche", "platform", "url", "host", "frameable", "captured")}
    for kind in ("desktop", "mobile"):
        entry[kind] = {"w": s[kind]["w"], "tiles": [{"src": f"assets/previews/{s['slug']}-{kind}-{i}.webp", "h": h}
                                                   for i, h in enumerate(s[kind]["tiles"], start=1)]}
    viewer_data["stores"].append(entry)
data_json = json.dumps(viewer_data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

section = f"""<!-- SHOWCASE:START (generated by scripts/build-showcase.py from scripts/showcase.json; edit the JSON, not this block) -->
        <section class="page gallery" id="live-previews" data-slide="4" data-label="Live Previews">
            <div class="wrap">
                <header class="sec-head sec-head-row reveal">
                    <div>
                        <p class="eyebrow"><span class="num">04</span>Live Previews</p>
                        <h2 class="h2">See Our Stores <em>Live</em></h2>
                        <p class="lede">Open any store and preview it exactly as shoppers see it, on desktop and on mobile.</p>
                    </div>
                    <p class="gallery-count">{len(gallery)} stores, hand-picked for design</p>
                </header>
                {filters}
                <ul class="gallery-grid">
{chr(10).join(card(s) for s in gallery)}
                </ul>
            </div>
        </section>
        <script type="application/json" id="previewData">{data_json}</script>
        <!-- SHOWCASE:END -->"""

src = INDEX.read_text(encoding="utf-8")
new, n = re.subn(r"<!-- SHOWCASE:START.*?<!-- SHOWCASE:END -->", lambda m: section, src, flags=re.S)
if n != 1:
    raise SystemExit("SHOWCASE markers not found exactly once in index.html")
new, count = renumber(new)
INDEX.write_text(new, encoding="utf-8")
print(f"Gallery rebuilt: {len(gallery)} stores in the gallery, {len(stores)} previewable in total; {count} sections numbered"
      + (f"; not published (no usable capture): {', '.join(skipped)}" if skipped else ""))
