// Quote form -> email to the client success inbox.
//
// Vercel serverless function (POST /api/contact). Zero dependencies: it calls
// the Resend REST API with fetch.
//
// Env on the Vercel project:
//   RESEND_API_KEY   required. The same Resend account the main site uses.
//   RESEND_FROM      optional sender, default below. Must be on a domain that
//                    is verified in that Resend account.
//   CONTACT_DRY_RUN  local preview only ("1"): log the email, send nothing.
//
// Security model: the recipient is a constant. Nothing in the request can
// choose who receives mail, and the visitor's address is only used as
// reply_to, so this cannot be used to send mail to anyone else. No
// confirmation email is sent to the visitor for the same reason.

const TO = 'clientsuccess@digitalheroesco.com';
const FROM_DEFAULT = 'Digital Heroes Portfolio <support@digitalheroes.co.in>';
const ALLOWED_ORIGINS = [
    /^https:\/\/portfolio\.digitalheroes\.co\.in$/,
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
    /^http:\/\/localhost(:\d+)?$/,
    /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];
const PROJECT_TYPES = ['Shopify', 'WordPress', 'Custom software', 'Not sure yet'];
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
const MIN_FILL_MS = 2500; // humans take longer than this to fill the form

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function readJson(req) {
    if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
    if (typeof req.body === 'string') {
        try { return Promise.resolve(JSON.parse(req.body)); } catch { return Promise.resolve(null); }
    }
    return new Promise((resolve) => {
        let raw = '';
        req.on('data', (c) => { raw += c; if (raw.length > 20000) req.destroy(); });
        req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
        req.on('error', () => resolve(null));
    });
}

function buildEmail(f) {
    const rows = [
        ['Name', f.name], ['Email', f.email], ['Phone / WhatsApp', f.phone || 'Not given'],
        ['Company', f.company || 'Not given'], ['Project type', f.type], ['Plan of interest', f.plan || 'Not sure yet'],
        ['Budget range', f.budget || 'Not given'], ['Page', f.page || 'portfolio.digitalheroes.co.in'],
    ];
    const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nProject details:\n${f.message || 'Not given'}\n`;
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1b2333">
<h2 style="margin:0 0 12px">New quote request from the portfolio</h2>
<table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) =>
        `<tr><td style="color:#667;vertical-align:top">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('')}</table>
<h3 style="margin:18px 0 6px">Project details</h3>
<p style="white-space:pre-wrap;margin:0">${esc(f.message || 'Not given')}</p>
<p style="color:#889;font-size:12px;margin-top:18px">Reply to this email to answer ${esc(f.name)} directly.</p></div>`;
    return { text, html };
}

// GET /api/contact?health=1 -> is the form able to send? Sends no email.
// Reports only booleans and the sender domain, never the key.
async function health() {
    const from = process.env.RESEND_FROM || FROM_DEFAULT;
    const senderDomain = (from.match(/@([^>\s]+)/) || [])[1] || null;
    const out = { keyConfigured: Boolean(process.env.RESEND_API_KEY), keyAccepted: null, senderDomain, senderVerified: null };
    if (!out.keyConfigured) return { ...out, ready: false, fix: 'Add RESEND_API_KEY to the Production environment and redeploy.' };
    try {
        const r = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
        const body = await r.json().catch(() => ({}));
        if (r.ok) {
            const d = (body.data || []).find((x) => x.name === senderDomain);
            out.keyAccepted = true;
            out.senderVerified = Boolean(d && d.status === 'verified');
            return { ...out, ready: out.senderVerified, fix: out.senderVerified ? null : `Verify ${senderDomain} in this Resend account, or set RESEND_FROM to an address on a verified domain.` };
        }
        if (r.status === 401 && body.name === 'restricted_api_key') {
            // A sending-only key cannot list domains; it is valid, the domain is unknown.
            out.keyAccepted = true;
            return { ...out, ready: null, fix: 'Key is sending-only, so the domain cannot be checked from here. Submit the form once to confirm.' };
        }
        out.keyAccepted = false;
        return { ...out, ready: false, fix: 'Resend rejected this key. Create a new API key in Resend and paste it into RESEND_API_KEY.' };
    } catch {
        return { ...out, ready: null, fix: 'Could not reach Resend to check.' };
    }
}

module.exports = async function handler(req, res) {
    const origin = req.headers.origin || '';
    if (origin && ALLOWED_ORIGINS.some((re) => re.test(origin))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(204).end();
    }
    if (req.method === 'GET' && /[?&]health=1\b/.test(req.url || '')) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(await health());
    }
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ ok: false, error: 'Method not allowed.' });
    }
    if (origin && !ALLOWED_ORIGINS.some((re) => re.test(origin))) {
        return res.status(403).json({ ok: false, error: 'Forbidden.' });
    }

    const body = await readJson(req);
    if (!body || typeof body !== 'object') {
        return res.status(400).json({ ok: false, error: 'Invalid request.' });
    }

    // Bots fill the hidden field or submit instantly. Answer as if it worked so
    // they learn nothing, but send nothing.
    const elapsed = Date.now() - Number(body.startedAt || 0);
    if (clean(body.website, 200) || !Number.isFinite(elapsed) || elapsed < MIN_FILL_MS) {
        return res.status(200).json({ ok: true });
    }

    const f = {
        name: clean(body.name, 120),
        email: clean(body.email, 200),
        phone: clean(body.phone, 60),
        company: clean(body.company, 160),
        type: clean(body.type, 40),
        plan: clean(body.plan, 120),
        budget: clean(body.budget, 60),
        message: clean(body.message, 5000),
        page: clean(body.page, 300),
    };
    if (!f.name) return res.status(400).json({ ok: false, error: 'Please enter your name.', field: 'name' });
    if (!EMAIL_RE.test(f.email)) return res.status(400).json({ ok: false, error: 'Please enter a valid email address.', field: 'email' });
    if (!PROJECT_TYPES.includes(f.type)) f.type = 'Not sure yet';

    const { text, html } = buildEmail(f);
    const mail = {
        from: process.env.RESEND_FROM || FROM_DEFAULT,
        to: [TO],
        reply_to: f.email, // REST API field name (the Node SDK calls it replyTo)
        subject: `Quote request: ${f.type}${f.plan ? `, ${f.plan}` : ''} from ${f.name}`,
        text,
        html,
    };

    if (process.env.CONTACT_DRY_RUN === '1') {
        console.log('[contact] DRY RUN, not sent:\n' + JSON.stringify({ ...mail, html: '(html omitted)' }, null, 2));
        return res.status(200).json({ ok: true, dryRun: true });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.error('[contact] RESEND_API_KEY is not set on this deployment');
        return res.status(503).json({ ok: false, error: 'The form is not set up yet.', code: 'NO_API_KEY' });
    }

    try {
        const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(mail),
        });
        if (!r.ok) {
            console.error('[contact] Resend refused:', r.status, (await r.text()).slice(0, 300));
            return res.status(502).json({ ok: false, error: 'We could not send your request.' });
        }
        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('[contact] Resend unreachable:', err && err.message);
        return res.status(502).json({ ok: false, error: 'We could not send your request.' });
    }
};
