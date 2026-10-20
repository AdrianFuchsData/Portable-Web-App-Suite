/*
 * Requests and collections of the HTTP analyzer: request model, {{variables}}, request body encoding (raw, form,
 * multipart, file), cURL import/export and Postman collection v2.1 import/export.
 *
 * request: { id, name, method, url, prerequest, tests (JavaScript, see scripts.js), headers: [{ key, value, enabled }], body: { mode: 'none'|'raw'|'urlencoded'|'formdata'|'file',
 *            raw, language, fields: [{ key, value, enabled, type: 'text'|'file', file }], file }, auth: { type: 'none'|'basic'|'bearer', username, password, token } }
 * collection: { name, items: [{ type: 'folder', name, items } | { type: 'request', ...request }], variables: [{ key, value, enabled }] }
 */

let counter = 0;
export const newId = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export function newRequest(props = {}) {
  return {
    type: 'request', id: newId(), name: 'New request', method: 'GET', url: '', prerequest: '', tests: '',
    headers: [], body: { mode: 'none', raw: '', language: 'json', fields: [], file: null }, auth: { type: 'none', username: '', password: '', token: '' },
    ...props,
  };
}

export const LANGUAGE_TYPES = { json: 'application/json', xml: 'application/xml', text: 'text/plain', html: 'text/html', javascript: 'application/javascript' };

// ---- URL and query parameters ------------------------------------------------------------------------

/** Query parameters of a URL as rows (variables like {{x}} stay unencoded). */
export function paramsOf(url) {
  const q = url.indexOf('?');
  if (q < 0) return [];
  const hash = url.indexOf('#', q);
  return url.slice(q + 1, hash < 0 ? undefined : hash).split('&').filter((p) => p !== '').map((p) => {
    const eq = p.indexOf('=');
    const dec = (s) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { return s; } };
    return { key: dec(eq < 0 ? p : p.slice(0, eq)), value: eq < 0 ? '' : dec(p.slice(eq + 1)), enabled: true };
  });
}

const encodePart = (s) => encodeURIComponent(s).replace(/%7B%7B/g, '{{').replace(/%7D%7D/g, '}}');

/** URL with its query replaced by the enabled rows. */
export function withParams(url, rows) {
  const q = url.indexOf('?');
  const hash = url.indexOf('#');
  const base = url.slice(0, q < 0 ? (hash < 0 ? undefined : hash) : q);
  const fragment = hash < 0 ? '' : url.slice(hash);
  const query = rows.filter((r) => r.enabled && r.key !== '').map((r) => `${encodePart(r.key)}${r.value !== '' ? `=${encodePart(r.value)}` : ''}`).join('&');
  return `${base}${query ? `?${query}` : ''}${fragment}`;
}

// ---- variables ------------------------------------------------------------------------------------------

/** Replace {{name}} with values (environment first, then collection variables); unknown names stay. */
export function resolve(text, vars) {
  return String(text ?? '').replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, name) => (vars.has(name) ? vars.get(name) : m));
}

export function variableMap(...lists) {
  const map = new Map();
  for (const list of lists) for (const v of list || []) if (v.enabled !== false && v.key) map.set(v.key, v.value ?? '');
  return map;
}

// ---- building the request --------------------------------------------------------------------------------

const enc = new TextEncoder();

/** Final { method, url, headers: [[k, v]], body: Uint8Array|null } of a request. */
export async function build(req, vars) {
  const r = (s) => resolve(s, vars);
  let url = r(req.url).trim();
  if (url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `http://${url}`;
  const headers = req.headers.filter((h) => h.enabled && h.key).map((h) => [r(h.key), r(h.value)]);
  const has = (name) => headers.some(([k]) => k.toLowerCase() === name.toLowerCase());
  const a = req.auth || {};
  if (a.type === 'basic' && !has('authorization')) {
    const bytes = enc.encode(`${r(a.username)}:${r(a.password)}`);
    headers.push(['Authorization', `Basic ${btoa(String.fromCharCode(...bytes))}`]);
  }
  if (a.type === 'bearer' && !has('authorization')) headers.push(['Authorization', `Bearer ${r(a.token)}`]);
  let body = null;
  const b = req.body || { mode: 'none' };
  if (!['GET', 'HEAD'].includes(req.method) || b.mode !== 'none') {
    if (b.mode === 'raw') {
      body = enc.encode(r(b.raw));
      if (!has('content-type')) headers.push(['Content-Type', LANGUAGE_TYPES[b.language] || 'text/plain']);
    } else if (b.mode === 'urlencoded') {
      body = enc.encode(b.fields.filter((f) => f.enabled && f.key).map((f) => `${encodeURIComponent(r(f.key))}=${encodeURIComponent(r(f.value))}`).join('&').replace(/%20/g, '+'));
      if (!has('content-type')) headers.push(['Content-Type', 'application/x-www-form-urlencoded']);
    } else if (b.mode === 'formdata') {
      const boundary = `----SuiteFormBoundary${Math.random().toString(36).slice(2)}`;
      const parts = [];
      for (const f of b.fields.filter((x) => x.enabled && x.key)) {
        if (f.type === 'file' && f.file) {
          parts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${r(f.key).replace(/"/g, '%22')}"; filename="${f.file.name.replace(/"/g, '%22')}"\r\nContent-Type: ${f.file.type || 'application/octet-stream'}\r\n\r\n`));
          parts.push(new Uint8Array(await f.file.arrayBuffer()), enc.encode('\r\n'));
        } else parts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${r(f.key).replace(/"/g, '%22')}"\r\n\r\n${r(f.value)}\r\n`));
      }
      parts.push(enc.encode(`--${boundary}--\r\n`));
      body = concat(parts);
      if (!has('content-type')) headers.push(['Content-Type', `multipart/form-data; boundary=${boundary}`]);
    } else if (b.mode === 'file' && b.file) {
      body = new Uint8Array(await b.file.arrayBuffer());
      if (!has('content-type')) headers.push(['Content-Type', b.file.type || 'application/octet-stream']);
    }
  }
  return { method: req.method, url, headers, body };
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ---- cURL ------------------------------------------------------------------------------------------------

/** Split a shell command line (single and double quotes, backslash escapes, line continuations). */
function shellWords(text) {
  const words = [];
  let cur = '', inWord = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\' && (text[i + 1] === '\n' || text[i + 1] === '\r')) { i += text[i + 1] === '\r' && text[i + 2] === '\n' ? 2 : 1; continue; }
    if (/\s/.test(c)) { if (inWord) { words.push(cur); cur = ''; inWord = false; } continue; }
    inWord = true;
    if (c === "'") { const end = text.indexOf("'", i + 1); cur += text.slice(i + 1, end < 0 ? undefined : end); i = end < 0 ? text.length : end; } else if (c === '"') {
      i++;
      while (i < text.length && text[i] !== '"') { if (text[i] === '\\' && /["\\$`]/.test(text[i + 1])) i++; cur += text[i++]; }
    } else if (c === '$' && text[i + 1] === "'") {
      i += 2;
      while (i < text.length && text[i] !== "'") {
        if (text[i] === '\\') { const n = text[++i]; cur += { n: '\n', t: '\t', r: '\r', "'": "'", '\\': '\\' }[n] ?? n; i++; } else cur += text[i++];
      }
    } else if (c === '\\') cur += text[++i] ?? '';
    else cur += c;
  }
  if (inWord) words.push(cur);
  return words;
}

export function fromCurl(text) {
  const words = shellWords(text.trim());
  if (!/^curl(\.exe)?$/i.test(words[0] || '')) throw new Error('not a curl command');
  const req = newRequest({ name: 'Imported request' });
  const data = [];
  let explicitMethod = null, form = false, getData = false;
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    const next = () => words[++i] ?? '';
    if (w === '-X' || w === '--request') explicitMethod = next().toUpperCase();
    else if (w === '-H' || w === '--header') {
      const h = next();
      const c = h.indexOf(':');
      if (c > 0) req.headers.push({ key: h.slice(0, c).trim(), value: h.slice(c + 1).trim(), enabled: true });
    } else if (['-d', '--data', '--data-raw', '--data-binary', '--data-ascii'].includes(w)) data.push(next());
    else if (w === '--data-urlencode') { const v = next(); const eq = v.indexOf('='); data.push(eq > 0 ? `${v.slice(0, eq)}=${encodeURIComponent(v.slice(eq + 1))}` : encodeURIComponent(v)); }
    else if (w === '--json') { data.push(next()); req.headers.push({ key: 'Content-Type', value: 'application/json', enabled: true }, { key: 'Accept', value: 'application/json', enabled: true }); }
    else if (w === '-F' || w === '--form') { form = true; const v = next(); const eq = v.indexOf('='); req.body.fields.push({ key: v.slice(0, eq), value: v.slice(eq + 1).replace(/^@/, ''), enabled: true, type: v[eq + 1] === '@' ? 'file' : 'text' }); }
    else if (w === '-u' || w === '--user') { const v = next(); const c = v.indexOf(':'); req.auth = { type: 'basic', username: c < 0 ? v : v.slice(0, c), password: c < 0 ? '' : v.slice(c + 1), token: '' }; }
    else if (w === '-G' || w === '--get') getData = true;
    else if (w === '-A' || w === '--user-agent') req.headers.push({ key: 'User-Agent', value: next(), enabled: true });
    else if (w === '-e' || w === '--referer') req.headers.push({ key: 'Referer', value: next(), enabled: true });
    else if (w === '-b' || w === '--cookie') req.headers.push({ key: 'Cookie', value: next(), enabled: true });
    else if (w === '--url') req.url = next();
    else if (['-o', '--output', '--connect-timeout', '-m', '--max-time', '--retry', '-w', '--write-out'].includes(w)) next();
    else if (!w.startsWith('-')) req.url = w;
  }
  if (getData && data.length) { req.url += (req.url.includes('?') ? '&' : '?') + data.join('&'); data.length = 0; }
  if (form) req.body.mode = 'formdata';
  else if (data.length) {
    const ct = (req.headers.find((h) => h.key.toLowerCase() === 'content-type') || {}).value || '';
    const raw = data.join('&');
    if (!ct || /x-www-form-urlencoded/i.test(ct)) {
      if (!ct && /^\s*[[{]/.test(raw)) req.body = { ...req.body, mode: 'raw', raw, language: 'json' };
      else {
        req.body = { ...req.body, mode: 'urlencoded', fields: raw.split('&').map((p) => { const eq = p.indexOf('='); const d = (s) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { return s; } }; return { key: d(eq < 0 ? p : p.slice(0, eq)), value: eq < 0 ? '' : d(p.slice(eq + 1)), enabled: true, type: 'text' }; }) };
        req.headers = req.headers.filter((h) => h.key.toLowerCase() !== 'content-type');
      }
    } else req.body = { ...req.body, mode: 'raw', raw, language: /json/i.test(ct) ? 'json' : /xml/i.test(ct) ? 'xml' : 'text' };
  }
  req.method = explicitMethod || (data.length || form ? 'POST' : 'GET');
  try { req.name = `${req.method} ${new URL(req.url).pathname}`; } catch (e) { /* keep */ }
  return req;
}

const shQuote = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

/** curl command of a built request (bodies that are not valid UTF-8 text are left out with a note). */
export function toCurl(built) {
  const lines = [`curl${built.method !== 'GET' || built.body ? ` -X ${built.method}` : ''} ${shQuote(built.url)}`];
  for (const [k, v] of built.headers) lines.push(`-H ${shQuote(`${k}: ${v}`)}`);
  if (built.body && built.body.length) {
    let text = null;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(built.body); } catch (e) { text = null; }
    lines.push(`--data-binary ${text !== null ? shQuote(text) : "'@body.bin'"}`);
  }
  return lines.join(' \\\n  ');
}

// ---- Postman collection v2.1 --------------------------------------------------------------------------------

export function fromPostman(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || !data.info || !Array.isArray(data.item)) throw new Error('not a Postman collection');
  const convertItem = (it) => {
    if (Array.isArray(it.item)) return { type: 'folder', id: newId(), name: it.name || 'Folder', items: it.item.map(convertItem) };
    const r = typeof it.request === 'string' ? { url: it.request, method: 'GET' } : it.request || {};
    const url = typeof r.url === 'string' ? r.url : r.url ? r.url.raw || '' : '';
    const req = newRequest({ name: it.name || 'Request', method: (r.method || 'GET').toUpperCase(), url });
    req.headers = (r.header || []).map((h) => ({ key: h.key, value: h.value ?? '', enabled: !h.disabled }));
    const b = r.body;
    if (b && b.mode === 'raw') req.body = { ...req.body, mode: 'raw', raw: b.raw || '', language: (b.options && b.options.raw && b.options.raw.language) || 'text' };
    else if (b && (b.mode === 'urlencoded' || b.mode === 'formdata')) req.body = { ...req.body, mode: b.mode, fields: (b[b.mode] || []).map((f) => ({ key: f.key, value: f.value ?? f.src ?? '', enabled: !f.disabled, type: f.type === 'file' ? 'file' : 'text' })) };
    const a = r.auth;
    const authValue = (list, key) => ((list || []).find((x) => x.key === key) || {}).value ?? '';
    if (a && a.type === 'basic') req.auth = { type: 'basic', username: authValue(a.basic, 'username'), password: authValue(a.basic, 'password'), token: '' };
    if (a && a.type === 'bearer') req.auth = { type: 'bearer', username: '', password: '', token: authValue(a.bearer, 'token') };
    const script = (listen) => { const ev = (it.event || []).find((e) => e.listen === listen); const exec = ev && ev.script && ev.script.exec; return Array.isArray(exec) ? exec.join('\n') : exec || ''; };
    req.prerequest = script('prerequest');
    req.tests = script('test');
    return req;
  };
  return {
    name: data.info.name || 'Collection',
    items: data.item.map(convertItem),
    variables: (data.variable || []).map((v) => ({ key: v.key, value: v.value ?? '', enabled: !v.disabled })),
  };
}

export function toPostman(collection) {
  const convertItem = (it) => {
    if (it.type === 'folder') return { name: it.name, item: it.items.map(convertItem) };
    const request = {
      method: it.method,
      header: it.headers.map((h) => ({ key: h.key, value: h.value, ...(h.enabled ? {} : { disabled: true }) })),
      url: { raw: it.url },
    };
    const b = it.body;
    if (b.mode === 'raw') request.body = { mode: 'raw', raw: b.raw, options: { raw: { language: b.language } } };
    if (b.mode === 'urlencoded' || b.mode === 'formdata') {
      request.body = { mode: b.mode, [b.mode]: b.fields.map((f) => ({ key: f.key, ...(f.type === 'file' ? { type: 'file', src: f.file ? f.file.name : f.value } : { value: f.value, type: 'text' }), ...(f.enabled ? {} : { disabled: true }) })) };
    }
    if (it.auth.type === 'basic') request.auth = { type: 'basic', basic: [{ key: 'username', value: it.auth.username, type: 'string' }, { key: 'password', value: it.auth.password, type: 'string' }] };
    if (it.auth.type === 'bearer') request.auth = { type: 'bearer', bearer: [{ key: 'token', value: it.auth.token, type: 'string' }] };
    const event = [['prerequest', it.prerequest], ['test', it.tests]].filter(([, code]) => (code || '').trim())
      .map(([listen, code]) => ({ listen, script: { type: 'text/javascript', exec: code.split('\n') } }));
    return { name: it.name, ...(event.length ? { event } : {}), request };
  };
  return {
    info: { name: collection.name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: collection.items.map(convertItem),
    variable: (collection.variables || []).map((v) => ({ key: v.key, value: v.value, ...(v.enabled === false ? { disabled: true } : {}) })),
  };
}
