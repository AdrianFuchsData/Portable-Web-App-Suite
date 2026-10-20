/*
 * iCalendar (RFC 5545) for the calendar and the mail client: parsing and writing (unknown properties and components are
 * kept), dates with time zones (TZID via Intl, Windows zone names mapped, generated VTIMEZONE), recurrence expansion.
 *
 *   const cal = Suite.ical.parse(text);            // -> component tree { name, props: [{ name, params, value }], comps: [...] }
 *   const events = Suite.ical.events(cal);         // -> event objects (see eventFromComp)
 *   const occ = Suite.ical.expand(event, from, to);  // -> [{ start: ms, end: ms, recurrenceId: key, event }]
 *   const text = Suite.ical.serialize(cal);
 *
 * A zoned wall time ("zt") is { y, m, d, hh, mm, ss, date: bool, tz } where tz is 'floating', 'UTC' or a TZID.
 */
(function (Suite) {
  'use strict';

  // ---- lines and components ----------------------------------------------------------------------

  function unfold(text) {
    return text.replace(/^\uFEFF/, '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/).filter((l) => l.length);
  }

  function parseLine(line) {
    let i = 0, inQuote = false;
    for (; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQuote = !inQuote;
      else if (c === ':' && !inQuote) break;
    }
    const head = line.slice(0, i);
    const value = line.slice(i + 1);
    const parts = [];
    let cur = '';
    inQuote = false;
    for (const c of head) {
      if (c === '"') { inQuote = !inQuote; cur += c; } else if (c === ';' && !inQuote) { parts.push(cur); cur = ''; } else cur += c;
    }
    parts.push(cur);
    const params = {};
    for (const p of parts.slice(1)) {
      const eq = p.indexOf('=');
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"(.*)"$/, '$1');
    }
    return { name: parts[0].toUpperCase(), params, value };
  }

  function parse(text) {
    const root = { name: 'ROOT', props: [], comps: [] };
    const stack = [root];
    for (const line of unfold(text)) {
      const p = parseLine(line);
      if (p.name === 'BEGIN') {
        const comp = { name: p.value.toUpperCase().trim(), props: [], comps: [] };
        stack[stack.length - 1].comps.push(comp);
        stack.push(comp);
      } else if (p.name === 'END') {
        if (stack.length > 1) stack.pop();
      } else stack[stack.length - 1].props.push(p);
    }
    const cal = root.comps.find((c) => c.name === 'VCALENDAR');
    if (!cal) throw new Suite.LocalizedError('ical.invalid');
    return cal;
  }

  function foldLine(line) {
    // fold at 75 octets without splitting UTF-8 sequences
    const bytes = new TextEncoder().encode(line);
    if (bytes.length <= 75) return line;
    const out = [];
    let start = 0, first = true;
    while (start < bytes.length) {
      let end = Math.min(bytes.length, start + (first ? 75 : 74));
      while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
      out.push((first ? '' : ' ') + new TextDecoder().decode(bytes.subarray(start, end)));
      start = end;
      first = false;
    }
    return out.join('\r\n');
  }

  const paramValue = (v) => (/[;:,"]/.test(v) ? `"${v.replace(/"/g, '')}"` : v);

  function serialize(comp) {
    const lines = [`BEGIN:${comp.name}`];
    for (const p of comp.props) {
      const params = Object.entries(p.params || {}).map(([k, v]) => `;${k}=${paramValue(v)}`).join('');
      lines.push(foldLine(`${p.name}${params}:${p.value}`));
    }
    for (const c of comp.comps) lines.push(serialize(c));
    lines.push(`END:${comp.name}`);
    return lines.join('\r\n') + (comp.name === 'VCALENDAR' ? '\r\n' : '');
  }

  const unescapeText = (v) => v.replace(/\\(n|N|,|;|\\)/g, (m, c) => (c === 'n' || c === 'N' ? '\n' : c));
  const escapeText = (v) => String(v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const prop = (comp, name) => comp.props.find((p) => p.name === name);
  const props = (comp, name) => comp.props.filter((p) => p.name === name);
  const text = (comp, name) => { const p = prop(comp, name); return p ? unescapeText(p.value) : ''; };

  // ---- time zones -------------------------------------------------------------------------------------

  const WINDOWS_ZONES = {
    'W. Europe Standard Time': 'Europe/Berlin', 'Central Europe Standard Time': 'Europe/Budapest', 'Romance Standard Time': 'Europe/Paris',
    'Central European Standard Time': 'Europe/Warsaw', 'GMT Standard Time': 'Europe/London', 'Greenwich Standard Time': 'Atlantic/Reykjavik',
    'E. Europe Standard Time': 'Europe/Chisinau', 'FLE Standard Time': 'Europe/Kiev', 'GTB Standard Time': 'Europe/Bucharest',
    'Russian Standard Time': 'Europe/Moscow', 'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago',
    'Mountain Standard Time': 'America/Denver', 'Pacific Standard Time': 'America/Los_Angeles', 'US Mountain Standard Time': 'America/Phoenix',
    'Alaskan Standard Time': 'America/Anchorage', 'Hawaiian Standard Time': 'Pacific/Honolulu', 'Atlantic Standard Time': 'America/Halifax',
    'China Standard Time': 'Asia/Shanghai', 'Tokyo Standard Time': 'Asia/Tokyo', 'India Standard Time': 'Asia/Kolkata', 'Singapore Standard Time': 'Asia/Singapore',
    'AUS Eastern Standard Time': 'Australia/Sydney', 'New Zealand Standard Time': 'Pacific/Auckland', 'UTC': 'UTC', 'Coordinated Universal Time': 'UTC',
    'Israel Standard Time': 'Asia/Jerusalem', 'Turkey Standard Time': 'Europe/Istanbul', 'South Africa Standard Time': 'Africa/Johannesburg',
    'E. South America Standard Time': 'America/Sao_Paulo', 'SA Pacific Standard Time': 'America/Bogota', 'Arabian Standard Time': 'Asia/Dubai',
  };
  const zoneCache = new Map();

  /** IANA zone for a TZID (also Windows names and "/mozilla.org/.../Europe/Vienna"-style ids), or null. */
  function ianaZone(tzid) {
    if (!tzid || tzid === 'floating') return null;
    if (zoneCache.has(tzid)) return zoneCache.get(tzid);
    const candidates = [tzid, WINDOWS_ZONES[tzid], tzid.replace(/^.*?([A-Za-z]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?)$/, '$1')];
    let found = null;
    for (const c of candidates) {
      if (!c) continue;
      try { new Intl.DateTimeFormat('en-US', { timeZone: c }); found = c; break; } catch (e) { /* not a valid zone */ }
    }
    zoneCache.set(tzid, found);
    return found;
  }

  const dtfCache = new Map();
  /** Offset of zone at instant ms, in minutes (local = UTC + offset). */
  function zoneOffset(zone, ms) {
    if (zone === 'UTC') return 0;
    let dtf = dtfCache.get(zone);
    if (!dtf) {
      dtf = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
      dtfCache.set(zone, dtf);
    }
    const parts = {};
    for (const p of dtf.formatToParts(new Date(ms))) parts[p.type] = +p.value;
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
  }

  /** Instant (ms) of a zoned wall time. Floating times and unknown zones use the browser's zone. */
  function toInstant(zt) {
    const wall = Date.UTC(zt.y, zt.m - 1, zt.d, zt.date ? 0 : zt.hh, zt.date ? 0 : zt.mm, zt.date ? 0 : zt.ss || 0);
    if (zt.tz === 'UTC') return wall;
    const zone = ianaZone(zt.tz);
    if (!zone) return new Date(zt.y, zt.m - 1, zt.d, zt.date ? 0 : zt.hh, zt.date ? 0 : zt.mm, zt.date ? 0 : zt.ss || 0).getTime();
    let guess = wall - zoneOffset(zone, wall) * 60000;
    guess = wall - zoneOffset(zone, guess) * 60000;
    return guess;
  }

  /** Zoned wall time of an instant in a zone (default: the browser's zone as floating local time). */
  function fromInstant(ms, tz = 'floating', date = false) {
    let d;
    if (tz === 'UTC') d = new Date(ms);
    const zone = tz !== 'UTC' ? ianaZone(tz) : null;
    if (tz === 'UTC') return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes(), ss: d.getUTCSeconds(), date, tz };
    if (zone) {
      d = new Date(ms + zoneOffset(zone, ms) * 60000);
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes(), ss: d.getUTCSeconds(), date, tz };
    }
    d = new Date(ms);
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), hh: d.getHours(), mm: d.getMinutes(), ss: d.getSeconds(), date, tz };
  }

  const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const pad = (n, w = 2) => String(n).padStart(w, '0');

  /** VTIMEZONE component for an IANA zone (rules derived from this year's transitions). */
  function vtimezone(tzid) {
    const zone = ianaZone(tzid);
    if (!zone || zone === 'UTC') return null;
    const year = new Date().getUTCFullYear();
    const start = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1);
    const transitions = [];
    let prev = zoneOffset(zone, start);
    for (let t = start + 86400000; t <= end; t += 86400000) {
      const off = zoneOffset(zone, t);
      if (off !== prev) {
        let lo = t - 86400000, hi = t; // binary search to the minute
        while (hi - lo > 60000) { const mid = Math.floor((lo + hi) / 2 / 60000) * 60000; if (zoneOffset(zone, mid) === prev) lo = mid; else hi = mid; }
        transitions.push({ at: hi, from: prev, to: off });
        prev = off;
      }
    }
    const fmtOff = (m) => `${m < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(m) / 60))}${pad(Math.abs(m) % 60)}`;
    const comp = { name: 'VTIMEZONE', props: [{ name: 'TZID', params: {}, value: tzid }], comps: [] };
    if (!transitions.length) {
      comp.comps.push({ name: 'STANDARD', props: [{ name: 'DTSTART', params: {}, value: '19700101T000000' }, { name: 'TZOFFSETFROM', params: {}, value: fmtOff(prev) }, { name: 'TZOFFSETTO', params: {}, value: fmtOff(prev) }], comps: [] });
      return comp;
    }
    const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    for (const tr of transitions.slice(0, 2)) {
      const local = new Date(tr.at + tr.from * 60000); // wall time before the change
      const dim = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
      const nth = local.getUTCDate() + 7 > dim ? -1 : Math.ceil(local.getUTCDate() / 7);
      comp.comps.push({
        name: tr.to > tr.from ? 'DAYLIGHT' : 'STANDARD',
        props: [
          { name: 'DTSTART', params: {}, value: `1970${pad(local.getUTCMonth() + 1)}${pad(local.getUTCDate())}T${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}00` },
          { name: 'RRULE', params: {}, value: `FREQ=YEARLY;BYMONTH=${local.getUTCMonth() + 1};BYDAY=${nth}${days[local.getUTCDay()]}` },
          { name: 'TZOFFSETFROM', params: {}, value: fmtOff(tr.from) },
          { name: 'TZOFFSETTO', params: {}, value: fmtOff(tr.to) },
        ],
        comps: [],
      });
    }
    return comp;
  }

  // ---- dates ------------------------------------------------------------------------------------------------

  function parseDateValue(p) {
    if (!p) return null;
    const v = p.value.trim().split(',')[0];
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
    if (!m) return null;
    const date = !m[4] || p.params.VALUE === 'DATE';
    return { y: +m[1], m: +m[2], d: +m[3], hh: date ? 0 : +m[4], mm: date ? 0 : +m[5], ss: date ? 0 : +(m[6] || 0), date, tz: m[7] ? 'UTC' : date ? 'floating' : p.params.TZID || 'floating' };
  }

  function parseDateList(p) {
    return p.value.split(',').map((v) => parseDateValue({ value: v, params: p.params })).filter(Boolean);
  }

  function formatDateValue(zt) {
    const date = `${pad(zt.y, 4)}${pad(zt.m)}${pad(zt.d)}`;
    if (zt.date) return { params: { VALUE: 'DATE' }, value: date };
    const time = `${date}T${pad(zt.hh)}${pad(zt.mm)}${pad(zt.ss || 0)}`;
    if (zt.tz === 'UTC') return { params: {}, value: `${time}Z` };
    if (zt.tz === 'floating') return { params: {}, value: time };
    return { params: { TZID: zt.tz }, value: time };
  }

  function parseDuration(v) {
    const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
    if (!m) return 0;
    const ms = ((+(m[2] || 0) * 7 + +(m[3] || 0)) * 86400 + +(m[4] || 0) * 3600 + +(m[5] || 0) * 60 + +(m[6] || 0)) * 1000;
    return m[1] === '-' ? -ms : ms;
  }

  /** Add days to a wall time (calendar arithmetic, keeps the clock time). */
  function addDays(zt, n) {
    const d = new Date(Date.UTC(zt.y, zt.m - 1, zt.d + n));
    return { ...zt, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }
  const weekday = (zt) => new Date(Date.UTC(zt.y, zt.m - 1, zt.d)).getUTCDay(); // 0 = Sunday
  const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dayKey = (zt) => zt.y * 10000 + zt.m * 100 + zt.d;
  const wallKey = (zt) => `${pad(zt.y, 4)}${pad(zt.m)}${pad(zt.d)}${zt.date ? '' : `T${pad(zt.hh)}${pad(zt.mm)}${pad(zt.ss || 0)}`}`;

  // ---- recurrence ------------------------------------------------------------------------------------------------

  const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

  function parseRRule(value) {
    const r = {};
    for (const part of value.split(';')) {
      const [k, v] = part.split('=');
      if (!k || v == null) continue;
      const key = k.toUpperCase();
      if (key === 'FREQ') r.freq = v.toUpperCase();
      else if (key === 'INTERVAL') r.interval = Math.max(1, parseInt(v, 10) || 1);
      else if (key === 'COUNT') r.count = parseInt(v, 10);
      else if (key === 'UNTIL') r.until = parseDateValue({ value: v, params: {} });
      else if (key === 'BYDAY') r.byday = v.split(',').map((d) => { const m = /^([+-]?\d+)?([A-Z]{2})$/i.exec(d.trim()); return m && { n: m[1] ? parseInt(m[1], 10) : 0, day: DAYS.indexOf(m[2].toUpperCase()) }; }).filter((x) => x && x.day >= 0);
      else if (key === 'BYMONTHDAY') r.bymonthday = v.split(',').map(Number);
      else if (key === 'BYMONTH') r.bymonth = v.split(',').map(Number);
      else if (key === 'BYSETPOS') r.bysetpos = v.split(',').map(Number);
      else if (key === 'WKST') r.wkst = DAYS.indexOf(v.toUpperCase());
      else (r.other = r.other || []).push(part);
    }
    return r.freq ? r : null;
  }

  function formatRRule(r) {
    const parts = [`FREQ=${r.freq}`];
    if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
    if (r.count) parts.push(`COUNT=${r.count}`);
    if (r.until) parts.push(`UNTIL=${formatDateValue(r.until.date ? r.until : { ...fromInstant(toInstant(r.until), 'UTC') }).value}`);
    if (r.byday && r.byday.length) parts.push(`BYDAY=${r.byday.map((b) => `${b.n || ''}${DAYS[b.day]}`).join(',')}`);
    if (r.bymonthday && r.bymonthday.length) parts.push(`BYMONTHDAY=${r.bymonthday.join(',')}`);
    if (r.bymonth && r.bymonth.length) parts.push(`BYMONTH=${r.bymonth.join(',')}`);
    if (r.bysetpos && r.bysetpos.length) parts.push(`BYSETPOS=${r.bysetpos.join(',')}`);
    if (r.wkst >= 0 && r.wkst !== 1) parts.push(`WKST=${DAYS[r.wkst]}`);
    if (r.other) parts.push(...r.other);
    return parts.join(';');
  }

  /** Days (wall times with the start's clock time) of one period of the rule, sorted. */
  function periodDays(r, start, periodStart) {
    const out = [];
    const withTime = (y, m, d) => ({ ...start, y, m, d });
    const nthWeekdays = (y, m, spec) => {
      const dim = daysInMonth(y, m);
      const all = [];
      for (let d = 1; d <= dim; d++) if (weekday({ y, m, d }) === spec.day) all.push(d);
      if (!spec.n) return all;
      const idx = spec.n > 0 ? spec.n - 1 : all.length + spec.n;
      return all[idx] ? [all[idx]] : [];
    };
    if (r.freq === 'DAILY') {
      const day = periodStart;
      if ((!r.bymonth || r.bymonth.includes(day.m)) && (!r.bymonthday || r.bymonthday.some((md) => (md > 0 ? md : daysInMonth(day.y, day.m) + md + 1) === day.d)) && (!r.byday || r.byday.some((b) => b.day === weekday(day)))) out.push(day);
    } else if (r.freq === 'WEEKLY') {
      const days = r.byday && r.byday.length ? r.byday.map((b) => b.day) : [weekday(start)];
      for (let i = 0; i < 7; i++) {
        const day = addDays(periodStart, i);
        if (days.includes(weekday(day)) && (!r.bymonth || r.bymonth.includes(day.m))) out.push(day);
      }
    } else if (r.freq === 'MONTHLY' || r.freq === 'YEARLY') {
      const months = r.freq === 'MONTHLY' ? [periodStart.m] : r.bymonth && r.bymonth.length ? r.bymonth : [start.m];
      for (const m of months) {
        if (r.freq === 'MONTHLY' && r.bymonth && !r.bymonth.includes(m)) continue;
        const y = periodStart.y;
        const dim = daysInMonth(y, m);
        let days = [];
        if (r.bymonthday && r.bymonthday.length) days = r.bymonthday.map((md) => (md > 0 ? md : dim + md + 1)).filter((d) => d >= 1 && d <= dim);
        if (r.byday && r.byday.length) {
          const byDays = r.byday.flatMap((spec) => nthWeekdays(y, m, spec));
          days = r.bymonthday && r.bymonthday.length ? days.filter((d) => byDays.includes(d)) : byDays;
        }
        if (!(r.bymonthday && r.bymonthday.length) && !(r.byday && r.byday.length)) days = start.d <= dim ? [start.d] : [];
        for (const d of [...new Set(days)].sort((a, b) => a - b)) out.push(withTime(y, m, d));
      }
    }
    let sorted = out.map((d) => withTime(d.y, d.m, d.d)).sort((a, b) => dayKey(a) - dayKey(b));
    if (r.bysetpos && r.bysetpos.length) sorted = r.bysetpos.map((p) => sorted[p > 0 ? p - 1 : sorted.length + p]).filter(Boolean);
    return sorted;
  }

  function nextPeriod(r, p) {
    const n = r.interval || 1;
    if (r.freq === 'DAILY') return addDays(p, n);
    if (r.freq === 'WEEKLY') return addDays(p, 7 * n);
    if (r.freq === 'MONTHLY') { const t = p.m - 1 + n; return { ...p, y: p.y + Math.floor(t / 12), m: (t % 12) + 1, d: 1 }; }
    return { ...p, y: p.y + n, m: 1, d: 1 };
  }

  function firstPeriod(r, start) {
    if (r.freq === 'WEEKLY') { const wkst = r.wkst >= 0 ? r.wkst : 1; return addDays(start, -((weekday(start) - wkst + 7) % 7)); }
    if (r.freq === 'MONTHLY') return { ...start, d: 1 };
    if (r.freq === 'YEARLY') return { ...start, m: 1, d: 1 };
    return start;
  }

  const wallNum = (zt) => dayKey(zt) * 1e6 + (zt.date ? 0 : zt.hh * 1e4 + zt.mm * 100 + (zt.ss || 0));

  /**
   * Occurrences of an event between from and to (ms), as { start, end, key, event, allDay } (key: wall time of the occurrence,
   * the RECURRENCE-ID). overrides: Map key -> event with that RECURRENCE-ID (moved or changed occurrences).
   */
  function expand(event, from, to, overrides = new Map()) {
    const duration = event.end ? toInstant(event.end) - toInstant(event.start) : event.start.date ? 86400000 : 0;
    const result = [];
    const seen = new Set();
    const push = (zt) => {
      const key = wallKey(zt);
      seen.add(key);
      const override = overrides.get(key);
      const src = override || event;
      const s = toInstant(override ? override.start : zt);
      const e = override && override.end ? toInstant(override.end) : s + duration;
      if (s < to && (e > from || (e === s && s >= from))) result.push({ start: s, end: e, key, event: src, allDay: src.start.date });
    };
    if (!event.rrule) { push(event.start); return result; }
    const r = event.rrule;
    const tz = event.start.date ? 'floating' : event.start.tz;
    // compare wall times (cheap) and convert to instants only near the range
    const fromNum = wallNum({ ...fromInstant(from - 2 * 86400000, tz), date: false });
    const toNum = wallNum({ ...fromInstant(to + 2 * 86400000, tz), date: false });
    const untilNum = r.until ? (r.until.date ? dayKey(r.until) * 1e6 + 235959 : wallNum(fromInstant(toInstant(r.until), tz))) : Infinity;
    const exdates = new Set((event.exdates || []).map((x) => wallKey(x.date || event.start.date ? { ...x, date: event.start.date } : fromInstant(toInstant(x), tz, false))));
    const startNum = wallNum(event.start);
    let count = 0;
    let period = firstPeriod(r, event.start);
    for (let guard = 0; guard < 200000 && period.y <= 9999; guard++) {
      if (wallNum({ ...period, hh: 0, mm: 0, ss: 0 }) > toNum) break;
      for (const day of periodDays(r, event.start, period)) {
        const num = wallNum(day);
        if (num < startNum) continue;
        if (num > untilNum) { guard = Infinity; break; }
        count++;
        if (r.count && count > r.count) { guard = Infinity; break; }
        if (num > toNum) { guard = Infinity; break; }
        if (num >= fromNum && !exdates.has(wallKey(day))) push(day);
      }
      period = nextPeriod(r, period);
    }
    // overrides that moved an occurrence from outside the range into it
    for (const [key, ov] of overrides) {
      if (seen.has(key) || exdates.has(key)) continue;
      const s = toInstant(ov.start);
      const e = ov.end ? toInstant(ov.end) : s + duration;
      if (s < to && e > from) result.push({ start: s, end: e, key, event: ov, allDay: ov.start.date });
    }
    return result.sort((x, y) => x.start - y.start);
  }

  // ---- events -------------------------------------------------------------------------------------------------------

  const MANAGED = ['UID', 'DTSTAMP', 'DTSTART', 'DTEND', 'DURATION', 'SUMMARY', 'LOCATION', 'DESCRIPTION', 'RRULE', 'EXDATE', 'RECURRENCE-ID', 'CATEGORIES', 'STATUS', 'LAST-MODIFIED', 'SEQUENCE', 'CREATED', 'URL'];

  function eventFromComp(comp) {
    const start = parseDateValue(prop(comp, 'DTSTART'));
    if (!start) return null;
    let end = parseDateValue(prop(comp, 'DTEND'));
    const dur = prop(comp, 'DURATION');
    if (!end && dur) end = fromInstant(toInstant(start) + parseDuration(dur.value), start.tz, start.date);
    if (!end && start.date) end = addDays(start, 1);
    const rr = prop(comp, 'RRULE');
    const rid = prop(comp, 'RECURRENCE-ID');
    return {
      uid: text(comp, 'UID') || `${Date.now()}-${Math.random().toString(36).slice(2)}@suite`,
      summary: text(comp, 'SUMMARY'), location: text(comp, 'LOCATION'), description: text(comp, 'DESCRIPTION'), url: text(comp, 'URL'),
      start, end,
      rrule: rr ? parseRRule(rr.value) : null,
      exdates: props(comp, 'EXDATE').flatMap(parseDateList),
      recurrenceId: rid ? wallKey(parseDateValue(rid)) : null,
      recurrenceIdValue: rid ? parseDateValue(rid) : null,
      categories: props(comp, 'CATEGORIES').flatMap((p) => p.value.split(/(?<!\\),/).map(unescapeText)).filter(Boolean),
      status: text(comp, 'STATUS'),
      transp: text(comp, 'TRANSP').toUpperCase(), // not managed: written back with the original component
      sequence: parseInt(text(comp, 'SEQUENCE') || '0', 10),
      alarms: comp.comps.filter((c) => c.name === 'VALARM').length,
      reminder: comp.comps.filter((c) => c.name === 'VALARM').map(alarmMinutes).find((x) => x != null) ?? null, // minutes before the start
      comp, // original component: unknown properties and sub-components (VALARM, attendees, …) are written back
    };
  }

  /** Minutes before the start of a VALARM with a relative trigger (RELATED=START), or null (absolute, after the end, …). */
  function alarmMinutes(alarm) {
    const trig = prop(alarm, 'TRIGGER');
    if (!trig || (trig.params.VALUE || '').toUpperCase() === 'DATE-TIME' || (trig.params.RELATED || 'START').toUpperCase() !== 'START') return null;
    if (!/^[+-]?P/.test(trig.value.trim())) return null;
    return Math.max(0, Math.round(-parseDuration(trig.value) / 60000));
  }

  /** The VALARM component for a reminder `minutes` before the start. */
  function alarmComp(minutes, summary) {
    const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60;
    const value = minutes ? `-P${d ? `${d}D` : ''}${h || m ? `T${h ? `${h}H` : ''}${m ? `${m}M` : ''}` : ''}` : 'PT0S';
    return { name: 'VALARM', props: [{ name: 'ACTION', params: {}, value: 'DISPLAY' }, { name: 'DESCRIPTION', params: {}, value: escapeText(summary || 'Reminder') },
      { name: 'TRIGGER', params: {}, value }], comps: [] };
  }

  function stamp() { const z = fromInstant(Date.now(), 'UTC'); return formatDateValue(z).value; }

  function compFromEvent(ev) {
    const base = ev.comp || { name: 'VEVENT', props: [], comps: [] };
    const kept = base.props.filter((p) => !MANAGED.includes(p.name));
    const out = [];
    const add = (name, value, params = {}) => out.push({ name, params, value });
    add('UID', escapeText(ev.uid));
    add('DTSTAMP', stamp());
    const s = formatDateValue(ev.start);
    add('DTSTART', s.value, s.params);
    if (ev.end) { const e = formatDateValue(ev.end); add('DTEND', e.value, e.params); }
    if (ev.recurrenceIdValue) { const r = formatDateValue(ev.recurrenceIdValue); add('RECURRENCE-ID', r.value, r.params); }
    add('SUMMARY', escapeText(ev.summary || ''));
    if (ev.location) add('LOCATION', escapeText(ev.location));
    if (ev.description) add('DESCRIPTION', escapeText(ev.description));
    if (ev.url) add('URL', ev.url);
    if (ev.rrule) add('RRULE', formatRRule(ev.rrule));
    if (ev.exdates && ev.exdates.length) {
      const list = ev.exdates.map((x) => formatDateValue({ ...x, date: ev.start.date, tz: ev.start.date ? 'floating' : x.tz }));
      add('EXDATE', list.map((x) => x.value).join(','), list[0].params);
    }
    if (ev.categories && ev.categories.length) add('CATEGORIES', ev.categories.map(escapeText).join(','));
    if (ev.status) add('STATUS', ev.status);
    add('SEQUENCE', String(ev.sequence || 0));
    add('LAST-MODIFIED', stamp());
    const created = prop(base, 'CREATED');
    if (created) out.push(created);
    // the first relative alarm is the editable reminder; other alarms are kept as they are
    let comps = base.comps;
    if (ev.reminder !== undefined) {
      const i = comps.findIndex((c) => c.name === 'VALARM' && alarmMinutes(c) != null);
      const current = i >= 0 ? alarmMinutes(comps[i]) : null;
      if (current !== ev.reminder) {
        comps = comps.filter((_, j) => j !== i);
        if (ev.reminder != null) comps = [...comps, alarmComp(ev.reminder, ev.summary)];
      }
    }
    return { name: 'VEVENT', props: [...out, ...kept], comps };
  }

  function events(cal) { return cal.comps.filter((c) => c.name === 'VEVENT').map(eventFromComp).filter(Boolean); }

  function newCalendar(name) {
    return {
      name: 'VCALENDAR', comps: [],
      props: [
        { name: 'VERSION', params: {}, value: '2.0' }, { name: 'PRODID', params: {}, value: '-//Portable Web App Suite//Calendar//EN' },
        { name: 'CALSCALE', params: {}, value: 'GREGORIAN' }, { name: 'X-WR-CALNAME', params: {}, value: escapeText(name) },
      ],
    };
  }

  /** Calendar component with the given events (VTIMEZONEs for the used TZIDs; other components are kept). */
  function buildCalendar(cal, evs) {
    const others = cal.comps.filter((c) => c.name !== 'VEVENT' && c.name !== 'VTIMEZONE');
    const known = new Map(cal.comps.filter((c) => c.name === 'VTIMEZONE').map((c) => [text(c, 'TZID'), c]));
    const tzids = new Set();
    for (const ev of evs) for (const zt of [ev.start, ev.end, ev.recurrenceIdValue]) if (zt && !zt.date && zt.tz !== 'UTC' && zt.tz !== 'floating') tzids.add(zt.tz);
    const zones = [...tzids].map((id) => known.get(id) || vtimezone(id)).filter(Boolean);
    return { ...cal, comps: [...zones, ...evs.map(compFromEvent), ...others] };
  }

  // ---- free/busy (RFC 5545 VFREEBUSY) -----------------------------------------------------------------------------------

  /** Sorted, merged intervals [{ start, end, type }]: periods of one type are joined; overlapping periods of different types stay. */
  function mergeBusy(list) {
    const byType = new Map();
    for (const x of list) if (x.end > x.start) byType.set(x.type, [...(byType.get(x.type) || []), x]);
    const out = [];
    for (const [type, items] of byType) {
      let cur = null;
      for (const x of items.sort((a, b) => a.start - b.start)) {
        if (cur && x.start <= cur.end) cur.end = Math.max(cur.end, x.end);
        else { cur = { start: x.start, end: x.end, type }; out.push(cur); }
      }
    }
    return out.sort((a, b) => a.start - b.start);
  }

  /** Busy periods of the VFREEBUSY components of a calendar: [{ start, end, type }] (FREE periods are left out). */
  function freeBusyPeriods(cal) {
    const out = [];
    for (const fb of cal.comps.filter((c) => c.name === 'VFREEBUSY')) {
      for (const p of props(fb, 'FREEBUSY')) {
        const type = (p.params.FBTYPE || 'BUSY').toUpperCase();
        if (type === 'FREE') continue;
        for (const period of p.value.split(',')) {
          const [a, b] = period.split('/');
          const sa = parseDateValue({ params: {}, value: a });
          if (!sa || !b) continue;
          const start = toInstant(sa);
          const end = /^[+-]?P/.test(b) ? start + parseDuration(b) : toInstant(parseDateValue({ params: {}, value: b }));
          out.push({ start, end, type });
        }
      }
    }
    return mergeBusy(out);
  }

  /** A VCALENDAR with one VFREEBUSY for [from, to) listing the busy periods in UTC (as the text of an .ifb file). */
  function freeBusyText(periods, from, to, { organizer = '' } = {}) {
    const utc = (ms) => formatDateValue(fromInstant(ms, 'UTC')).value;
    const props_ = [['DTSTAMP', stamp()], ['DTSTART', utc(from)], ['DTEND', utc(to)], ['UID', `${Date.now().toString(36)}-fb@suite`]];
    if (organizer) props_.push(['ORGANIZER', organizer]);
    const comp = { name: 'VFREEBUSY', props: props_.map(([name, value]) => ({ name, params: {}, value })), comps: [] };
    for (const x of mergeBusy(periods.map((p) => ({ ...p, start: Math.max(from, p.start), end: Math.min(to, p.end) })))) {
      comp.props.push({ name: 'FREEBUSY', params: x.type === 'BUSY' ? {} : { FBTYPE: x.type }, value: `${utc(x.start)}/${utc(x.end)}` });
    }
    return serialize({ name: 'VCALENDAR', props: [{ name: 'VERSION', params: {}, value: '2.0' }, { name: 'PRODID', params: {}, value: '-//Portable Web App Suite//Calendar//EN' }, { name: 'METHOD', params: {}, value: 'PUBLISH' }], comps: [comp] });
  }

  /**
   * Free slots of at least `minutes` in [from, to) outside the busy periods, limited to working hours (fromHour..toHour local
   * time) and, unless `weekends`, to Monday–Friday. Returns [{ start, end }].
   */
  function freeSlots(busy, from, to, { minutes = 60, fromHour = 8, toHour = 18, weekends = false } = {}) {
    const merged = mergeBusy(busy.map((b) => ({ ...b, type: 'BUSY' })));
    const out = [];
    for (let day = new Date(from); +day < to; day.setDate(day.getDate() + 1)) {
      if (!weekends && (day.getDay() === 0 || day.getDay() === 6)) continue;
      const a = new Date(day); a.setHours(Math.floor(fromHour), Math.round((fromHour % 1) * 60), 0, 0);
      const b = new Date(day); b.setHours(Math.floor(toHour), Math.round((toHour % 1) * 60), 0, 0);
      let t = Math.max(+a, from);
      const end = Math.min(+b, to);
      for (const x of merged) {
        if (x.end <= t || x.start >= end) continue;
        if (x.start - t >= minutes * 60000) out.push({ start: t, end: x.start });
        t = Math.max(t, x.end);
      }
      if (end - t >= minutes * 60000) out.push({ start: t, end });
      day.setHours(0, 0, 0, 0);
    }
    return out;
  }

  Suite.i18n.register({
    en: { 'ical.invalid': 'The file is not an iCalendar file (VCALENDAR missing).' },
    de: { 'ical.invalid': 'Die Datei ist keine iCalendar-Datei (VCALENDAR fehlt).' },
  });

  Suite.ical = {
    parse, serialize, events, eventFromComp, compFromEvent, buildCalendar, newCalendar, expand, vtimezone,
    toInstant, fromInstant, parseDateValue, formatDateValue, parseRRule, formatRRule, parseDuration, ianaZone, localZone, wallKey, addDays,
    escapeText, unescapeText, prop, text, alarmMinutes, mergeBusy, freeBusyPeriods, freeBusyText, freeSlots,
  };
})(window.Suite = window.Suite || {});
