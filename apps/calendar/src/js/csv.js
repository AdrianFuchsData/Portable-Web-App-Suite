/*
 * CSV import and export of the calendar (the layout of Outlook and Google Calendar: Subject, Start Date, Start Time, End Date,
 * End Time, All Day Event, Description, Location, Categories; tasks: Subject, Due Date, Due Time, Priority, Status, …).
 *
 *   CALCSV.columns(header) -> { field: index }                 English, German (Outlook) and other common header names
 *   CALCSV.parseDate(text, order) -> { y, m, d } | null        ISO, 16.10.2026, 10/16/2026 (order 'mdy' | 'dmy' | null = guess)
 *   CALCSV.parseTime(text) -> { hh, mm } | null                14:30, 14.30, 2:30 PM, 14:30:00
 *   CALCSV.records(rows) -> { kind: 'events' | 'tasks', items: [{ line, summary, start, end, allDay, due, … }], errors }
 *   CALCSV.format(date, style) / formatTime(date, style)        style 'iso' | 'us' | 'eu'
 */
(function () {
  'use strict';

  const norm = (h) => String(h).toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
  const NAMES = {
    summary: ['subject', 'title', 'summary', 'name', 'event', 'eventname', 'betreff', 'titel', 'thema', 'aufgabe', 'task'],
    startDate: ['startdate', 'start', 'begin', 'begindate', 'dtstart', 'beginntam', 'startdatum', 'beginn', 'anfang', 'datum', 'date'],
    startTime: ['starttime', 'begintime', 'beginntum', 'startzeit', 'anfangszeit', 'uhrzeit', 'time'],
    endDate: ['enddate', 'end', 'dtend', 'endetam', 'enddatum', 'ende'],
    endTime: ['endtime', 'endetum', 'endzeit'],
    allDay: ['alldayevent', 'allday', 'ganztägigesereignis', 'ganztägig', 'ganztaegig', 'ganzertag'],
    description: ['description', 'notes', 'note', 'body', 'beschreibung', 'notizen', 'notiz', 'text'],
    location: ['location', 'place', 'where', 'ort', 'raum', 'room'],
    categories: ['categories', 'category', 'tags', 'kategorien', 'kategorie'],
    due: ['duedate', 'due', 'fälligam', 'fälligkeit', 'fällig', 'faelligam', 'fälligkeitsdatum'],
    dueTime: ['duetime', 'fälligum', 'faelligum'],
    priority: ['priority', 'priorität', 'prioritaet', 'wichtigkeit', 'importance'],
    status: ['status', 'state', 'zustand'],
    percent: ['complete', 'percentcomplete', 'erledigt', 'prozenterledigt'],
    completed: ['datecompleted', 'completed', 'erledigtam'],
  };

  function columns(header) {
    const out = {};
    header.forEach((h, i) => {
      const n = norm(h);
      for (const [field, names] of Object.entries(NAMES)) if (!(field in out) && names.includes(n)) { out[field] = i; break; }
    });
    return out;
  }

  function parseDate(text, order = null) {
    const s = String(text || '').trim();
    if (!s) return null;
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return valid(+m[1], +m[2], +m[3]);
    m = /^(\d{4})(\d{2})(\d{2})(?:T|$)/.exec(s);
    if (m) return valid(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{2,4})/.exec(s);
    if (m) return valid(year(m[3]), +m[2], +m[1]);
    m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(s);
    if (m) {
      const a = +m[1], b = +m[2];
      const dmy = order === 'dmy' || (order !== 'mdy' && a > 12);
      return dmy ? valid(year(m[3]), b, a) : valid(year(m[3]), a, b);
    }
    return null;
  }
  const year = (y) => (y.length === 2 ? 2000 + +y : +y);
  function valid(y, m, d) {
    const x = new Date(y, m - 1, d);
    return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d ? { y, m, d } : null;
  }

  function parseTime(text) {
    const s = String(text || '').trim();
    if (!s) return null;
    const m = /^(\d{1,2})(?:[:.](\d{2}))?(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i.exec(s) || /(?:T|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i.exec(s);
    if (!m || (m[2] === undefined && !m[4])) return null;
    let hh = +m[1];
    const mm = +(m[2] || 0);
    const ampm = (m[4] || '').toLowerCase().replace(/\./g, '');
    if (ampm === 'pm' && hh < 12) hh += 12;
    if (ampm === 'am' && hh === 12) hh = 0;
    return hh < 24 && mm < 60 ? { hh, mm } : null;
  }

  const yes = (v) => /^(true|yes|ja|wahr|1|x|on|y)$/i.test(String(v || '').trim());

  /** Which day order the dates of a column use: 'dmy' when a first number above 12 occurs, 'mdy' when a second one does. */
  function dayOrder(rows, cols) {
    for (const r of rows) for (const i of cols) {
      const m = /^(\d{1,2})[/-](\d{1,2})[/-]/.exec(String(r[i] || '').trim());
      if (m && +m[1] > 12) return 'dmy';
      if (m && +m[2] > 12) return 'mdy';
    }
    return null;
  }

  const PRIORITY = { high: 1, hoch: 1, wichtig: 1, normal: 5, medium: 5, mittel: 5, low: 9, niedrig: 9, gering: 9 };
  const STATUS = { 'not started': 'NEEDS-ACTION', 'nicht begonnen': 'NEEDS-ACTION', 'in progress': 'IN-PROCESS', 'in bearbeitung': 'IN-PROCESS', completed: 'COMPLETED', erledigt: 'COMPLETED',
    abgeschlossen: 'COMPLETED', 'needs-action': 'NEEDS-ACTION', 'in-process': 'IN-PROCESS', cancelled: 'CANCELLED', abgesagt: 'CANCELLED', 'waiting on someone else': 'NEEDS-ACTION', deferred: 'NEEDS-ACTION' };

  /** CSV rows (the first is the header) as events or tasks; rows without a readable date are reported in errors. */
  function records(rows) {
    if (rows.length < 2) return { kind: 'events', items: [], errors: [] };
    const c = columns(rows[0]);
    const kind = c.startDate === undefined && c.due !== undefined ? 'tasks' : 'events';
    const body = rows.slice(1);
    const order = dayOrder(body, [c.startDate, c.endDate, c.due].filter((x) => x !== undefined));
    const get = (r, f) => (c[f] === undefined ? '' : String(r[c[f]] ?? '').trim());
    const items = [], errors = [];
    body.forEach((r, i) => {
      const line = i + 2;
      if (!r.some((x) => String(x).trim())) return;
      const base = { line, summary: get(r, 'summary'), description: get(r, 'description'), location: get(r, 'location'),
        categories: get(r, 'categories').split(/[;,]/).map((x) => x.trim()).filter(Boolean) };
      if (kind === 'tasks') {
        const due = get(r, 'due') ? parseDate(get(r, 'due'), order) : null;
        if (get(r, 'due') && !due) { errors.push({ line, text: get(r, 'due') }); return; }
        const p = get(r, 'priority').toLowerCase();
        const st = STATUS[get(r, 'status').toLowerCase()] || (get(r, 'completed') ? 'COMPLETED' : 'NEEDS-ACTION');
        items.push({ ...base, due, dueTime: parseTime(get(r, 'dueTime')), priority: /^\d$/.test(p) ? +p : PRIORITY[p] || 0, status: st,
          percent: st === 'COMPLETED' ? 100 : Math.max(0, Math.min(100, parseInt(get(r, 'percent'), 10) || 0)) });
        return;
      }
      const startText = get(r, 'startDate');
      const start = parseDate(startText, order);
      if (!start) { errors.push({ line, text: startText || '–' }); return; }
      const startTime = parseTime(get(r, 'startTime')) || parseTime(startText.replace(/^\S+/, ''));
      const end = parseDate(get(r, 'endDate'), order);
      const endTime = parseTime(get(r, 'endTime')) || parseTime(get(r, 'endDate').replace(/^\S+/, ''));
      const allDay = c.allDay !== undefined && get(r, 'allDay') ? yes(get(r, 'allDay')) : !startTime;
      items.push({ ...base, start, startTime: allDay ? null : startTime || { hh: 9, mm: 0 }, end, endTime: allDay ? null : endTime, allDay });
    });
    return { kind, items, errors };
  }

  const p2 = (n) => String(n).padStart(2, '0');
  function format(date, style) {
    const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
    if (style === 'us') return `${m}/${d}/${y}`;
    if (style === 'eu') return `${p2(d)}.${p2(m)}.${y}`;
    return `${y}-${p2(m)}-${p2(d)}`;
  }
  function formatTime(date, style) {
    const h = date.getHours(), m = date.getMinutes();
    if (style === 'us') return `${h % 12 || 12}:${p2(m)} ${h < 12 ? 'AM' : 'PM'}`;
    return `${p2(h)}:${p2(m)}`;
  }

  const EVENT_HEADER = ['Subject', 'Start Date', 'Start Time', 'End Date', 'End Time', 'All Day Event', 'Description', 'Location', 'Categories', 'Calendar'];
  const TASK_HEADER = ['Subject', 'Due Date', 'Due Time', 'Priority', 'Status', '% Complete', 'Description', 'Location', 'Categories', 'Calendar'];

  window.CALCSV = { columns, parseDate, parseTime, records, format, formatTime, EVENT_HEADER, TASK_HEADER };
})();
