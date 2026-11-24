/*
 * CalDAV (RFC 4791) client of the calendar, through the relay (Suite.relay.http: no CORS, any method).
 *
 *   CALDAV.discover(relay, account) -> [{ url, name, color, components: ['VEVENT', 'VTODO'], ctag }]
 *       account: { url, username, password } – the server, a principal or a calendar address; tries the URL itself,
 *       current-user-principal → calendar-home-set, and /.well-known/caldav
 *   CALDAV.objects(relay, account, calendarUrl) -> [{ url, etag, data }]       every calendar object (REPORT calendar-query)
 *   CALDAV.put(relay, account, url, ics, etag | null) -> new etag | null       If-Match (update) or If-None-Match: * (new)
 *   CALDAV.remove(relay, account, url, etag)
 *   Errors: CALDAV.HttpError with .status (412 = changed on the server in the meantime).
 */
(function () {
  'use strict';

  const NS = { d: 'DAV:', c: 'urn:ietf:params:xml:ns:caldav', cs: 'http://calendarserver.org/ns/', a: 'http://apple.com/ns/ical/' };

  class HttpError extends Error {
    constructor(status, reason, url) { super(`HTTP ${status}${reason ? ` ${reason}` : ''} (${url})`); this.status = status; }
  }

  const utf8b64 = (s) => { const b = new TextEncoder().encode(s); let x = ''; for (const c of b) x += String.fromCharCode(c); return btoa(x); };

  async function request(relay, account, method, url, { body = null, headers = [], depth = null, ok = [200, 201, 204, 207] } = {}) {
    const h = [['Authorization', `Basic ${utf8b64(`${account.username || ''}:${account.password || ''}`)}`], ['User-Agent', 'PortableWebAppSuite-Calendar'], ...headers];
    if (depth !== null) h.push(['Depth', String(depth)]);
    if (body !== null && !headers.some(([n]) => n.toLowerCase() === 'content-type')) h.push(['Content-Type', 'application/xml; charset=utf-8']);
    // redirects are followed here with the same method (PROPFIND, REPORT: an HTTP library would turn them into GET or refuse)
    let r, target = url;
    for (let hop = 0; ; hop++) {
      r = await Suite.relay.http(relay, { method, url: target, headers: h, body: body === null ? undefined : body, followRedirects: false, timeout: 60, insecure: !!account.insecure });
      const location = [301, 302, 303, 307, 308].includes(r.status) && (r.headers || []).find(([n]) => n.toLowerCase() === 'location');
      if (!location || hop >= 5) break;
      target = new URL(location[1], target).href;
    }
    if (!ok.includes(r.status)) throw new HttpError(r.status, r.reason, target);
    r.url = target;
    return { ...r, text: new TextDecoder().decode(r.body || new Uint8Array()), header: (name) => { const x = (r.headers || []).find(([n]) => n.toLowerCase() === name.toLowerCase()); return x ? x[1] : null; } };
  }

  const xml = (text) => new DOMParser().parseFromString(text, 'application/xml');
  const kids = (el, ns, name) => (el ? [...el.getElementsByTagNameNS(ns, name)] : []);
  const first = (el, ns, name) => kids(el, ns, name)[0] || null;
  const abs = (href, base) => new URL(href.trim(), base).href;

  /** The <response> elements of a multistatus with their href and the properties of their 2xx propstats. */
  function responses(text, base) {
    return kids(xml(text).documentElement, NS.d, 'response').map((r) => {
      const props = kids(r, NS.d, 'propstat').filter((ps) => /\s2\d\d\s/.test(` ${(first(ps, NS.d, 'status') || {}).textContent || 'HTTP/1.1 200 OK'} `)).map((ps) => first(ps, NS.d, 'prop')).filter(Boolean);
      const find = (ns, name) => { for (const p of props) { const e = first(p, ns, name); if (e) return e; } return null; };
      return { url: abs((first(r, NS.d, 'href') || {}).textContent || '', base), find };
    });
  }

  const PROPS = `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/"><d:prop>
<d:resourcetype/><d:displayname/><d:current-user-principal/><c:calendar-home-set/><c:supported-calendar-component-set/><a:calendar-color/><cs:getctag/>
</d:prop></d:propfind>`;

  const isCalendar = (r) => { const t = r.find(NS.d, 'resourcetype'); return !!(t && first(t, NS.c, 'calendar')); };
  function describe(r) {
    const comps = r.find(NS.c, 'supported-calendar-component-set');
    const color = r.find(NS.a, 'calendar-color');
    const name = r.find(NS.d, 'displayname');
    return {
      url: r.url, name: (name && name.textContent.trim()) || decodeURIComponent(new URL(r.url).pathname.split('/').filter(Boolean).pop() || r.url),
      color: color && /^#[0-9a-f]{6}/i.test(color.textContent.trim()) ? color.textContent.trim().slice(0, 7) : null,
      components: comps ? kids(comps, NS.c, 'comp').map((c) => c.getAttribute('name')) : ['VEVENT', 'VTODO'],
      ctag: (r.find(NS.cs, 'getctag') || {}).textContent || null,
    };
  }

  async function propfind(relay, account, url, depth) {
    const r = await request(relay, account, 'PROPFIND', url, { body: PROPS, depth });
    return responses(r.text, r.url || url);
  }

  async function discover(relay, account) {
    const start = account.url.trim();
    const tried = new Set();
    const calendarsIn = async (home) => (await propfind(relay, account, home, 1)).filter(isCalendar).map(describe);
    const fromUrl = async (url) => {
      if (tried.has(url)) return [];
      tried.add(url);
      const [self] = await propfind(relay, account, url, 0);
      if (!self) return [];
      if (isCalendar(self)) return [describe(self)];
      let home = self.find(NS.c, 'calendar-home-set');
      if (!home) {
        const principal = first(self.find(NS.d, 'current-user-principal'), NS.d, 'href');
        if (principal) {
          const [p] = await propfind(relay, account, abs(principal.textContent, self.url), 0);
          home = p && p.find(NS.c, 'calendar-home-set');
        }
      }
      const href = home && first(home, NS.d, 'href');
      if (href) return calendarsIn(abs(href.textContent, self.url));
      return calendarsIn(self.url); // (a folder with calendars)
    };
    let found = [];
    try { found = await fromUrl(start); } catch (e) { if (!(e instanceof HttpError) || ![404, 405, 501].includes(e.status)) throw e; }
    if (!found.length) {
      try { found = await fromUrl(new URL('/.well-known/caldav', start).href); } catch (e) { if (!(e instanceof HttpError)) throw e; }
    }
    return found.filter((c) => c.components.some((x) => x === 'VEVENT' || x === 'VTODO'));
  }

  const QUERY = `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop>
<c:filter><c:comp-filter name="VCALENDAR"/></c:filter></c:calendar-query>`;

  async function objects(relay, account, url) {
    const r = await request(relay, account, 'REPORT', url, { body: QUERY, depth: 1 });
    return responses(r.text, r.url || url).map((x) => ({ url: x.url, etag: ((x.find(NS.d, 'getetag') || {}).textContent || '').trim() || null, data: ((x.find(NS.c, 'calendar-data') || {}).textContent || '') }))
      .filter((x) => /BEGIN:VCALENDAR/i.test(x.data));
  }

  async function put(relay, account, url, ics, etag) {
    const headers = [['Content-Type', 'text/calendar; charset=utf-8'], etag ? ['If-Match', etag] : ['If-None-Match', '*']];
    const r = await request(relay, account, 'PUT', url, { body: ics, headers, ok: [200, 201, 204] });
    return r.header('ETag');
  }

  async function remove(relay, account, url, etag) {
    await request(relay, account, 'DELETE', url, { headers: etag ? [['If-Match', etag]] : [], ok: [200, 204, 404] });
  }

  window.CALDAV = { discover, objects, put, remove, HttpError };
})();
