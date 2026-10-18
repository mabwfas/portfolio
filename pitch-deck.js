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
        if (document.querySelector('.lightbox[open]')) return;
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
