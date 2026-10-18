/* ==========================================================================
   Digital Heroes portfolio deck
   Section counter and arrows, scroll reveals, reading progress, plan tabs,
   quote form, image previews, and print page footers.
   ========================================================================== */
(() => {
    const sections = [...document.querySelectorAll('section.page')];
    const total = sections.length;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pad = (n) => String(n).padStart(2, '0');
    const $ = (id) => document.getElementById(id);

    /* ---------- Section counter ---------- */
    const currentEl = $('currentSlide');
    const totalEl = $('totalSlides');
    const labelEl = $('slideLabel');
    const prevBtn = $('prevBtn');
    const nextBtn = $('nextBtn');
    let current = 1;

    function setCurrent(n) {
        current = n;
        if (currentEl) currentEl.textContent = pad(n);
        if (labelEl) labelEl.textContent = sections[n - 1].dataset.label || '';
        if (prevBtn) prevBtn.disabled = n === 1;
        if (nextBtn) nextBtn.disabled = n === total;
    }

    function goTo(n) {
        if (n < 1 || n > total) return;
        sections[n - 1].scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        setCurrent(n);
    }

    if (totalEl) totalEl.textContent = pad(total);
    setCurrent(1);
    prevBtn?.addEventListener('click', () => goTo(current - 1));
    nextBtn?.addEventListener('click', () => goTo(current + 1));

    // Left/Right jump a section, like a deck. Up/Down, Space, Home and End stay
    // native. Tabs, form fields and the image preview keep their own arrows.
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
        if (e.target.closest('input, textarea, select, [contenteditable], [role="tablist"]')) return;
        if (document.querySelector('dialog[open]')) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); goTo(current + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(current - 1); }
    });

    // "Current" is the section crossing the middle of the screen.
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) setCurrent(sections.indexOf(entry.target) + 1);
            });
        }, { rootMargin: '-50% 0px -50% 0px', threshold: 0 });
        sections.forEach((s) => io.observe(s));
    }

    /* ---------- Scroll reveals ---------- */
    const reveals = [...document.querySelectorAll('.reveal')];
    reveals.forEach((el) => {
        const siblings = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
        const i = siblings.indexOf(el);
        if (i > 0) el.style.setProperty('--d', `${Math.min(i, 5) * 80}ms`);
    });

    const showAll = () => reveals.forEach((el) => el.classList.add('is-in'));
    let revealObserver = null;
    if (reduceMotion || !('IntersectionObserver' in window)) {
        showAll();
    } else {
        // Hidden-until-seen is switched on by the script that reveals, so a
        // script that fails to load can never leave content invisible.
        document.documentElement.classList.add('reveal-on');
        revealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-in');
                revealObserver.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
        reveals.forEach((el) => revealObserver.observe(el));
    }

    /* ---------- Reading progress ---------- */
    const fill = $('progressFill');
    let ticking = false;
    function paintProgress() {
        ticking = false;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        fill.style.transform = `scaleX(${max > 0 ? Math.min(window.scrollY / max, 1) : 0})`;
    }
    if (fill) {
        window.addEventListener('scroll', () => {
            if (!ticking) { ticking = true; requestAnimationFrame(paintProgress); }
        }, { passive: true });
        paintProgress();
    }

    if (reduceMotion) document.querySelector('.orbit')?.pauseAnimations?.();

    /* ---------- Plan tabs ---------- */
    const tabs = [...document.querySelectorAll('.plan-tab')];
    function selectTab(tab, focus) {
        tabs.forEach((t) => {
            const on = t === tab;
            t.setAttribute('aria-selected', String(on));
            t.tabIndex = on ? 0 : -1;
            const panel = $(t.getAttribute('aria-controls'));
            if (!panel) return;
            panel.hidden = !on;
            // Cards in a newly shown panel may never have been observed as visible.
            if (on) panel.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-in'));
        });
        if (focus) tab.focus();
    }
    tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => selectTab(tab));
        tab.addEventListener('keydown', (e) => {
            const map = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
            if (!(e.key in map)) return;
            e.preventDefault();
            selectTab(tabs[(map[e.key] + tabs.length) % tabs.length], true);
        });
    });

    /* ---------- Quote form ---------- */
    const form = $('quoteForm');
    const typeSel = $('qf-type');
    const planSel = $('qf-plan');

    // Plan names come from the plan panels, so the form can never drift from them.
    const plansByType = {};
    document.querySelectorAll('.plan-panel').forEach((panel) => {
        const type = panel.dataset.type.replace(' Software', ' software');
        plansByType[type] = [...panel.querySelectorAll('.tier-name')].map((n) => n.textContent.trim());
    });

    function fillPlans(type, chosen) {
        if (!planSel) return;
        planSel.replaceChildren(new Option('Not sure yet', ''));
        (plansByType[type] || []).forEach((name) => planSel.add(new Option(name, name)));
        planSel.value = chosen && (plansByType[type] || []).includes(chosen) ? chosen : '';
    }

    if (form && typeSel && planSel) {
        fillPlans(typeSel.value);
        typeSel.addEventListener('change', () => fillPlans(typeSel.value));

        // Any "Get Pricing" button pre-selects its plan before the jump to the form.
        document.querySelectorAll('[data-quote-type]').forEach((link) => {
            link.addEventListener('click', () => {
                typeSel.value = link.dataset.quoteType;
                fillPlans(link.dataset.quoteType, link.dataset.quotePlan);
                setTimeout(() => $('qf-name')?.focus({ preventScroll: true }), reduceMotion ? 0 : 700);
            });
        });

        let startedAt = Date.now();
        form.addEventListener('focusin', () => { if (!form.dataset.touched) { form.dataset.touched = '1'; startedAt = Date.now(); } }, { once: true });

        const status = $('qf-status');
        const submit = form.querySelector('button[type="submit"]');
        const submitIcon = submit.querySelector('use');
        const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
        const fallback = 'Email <a href="mailto:clientsuccess@digitalheroesco.com">clientsuccess@digitalheroesco.com</a> or <a href="https://wa.me/918840925421" target="_blank" rel="noopener">message us on WhatsApp</a>. Your details are still in the form.';

        function fieldError(name, msg) {
            const input = form.elements[name];
            const field = input.closest('.field');
            field.classList.toggle('has-error', Boolean(msg));
            input.setAttribute('aria-invalid', msg ? 'true' : 'false');
            const err = $(`qf-${name}-err`);
            if (err) err.textContent = msg || '';
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            status.textContent = '';
            const data = Object.fromEntries(new FormData(form).entries());
            let bad = null;
            fieldError('name', data.name.trim() ? '' : 'Please enter your name.');
            if (!data.name.trim()) bad = bad || 'name';
            fieldError('email', EMAIL_RE.test(data.email.trim()) ? '' : 'Please enter a valid email address.');
            if (!EMAIL_RE.test(data.email.trim())) bad = bad || 'email';
            if (bad) { form.elements[bad].focus(); return; }

            submit.classList.add('is-loading');
            submit.disabled = true;
            submitIcon.setAttribute('href', '#i-loader');
            try {
                const res = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...data, startedAt, page: location.href }),
                });
                const out = await res.json().catch(() => ({}));
                if (!res.ok || !out.ok) {
                    if (out.field) { fieldError(out.field, out.error); form.elements[out.field]?.focus(); }
                    throw new Error(out.error || `HTTP ${res.status}`);
                }
                const name = data.name.trim().split(/\s+/)[0];
                form.innerHTML = `<div class="quote-success" role="status" tabindex="-1">
                    <svg class="ico"><use href="#i-circle-check" /></svg>
                    <h3>Thanks, ${name.replace(/[<>&"]/g, '')}. Your request is in.</h3>
                    <p>Our client success team will reply to <strong>${data.email.trim().replace(/[<>&"]/g, '')}</strong> with a tailored quote.</p>
                    <p>Want to move faster? <a class="text-link" href="https://wa.me/918840925421" target="_blank" rel="noopener">Message us on WhatsApp<svg class="ico"><use href="#i-arrow-right" /></svg></a></p>
                </div>`;
                form.querySelector('.quote-success').focus();
            } catch (err) {
                status.innerHTML = `We couldn't send your request just now. ${fallback}`;
            } finally {
                if (submit.isConnected) {
                    submit.classList.remove('is-loading');
                    submit.disabled = false;
                    submitIcon.setAttribute('href', '#i-send');
                }
            }
        });
    }

    /* ---------- Image previews ---------- */
    const lb = $('lightbox');
    const lbImg = $('lbImg');
    const lbCap = $('lbCap');
    const lbCount = $('lbCount');
    const lbPrev = $('lbPrev');
    const lbNext = $('lbNext');
    let group = [];
    let at = 0;
    let opener = null;

    const zoomables = [...document.querySelectorAll('.phone, .work-shot, .sheet')].filter((el) => el.querySelector('img'));
    zoomables.forEach((el) => {
        const img = el.querySelector('img');
        el.classList.add('zoom');
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', `Enlarge: ${img.alt}`);
        const open = () => {
            const section = el.closest('section');
            group = zoomables.filter((z) => z.closest('section') === section).map((z) => z.querySelector('img'));
            opener = el;
            show(group.indexOf(img));
            lb.showModal();
        };
        el.addEventListener('click', open);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });

    function show(i) {
        at = (i + group.length) % group.length;
        const img = group[at];
        img.loading = 'eager';
        lbImg.classList.add('is-swapping');
        const swap = () => {
            lbImg.src = img.currentSrc || img.src;
            lbImg.alt = img.alt;
            lbCap.textContent = img.alt;
            lbImg.classList.remove('is-swapping');
        };
        reduceMotion ? swap() : setTimeout(swap, 120);
        lbCount.textContent = group.length > 1 ? `${at + 1} / ${group.length}` : '';
        lbPrev.hidden = lbNext.hidden = group.length < 2;
    }

    if (lb) {
        $('lbClose').addEventListener('click', () => lb.close());
        lbPrev.addEventListener('click', () => show(at - 1));
        lbNext.addEventListener('click', () => show(at + 1));
        lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
        lb.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); show(at + 1); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); show(at - 1); }
        });
        lb.addEventListener('close', () => opener?.focus({ preventScroll: true }));
    }

    /* ---------- Live store previews ----------
       A theme-store style viewer: desktop and mobile frames, store to store
       navigation, and a shareable #preview=<slug> link. Most Shopify stores
       refuse to be framed (X-Frame-Options / frame-ancestors), so the default
       view is a full-page capture of the live store; stores that allow framing
       also get an Interactive mode that loads the real site in a sandbox. */
    const viewer = $('viewer');
    const pStores = (() => {
        try { return JSON.parse($('previewData')?.textContent || '{}').stores || []; } catch { return []; }
    })();
    const bySlug = new Map(pStores.map((s) => [s.slug, s]));
    const vw = {
        stage: $('vwStage'), screen: $('vwScreen'), name: $('vwName'), niche: $('vwNiche'), url: $('vwUrl'),
        visit: $('vwVisit'), count: $('vwCount'), mode: $('vwMode'), note: $('vwNote'), live: $('vwLive'),
        prev: $('vwPrev'), next: $('vwNext'),
    };
    const deviceBtns = viewer ? [...viewer.querySelectorAll('.vw-devices [data-device]')] : [];
    let pList = [];          // slugs the arrows step through (the gallery, or the case studies)
    let pAt = 0;
    let pDevice = window.matchMedia('(max-width: 640px)').matches ? 'mobile' : 'desktop';
    let pLive = false;
    let pOpener = null;
    let renderSeq = 0;
    let tileObserver = null;
    const currentStore = () => bySlug.get(pList[pAt]);
    const fmtDate = (iso) => {
        const d = iso ? new Date(`${iso}T00:00:00`) : null;
        return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'recently';
    };

    // Opened from the gallery (or a gallery store's link): step through the
    // visible gallery. Opened from a case-study card: step through those.
    function listFor(slug) {
        const gallery = [...document.querySelectorAll('.gcard:not([hidden]) .gcard-shot')].map((b) => b.dataset.preview);
        if (gallery.includes(slug)) return gallery;
        const others = pStores.filter((s) => !gallery.includes(s.slug) && !document.querySelector(`.gcard [data-preview="${s.slug}"]`)).map((s) => s.slug);
        return others.includes(slug) ? others : [slug];
    }

    function fitFrame() {
        const frame = vw.screen.querySelector('iframe');
        if (!frame) return;
        const base = pDevice === 'desktop' ? 1440 : 390;
        const scale = vw.screen.clientWidth / base;
        frame.style.width = `${base}px`;
        frame.style.height = `${vw.screen.clientHeight / scale}px`;
        frame.style.transform = `scale(${scale})`;
    }

    function setDevice(device) {
        pDevice = device;
        vw.stage.dataset.view = device;
        deviceBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.device === device)));
    }

    function announce(s) {
        if (vw.live) vw.live.textContent = `${s.name}, ${s.niche}. Store ${pAt + 1} of ${pList.length}, ${pDevice} view.`;
    }

    function renderShots(s) {
        const token = ++renderSeq;
        tileObserver?.disconnect();
        vw.screen.querySelectorAll('img').forEach((img) => { img.removeAttribute('src'); });
        vw.screen.replaceChildren();
        vw.screen.scrollTop = 0;
        vw.screen.classList.add('is-loading');
        vw.screen.classList.toggle('is-frame', pLive);
        const done = () => { if (token === renderSeq) vw.screen.classList.remove('is-loading'); };
        if (pLive) {
            const frame = document.createElement('iframe');
            frame.title = `${s.name}, live site`;
            frame.referrerPolicy = 'strict-origin-when-cross-origin';
            // The store runs normally but cannot navigate or take over the portfolio tab.
            frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
            frame.addEventListener('load', done, { once: true });
            frame.src = s.url;
            vw.screen.append(frame);
            requestAnimationFrame(fitFrame);
            vw.note.textContent = 'Live site, running inside the preview. Use Visit live store to open it in its own tab.';
            return;
        }
        // Long pages are stacked tiles; width/height reserve each tile's space so
        // scrolling never jumps. Lower tiles load as they approach the frame.
        const shot = s[pDevice];
        const imgs = shot.tiles.map((t, i) => {
            const img = new Image(shot.w, t.h);
            img.decoding = 'async';
            img.alt = i === 0 ? `${s.name} ${pDevice} homepage, full page` : '';
            if (i === 0) {
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
                img.src = t.src;
            } else {
                img.dataset.src = t.src;
            }
            vw.screen.append(img);
            return img;
        });
        if ('IntersectionObserver' in window) {
            tileObserver = new IntersectionObserver((entries) => entries.forEach((e) => {
                if (!e.isIntersecting || !e.target.dataset.src) return;
                e.target.src = e.target.dataset.src;
                delete e.target.dataset.src;
                tileObserver.unobserve(e.target);
            }), { root: vw.screen, rootMargin: '0px 0px 200% 0px' });
            imgs.slice(1).forEach((img) => tileObserver.observe(img));
        } else {
            imgs.slice(1).forEach((img) => { img.src = img.dataset.src; });
        }
        vw.note.textContent = `Full-page capture of the live store, ${pDevice} view, taken ${fmtDate(s.captured)}. Scroll inside the frame to explore.`;
    }

    function renderPreview() {
        const s = currentStore();
        if (!s) return;
        if (!s.frameable) pLive = false;
        vw.name.textContent = s.name;
        vw.niche.textContent = `${s.niche} · ${s.platform}`;
        vw.url.textContent = s.host;
        vw.visit.href = s.url;
        vw.visit.setAttribute('aria-label', `Visit ${s.name} live store (opens in a new tab)`);
        vw.count.textContent = `${pAt + 1} / ${pList.length}`;
        vw.prev.hidden = vw.next.hidden = pList.length < 2;
        setDevice(pDevice);
        if (!s.frameable && document.activeElement === vw.mode) (vw.next.hidden ? vw.screen : vw.next).focus();
        vw.mode.hidden = !s.frameable;
        vw.mode.setAttribute('aria-pressed', String(pLive));
        renderShots(s);
        announce(s);
        // Warm the next store so stepping through feels instant.
        const next = bySlug.get(pList[(pAt + 1) % pList.length]);
        if (next && next !== s) new Image().src = next[pDevice].tiles[0].src;
    }

    function openPreview(slug, opener) {
        if (!viewer || !bySlug.has(slug)) return;
        pList = listFor(slug);
        pAt = pList.indexOf(slug);
        pOpener = opener || null;
        pLive = false;
        renderPreview();
        if (!viewer.open) {
            viewer.showModal();
            vw.screen.focus({ preventScroll: true });
        }
        history.replaceState(null, '', `#preview=${slug}`);
    }

    function stepPreview(d) {
        if (pList.length < 2) return;
        pAt = (pAt + d + pList.length) % pList.length;
        pLive = false;
        renderPreview();
        history.replaceState(null, '', `#preview=${pList[pAt]}`);
    }

    if (viewer && pStores.length) {
        // Case-study cards in "Stores We've Built" get a Live Preview when their store is in the data.
        const byHost = new Map(pStores.map((s) => [s.host, s]));
        document.querySelectorAll('.work').forEach((card) => {
            const link = card.querySelector('.work-link[href^="http"]');
            if (!link) return;
            const s = byHost.get(new URL(link.href).hostname.replace(/^www\./, ''));
            if (!s) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'work-preview no-print';
            btn.dataset.preview = s.slug;
            btn.setAttribute('aria-label', `Live preview of ${s.name}`);
            btn.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-eye" /></svg>Live Preview';
            const row = document.createElement('div');
            row.className = 'work-actions';
            link.replaceWith(row);
            row.append(btn, link);
        });

        document.addEventListener('click', (e) => {
            const trigger = e.target.closest('[data-preview]');
            if (trigger && !viewer.contains(trigger)) { e.preventDefault(); openPreview(trigger.dataset.preview, trigger); }
        });
        deviceBtns.forEach((b) => b.addEventListener('click', () => {
            if (b.dataset.device === pDevice) return;
            setDevice(b.dataset.device);
            const s = currentStore();
            // A live site just reflows to the new width; it keeps the visitor's place.
            if (pLive && vw.screen.querySelector('iframe')) { requestAnimationFrame(fitFrame); announce(s); return; }
            renderShots(s);
            announce(s);
        }));
        vw.mode.addEventListener('click', () => { pLive = !pLive; renderPreview(); });
        vw.prev.addEventListener('click', () => stepPreview(-1));
        vw.next.addEventListener('click', () => stepPreview(1));
        $('vwClose').addEventListener('click', () => viewer.close());
        viewer.addEventListener('keydown', (e) => {
            if (e.target.closest('input, textarea, select')) return;
            if (e.key === 'ArrowRight') { e.preventDefault(); stepPreview(1); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); stepPreview(-1); }
        });
        viewer.addEventListener('close', () => {
            renderSeq++;
            tileObserver?.disconnect();
            vw.screen.replaceChildren(); // stops any live iframe and pending tiles
            history.replaceState(null, '', location.pathname + location.search);
            pOpener?.focus({ preventScroll: true });
        });
        window.addEventListener('resize', fitFrame);

        // Gallery platform filter (shown only when every platform has two or more stores).
        document.querySelectorAll('.gfilter').forEach((chip) => chip.addEventListener('click', () => {
            const f = chip.dataset.filter;
            document.querySelectorAll('.gfilter').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
            document.querySelectorAll('.gcard').forEach((card) => { card.hidden = f !== 'all' && card.dataset.platform !== f; });
        }));

        // Shared links open straight into a store: portfolio.digitalheroes.co.in/#preview=<slug>
        const fromHash = () => {
            const m = location.hash.match(/^#preview=([a-z0-9-]+)$/);
            if (m && (!viewer.open || pList[pAt] !== m[1])) openPreview(m[1]);
        };
        fromHash();
        window.addEventListener('hashchange', fromHash);
    }

    /* ---------- Print ----------
       Each printed sheet gets a footer with its page number. The plans section
       prints as one sheet per plan type, so those panels are the sheets. */
    const printPages = [...document.querySelectorAll('section.page:not(.plans), .plan-panel')]; // document order
    printPages.forEach((page, i) => {
        const foot = document.createElement('div');
        foot.className = 'print-foot';
        foot.setAttribute('aria-hidden', 'true');
        foot.innerHTML = `<span><b>Digital Heroes</b> &nbsp;Portfolio</span><span>portfolio.digitalheroes.co.in</span><span>${pad(i + 1)} / ${pad(printPages.length)}</span>`;
        page.appendChild(foot);
    });

    // Lazy images that were never scrolled to can print as empty boxes.
    function loadAllImages() {
        const images = [...document.images];
        images.forEach((img) => { img.loading = 'eager'; });
        return Promise.all(images.map((img) => (img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
            }))));
    }
    window.addEventListener('beforeprint', () => { showAll(); loadAllImages(); });

    // Used by scripts/build-pdf.py.
    window.loadAllImages = loadAllImages;
    window.revealAll = showAll;
})();
