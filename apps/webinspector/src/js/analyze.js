/*
 * Analysis for the web inspector: security headers, page structure and accessibility hints of an HTML document, HAR
 * helpers (entries, MIME groups, bodies, cURL, HAR export of own requests) and inlining of page resources for the preview.
 */

const header = (headers, name) => { const h = headers.find(([k]) => k.toLowerCase() === name); return h ? h[1] : null; };
const all = (headers, name) => headers.filter(([k]) => k.toLowerCase() === name).map(([, v]) => v);

/** Security header checks: [{ name, status: 'ok'|'warn'|'bad'|'info', value, note }] (note: i18n key and args). */
export function securityChecks(headers, url = '') {
  const https = /^https:/i.test(url);
  const out = [];
  const add = (name, status, value, note, ...args) => out.push({ name, status, value: value || '', note, args });
  const hsts = header(headers, 'strict-transport-security');
  if (!https) add('Strict-Transport-Security', 'bad', hsts, 'sec.noHttps');
  else if (!hsts) add('Strict-Transport-Security', 'warn', '', 'sec.hstsMissing');
  else {
    const age = Number((/max-age=(\d+)/i.exec(hsts) || [])[1] || 0);
    add('Strict-Transport-Security', age >= 15552000 ? 'ok' : 'warn', hsts, age >= 15552000 ? 'sec.hstsOk' : 'sec.hstsShort');
  }
  const csp = header(headers, 'content-security-policy');
  if (!csp) add('Content-Security-Policy', 'warn', header(headers, 'content-security-policy-report-only') || '', 'sec.cspMissing');
  else {
    const weak = [];
    if (/script-src[^;]*'unsafe-inline'/i.test(csp) && !/script-src[^;]*'(nonce|sha\d+)-/i.test(csp)) weak.push("'unsafe-inline'");
    if (/script-src[^;]*'unsafe-eval'/i.test(csp)) weak.push("'unsafe-eval'");
    if (!/(default-src|script-src)/i.test(csp)) weak.push('no script-src');
    add('Content-Security-Policy', weak.length ? 'warn' : 'ok', csp, weak.length ? 'sec.cspWeak' : 'sec.cspOk', weak.join(', '));
  }
  const xfo = header(headers, 'x-frame-options');
  const fa = csp && /frame-ancestors/i.test(csp);
  add('X-Frame-Options / frame-ancestors', xfo || fa ? 'ok' : 'warn', xfo || (fa ? (/frame-ancestors[^;]*/i.exec(csp) || [''])[0] : ''), xfo || fa ? 'sec.framingOk' : 'sec.framingMissing');
  const xcto = header(headers, 'x-content-type-options');
  add('X-Content-Type-Options', /nosniff/i.test(xcto || '') ? 'ok' : 'warn', xcto, /nosniff/i.test(xcto || '') ? 'sec.ok' : 'sec.nosniffMissing');
  const rp = header(headers, 'referrer-policy');
  add('Referrer-Policy', rp ? (/unsafe-url/i.test(rp) ? 'warn' : 'ok') : 'info', rp, rp ? 'sec.ok' : 'sec.referrerDefault');
  const pp = header(headers, 'permissions-policy');
  add('Permissions-Policy', pp ? 'ok' : 'info', pp, pp ? 'sec.ok' : 'sec.permissionsMissing');
  for (const name of ['cross-origin-opener-policy', 'cross-origin-embedder-policy', 'cross-origin-resource-policy']) {
    const v = header(headers, name);
    add(name.replace(/(^|-)(\w)/g, (m, d, c) => d + c.toUpperCase()), v ? 'ok' : 'info', v, v ? 'sec.ok' : 'sec.optional');
  }
  for (const cookie of all(headers, 'set-cookie')) {
    const name = cookie.split('=')[0];
    const missing = [];
    if (!/;\s*secure/i.test(cookie)) missing.push('Secure');
    if (!/;\s*httponly/i.test(cookie)) missing.push('HttpOnly');
    if (!/;\s*samesite=/i.test(cookie)) missing.push('SameSite');
    add(`Set-Cookie: ${name}`, missing.length ? 'warn' : 'ok', cookie, missing.length ? 'sec.cookieFlags' : 'sec.ok', missing.join(', '));
  }
  for (const name of ['server', 'x-powered-by', 'x-aspnet-version']) {
    const v = header(headers, name);
    if (v && /\d/.test(v)) add(name.replace(/(^|-)(\w)/g, (m, d, c) => d + c.toUpperCase()), 'info', v, 'sec.disclosure');
  }
  return out;
}

/** Structure of an HTML document: title, meta, headings, links, images, scripts, styles, forms, frames and hints. */
export function structure(source, baseUrl = '') {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const abs = (u) => { try { return new URL(u, baseUrl || undefined).href; } catch (e) { return u || ''; } };
  const host = (() => { try { return new URL(baseUrl).host; } catch (e) { return ''; } })();
  const metas = [...doc.querySelectorAll('meta')].map((m) => ({ name: m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('http-equiv') || (m.hasAttribute('charset') ? 'charset' : ''), content: m.getAttribute('content') || m.getAttribute('charset') || '' })).filter((m) => m.name);
  const headings = [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({ level: Number(h.tagName[1]), text: h.textContent.trim().replace(/\s+/g, ' ').slice(0, 200) }));
  const links = [...doc.querySelectorAll('a[href]')].map((a) => {
    const href = abs(a.getAttribute('href'));
    let external = false;
    try { external = !!host && new URL(href).host !== host; } catch (e) { /* not a URL */ }
    return { href, text: a.textContent.trim().replace(/\s+/g, ' ').slice(0, 120), external, nofollow: /nofollow/i.test(a.getAttribute('rel') || '') };
  });
  const images = [...doc.querySelectorAll('img')].map((i) => ({ src: abs(i.getAttribute('src') || ''), alt: i.getAttribute('alt'), width: i.getAttribute('width') || '', height: i.getAttribute('height') || '' }));
  const scripts = [...doc.querySelectorAll('script')].map((s) => ({ src: s.getAttribute('src') ? abs(s.getAttribute('src')) : '', type: s.getAttribute('type') || '', inline: !s.getAttribute('src'), size: s.textContent.length, async: s.hasAttribute('async'), defer: s.hasAttribute('defer') }));
  const styles = [...doc.querySelectorAll('link[rel~=stylesheet], style')].map((s) => ({ href: s.tagName === 'LINK' ? abs(s.getAttribute('href')) : '', inline: s.tagName === 'STYLE', size: s.textContent.length }));
  const forms = [...doc.querySelectorAll('form')].map((f) => ({
    action: abs(f.getAttribute('action') || ''), method: (f.getAttribute('method') || 'GET').toUpperCase(),
    fields: [...f.querySelectorAll('input, select, textarea')].map((i) => `${i.getAttribute('name') || i.id || '?'} (${i.getAttribute('type') || i.tagName.toLowerCase()})`),
  }));
  const frames = [...doc.querySelectorAll('iframe, frame')].map((f) => abs(f.getAttribute('src') || ''));
  const hints = [];
  if (!doc.documentElement.getAttribute('lang')) hints.push(['a11y.noLang']);
  if (!doc.title.trim()) hints.push(['a11y.noTitle']);
  if (!metas.some((m) => m.name === 'viewport')) hints.push(['a11y.noViewport']);
  const noAlt = images.filter((i) => i.alt === null).length;
  if (noAlt) hints.push(['a11y.noAlt', noAlt]);
  const h1 = headings.filter((h) => h.level === 1).length;
  if (h1 !== 1) hints.push(['a11y.h1', h1]);
  for (let i = 1; i < headings.length; i++) if (headings[i].level > headings[i - 1].level + 1) { hints.push(['a11y.skip', `h${headings[i - 1].level} → h${headings[i].level}`]); break; }
  const unlabeled = [...doc.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea')].filter((i) => !(i.id && doc.querySelector(`label[for="${CSS.escape(i.id)}"]`)) && !i.closest('label') && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby') && !i.getAttribute('title')).length;
  if (unlabeled) hints.push(['a11y.noLabel', unlabeled]);
  const emptyLinks = links.filter((l) => !l.text).length - [...doc.querySelectorAll('a[href]')].filter((a) => !a.textContent.trim() && (a.getAttribute('aria-label') || a.querySelector('img[alt]:not([alt=""])'))).length;
  if (emptyLinks > 0) hints.push(['a11y.emptyLinks', emptyLinks]);
  for (const s of scripts) if (s.src && /^http:/i.test(s.src) && /^https:/i.test(baseUrl)) { hints.push(['sec.mixed', s.src]); break; }
  for (const f of forms) if (/^http:/i.test(f.action) && /^https:/i.test(baseUrl)) { hints.push(['sec.formHttp', f.action]); break; }
  return {
    title: doc.title, lang: doc.documentElement.getAttribute('lang') || '', charset: doc.characterSet, metas, headings, links, images, scripts, styles, forms, frames, hints,
    canonical: (doc.querySelector('link[rel=canonical]') || { href: '' }).getAttribute?.('href') || '',
    elements: doc.getElementsByTagName('*').length,
  };
}

// ---- HAR ------------------------------------------------------------------------------------------------------------------

export function parseHar(text) {
  const har = JSON.parse(text);
  if (!har.log || !Array.isArray(har.log.entries)) throw new Error('not a HAR file (log.entries missing)');
  return har.log;
}

export function mimeGroup(mime = '', url = '') {
  const m = mime.toLowerCase();
  if (/html/.test(m)) return 'doc';
  if (/css/.test(m)) return 'css';
  if (/javascript|ecmascript/.test(m) || /\.m?js(\?|$)/.test(url)) return 'js';
  if (/^image\//.test(m)) return 'img';
  if (/font|woff|ttf|otf/.test(m)) return 'font';
  if (/^(audio|video)\//.test(m)) return 'media';
  if (/json|xml/.test(m)) return 'xhr';
  return 'other';
}

/** Response body text or bytes of a HAR entry. */
export function bodyOf(entry) {
  const c = (entry.response && entry.response.content) || {};
  if (c.text == null) return null;
  if (c.encoding === 'base64') {
    const bin = atob(c.text);
    return { bytes: Uint8Array.from(bin, (ch) => ch.charCodeAt(0)), mime: c.mimeType || '' };
  }
  return { text: c.text, mime: c.mimeType || '' };
}

const shq = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

export function curl(entry) {
  const r = entry.request;
  const parts = [`curl ${shq(r.url)}`];
  if (r.method !== 'GET') parts.push(`-X ${r.method}`);
  for (const h of r.headers || []) if (!/^(:|content-length$|host$|accept-encoding$)/i.test(h.name)) parts.push(`-H ${shq(`${h.name}: ${h.value}`)}`);
  if (r.postData && r.postData.text != null) parts.push(`--data-raw ${shq(r.postData.text)}`);
  return parts.join(' \\\n  ');
}

/** A HAR 1.2 log of own requests [{ started, method, url, requestHeaders, status, reason, httpVersion, headers, body, timeMs }]. */
export function toHar(requests, page = {}) {
  const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const text = (bytes, mime) => (/^text\/|json|xml|javascript|svg/.test(mime) ? { text: new TextDecoder().decode(bytes) } : { text: b64(bytes), encoding: 'base64' });
  const kv = (list) => (list || []).map(([name, value]) => ({ name, value }));
  return {
    log: {
      version: '1.2', creator: { name: 'Portable Web App Suite – Web inspector', version: '1' },
      pages: page.url ? [{ id: 'page_1', startedDateTime: new Date(requests[0] ? requests[0].started : Date.now()).toISOString(), title: page.title || page.url, pageTimings: {} }] : [],
      entries: requests.map((r) => {
        const mime = (r.headers.find(([k]) => k.toLowerCase() === 'content-type') || [, ''])[1];
        return {
          pageref: page.url ? 'page_1' : undefined, startedDateTime: new Date(r.started).toISOString(), time: r.timeMs,
          request: { method: r.method, url: r.url, httpVersion: r.httpVersion || 'HTTP/1.1', headers: kv(r.requestHeaders), queryString: [...new URL(r.url).searchParams].map(([name, value]) => ({ name, value })), cookies: [], headersSize: -1, bodySize: 0 },
          response: { status: r.status, statusText: r.reason || '', httpVersion: r.httpVersion || 'HTTP/1.1', headers: kv(r.headers), cookies: [], content: { size: r.body.length, mimeType: mime, ...text(r.body, mime) }, redirectURL: '', headersSize: -1, bodySize: r.body.length },
          cache: {}, timings: { send: 0, wait: r.timeMs, receive: 0 },
        };
      }),
    },
  };
}

// ---- preview ---------------------------------------------------------------------------------------------------------------

const bytesToDataUrl = (bytes, mime) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime || 'application/octet-stream'};base64,${btoa(s)}`;
};

/**
 * Preview document of a page: scripts, frames, forms' actions and event handlers removed, <base> set; with `fetchResource`
 * (url -> { bytes, mime } or null), stylesheets are inlined and images, CSS images and fonts become data: URLs.
 */
export async function previewDocument(source, url, { fetchResource = null, limit = 80 } = {}) {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  doc.querySelectorAll('script, noscript, iframe, frame, frameset, object, embed, base, meta[http-equiv]').forEach((e) => e.remove());
  for (const el of doc.querySelectorAll('*')) {
    for (const a of [...el.attributes]) if (/^on/i.test(a.name) || (/^(href|src|action|formaction)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
  }
  const abs = (u, base = url) => { try { return new URL(u, base).href; } catch (e) { return null; } };
  let count = 0;
  const get = async (u) => {
    if (!fetchResource || !u || count >= limit || !/^https?:/i.test(u)) return null;
    count++;
    try { return await fetchResource(u); } catch (e) { return null; }
  };
  const inlineCss = async (css, base) => {
    const urls = [...new Set([...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)].map((m) => m[2]).filter((u) => !/^data:/i.test(u)))];
    for (const u of urls) {
      const target = abs(u, base);
      const r = await get(target);
      // resources that could not be loaded (or are blocked) must not be requested by the preview either
      css = css.split(u).join(r ? bytesToDataUrl(r.bytes, r.mime) : 'data:,');
    }
    return css.replace(/@import\s+[^;]+;/gi, '');
  };
  if (fetchResource) {
    // the page's own styles first: linked stylesheets are inlined below (each only once)
    for (const style of doc.querySelectorAll('style')) style.textContent = await inlineCss(style.textContent, url);
    for (const link of [...doc.querySelectorAll('link[rel~=stylesheet][href]')]) {
      const target = abs(link.getAttribute('href'));
      const r = await get(target);
      const style = doc.createElement('style');
      if (r) style.textContent = await inlineCss(new TextDecoder().decode(r.bytes), target);
      link.replaceWith(style);
    }
    for (const img of doc.querySelectorAll('img[src], input[type=image][src], video[poster]')) {
      const attr = img.hasAttribute('poster') ? 'poster' : 'src';
      const r = await get(abs(img.getAttribute(attr)));
      if (r) img.setAttribute(attr, bytesToDataUrl(r.bytes, r.mime));
      else { img.setAttribute(`data-original-${attr}`, img.getAttribute(attr)); img.removeAttribute(attr); }
      img.removeAttribute('srcset');
    }
    for (const el of doc.querySelectorAll('[style*="url("]')) el.setAttribute('style', await inlineCss(el.getAttribute('style'), url));
  }
  doc.querySelectorAll('img[srcset], source[srcset]').forEach((e) => e.removeAttribute('srcset'));
  for (const a of doc.querySelectorAll('a[href]')) { const h = abs(a.getAttribute('href')); if (h) a.setAttribute('href', h); }
  for (const f of doc.querySelectorAll('form')) f.removeAttribute('action');
  return { html: `<!doctype html>\n${doc.documentElement.outerHTML}`, fetched: count };
}

// ---- source highlighting ------------------------------------------------------------------------------------------------------

/** HTML source as highlighted HTML (tags, attributes, strings, comments). */
export function highlightHtml(source) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return source.replace(/(<!--[\s\S]*?-->)|(<\/?[\w:-]+)((?:\s+[\w:@.-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)(\s*\/?>)|([^<]+|<)/g, (m, comment, tag, attrs, close, text) => {
    if (comment) return `<span class="hl-c">${esc(comment)}</span>`;
    if (tag) {
      const a = attrs.replace(/([\w:@.-]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)?/g, (x, name, eq, value) => `<span class="hl-a">${esc(name)}</span>${value ? `${esc(eq)}<span class="hl-s">${esc(value)}</span>` : esc(eq || '')}`);
      return `<span class="hl-t">${esc(tag)}</span>${a}<span class="hl-t">${esc(close)}</span>`;
    }
    return esc(text);
  });
}

// ---- cookies and request blocking -------------------------------------------------------------------------------------------

/**
 * One Set-Cookie header of a response from `url` (RFC 6265, simplified): { name, value, domain, hostOnly, path, expires
 * (ms since 1970, null for a session cookie), secure, httpOnly, sameSite, raw }; null when the cookie must be rejected.
 */
export function parseSetCookie(header, url, now = Date.now()) {
  const u = new URL(url);
  const [pair, ...attrs] = header.split(';');
  const eq = pair.indexOf('=');
  const name = (eq < 0 ? '' : pair.slice(0, eq)).trim(), value = (eq < 0 ? pair : pair.slice(eq + 1)).trim();
  if (!name && !value) return null;
  const c = { name, value, domain: u.hostname, hostOnly: true, path: u.pathname.replace(/\/[^/]*$/, '') || '/', expires: null, secure: false, httpOnly: false, sameSite: '', raw: header };
  let maxAge = null;
  for (const a of attrs) {
    const i = a.indexOf('=');
    const k = (i < 0 ? a : a.slice(0, i)).trim().toLowerCase(), v = i < 0 ? '' : a.slice(i + 1).trim();
    if (k === 'domain' && v) {
      const d = v.replace(/^\./, '').toLowerCase();
      if (u.hostname !== d && !u.hostname.endsWith(`.${d}`)) return null; // a site may not set cookies for another one
      c.domain = d; c.hostOnly = false;
    } else if (k === 'path' && v.startsWith('/')) c.path = v;
    else if (k === 'expires') { const tm = Date.parse(v); if (!Number.isNaN(tm)) c.expires = tm; } else if (k === 'max-age' && /^-?\d+$/.test(v)) maxAge = Number(v);
    else if (k === 'secure') c.secure = true;
    else if (k === 'httponly') c.httpOnly = true;
    else if (k === 'samesite') c.sameSite = v;
  }
  if (maxAge != null) c.expires = now + maxAge * 1000; // Max-Age wins over Expires
  return c;
}

/** Does a cookie go with a request to `url`? */
export function cookieMatches(c, url, now = Date.now()) {
  const u = new URL(url);
  if (c.expires != null && c.expires <= now) return false;
  if (c.secure && u.protocol !== 'https:') return false;
  const host = u.hostname;
  if (c.hostOnly ? host !== c.domain : host !== c.domain && !host.endsWith(`.${c.domain}`)) return false;
  return u.pathname === c.path || u.pathname.startsWith(c.path.endsWith('/') ? c.path : `${c.path}/`) || c.path === '/';
}

/** The jar after a response from `url`: cookies replace those with the same name, domain and path; expired ones delete them. */
export function storeCookies(jar, headers, url, now = Date.now()) {
  let out = jar.slice();
  for (const [k, v] of headers || []) {
    if (k.toLowerCase() !== 'set-cookie') continue;
    const c = parseSetCookie(v, url, now);
    if (!c) continue;
    out = out.filter((x) => !(x.name === c.name && x.domain === c.domain && x.path === c.path));
    if (c.expires == null || c.expires > now) out.push({ ...c, setBy: url });
  }
  return out;
}

/** The Cookie request header for `url` (longer paths first), or ''. */
export function cookieHeader(jar, url, now = Date.now()) {
  return jar.filter((c) => cookieMatches(c, url, now)).sort((a, b) => b.path.length - a.path.length).map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * The blocking rule (one per line; # starts a comment) that matches `url`, or null. A rule without * and / blocks a host and
 * its subdomains ("ads.example.com"); otherwise it is a pattern for the whole address with * as wildcard (e.g. "*.woff2").
 */
const escapeRe = (x) => x.replace(/[.+?^$|()[\]{}\\]/g, '\\$&');

export function blockedBy(rules, url) {
  let host = '';
  try { host = new URL(url).hostname; } catch (e) { return null; }
  for (const line of String(rules || '').split('\n')) {
    const rule = line.replace(/#.*/, '').trim();
    if (!rule) continue;
    if (!/[*/]/.test(rule)) { if (host === rule.toLowerCase() || host.endsWith(`.${rule.toLowerCase()}`)) return rule; continue; }
    const re = new RegExp('^' + rule.split('*').map(escapeRe).join('.*') + '$', 'i');
    if (re.test(url) || (!/^\w+:/.test(rule) && re.test(url.replace(/^\w+:\/\//, '')))) return rule;
  }
  return null;
}
