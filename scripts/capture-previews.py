"""Capture the Live Preview images for the stores in scripts/showcase.json.

USAGE (PowerShell, from the repo root)
  1. Start the US exit, so Shopify shows USD prices (in another terminal):
       node ..\\dh-nexa-site\\_handoff\\gsc-uplift\\tools\\us-proxy.mjs
  2. Capture (all stores, or name slugs):
       $env:CAPTURE_PROXY = 'http://127.0.0.1:18080'
       python scripts/capture-previews.py            # or: ... capture-previews.py vslf k-star
  3. Check the summary. "REFUSED" means the live store is broken (lockout,
     password, parked domain, error page); fix the store or remove it from
     showcase.json. "FAILED" means a temporary problem; the previous capture
     is kept, just run it again.
  4. python scripts/build-showcase.py
  5. python scripts/build-pdf.py
  6. git add assets/previews scripts/showcase.json index.html assets/Digital-Heroes-Portfolio.pdf
Without CAPTURE_PROXY the run uses this machine's own IP, and Shopify Markets
stores then show local (INR) prices; the run warns when that happens.

HOW
The page is scrolled one screen at a time, as a shopper scrolls, and every
screen is captured and stitched. Modern themes only draw sections, sliders,
lazy images and footers when they scroll into view, so a one-shot full-page
screenshot leaves them blank. A few stores animate against the scroll
position instead; for those, showcase.json can set
"method": {"desktop": "fullpage"|"scroll", "mobile": ...}, "settle_ms" (extra
wait per screen) and "css" (a small override). The sticky header appears once
at the top; floating widgets, cookie bars and popups are removed.

OUTPUT (assets/previews/)
  <slug>-desktop-<n>.webp  1440px page stored 1280 wide, in tiles
  <slug>-mobile-<n>.webp   390px page @2x stored 780 wide, in tiles
  <slug>-thumb.webp        first desktop screen, 960x600, for the gallery card
New files are staged and only replace the old ones once desktop AND mobile
both succeed, so a failed run never leaves a store half updated.

Needs Python Playwright, Pillow and a Chrome install (CHROME env to override).
"""
import asyncio
import datetime
import io
import json
import os
import pathlib
import re
import shutil
import sys
from urllib.parse import urlparse

from PIL import Image
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "scripts" / "showcase.json"
OUT = ROOT / "assets" / "previews"
STAGE = OUT / ".staging"
CHROME = os.environ.get("CHROME", r"C:\Program Files\Google\Chrome\Application\chrome.exe")
IPHONE_UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
             "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

# Pages that must never be published as a store preview. HARD phrases count
# anywhere; HOLDING phrases only on a near-empty page (a real store can say
# "new flavours coming soon" in a banner).
HARD = re.compile(r"unauthori[sz]ed version of the theme|purchase a valid license|store unavailable|"
                  r"enter using password|this store is password protected|domain has expired|domain is for sale|"
                  r"this domain may be for sale|related searches|verify you are human|connection needs to be verified|"
                  r"checking your browser|attention required|access denied|just a moment\.\.\.", re.I)
HOLDING = re.compile(r"opening soon|coming soon|launching soon|under construction|maintenance mode", re.I)
MIN_DESKTOP_HEIGHT = 1200  # lockout and parking pages are about one screen tall

BASE_CSS = """
[id*="klaviyo"], [class*="klaviyo-form"], .kl-private-reset-css-Xuajs1, .privy-popup-container, #privy-container,
[id*="attentive"], [class*="newsletter-popup"], [class*="newsletter-modal"], [class*="popup-newsletter"],
#shopify-pc__banner, .shopify-pc__banner__dialog, [class*="cookie-banner"], [id*="cookie-banner"],
#onetrust-banner-sdk, .cc-window, [class*="age-verification"], [id*="gorgias-chat"], #chat-button,
#tidio-chat, [id*="smile-ui"], #shopify-chat, inbox-online-store-chat { display: none !important; }
html { scroll-behavior: auto !important; scroll-snap-type: none !important; }
* { content-visibility: visible !important; }
.swiper-wrapper, .flickity-slider, .slick-track, .splide__list, .glide__slides, .owl-stage, [class*="carousel__track"],
[class*="slider__track"], slider-component ul { transition-duration: 0s !important; }
[data-aos] { opacity: 1 !important; transform: none !important; transition: none !important; }
"""

# Removes promo popups, toasts, chat bubbles and dark backdrops (shadow DOM
# included), every fixed-position iframe, and native modal dialogs.
KILL_FLOATERS = r"""() => {
  const vw = innerWidth, vh = innerHeight;
  const words = /(% ?off|newsletter|subscribe|sign ?up|join (the|our)|discount|cookies?|consent|we value your privacy|unlock|welcome offer|get \d+ ?%|spin|giveaway|review|bought|purchased)/i;
  document.querySelectorAll('dialog[open]').forEach(d => { try { d.close(); } catch (e) {} d.style.setProperty('display', 'none', 'important'); });
  const visit = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) visit(el.shadowRoot);
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.height < 200 && el.closest('header, [class*="header"], [id*="header"], [class*="announcement"]')) continue;
      const text = ((el.innerText || '') + ' ' + (el.shadowRoot ? el.shadowRoot.textContent : '')).slice(0, 800);
      const big = r.width * r.height > vw * vh * 0.12;
      const docked = r.bottom >= vh - 4 && r.width > vw * 0.5;
      const floating = r.top > 120 && r.width < vw * 0.6;
      const promo = words.test(text) || el.querySelector('input[type="email"]');
      const backdrop = r.width >= vw * 0.9 && r.height >= vh * 0.9 && !text.trim();
      if (el.tagName === 'IFRAME' || (promo && (big || docked)) || floating || backdrop) {
        el.style.setProperty('display', 'none', 'important');
      }
    }
  };
  visit(document);
  for (const n of [document.documentElement, document.body]) n.style.setProperty('overflow', 'visible', 'important');
}"""

# After the first screen, sticky elements stay in place and fixed bars hide, so nothing repeats.
UNSTICK = r"""() => {
  for (const el of document.querySelectorAll('body *')) {
    const p = getComputedStyle(el).position;
    if (p === 'sticky') el.style.setProperty('position', 'relative', 'important');
    else if (p === 'fixed') el.style.setProperty('visibility', 'hidden', 'important');
  }
}"""

# Reveal animations and slide transitions jump to their end state; endless ones are left alone.
FINISH_ANIMATIONS = """() => {
  for (const a of document.getAnimations()) {
    try { const t = a.effect && a.effect.getComputedTiming(); if (t && t.iterations !== Infinity) a.finish(); } catch (e) {}
  }
}"""

PLAY_VIDEOS = """async () => {
  const vids = [...document.querySelectorAll('video')];
  vids.forEach(v => { v.muted = true; v.playsInline = true; if (v.dataset.src && !v.src) v.src = v.dataset.src; v.play().catch(() => {}); });
  const t0 = performance.now();
  while (vids.some(v => v.readyState < 2) && performance.now() - t0 < 5000) await new Promise(r => setTimeout(r, 200));
}"""

SETTLE_SCREEN = """async () => {
  const near = [...document.images].filter(i => { const r = i.getBoundingClientRect(); return r.bottom > -200 && r.top < innerHeight + 400; });
  near.forEach(i => { if (i.loading === 'lazy') i.loading = 'eager'; });
  const pending = near.filter(i => !i.complete);
  await Promise.race([
    Promise.all(pending.map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))),
    new Promise(r => setTimeout(r, 6000)),
  ]);
}"""

LOAD_ALL_IMAGES = """async () => {
  document.querySelectorAll('img[loading="lazy"], iframe[loading="lazy"]').forEach(el => el.loading = 'eager');
  const pending = [...document.images].filter(i => !i.complete);
  await Promise.race([
    Promise.all(pending.map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))),
    new Promise(r => setTimeout(r, 10000)),
  ]);
}"""

PAGE_HEIGHT = "Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)"

DEVICES = {
    # dpr: device pixel ratio; store_w: stored width; tile: max stored px per tile; cap: max CSS px captured
    "desktop": {"ctx": {"viewport": {"width": 1440, "height": 900}}, "dpr": 1, "store_w": 1280, "tile": 6000, "cap": 20000},
    "mobile": {"ctx": {"viewport": {"width": 390, "height": 844}, "device_scale_factor": 2, "is_mobile": True,
                       "has_touch": True, "user_agent": IPHONE_UA}, "dpr": 2, "store_w": 780, "tile": 8000, "cap": 24000},
}

# Fields this script owns in showcase.json; everything else is the owner's.
OWNED = ("desktop", "mobile", "captured", "frameable", "capture_error", "last_error")


class Refused(Exception):
    """The live page is not a store that can be shown (lockout, password, parked, error, challenge)."""


def check_entry(s):
    if not SLUG_RE.match(s.get("slug", "")):
        raise SystemExit(f"bad slug {s.get('slug')!r}: use lowercase letters, digits and dashes")
    u = urlparse(s.get("url", ""))
    if (u.scheme != "https" or not u.hostname or u.username or u.password or u.port or u.params
            or u.query or u.fragment or u.path not in ("", "/")):
        raise SystemExit(f"{s['slug']}: url must be a bare https://host/ (no path, query, credentials or port)")


def frameable(headers, store):
    """Can the portfolio frame this store? Owner override wins; X-Frame-Options blocks;
    frame-ancestors allows only '*' or the portfolio's own origin."""
    if "frameable_override" in store:
        return bool(store["frameable_override"])
    if headers.get("x-frame-options"):
        return False
    csp = headers.get("content-security-policy", "")
    for policy in re.split(r"[,\n]", csp):
        for d in policy.split(";"):
            d = d.strip()
            if d.startswith("frame-ancestors"):
                sources = d.split()[1:]
                return "*" in sources or "https://portfolio.digitalheroes.co.in" in sources
    return True


async def settle(page, url, css=""):
    """Load, follow any redirect, and wait until the page stops navigating."""
    resp = await page.goto(url, wait_until="domcontentloaded", timeout=45000)
    for _ in range(3):
        try:
            await page.wait_for_load_state("load", timeout=20000)
            await page.wait_for_timeout(1000)
            await page.add_style_tag(content=BASE_CSS + css)
            return resp
        except Exception as e:  # noqa: BLE001
            if "Execution context was destroyed" not in str(e) and "navigation" not in str(e).lower():
                raise
    raise RuntimeError("page kept navigating")


async def page_text(page):
    text = ""
    for frame in page.frames:  # parking and lockout pages often render inside a frame
        try:
            text += " " + await frame.evaluate("document.body ? document.body.innerText.slice(0, 6000) : ''")
        except Exception:  # noqa: BLE001
            pass
    return text


class TileWriter:
    """Stitches screens into tiles of at most `tile` stored px, written to the staging folder."""

    def __init__(self, folder, slug, kind, width, tile, store_w):
        self.folder, self.slug, self.kind = folder, slug, kind
        self.width, self.tile, self.store_w = width, tile, store_w
        self.scale = store_w / width
        self.buf, self.used, self.heights = None, 0, []

    def _flush(self):
        if self.buf is None or not self.used:
            return
        img = self.buf.crop((0, 0, self.width, self.used))
        img = img.resize((self.store_w, round(self.used * self.scale)), Image.LANCZOS)
        img.save(self.folder / f"{self.slug}-{self.kind}-{len(self.heights) + 1}.webp", "WEBP", quality=74, method=6)
        self.heights.append(img.height)
        self.buf, self.used = None, 0

    def add(self, img):
        raw_tile = round(self.tile / self.scale)
        y = 0
        while y < img.height:
            if self.buf is None:
                self.buf, self.used = Image.new("RGB", (self.width, raw_tile), "white"), 0
            take = min(img.height - y, raw_tile - self.used)
            self.buf.paste(img.crop((0, y, self.width, y + take)), (0, self.used))
            self.used += take
            y += take
            if self.used >= raw_tile:
                self._flush()

    def close(self):
        self._flush()
        return self.heights


def save_thumb(folder, slug, frame):
    top = frame.crop((0, 0, frame.width, min(frame.height, round(frame.width * 10 / 16))))
    top.resize((960, 600), Image.LANCZOS).save(folder / f"{slug}-thumb.webp", "WEBP", quality=80, method=6)


async def capture(browser, store, kind, folder):
    spec = DEVICES[kind]
    vw, vh, dpr = spec["ctx"]["viewport"]["width"], spec["ctx"]["viewport"]["height"], spec["dpr"]
    ctx = await browser.new_context(**spec["ctx"], locale="en-US")
    page = await ctx.new_page()
    try:
        resp = await settle(page, store["url"], store.get("css", ""))
        if resp is None or resp.status >= 400:
            raise Refused(f"HTTP {resp.status if resp else 'no response'} at {page.url}")
        text = await page_text(page)
        if "/password" in page.url or HARD.search(text) or (len(text.strip()) < 1500 and HOLDING.search(text)):
            raise Refused(f"lockout, password, parked or challenge page at {page.url}")
        await page.evaluate(PLAY_VIDEOS)
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(1500)
        await page.evaluate(KILL_FLOATERS)
        headers = await resp.all_headers()

        writer = TileWriter(folder, store["slug"], kind, vw * dpr, spec["tile"], spec["store_w"])
        method = (store.get("method") or {}).get(kind, "scroll")
        extra = int(store.get("settle_ms", 0))
        if method == "fullpage":
            await page.evaluate("""async (cap) => {
                const h = () => Math.min(document.documentElement.scrollHeight, cap);
                for (let y = 0; y < h(); y += 360) { scrollTo(0, y); await new Promise(r => setTimeout(r, 300)); }
                scrollTo(0, h()); await new Promise(r => setTimeout(r, 1500)); }""", spec["cap"])
            await page.evaluate(LOAD_ALL_IMAGES)
            try:
                await page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:  # noqa: BLE001
                pass
            await page.evaluate("scrollTo(0, 0)")
            await page.wait_for_timeout(900 + extra)
            await page.evaluate(FINISH_ANIMATIONS)
            await page.evaluate(KILL_FLOATERS)
            height = min(await page.evaluate(PAGE_HEIGHT), spec["cap"])
            for i, y0 in enumerate(range(0, height, 4000)):
                png = await page.screenshot(type="png", full_page=True, clip={"x": 0, "y": y0, "width": vw, "height": min(4000, height - y0)})
                frame = Image.open(io.BytesIO(png)).convert("RGB")
                if kind == "desktop" and i == 0:
                    save_thumb(folder, store["slug"], frame)
                writer.add(frame)
        else:
            y, shot_no = 0, 0
            while True:
                height = min(await page.evaluate(PAGE_HEIGHT), spec["cap"])
                if y >= height:
                    break
                await page.evaluate(f"scrollTo(0, {y})")
                await page.wait_for_timeout(700)
                await page.evaluate(SETTLE_SCREEN)
                await page.wait_for_timeout(500 + extra)
                await page.evaluate(FINISH_ANIMATIONS)
                await page.wait_for_timeout(150)
                await page.keyboard.press("Escape")
                await page.evaluate(KILL_FLOATERS)
                actual = await page.evaluate("Math.round(scrollY)")
                png = await page.screenshot(type="png")
                frame = Image.open(io.BytesIO(png)).convert("RGB")
                height = min(await page.evaluate(PAGE_HEIGHT), spec["cap"])  # pages can shrink while scrolled
                skip = max(0, y - actual) * dpr
                keep = min(vh, height - y) * dpr
                if keep <= 0 or skip >= frame.height:
                    break
                frame = frame.crop((0, skip, frame.width, min(frame.height, skip + keep)))
                if kind == "desktop" and shot_no == 0:
                    save_thumb(folder, store["slug"], frame)
                writer.add(frame)
                if shot_no == 0:
                    await page.evaluate(UNSTICK)
                shot_no += 1
                y += vh
        tiles = writer.close()
        total = sum(tiles) / (spec["store_w"] / vw)
        if kind == "desktop" and total < MIN_DESKTOP_HEIGHT:
            raise Refused(f"page is only {round(total)}px tall, likely a holding or lockout page")
        result = {"w": spec["store_w"], "h": sum(tiles), "tiles": tiles}
        if kind == "desktop":
            result["frameable"] = frameable({k.lower(): v for k, v in headers.items()}, store)
        return result
    finally:
        await ctx.close()


def commit_files(slug, folder):
    """Swap the staged files in for the store's old ones."""
    for old in OUT.glob(f"{slug}-*.webp"):
        old.unlink()
    for f in folder.iterdir():
        os.replace(f, OUT / f.name)
    folder.rmdir()


def write_back(slug, fields):
    """Merge this script's fields into the current showcase.json atomically."""
    data = json.loads(DATA.read_text(encoding="utf-8"))
    for s in data["stores"]:
        if s["slug"] != slug:
            continue
        if "desktop" in fields:            # success: clear any old error notes
            s.pop("capture_error", None)
            s.pop("last_error", None)
        elif "capture_error" in fields:    # refused: the store is broken, it stops being published
            s.pop("last_error", None)
        s.update(fields)                   # failed: only last_error is added; the old capture stays
    tmp = DATA.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, DATA)


async def main(requested):
    data = json.loads(DATA.read_text(encoding="utf-8"))
    for s in data["stores"]:
        check_entry(s)
    slugs = [s["slug"] for s in data["stores"]]
    dupes = sorted({x for x in slugs if slugs.count(x) > 1})
    if dupes:
        raise SystemExit(f"duplicate slugs in showcase.json: {', '.join(dupes)}")
    unknown = sorted(set(requested) - set(slugs))
    if unknown:
        raise SystemExit(f"not in showcase.json: {', '.join(unknown)}")
    stores = [s for s in data["stores"] if not requested or s["slug"] in requested]
    OUT.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(STAGE, ignore_errors=True)
    STAGE.mkdir(parents=True)
    proxy = os.environ.get("CAPTURE_PROXY")
    if not proxy:
        print("WARNING: CAPTURE_PROXY is not set; Shopify stores may show this machine's local currency.")
    refused, failed = [], []
    lock = asyncio.Lock()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=CHROME, headless=True,
                                          args=["--autoplay-policy=no-user-gesture-required", "--hide-scrollbars"],
                                          proxy={"server": proxy} if proxy else None)
        if proxy:
            print(f"Capturing through {proxy}")
        sem = asyncio.Semaphore(4)

        async def one(store):
            slug = store["slug"]
            folder = STAGE / slug
            folder.mkdir(parents=True, exist_ok=True)
            async with sem:
                try:
                    d = await capture(browser, store, "desktop", folder)
                    m = await capture(browser, store, "mobile", folder)
                    fields = {"frameable": d.pop("frameable"), "desktop": d, "mobile": m,
                              "captured": datetime.date.today().isoformat()}
                    async with lock:
                        commit_files(slug, folder)
                        write_back(slug, fields)
                    print(f"  {slug:<22} desktop {d['h']}px/{len(d['tiles'])} tiles  mobile {m['h']}px/{len(m['tiles'])} tiles  frameable={fields['frameable']}")
                except Refused as e:
                    shutil.rmtree(folder, ignore_errors=True)
                    async with lock:
                        write_back(slug, {"capture_error": str(e)})
                    refused.append(slug)
                    print(f"  {slug:<22} REFUSED: {e}")
                except Exception as e:  # noqa: BLE001
                    shutil.rmtree(folder, ignore_errors=True)
                    msg = str(e).splitlines()[0][:160]
                    async with lock:
                        write_back(slug, {"last_error": msg})
                    failed.append(slug)
                    print(f"  {slug:<22} FAILED (previous capture kept): {msg}")

        await asyncio.gather(*(one(s) for s in stores))
        await browser.close()
    shutil.rmtree(STAGE, ignore_errors=True)
    ok = len(stores) - len(refused) - len(failed)
    print(f"Captured {ok} of {len(stores)}." + (f" REFUSED: {', '.join(refused)}." if refused else "")
          + (f" FAILED: {', '.join(failed)} (run again)." if failed else ""))
    if refused or failed:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
