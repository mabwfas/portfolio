"""Build assets/Digital-Heroes-Portfolio.pdf, the file behind "Download PDF".

Usage (from the repo root):  python scripts/build-pdf.py [page-url]

Re-run it after ANY change to index.html, pitch-deck.css or the images, and
commit the PDF with the change, or the download goes stale.

Needs Python Playwright and PyMuPDF (pip install playwright pymupdf) and a
Chrome install. Set CHROME to its path if it is not in the default place.
It renders the print stylesheet (one A4 sheet per page), refuses to write the
file if any page's content runs into that page's footer, then compresses the
images and stamps the PDF metadata.
"""
import os
import pathlib
import sys

import fitz  # PyMuPDF
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "Digital-Heroes-Portfolio.pdf"
CHROME = os.environ.get("CHROME", r"C:\Program Files\Google\Chrome\Application\chrome.exe")
URL = sys.argv[1] if len(sys.argv) > 1 else (ROOT / "index.html").as_uri()

# For every printed sheet: how far its content reaches, against where its
# footer starts. Decorative layers and the footer itself are ignored.
OVERFLOW_JS = """() => {
  const pages = [...document.querySelectorAll('section.page:not(.plans), .plan-panel')];
  return pages.map((page, i) => {
    const top = page.getBoundingClientRect().top;
    const foot = page.querySelector('.print-foot');
    const limit = (foot ? foot.getBoundingClientRect().top : page.getBoundingClientRect().bottom) - top;
    let bottom = 0;
    for (const el of page.querySelectorAll('*')) {
      if (el.closest('.print-foot, .orbit, .sprite')) continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.width > 0) bottom = Math.max(bottom, r.bottom - top);
    }
    const label = page.dataset.label || page.querySelector('.panel-title')?.textContent || '';
    return { page: i + 1, label, used: Math.round(bottom), limit: Math.round(limit) };
  });
}"""


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROME, headless=True)
        page = browser.new_context(viewport={"width": 1280, "height": 900}).new_page()
        page.goto(URL, wait_until="load")
        page.evaluate("window.revealAll && window.revealAll()")
        page.evaluate("window.loadAllImages ? window.loadAllImages() : null")
        page.evaluate("document.fonts.ready")
        page.wait_for_timeout(2500)
        page.emulate_media(media="print")
        page.wait_for_timeout(500)

        report = page.evaluate(OVERFLOW_JS)
        over = [r for r in report if r["used"] > r["limit"] - 8]
        for r in report:
            flag = "  <-- OVERFLOWS" if r in over else ""
            print(f'  page {r["page"]:>2}  {r["label"][:28]:<28} {r["used"]:>5} / {r["limit"]:>5} px{flag}')
        if over:
            browser.close()
            raise SystemExit(f"{len(over)} page(s) run into their footer; fix the print layout, PDF not written.")

        tmp = OUT.with_suffix(".tmp.pdf")
        page.pdf(path=str(tmp), prefer_css_page_size=True, print_background=True)
        browser.close()

    meta = {
        "title": "Digital Heroes Portfolio",
        "author": "Digital Heroes",
        "subject": "Shopify, WordPress and custom software portfolio, plans and reviews",
        "keywords": "Digital Heroes, portfolio, Shopify, WordPress, custom software",
        "creator": "portfolio.digitalheroes.co.in",
    }

    # Chrome writes ~28 MB. Recompressing the images brings it to ~6 MB.
    # garbage must stay at 1: levels 3 and 4 merge objects and break Chrome's
    # shared transparency (ExtGState) resources, which some viewers then draw
    # wrong. The result is re-checked, and the raw file is kept if it is damaged.
    doc = fitz.open(tmp)
    if hasattr(doc, "rewrite_images"):
        doc.rewrite_images(dpi_threshold=200, dpi_target=170, quality=82, lossy=True, lossless=True,
                           bitonal=True, color=True, gray=True)
    doc.set_metadata(meta)
    doc.save(OUT, garbage=1, deflate=True)
    doc.close()

    if damaged(OUT):
        print("Compressed PDF failed its integrity check; keeping Chrome's uncompressed output.")
        doc = fitz.open(tmp)
        doc.set_metadata(meta)
        doc.save(OUT, garbage=0, deflate=True)
        doc.close()
        if damaged(OUT):
            raise SystemExit("Even the uncompressed PDF has missing resources; not shipping it.")
    tmp.unlink()
    pages = fitz.open(OUT).page_count
    print(f"Wrote {OUT.relative_to(ROOT)}: {pages} pages, {OUT.stat().st_size / 1e6:.1f} MB, integrity check passed")


def damaged(path):
    """Render every page and report whether MuPDF hit missing resources."""
    fitz.TOOLS.reset_mupdf_warnings()
    with fitz.open(path) as d:
        for p in d:
            p.get_pixmap(dpi=24)
    return "cannot find" in fitz.TOOLS.mupdf_warnings()


if __name__ == "__main__":
    main()
