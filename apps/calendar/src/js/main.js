/*
 * Calendar: iCalendar (.ics) files as calendars; month, week, day and agenda views; events with time zones, recurrence
 * (single occurrences can be changed or deleted), drag & drop; search. iCalendar handling in shared/js/ical.js.
 */
(function () {
  'use strict';

  const { html } = Suite.shell;
  const t = Suite.t;
  const ical = Suite.ical;
  const APP = 'calendar';
  const PREFS = 'suite.calendar';
  const HOUR = 44; // px per hour in the time grid
  const SNAP = 15; // minutes
  const COLORS = ['#3b82f6', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777'];
  const ICS_TYPES = [{ description: 'iCalendar', accept: { 'text/calendar': ['.ics', '.ical', '.ifb', '.icalendar'] } }];

  Suite.i18n.register({
    en: {
      'app.title': 'Calendar', 'cal.undo': 'Undo', 'cal.redo': 'Redo',
      'cal.today': 'Today', 'cal.month': 'Month', 'cal.week': 'Week', 'cal.day': 'Day', 'cal.agenda': 'Agenda', 'cal.freebusy': 'Availability', 'cal.new': 'New event',
      'cal.fbHours': 'Working hours', 'cal.fbDuration': 'Duration (min)', 'cal.fbWeekends': 'Weekends', 'cal.fbExport': 'Export free/busy (.ifb)', 'cal.fbFree': 'Free',
      'cal.fbSlots': 'Free times of at least {0} minutes', 'cal.fbNone': 'No free time in this week.', 'cal.fbBusy': 'busy', 'cal.fbTentative': 'tentative', 'cal.fbImported': 'free/busy',
      'cal.fbHint': 'Busy times of all shown calendars; transparent ("free") and cancelled events and all-day events do not count. Click a free time to plan an event.',
      'cal.calendars': 'Calendars', 'cal.newCalendar': 'New calendar', 'cal.open': 'Open…', 'cal.import': 'Import events…', 'cal.save': 'Save', 'cal.saveAll': 'Save all',
      'cal.close': 'Close', 'cal.untitled': 'My calendar', 'cal.search': 'Search', 'cal.allDay': 'All day', 'cal.more': '+{0} more', 'cal.noEvents': 'No events.',
      'cal.title': 'Title', 'cal.calendar': 'Calendar', 'cal.start': 'Start', 'cal.end': 'End', 'cal.location': 'Location', 'cal.description': 'Description',
      'cal.categories': 'Categories (separated by commas)', 'cal.timeZone': 'Time zone', 'cal.repeat': 'Repeat', 'cal.never': 'Does not repeat', 'cal.daily': 'Daily',
      'cal.weekly': 'Weekly', 'cal.monthly': 'Monthly', 'cal.yearly': 'Yearly', 'cal.every': 'Every', 'cal.on': 'On', 'cal.ends': 'Ends', 'cal.endsNever': 'Never',
      'cal.endsAfter': 'After', 'cal.times': 'times', 'cal.endsOn': 'On date', 'cal.byMonthDay': 'On day {0} of the month', 'cal.byWeekday': 'On the {0} {1}',
      'cal.nth1': 'first', 'cal.nth2': 'second', 'cal.nth3': 'third', 'cal.nth4': 'fourth', 'cal.nth-1': 'last', 'cal.custom': 'Custom rule: {0}',
      'cal.saveEvent': 'Save', 'cal.cancel': 'Cancel', 'cal.delete': 'Delete', 'cal.export': 'Export (.ics)', 'cal.reminders': '{0} reminder(s) are kept.',
      'cal.print': 'Print / PDF (current view)', 'cal.reminder': 'Reminder', 'cal.remNone': 'None', 'cal.remAt': 'At the start', 'cal.remMin': '{0} minutes before', 'cal.remHour': '{0} hour(s) before', 'cal.remDay': '{0} day(s) before',
      'cal.remNow': 'now', 'cal.remIn': 'in {0} min', 'cal.remEnable': 'Show reminders as system notifications', 'cal.remBlocked': 'The browser does not allow notifications; reminders are shown in this window.',
      'cal.remOther': '{0} more reminder(s) of this event are kept.',
      'cal.scopeTitle': 'Repeating event', 'cal.scopeEdit': 'Change only this occurrence or all occurrences?', 'cal.scopeDelete': 'Delete only this occurrence or all occurrences?',
      'cal.thisOne': 'Only this', 'cal.all': 'All', 'cal.noCalendar': 'Create or open a calendar first.', 'cal.closeConfirm': '“{0}” has unsaved changes. Close it anyway?',
      'cal.imported': '{0} event(s) imported into “{1}”.', 'cal.recent': 'Recently used', 'cal.week.short': 'W', 'cal.weekStart': 'Week starts on',
      'cal.monday': 'Monday', 'cal.sunday': 'Sunday', 'cal.sidebar': 'Calendars', 'cal.endBeforeStart': 'The end is before the start.', 'cal.local': 'local time',
      'cal.floating': 'floating (no time zone)',
    },
    de: {
      'app.title': 'Kalender', 'cal.undo': 'Rückgängig', 'cal.redo': 'Wiederholen',
      'cal.today': 'Heute', 'cal.month': 'Monat', 'cal.week': 'Woche', 'cal.day': 'Tag', 'cal.agenda': 'Liste', 'cal.freebusy': 'Verfügbarkeit', 'cal.new': 'Neuer Termin',
      'cal.fbHours': 'Arbeitszeit', 'cal.fbDuration': 'Dauer (min)', 'cal.fbWeekends': 'Wochenenden', 'cal.fbExport': 'Frei/Belegt exportieren (.ifb)', 'cal.fbFree': 'Frei',
      'cal.fbSlots': 'Freie Zeiten von mindestens {0} Minuten', 'cal.fbNone': 'Keine freie Zeit in dieser Woche.', 'cal.fbBusy': 'belegt', 'cal.fbTentative': 'vorläufig', 'cal.fbImported': 'Frei/Belegt',
      'cal.fbHint': 'Belegte Zeiten aller angezeigten Kalender; transparente („frei“) und abgesagte Termine sowie ganztägige Termine zählen nicht. Ein Klick auf eine freie Zeit plant einen Termin.',
      'cal.calendars': 'Kalender', 'cal.newCalendar': 'Neuer Kalender', 'cal.open': 'Öffnen…', 'cal.import': 'Termine importieren…', 'cal.save': 'Speichern', 'cal.saveAll': 'Alle speichern',
      'cal.close': 'Schließen', 'cal.untitled': 'Mein Kalender', 'cal.search': 'Suchen', 'cal.allDay': 'Ganztägig', 'cal.more': '+{0} weitere', 'cal.noEvents': 'Keine Termine.',
      'cal.title': 'Titel', 'cal.calendar': 'Kalender', 'cal.start': 'Beginn', 'cal.end': 'Ende', 'cal.location': 'Ort', 'cal.description': 'Beschreibung',
      'cal.categories': 'Kategorien (durch Kommas getrennt)', 'cal.timeZone': 'Zeitzone', 'cal.repeat': 'Wiederholen', 'cal.never': 'Keine Wiederholung', 'cal.daily': 'Täglich',
      'cal.weekly': 'Wöchentlich', 'cal.monthly': 'Monatlich', 'cal.yearly': 'Jährlich', 'cal.every': 'Alle', 'cal.on': 'An', 'cal.ends': 'Endet', 'cal.endsNever': 'Nie',
      'cal.endsAfter': 'Nach', 'cal.times': 'Mal', 'cal.endsOn': 'Am Datum', 'cal.byMonthDay': 'Am {0}. des Monats', 'cal.byWeekday': 'Am {0} {1}',
      'cal.nth1': 'ersten', 'cal.nth2': 'zweiten', 'cal.nth3': 'dritten', 'cal.nth4': 'vierten', 'cal.nth-1': 'letzten', 'cal.custom': 'Eigene Regel: {0}',
      'cal.saveEvent': 'Speichern', 'cal.cancel': 'Abbrechen', 'cal.delete': 'Löschen', 'cal.export': 'Exportieren (.ics)', 'cal.reminders': '{0} Erinnerung(en) bleiben erhalten.',
      'cal.print': 'Drucken / PDF (aktuelle Ansicht)', 'cal.reminder': 'Erinnerung', 'cal.remNone': 'Keine', 'cal.remAt': 'Zu Beginn', 'cal.remMin': '{0} Minuten vorher', 'cal.remHour': '{0} Stunde(n) vorher', 'cal.remDay': '{0} Tag(e) vorher',
      'cal.remNow': 'jetzt', 'cal.remIn': 'in {0} Min.', 'cal.remEnable': 'Erinnerungen als Systembenachrichtigungen anzeigen', 'cal.remBlocked': 'Der Browser erlaubt keine Benachrichtigungen; Erinnerungen erscheinen in diesem Fenster.',
      'cal.remOther': '{0} weitere Erinnerung(en) dieses Termins bleiben erhalten.',
      'cal.scopeTitle': 'Wiederkehrender Termin', 'cal.scopeEdit': 'Nur diesen Termin oder alle Termine der Serie ändern?', 'cal.scopeDelete': 'Nur diesen Termin oder die ganze Serie löschen?',
      'cal.thisOne': 'Nur diesen', 'cal.all': 'Alle', 'cal.noCalendar': 'Legen Sie zuerst einen Kalender an oder öffnen Sie einen.', 'cal.closeConfirm': '„{0}“ hat ungespeicherte Änderungen. Trotzdem schließen?',
      'cal.imported': '{0} Termin(e) in „{1}“ importiert.', 'cal.recent': 'Zuletzt verwendet', 'cal.week.short': 'KW', 'cal.weekStart': 'Woche beginnt am',
      'cal.monday': 'Montag', 'cal.sunday': 'Sonntag', 'cal.sidebar': 'Kalender', 'cal.endBeforeStart': 'Das Ende liegt vor dem Beginn.', 'cal.local': 'Ortszeit',
      'cal.floating': 'unverankert (ohne Zeitzone)',
    },
  });

  // ---- state ------------------------------------------------------------------------------------------

  const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch (e) { return {}; } })();
  const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify({ view: state.view, weekStart: state.weekStart, notify: !!state.notify, fb: state.fb })); } catch (e) { /* ignore */ } };
  const narrow = () => window.matchMedia('(max-width: 760px)').matches;

  const state = {
    cals: [], active: null, view: prefs.view || (narrow() ? 'agenda' : 'month'), weekStart: prefs.weekStart ?? 1,
    date: startOfDay(new Date()), search: '', dialog: null, scope: null, drag: null, sidebar: false, recent: [], notify: !!prefs.notify,
    fb: { from: 8, to: 18, minutes: 60, weekends: false, ...(prefs.fb || {}) }, // free/busy view
  };
  let nextCalId = 1;

  let queued = false;
  function render() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; Suite.shell.refresh(); });
  }

  function markDirty(cal) {
    cal.dirty = true;
    Suite.shell.setDirty(state.cals.some((c) => c.dirty));
    render();
  }

  // Undo covers the content of the open calendars (events, name, color, time zones), not opening/closing files.
  const snapshot = () => state.cals.map((c) => ({ id: c.id, name: c.name, color: c.color, cal: c.cal, events: c.events }));
  const history = new Suite.UndoHistory({
    clone: (cals) => cals.map((c) => ({ ...c, cal: structuredClone(c.cal), events: structuredClone(c.events) })),
    onChange: () => render(),
  });
  const recordUndo = (coalesce = null) => history.record(snapshot(), coalesce);

  function step(redo) {
    const snap = redo ? history.redo(snapshot()) : history.undo(snapshot());
    if (!snap) return;
    for (const s of snap) {
      const c = state.cals.find((x) => x.id === s.id);
      if (!c) continue; // closed in the meantime
      const changed = c.name !== s.name || c.color !== s.color || JSON.stringify(c.events) !== JSON.stringify(s.events) || JSON.stringify(c.cal) !== JSON.stringify(s.cal);
      Object.assign(c, { name: s.name, color: s.color, cal: s.cal, events: s.events });
      if (changed) c.dirty = true;
    }
    state.dialog = null;
    state.scope = null;
    Suite.shell.setDirty(state.cals.some((c) => c.dirty));
    render();
  }

  const fail = (e) => { console.warn(e); Suite.shell.toast(Suite.i18n.describe(e), 'error'); };

  // ---- dates ------------------------------------------------------------------------------------------

  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDaysDate(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function startOfWeek(d) { const x = startOfDay(d); return addDaysDate(x, -((x.getDay() - state.weekStart + 7) % 7)); }
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const locale = () => (Suite.i18n.language === 'de' ? 'de-AT' : 'en-GB');
  const fmt = (d, opts) => new Intl.DateTimeFormat(locale(), opts).format(d);
  const fmtTime = (ms) => fmt(new Date(ms), { hour: '2-digit', minute: '2-digit' });
  const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const pad = (n) => String(n).padStart(2, '0');

  function isoWeek(d) {
    const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = x.getUTCDay() || 7;
    x.setUTCDate(x.getUTCDate() + 4 - day);
    return Math.ceil(((x - Date.UTC(x.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  }

  /** Visible range of the current view. */
  function range() {
    if (state.view === 'month') {
      const first = new Date(state.date.getFullYear(), state.date.getMonth(), 1);
      const start = startOfWeek(first);
      return { start, end: addDaysDate(start, 42) };
    }
    if (state.view === 'week' || state.view === 'freebusy') { const start = startOfWeek(state.date); return { start, end: addDaysDate(start, 7) }; }
    if (state.view === 'day') return { start: startOfDay(state.date), end: addDaysDate(startOfDay(state.date), 1) };
    return { start: startOfDay(state.date), end: addDaysDate(startOfDay(state.date), 60) };
  }

  function move(dir) {
    const d = new Date(state.date);
    if (state.view === 'month') { d.setDate(1); d.setMonth(d.getMonth() + dir); } else if (state.view === 'week' || state.view === 'freebusy') d.setDate(d.getDate() + 7 * dir);
    else if (state.view === 'day') d.setDate(d.getDate() + dir); else d.setDate(d.getDate() + 30 * dir);
    state.date = d;
    render();
  }

  // ---- occurrences ------------------------------------------------------------------------------------------

  /** All occurrences of the visible calendars (or of `cals`) in [from, to), filtered by the search (unless `all`). */
  function occurrences(from, to, { cals = null, all = false } = {}) {
    const q = all ? '' : state.search.trim().toLowerCase();
    const out = [];
    for (const cal of cals || state.cals) {
      if (!cals && !cal.visible) continue;
      const byUid = new Map();
      for (const ev of cal.events) {
        const entry = byUid.get(ev.uid) || { master: null, overrides: new Map() };
        if (ev.recurrenceId) entry.overrides.set(ev.recurrenceId, ev); else entry.master = ev;
        byUid.set(ev.uid, entry);
      }
      for (const { master, overrides } of byUid.values()) {
        const list = master ? ical.expand(master, +from, +to, overrides) : [...overrides.values()].flatMap((ev) => ical.expand(ev, +from, +to));
        for (const o of list) {
          const ev = o.event;
          if (q && ![ev.summary, ev.location, ev.description, ...(ev.categories || [])].some((v) => (v || '').toLowerCase().includes(q))) continue;
          out.push({ ...o, cal, master: master || ev, recurring: !!(master && master.rrule) });
        }
      }
    }
    return out.sort((a, b) => a.start - b.start || (b.allDay - a.allDay) || (b.end - b.start) - (a.end - a.start));
  }

  /** Occurrences that touch a day (all-day occurrences use their wall dates). */
  function forDay(list, day) {
    const s = +startOfDay(day), e = +addDaysDate(day, 1);
    return list.filter((o) => (o.allDay ? allDayCovers(o, day) : o.start < e && (o.end > s || (o.end === o.start && o.start >= s))));
  }

  function allDayCovers(o, day) {
    const st = ical.fromInstant(o.start, 'floating');
    const en = ical.fromInstant(o.end, 'floating');
    const key = day.getFullYear() * 10000 + (day.getMonth() + 1) * 100 + day.getDate();
    const sk = st.y * 10000 + st.m * 100 + st.d, ek = en.y * 10000 + en.m * 100 + en.d;
    return key >= sk && (key < ek || (ek === sk && key === sk));
  }

  // ---- calendars ------------------------------------------------------------------------------------------------

  function addCalendar({ name, cal, events, fileName = null, handle = null }) {
    const c = { id: nextCalId++, name, color: COLORS[state.cals.length % COLORS.length], visible: true, cal, events, fileName, handle, dirty: false };
    const color = ical.prop(cal, 'X-APPLE-CALENDAR-COLOR') || ical.prop(cal, 'COLOR');
    if (color && /^#[0-9a-f]{6}/i.test(color.value)) c.color = color.value.slice(0, 7);
    for (const ev of events) ev.calId = c.id;
    state.cals.push(c);
    if (!state.active) state.active = c.id;
    render();
    return c;
  }

  function newCalendar() {
    const name = state.cals.length ? `${t('cal.untitled')} ${state.cals.length + 1}` : t('cal.untitled');
    const c = addCalendar({ name, cal: ical.newCalendar(name), events: [] });
    state.active = c.id;
    markDirty(c);
  }

  function parseIcs(textContent, fallbackName) {
    const cal = ical.parse(textContent);
    const name = ical.text(cal, 'X-WR-CALNAME') || fallbackName;
    return { cal, name, events: ical.events(cal) };
  }

  async function openFiles() {
    const picked = await Suite.files.open({ types: ICS_TYPES, multiple: true }).catch(fail);
    if (!picked) return;
    for (const p of picked) await openPicked(p);
  }

  // recovery copies of unsaved work (shared/js/autosave.js): the changed calendars
  Suite.autosave.register({
    app: APP,
    save: () => {
      const list = state.cals.filter((c) => c.dirty).map((c) => ({ name: c.name, fileName: c.fileName, handle: c.handle || null, ics: calendarText(c) }));
      return list.length ? { name: list.map((c) => c.fileName || c.name).join(', '), cals: list } : null;
    },
    restore: (snap) => {
      for (const x of snap.cals) {
        const c = addCalendar({ ...parseIcs(x.ics, x.name), fileName: x.fileName, handle: x.handle });
        state.active = c.id;
        markDirty(c);
      }
    },
  });

  async function openPicked({ file, handle }) {
    try {
      // the same file twice: just select it
      for (const c of state.cals) if (c.handle && handle && (await c.handle.isSameEntry(handle))) { state.active = c.id; render(); return; }
      const parsed = parseIcs(await file.text(), file.name.replace(/\.[^.]+$/, ''));
      const c = addCalendar({ ...parsed, fileName: file.name, handle });
      state.active = c.id;
      state.sidebar = false;
      if (handle) { Suite.files.remember(APP, handle); state.recent = await Suite.files.recent(APP); }
      // jump to the first upcoming event if nothing is in view
      if (!occurrences(range().start, range().end).some((o) => o.cal === c)) {
        const next = occurrences(new Date(), addDaysDate(new Date(), 366)).find((o) => o.cal === c) || occurrences(addDaysDate(new Date(), -3650), addDaysDate(new Date(), 3650)).find((o) => o.cal === c);
        if (next) state.date = startOfDay(new Date(next.start));
      }
      render();
    } catch (e) { fail(e); }
  }

  async function importEvents() {
    const target = activeCal();
    if (!target) { Suite.shell.toast(t('cal.noCalendar'), 'warning'); return; }
    const picked = await Suite.files.open({ types: ICS_TYPES, multiple: true }).catch(fail);
    if (!picked) return;
    let n = 0;
    recordUndo();
    for (const p of picked) {
      try {
        const { cal, events } = parseIcs(await p.file.text(), p.file.name);
        for (const ev of events) {
          // replace an event with the same UID (and RECURRENCE-ID), e.g. an updated invitation
          target.events = target.events.filter((x) => !(x.uid === ev.uid && x.recurrenceId === ev.recurrenceId));
          ev.calId = target.id;
          target.events.push(ev);
          n++;
        }
        for (const tz of cal.comps.filter((x) => x.name === 'VTIMEZONE')) if (!target.cal.comps.some((x) => x.name === 'VTIMEZONE' && ical.text(x, 'TZID') === ical.text(tz, 'TZID'))) target.cal.comps.push(tz);
      } catch (e) { fail(e); }
    }
    Suite.shell.toast(t('cal.imported', n, target.name));
    markDirty(target);
  }

  const activeCal = () => state.cals.find((c) => c.id === state.active) || state.cals[0] || null;

  function calendarText(c) {
    const props = c.cal.props.filter((p) => p.name !== 'X-WR-CALNAME' && p.name !== 'X-APPLE-CALENDAR-COLOR');
    props.push({ name: 'X-WR-CALNAME', params: {}, value: ical.escapeText(c.name) }, { name: 'X-APPLE-CALENDAR-COLOR', params: {}, value: c.color });
    return ical.serialize(ical.buildCalendar({ ...c.cal, props }, c.events));
  }

  function report(result) { if (result.mode === 'downloaded') Suite.shell.banner(result.message); else Suite.shell.toast(result.message); }

  async function saveCalendar(c, as = false) {
    try {
      const bytes = new TextEncoder().encode(calendarText(c));
      const name = c.fileName || `${c.name.replace(/[\\/:*?"<>|]/g, '_')}.ics`;
      const result = as || !c.handle && !c.fileName ? await Suite.files.saveAs(bytes, { suggestedName: name, types: ICS_TYPES, type: 'text/calendar' })
        : await Suite.files.save({ name, handle: c.handle }, bytes, { type: 'text/calendar' });
      if (!result) return;
      report(result);
      if (result.handle) c.handle = result.handle;
      c.fileName = result.name || name;
      c.dirty = false;
      Suite.shell.setDirty(state.cals.some((x) => x.dirty));
      render();
    } catch (e) { fail(e); }
  }

  async function saveAll() { for (const c of state.cals.filter((x) => x.dirty)) await saveCalendar(c); }

  async function closeCalendar(c) {
    if (c.dirty && !(await Suite.shell.confirm(t('cal.closeConfirm', c.name)))) return;
    state.cals = state.cals.filter((x) => x !== c);
    if (state.active === c.id) state.active = state.cals[0] ? state.cals[0].id : null;
    Suite.shell.setDirty(state.cals.some((x) => x.dirty));
    render();
  }

  // ---- editing events --------------------------------------------------------------------------------------------

  const zone = () => ical.localZone();
  const ztOf = (ms, tz, date = false) => ical.fromInstant(ms, tz === 'floating' ? 'floating' : tz, date);

  function newEventDraft(startMs, endMs, allDay = false) {
    const cal = activeCal();
    if (!cal) { Suite.shell.toast(t('cal.noCalendar'), 'warning'); return; }
    const tz = zone();
    const start = allDay ? { ...ztOf(startMs, 'floating', true), tz: 'floating' } : ztOf(startMs, tz);
    const end = allDay ? { ...ztOf(endMs, 'floating', true), tz: 'floating' } : ztOf(endMs, tz);
    openDialog({ isNew: true, calId: cal.id, event: { uid: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}@portable-web-app-suite`, summary: '', location: '', description: '', start, end, rrule: null, exdates: [], categories: [], sequence: 0 } });
  }

  /** Open the event dialog for an occurrence (or a draft). */
  function openDialog({ isNew = false, calId, event, occ = null }) {
    const ev = event;
    const allDay = ev.start.date;
    const tz = allDay ? 'floating' : ev.start.tz;
    // the dialog edits wall times in the event's zone (or the local zone for floating times)
    const s = occ ? ztOf(occ.start, tz, allDay) : ev.start;
    const e = occ ? ztOf(occ.end, tz, allDay) : ev.end || ev.start;
    const endShown = allDay ? ical.addDays(e, -1) : e; // DTEND of all-day events is exclusive
    const r = ev.rrule;
    state.dialog = {
      isNew, occ, original: event, calId,
      summary: ev.summary || '', location: ev.location || '', description: ev.description || '', categories: (ev.categories || []).join(', '),
      allDay, tz: allDay ? zone() : tz,
      startDate: `${s.y}-${pad(s.m)}-${pad(s.d)}`, startTime: `${pad(s.hh)}:${pad(s.mm)}`,
      endDate: `${endShown.y}-${pad(endShown.m)}-${pad(endShown.d)}`, endTime: `${pad(e.hh)}:${pad(e.mm)}`,
      repeat: simpleRule(r, ev.start),
      alarms: ev.alarms || 0,
      reminder: ev.reminder ?? null,
    };
    render();
    requestAnimationFrame(() => { const el = document.querySelector('[data-testid=ev-title]'); if (el) el.focus(); });
  }

  /** Map an RRULE to the dialog's simple form (or keep it as a custom rule). */
  function simpleRule(r, start) {
    const base = { freq: 'NONE', interval: 1, days: [new Date(start.y, start.m - 1, start.d).getDay()], monthly: 'day', ends: 'never', count: 10, until: '', custom: null };
    if (!r) return base;
    const until = r.until ? `${r.until.y}-${pad(r.until.m)}-${pad(r.until.d)}` : '';
    const simple = { ...base, freq: r.freq, interval: r.interval || 1, ends: r.count ? 'count' : r.until ? 'until' : 'never', count: r.count || 10, until };
    const plainDays = r.byday && r.byday.every((b) => !b.n);
    if (r.freq === 'WEEKLY' && (!r.byday || plainDays) && !r.bymonthday && !r.bymonth && !r.bysetpos) return { ...simple, days: r.byday ? r.byday.map((b) => b.day) : base.days };
    if (r.freq === 'MONTHLY' && !r.bysetpos && !r.bymonth && ((!r.byday && (!r.bymonthday || r.bymonthday.length === 1)) || (r.byday && r.byday.length === 1 && r.byday[0].n && !r.bymonthday))) return { ...simple, monthly: r.byday ? 'weekday' : 'day' };
    if ((r.freq === 'DAILY' || r.freq === 'YEARLY') && !r.byday && !r.bymonthday && !r.bysetpos && (!r.bymonth || r.freq === 'YEARLY')) return simple;
    return { ...simple, custom: ical.formatRRule(r) };
  }

  /** The RRULE of the dialog (null for no repetition). */
  function ruleFromDialog(d, start) {
    const rp = d.repeat;
    if (rp.freq === 'NONE') return null;
    if (rp.custom) {
      const r = ical.parseRRule(rp.custom);
      if (r) { delete r.count; delete r.until; }
      return r && applyEnds(r, rp, start);
    }
    const r = { freq: rp.freq, interval: Math.max(1, rp.interval | 0) };
    if (rp.freq === 'WEEKLY') r.byday = (rp.days.length ? rp.days : [new Date(start.y, start.m - 1, start.d).getDay()]).map((day) => ({ n: 0, day }));
    if (rp.freq === 'MONTHLY') {
      if (rp.monthly === 'weekday') r.byday = [{ n: nthOf(start.d), day: new Date(start.y, start.m - 1, start.d).getDay() }]; else r.bymonthday = [start.d];
    }
    return applyEnds(r, rp, start);
  }

  /** Ordinal of a day's weekday in its month (1..4, or -1 for the fifth = last). */
  const nthOf = (day) => (Math.ceil(day / 7) >= 5 ? -1 : Math.ceil(day / 7));

  function applyEnds(r, rp, start) {
    if (rp.ends === 'count') r.count = Math.max(1, rp.count | 0);
    if (rp.ends === 'until' && rp.until) {
      const [y, m, d] = rp.until.split('-').map(Number);
      r.until = start.date ? { y, m, d, hh: 0, mm: 0, ss: 0, date: true, tz: 'floating' } : ical.fromInstant(ical.toInstant({ y, m, d, hh: 23, mm: 59, ss: 59, date: false, tz: start.tz }), 'UTC');
    }
    return r;
  }

  function dialogTimes(d) {
    const [sy, sm, sd] = d.startDate.split('-').map(Number);
    const [ey, em, ed] = d.endDate.split('-').map(Number);
    if (d.allDay) {
      const start = { y: sy, m: sm, d: sd, hh: 0, mm: 0, ss: 0, date: true, tz: 'floating' };
      const end = ical.addDays({ y: ey, m: em, d: ed, hh: 0, mm: 0, ss: 0, date: true, tz: 'floating' }, 1);
      return { start, end };
    }
    const [sh, smin] = d.startTime.split(':').map(Number);
    const [eh, emin] = d.endTime.split(':').map(Number);
    return { start: { y: sy, m: sm, d: sd, hh: sh, mm: smin, ss: 0, date: false, tz: d.tz }, end: { y: ey, m: em, d: ed, hh: eh, mm: emin, ss: 0, date: false, tz: d.tz } };
  }

  function findCal(id) { return state.cals.find((c) => c.id === id); }

  /** Apply the dialog. scope: 'one' (this occurrence) or 'all'. */
  function saveDialog(scope = null) {
    const d = state.dialog;
    const { start, end } = dialogTimes(d);
    if (ical.toInstant(end) < ical.toInstant(start)) { Suite.shell.toast(t('cal.endBeforeStart'), 'error'); return; }
    const orig = d.original;
    const recurring = !d.isNew && d.occ && d.occ.recurring;
    if (recurring && !scope) { state.scope = { kind: 'edit', run: (s) => saveDialog(s) }; render(); return; }
    const fields = {
      summary: d.summary.trim(), location: d.location.trim(), description: d.description, categories: d.categories.split(',').map((x) => x.trim()).filter(Boolean),
      reminder: d.reminder,
    };
    const target = findCal(d.calId);
    const source = findCal(orig.calId) || target;
    recordUndo();
    if (d.isNew) {
      const ev = { ...orig, ...fields, start, end, rrule: ruleFromDialog(d, start), calId: target.id };
      target.events.push(ev);
      markDirty(target);
    } else if (recurring && scope === 'one') {
      // an override for this occurrence (or update the existing override)
      const master = d.occ.master;
      const existing = source.events.find((x) => x.uid === master.uid && x.recurrenceId === d.occ.key);
      const rid = parseKey(d.occ.key, master.start);
      if (existing) Object.assign(existing, fields, { start, end, sequence: (existing.sequence || 0) + 1 });
      else source.events.push({ uid: master.uid, ...fields, start, end, rrule: null, exdates: [], recurrenceId: d.occ.key, recurrenceIdValue: rid, sequence: (master.sequence || 0) + 1, calId: source.id, comp: master.comp ? { ...master.comp, props: master.comp.props.filter((p) => !['RRULE', 'EXDATE', 'RDATE'].includes(p.name)) } : null });
      markDirty(source);
    } else {
      const master = d.occ ? d.occ.master : orig;
      // when the dialog showed an occurrence of a series, move the series by the same amount
      let newStart = start, newEnd = end;
      if (recurring) {
        const delta = ical.toInstant(start) - d.occ.start;
        const dur = ical.toInstant(end) - ical.toInstant(start);
        const ms = ical.toInstant(master.start) + delta;
        newStart = ztOf(ms, start.tz, start.date);
        newEnd = ztOf(ms + dur, start.tz, start.date);
      }
      Object.assign(master, fields, { start: newStart, end: newEnd, rrule: d.repeat.freq === 'NONE' ? null : ruleFromDialog(d, newStart), sequence: (master.sequence || 0) + 1 });
      if (!master.rrule) source.events = source.events.filter((x) => !(x.uid === master.uid && x.recurrenceId));
      if (target !== source) {
        const moved = source.events.filter((x) => x.uid === master.uid);
        source.events = source.events.filter((x) => x.uid !== master.uid);
        for (const x of moved) { x.calId = target.id; target.events.push(x); }
        markDirty(source);
      }
      markDirty(target);
    }
    state.dialog = null;
    state.scope = null;
    render();
  }

  /** Zoned wall time from an occurrence key (YYYYMMDD[THHMMSS]) in the master's zone. */
  function parseKey(key, like) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?$/.exec(key);
    return { y: +m[1], m: +m[2], d: +m[3], hh: m[4] ? +m[4] : 0, mm: m[5] ? +m[5] : 0, ss: m[6] ? +m[6] : 0, date: !m[4], tz: like.date ? 'floating' : like.tz };
  }

  function deleteEvent(scope = null) {
    const d = state.dialog;
    const cal = findCal(d.original.calId);
    if (d.isNew) { state.dialog = null; render(); return; }
    if (d.occ && d.occ.recurring && !scope) { state.scope = { kind: 'delete', run: (s) => deleteEvent(s) }; render(); return; }
    const master = d.occ ? d.occ.master : d.original;
    recordUndo();
    if (scope === 'one') {
      master.exdates = [...(master.exdates || []), parseKey(d.occ.key, master.start)];
      cal.events = cal.events.filter((x) => !(x.uid === master.uid && x.recurrenceId === d.occ.key));
      master.sequence = (master.sequence || 0) + 1;
    } else cal.events = cal.events.filter((x) => x.uid !== master.uid || (d.original.recurrenceId && !master.rrule && x !== d.original));
    state.dialog = null;
    state.scope = null;
    markDirty(cal);
  }

  function exportEvent() {
    const d = state.dialog;
    const cal = findCal(d.original.calId);
    const evs = cal ? cal.events.filter((x) => x.uid === d.original.uid) : [d.original];
    const text = ical.serialize(ical.buildCalendar(ical.newCalendar(d.summary || 'event'), evs.length ? evs : [d.original]));
    Suite.files.download(new TextEncoder().encode(text), `${(d.summary || 'event').replace(/[\\/:*?"<>|]/g, '_')}.ics`, 'text/calendar');
  }

  /** Move or resize an occurrence by drag & drop. */
  function applyDrag(o, newStart, newEnd, scope = null) {
    if (o.recurring && !scope) { state.scope = { kind: 'edit', run: (s) => applyDrag(o, newStart, newEnd, s) }; render(); return; }
    const cal = o.cal;
    const ev = o.event;
    const tz = ev.start.date ? 'floating' : ev.start.tz;
    const date = ev.start.date;
    recordUndo();
    if (o.recurring && scope === 'one') {
      const existing = cal.events.find((x) => x.uid === o.master.uid && x.recurrenceId === o.key);
      const start = ztOf(newStart, tz, date), end = ztOf(newEnd, tz, date);
      if (existing) Object.assign(existing, { start, end, sequence: (existing.sequence || 0) + 1 });
      else cal.events.push({ ...o.master, start, end, rrule: null, exdates: [], recurrenceId: o.key, recurrenceIdValue: parseKey(o.key, o.master.start), sequence: (o.master.sequence || 0) + 1, comp: o.master.comp ? { ...o.master.comp, props: o.master.comp.props.filter((p) => !['RRULE', 'EXDATE', 'RDATE'].includes(p.name)) } : null });
    } else {
      const target = o.recurring ? o.master : ev;
      const delta = newStart - o.start;
      const dur = newEnd - newStart;
      const s = ical.toInstant(target.start) + delta;
      target.start = ztOf(s, tz, date);
      target.end = ztOf(s + dur, tz, date);
      target.sequence = (target.sequence || 0) + 1;
    }
    state.scope = null;
    markDirty(cal);
  }

  // ---- UI: toolbar and sidebar -----------------------------------------------------------------------------------

  function title() {
    const d = state.date;
    if (state.view === 'month') return fmt(d, { month: 'long', year: 'numeric' });
    if (state.view === 'day') return fmt(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (state.view === 'week' || state.view === 'freebusy') {
      const s = startOfWeek(d), e = addDaysDate(s, 6);
      return `${fmt(s, { day: 'numeric', month: 'short' })} – ${fmt(e, { day: 'numeric', month: 'short', year: 'numeric' })} · ${t('cal.week.short')} ${isoWeek(s)}`;
    }
    return `${fmt(d, { day: 'numeric', month: 'short' })} – ${fmt(addDaysDate(d, 59), { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }

  function Toolbar() {
    return html`<nav class="cal-toolbar" role="toolbar">
      <button class="secondary outline cal-only-phone" data-testid="toggle-sidebar" onClick=${() => { state.sidebar = !state.sidebar; render(); }}>☰</button>
      <button class="secondary" data-testid="today" onClick=${() => { state.date = startOfDay(new Date()); render(); }}>${t('cal.today')}</button>
      <button class="secondary outline" data-testid="prev" aria-label="previous" onClick=${() => move(-1)}>‹</button>
      <button class="secondary outline" data-testid="next" aria-label="next" onClick=${() => move(1)}>›</button>
      <strong class="cal-title" data-testid="title">${title()}</strong>
      <span class="cal-views">${['month', 'week', 'day', 'agenda', 'freebusy'].map((v) => html`<button class=${state.view === v ? '' : 'secondary outline'} data-testid=${`view-${v}`} aria-pressed=${state.view === v}
        onClick=${() => { state.view = v; savePrefs(); render(); }}>${t(`cal.${v}`)}</button>`)}</span>
      <input type="search" class="cal-search" placeholder=${t('cal.search')} value=${state.search} data-testid="search" onInput=${(e) => { state.search = e.target.value; render(); }} />
      <button class="secondary outline" title="${t('cal.undo')} (Ctrl+Z)" data-testid="undo" disabled=${!history.canUndo} onClick=${() => step(false)}>↶</button>
      <button class="secondary outline" title="${t('cal.redo')} (Ctrl+Y)" data-testid="redo" disabled=${!history.canRedo} onClick=${() => step(true)}>↷</button>
      <button data-testid="new-event" onClick=${() => { const s = new Date(state.date); s.setHours(9, 0, 0, 0); newEventDraft(+s, +s + 3600000); }}>+ ${t('cal.new')}</button>
      <button class="secondary outline" data-testid="print" title=${t('cal.print')} onClick=${printView}>🖨</button>
      <button class=${state.notify ? '' : 'secondary outline'} data-testid="notify" title=${t('cal.remEnable')} aria-pressed=${!!state.notify} onClick=${toggleNotify}>🔔</button>
      ${state.cals.some((c) => c.dirty) ? html`<button class="secondary" data-testid="save-all" onClick=${saveAll}>${t('cal.saveAll')}</button>` : null}
    </nav>`;
  }

  function MiniMonth() {
    const first = new Date(state.date.getFullYear(), state.date.getMonth(), 1);
    const start = startOfWeek(first);
    const today = new Date();
    const days = Array.from({ length: 42 }, (_, i) => addDaysDate(start, i));
    const names = Array.from({ length: 7 }, (_, i) => fmt(addDaysDate(start, i), { weekday: 'narrow' }));
    return html`<div class="cal-mini" data-testid="mini">
      <div class="cal-mini-head"><button class="secondary outline" onClick=${() => { const d = new Date(first); d.setMonth(d.getMonth() - 1); state.date = d; render(); }}>‹</button>
        <span>${fmt(first, { month: 'long', year: 'numeric' })}</span>
        <button class="secondary outline" onClick=${() => { const d = new Date(first); d.setMonth(d.getMonth() + 1); state.date = d; render(); }}>›</button></div>
      <div class="cal-mini-grid">${names.map((n) => html`<span class="cal-mini-name">${n}</span>`)}
        ${days.map((d) => html`<button class=${['cal-mini-day', d.getMonth() !== first.getMonth() ? 'other' : '', sameDay(d, today) ? 'today' : '', sameDay(d, state.date) ? 'selected' : ''].join(' ')}
          onClick=${() => { state.date = d; if (narrow()) { state.sidebar = false; if (state.view === 'month') state.view = 'day'; } render(); }}>${d.getDate()}</button>`)}</div>
    </div>`;
  }

  function Sidebar() {
    return html`<aside class=${`cal-sidebar suite-drawer ${state.sidebar ? 'open' : ''}`} data-testid="sidebar">
      <button class="secondary outline cal-only-phone cal-side-close" data-testid="close-sidebar" onClick=${() => { state.sidebar = false; render(); }}>×</button>
      <${MiniMonth} />
      <div class="cal-side-head"><strong>${t('cal.calendars')}</strong></div>
      <ul class="cal-list">${state.cals.map((c) => html`<li class=${state.active === c.id ? 'active' : ''} data-testid="calendar">
        <input type="checkbox" checked=${c.visible} title="👁" data-testid="cal-visible" onChange=${(e) => { c.visible = e.target.checked; render(); }} />
        <input type="color" value=${c.color} data-testid="cal-color" onInput=${(e) => { recordUndo(`color:${c.id}`); c.color = e.target.value; markDirty(c); }} />
        ${state.renaming === c.id
          ? html`<input class="cal-name-input" defaultValue=${c.name} data-testid="cal-name-input" autofocus
              onKeyDown=${(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { state.renaming = null; render(); } }}
              onBlur=${(e) => { if (state.renaming !== c.id) return; state.renaming = null; const name = e.target.value.trim(); if (name && name !== c.name) { recordUndo(); c.name = name; markDirty(c); } else render(); }} />`
          : html`<span class="cal-name" data-testid="cal-name" onClick=${() => { state.active = c.id; render(); }}
              onDblClick=${() => { state.renaming = c.id; render(); }}>${c.name}${c.dirty ? ' •' : ''}</span>`}
        <button class="secondary outline" title=${t('cal.save')} data-testid="cal-save" onClick=${() => saveCalendar(c)}>💾</button>
        <button class="secondary outline" title=${t('cal.close')} data-testid="cal-close" onClick=${() => closeCalendar(c)}>×</button>
      </li>`)}</ul>
      <div class="cal-side-buttons">
        <button class="secondary outline" data-testid="new-calendar" onClick=${newCalendar}>+ ${t('cal.newCalendar')}</button>
        <button class="secondary outline" data-testid="open" onClick=${openFiles}>${t('cal.open')}</button>
        <button class="secondary outline" data-testid="import" disabled=${!state.cals.length} onClick=${importEvents}>${t('cal.import')}</button>
      </div>
      ${state.recent.length ? html`<div class="cal-recent"><small>${t('cal.recent')}</small><ul>${state.recent.map((r) => html`<li><a href="#" onClick=${async (e) => {
        e.preventDefault(); const picked = await Suite.files.reopen(r.handle); if (picked) openPicked(picked);
      }}>${r.name}</a></li>`)}</ul></div>` : null}
      <label class="cal-weekstart">${t('cal.weekStart')}<select data-testid="week-start" onChange=${(e) => { state.weekStart = +e.target.value; savePrefs(); render(); }}>
        <option value="1" selected=${state.weekStart === 1}>${t('cal.monday')}</option><option value="0" selected=${state.weekStart === 0}>${t('cal.sunday')}</option></select></label>
    </aside>`;
  }

  // ---- UI: views ----------------------------------------------------------------------------------------------------

  function chipLabel(o, day) {
    if (o.allDay) return o.event.summary || '—';
    const startsToday = sameDay(new Date(o.start), day);
    return `${startsToday ? fmtTime(o.start) : '…'} ${o.event.summary || '—'}`;
  }

  function Chip({ o, day }) {
    return html`<div class=${`cal-chip ${o.allDay ? 'allday' : ''}`} style=${`--c:${o.cal.color}`} data-testid="event" draggable="true" title=${o.event.summary}
      onDragStart=${(e) => { state.drag = { kind: 'chip', o, day }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', o.event.uid); }}
      onClick=${(e) => { e.stopPropagation(); openDialog({ calId: o.cal.id, event: o.event, occ: o }); }}>${o.recurring ? '↻ ' : ''}${chipLabel(o, day)}</div>`;
  }

  function dropOnDay(e, day) {
    const d = state.drag;
    if (!d || d.kind !== 'chip') return;
    e.preventDefault();
    state.drag = null;
    const shift = +startOfDay(day) - +startOfDay(d.day);
    if (!shift) return;
    // shift by whole days, keeping the clock time (also across DST changes)
    const s = new Date(d.o.start); s.setDate(s.getDate() + Math.round(shift / 86400000));
    applyDrag(d.o, +s, +s + (d.o.end - d.o.start));
  }

  function MonthView() {
    const { start } = range();
    const days = Array.from({ length: 42 }, (_, i) => addDaysDate(start, i));
    const list = occurrences(start, addDaysDate(start, 42));
    const month = state.date.getMonth();
    const today = new Date();
    return html`<div class="cal-month" data-testid="month">
      <div class="cal-month-head">${days.slice(0, 7).map((d) => html`<span>${fmt(d, { weekday: 'short' })}</span>`)}</div>
      <div class="cal-month-grid">${days.map((day) => {
        const items = forDay(list, day);
        const max = narrow() ? 2 : 4;
        return html`<div class=${['cal-cell', day.getMonth() !== month ? 'other' : '', sameDay(day, today) ? 'today' : ''].join(' ')} data-testid="day" data-date=${isoDate(day)}
            onDblClick=${() => { const s = new Date(day); s.setHours(9, 0, 0, 0); newEventDraft(+s, +s + 3600000); }}
            onDragOver=${(e) => { if (state.drag) e.preventDefault(); }} onDrop=${(e) => dropOnDay(e, day)}>
          <button class="cal-daynum" data-testid="day-number" onClick=${() => { state.date = day; state.view = 'day'; render(); }}>${day.getDate()}</button>
          ${items.slice(0, max).map((o) => html`<${Chip} o=${o} day=${day} key=${o.event.uid + o.key} />`)}
          ${items.length > max ? html`<button class="cal-more" onClick=${() => { state.date = day; state.view = 'day'; render(); }}>${t('cal.more', items.length - max)}</button>` : null}
        </div>`;
      })}</div>
    </div>`;
  }

  /** Columns for overlapping timed occurrences of one day. */
  function layout(items) {
    const cols = [];
    const placed = items.map((o) => ({ o }));
    let group = [], groupEnd = -Infinity;
    const flush = () => { const n = Math.max(...group.map((p) => p.col)) + 1; for (const p of group) p.cols = n; group = []; };
    for (const p of placed) {
      if (p.o.start >= groupEnd && group.length) { flush(); cols.length = 0; }
      let col = cols.findIndex((end) => end <= p.o.start);
      if (col < 0) { col = cols.length; cols.push(0); }
      cols[col] = Math.max(p.o.end, p.o.start + 15 * 60000);
      p.col = col;
      group.push(p);
      groupEnd = Math.max(groupEnd, cols[col]);
    }
    if (group.length) flush();
    return placed;
  }

  function TimeGrid({ days }) {
    const list = occurrences(days[0], addDaysDate(days[days.length - 1], 1));
    const now = new Date();
    const d = state.drag;
    return html`<div class="cal-timegrid" data-testid="timegrid" style=${`--days:${days.length}`}>
      <div class="cal-tg-head"><span></span>${days.map((day) => html`<button class=${`cal-tg-day ${sameDay(day, now) ? 'today' : ''}`} onClick=${() => { state.date = day; state.view = 'day'; render(); }}>
        ${fmt(day, { weekday: 'short' })} <b>${day.getDate()}</b></button>`)}</div>
      <div class="cal-tg-allday"><span>${t('cal.allDay')}</span>${days.map((day) => html`<div class="cal-tg-allday-cell" data-testid="allday" data-date=${isoDate(day)}
          onDblClick=${() => newEventDraft(+day, +addDaysDate(day, 1), true)} onDragOver=${(e) => { if (state.drag) e.preventDefault(); }} onDrop=${(e) => dropOnDay(e, day)}>
        ${forDay(list, day).filter((o) => o.allDay || o.end - o.start >= 86400000).map((o) => html`<${Chip} o=${o} day=${day} key=${o.event.uid + o.key} />`)}</div>`)}</div>
      <div class="cal-tg-body" ref=${(el) => { if (el && !el.dataset.scrolled) { el.dataset.scrolled = '1'; requestAnimationFrame(() => { el.scrollTop = HOUR * 7; }); } }}>
        <div class="cal-tg-hours">${Array.from({ length: 24 }, (_, h) => html`<span style=${`top:${h * HOUR}px`}>${h ? `${pad(h)}:00` : ''}</span>`)}</div>
        ${days.map((day) => {
          const timed = forDay(list, day).filter((o) => !o.allDay && o.end - o.start < 86400000);
          const dayStart = +startOfDay(day);
          return html`<div class="cal-tg-col" data-testid="column" data-date=${isoDate(day)} onPointerDown=${(e) => startCreate(e, day)}>
            ${layout(timed).map(({ o, col, cols }) => {
              const preview = d && d.kind === 'move' && d.o === o && d.moved ? d : null;
              const s = Math.max(o.start, dayStart), e = Math.min(o.end, dayStart + 86400000);
              const top = ((s - dayStart) / 3600000) * HOUR, height = Math.max(18, ((e - s) / 3600000) * HOUR);
              return html`<div class=${`cal-ev ${preview ? 'dragging' : ''}`} key=${o.event.uid + o.key} data-testid="event" style=${`--c:${o.cal.color};top:${top}px;height:${height}px;left:${(col / cols) * 100}%;width:${100 / cols}%`}
                  onPointerDown=${(ev) => startMove(ev, o, day)}>
                <b>${o.event.summary || '—'}</b><small>${fmtTime(o.start)}–${fmtTime(o.end)}${o.recurring ? ' ↻' : ''}${o.event.location ? ` · ${o.event.location}` : ''}</small>
                <span class="cal-ev-resize" data-testid="resize" onPointerDown=${(ev) => startResize(ev, o)}></span>
              </div>`;
            })}
            ${d && d.kind === 'create' && sameDay(d.day, day) ? html`<div class="cal-ev cal-ev-new" style=${`top:${(d.a / 60) * HOUR}px;height:${Math.max(4, ((d.b - d.a) / 60) * HOUR)}px`}></div>` : null}
            ${d && (d.kind === 'move' || d.kind === 'resize') && d.moved && d.previewDay && sameDay(d.previewDay, day) ? html`<div class="cal-ev cal-ev-new" style=${`--c:${d.o.cal.color};top:${(d.previewStartMin / 60) * HOUR}px;height:${Math.max(4, (d.previewDurMin / 60) * HOUR)}px`}></div>` : null}
            ${sameDay(day, now) ? html`<div class="cal-now" style=${`top:${((now - dayStart) / 3600000) * HOUR}px`}></div>` : null}
          </div>`;
        })}
      </div>
    </div>`;
  }

  // pointer interaction in the time grid (minutes from midnight, snapped)
  function minutesAt(e, col) {
    const r = col.getBoundingClientRect();
    return Math.max(0, Math.min(24 * 60, Math.round(((e.clientY - r.top) / HOUR) * 60 / SNAP) * SNAP));
  }

  function columnAt(e) {
    const el = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.classList && x.classList.contains('cal-tg-col'));
    return el || null;
  }

  function startCreate(e, day) {
    if (e.button !== 0 || e.target.closest('.cal-ev')) return;
    const col = e.currentTarget;
    const a = Math.floor(minutesAt(e, col) / 30) * 30;
    state.drag = { kind: 'create', day, a, b: a + 60, start: a, moved: false, col };
    col.setPointerCapture(e.pointerId);
    const onMove = (ev) => { const m = minutesAt(ev, col); state.drag.moved = true; state.drag.a = Math.min(state.drag.start, m); state.drag.b = Math.max(state.drag.start + SNAP, m); render(); };
    const onUp = () => {
      col.removeEventListener('pointermove', onMove);
      const d = state.drag;
      state.drag = null;
      const base = +startOfDay(day);
      const s = new Date(base); s.setMinutes(d.a);
      const en = new Date(base); en.setMinutes(d.moved ? d.b : d.a + 60);
      newEventDraft(+s, +en);
    };
    col.addEventListener('pointermove', onMove);
    col.addEventListener('pointerup', onUp, { once: true });
  }

  function startMove(e, o, day) {
    if (e.button !== 0 || e.target.classList.contains('cal-ev-resize')) return;
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const col = el.parentElement;
    const offsetMin = minutesAt(e, col) - Math.round((Math.max(o.start, +startOfDay(day)) - +startOfDay(day)) / 60000);
    const durMin = Math.round((o.end - o.start) / 60000);
    state.drag = { kind: 'move', o, moved: false, x: e.clientX, y: e.clientY };
    const onMove = (ev) => {
      const d = state.drag;
      if (!d.moved && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 4) return;
      d.moved = true;
      const target = columnAt(ev);
      if (!target) return;
      d.previewDay = new Date(`${target.dataset.date}T00:00:00`);
      d.previewStartMin = Math.max(0, Math.min(24 * 60 - SNAP, minutesAt(ev, target) - offsetMin));
      d.previewDurMin = durMin;
      render();
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      const d = state.drag;
      state.drag = null;
      if (!d.moved) { openDialog({ calId: o.cal.id, event: o.event, occ: o }); return; }
      if (!d.previewDay) { render(); return; }
      const s = new Date(d.previewDay); s.setMinutes(d.previewStartMin);
      applyDrag(o, +s, +s + (o.end - o.start));
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp, { once: true });
  }

  function startResize(e, o) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const col = handle.closest('.cal-tg-col');
    const day = new Date(`${col.dataset.date}T00:00:00`);
    const startMin = Math.round((Math.max(o.start, +day) - +day) / 60000);
    state.drag = { kind: 'resize', o, moved: false, previewDay: day, previewStartMin: startMin, previewDurMin: Math.round((o.end - o.start) / 60000) };
    const onMove = (ev) => { const d = state.drag; d.moved = true; d.previewDurMin = Math.max(SNAP, minutesAt(ev, col) - startMin); render(); };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      const d = state.drag;
      state.drag = null;
      if (!d.moved) { render(); return; }
      const end = new Date(day); end.setMinutes(startMin + d.previewDurMin);
      applyDrag(o, o.start, Math.max(o.start + SNAP * 60000, +end));
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp, { once: true });
  }

  function AgendaView() {
    const { start, end } = range();
    const list = occurrences(start, end);
    const days = [];
    for (let d = start; d < end; d = addDaysDate(d, 1)) {
      const items = forDay(list, d);
      if (items.length) days.push({ d, items });
    }
    return html`<div class="cal-agenda" data-testid="agenda">${days.length ? days.map(({ d, items }) => html`<section class=${sameDay(d, new Date()) ? 'today' : ''}>
      <h4>${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}</h4>
      ${items.map((o) => html`<button class="cal-agenda-item" style=${`--c:${o.cal.color}`} data-testid="event" onClick=${() => openDialog({ calId: o.cal.id, event: o.event, occ: o })}>
        <span class="cal-agenda-time">${o.allDay ? t('cal.allDay') : `${fmtTime(o.start)}–${fmtTime(o.end)}`}</span>
        <span><b>${o.event.summary || '—'}</b>${o.recurring ? ' ↻' : ''}${o.event.location ? html`<small> · ${o.event.location}</small>` : null}</span>
      </button>`)}
    </section>`) : html`<p class="cal-empty">${t('cal.noEvents')}</p>`}</div>`;
  }

  // ---- free/busy -------------------------------------------------------------------------------------------------------

  /** Does an occurrence block time? Cancelled and transparent events do not; all-day events only when marked OPAQUE. */
  const blocks = (o) => (o.event.status || '').toUpperCase() !== 'CANCELLED' && o.event.transp !== 'TRANSPARENT' && (!o.allDay || o.event.transp === 'OPAQUE');

  const fbCache = new WeakMap(); // cal component -> busy periods of its VFREEBUSY components (imported .ifb files)
  function importedBusy(c) {
    if (!fbCache.has(c.cal)) fbCache.set(c.cal, ical.freeBusyPeriods(c.cal));
    return fbCache.get(c.cal);
  }

  /** Busy periods of one calendar in [from, to): [{ start, end, type }]. */
  function busyOf(c, from, to) {
    const list = occurrences(from, to, { cals: [c], all: true }).filter(blocks)
      .map((o) => ({ start: o.start, end: o.end, type: (o.event.status || '').toUpperCase() === 'TENTATIVE' ? 'BUSY-TENTATIVE' : 'BUSY' }));
    return ical.mergeBusy([...list, ...importedBusy(c).filter((p) => p.end > +from && p.start < +to)]);
  }

  function exportFreeBusy() {
    const from = startOfWeek(state.date), to = addDaysDate(from, 56); // eight weeks
    const busy = state.cals.filter((c) => c.visible).flatMap((c) => busyOf(c, from, to));
    const text = ical.freeBusyText(busy, +from, +to);
    Suite.files.download(new TextEncoder().encode(text), `free-busy-${isoDate(from)}.ifb`, 'text/calendar');
  }

  function FreeBusyView() {
    const fb = state.fb;
    const from = startOfWeek(state.date), to = addDaysDate(from, 7);
    const cals = state.cals.filter((c) => c.visible);
    const busy = new Map(cals.map((c) => [c.id, busyOf(c, from, to)]));
    const all = [...busy.values()].flat();
    const slots = ical.freeSlots(all, +from, +to, { minutes: fb.minutes, fromHour: fb.from, toHour: fb.to, weekends: fb.weekends });
    const days = Array.from({ length: 7 }, (_, i) => addDaysDate(from, i)).filter((d) => fb.weekends || (d.getDay() !== 0 && d.getDay() !== 6));
    const set = (k, v) => { state.fb = { ...fb, [k]: v }; savePrefs(); render(); };
    const hours = Array.from({ length: Math.max(0, Math.ceil(fb.to) - Math.floor(fb.from) + 1) }, (_, i) => Math.floor(fb.from) + i);
    const bar = (list, day, cls, title, onClick) => {
      const a = new Date(day); a.setHours(0, 0, 0, 0);
      const s = +a + fb.from * 3600000, e = +a + fb.to * 3600000, span = e - s;
      return list.filter((x) => x.end > s && x.start < e).map((x) => {
        const l = Math.max(0, (x.start - s) / span) * 100, r = Math.min(1, (x.end - s) / span) * 100;
        return html`<span class=${`cal-fb-seg ${cls} ${x.type === 'BUSY-TENTATIVE' ? 'tentative' : ''}`} data-testid=${cls === 'free' ? 'fb-free' : 'fb-busy'} style=${`left:${l}%;width:${r - l}%`}
          title=${`${fmtTime(x.start)}–${fmtTime(x.end)} ${title(x)}`} onClick=${onClick ? () => onClick(x) : null}></span>`;
      });
    };
    const plan = (x) => newEventDraft(x.start, Math.min(x.end, x.start + fb.minutes * 60000));
    return html`<div class="cal-fb" data-testid="freebusy">
      <div class="cal-fb-controls">
        <label>${t('cal.fbHours')} <input type="number" min="0" max="23" step="0.5" value=${fb.from} data-testid="fb-from" onChange=${(e) => set('from', Math.max(0, Math.min(fb.to - 0.5, Number(e.target.value) || 0)))} />
          – <input type="number" min="1" max="24" step="0.5" value=${fb.to} data-testid="fb-to" onChange=${(e) => set('to', Math.min(24, Math.max(fb.from + 0.5, Number(e.target.value) || 24)))} /></label>
        <label>${t('cal.fbDuration')} <input type="number" min="5" step="5" value=${fb.minutes} data-testid="fb-minutes" onChange=${(e) => set('minutes', Math.max(5, Number(e.target.value) || 60))} /></label>
        <label class="cal-fb-check"><input type="checkbox" checked=${fb.weekends} data-testid="fb-weekends" onChange=${(e) => set('weekends', e.target.checked)} /> ${t('cal.fbWeekends')}</label>
        <button class="secondary outline" data-testid="fb-export" disabled=${!cals.length} onClick=${exportFreeBusy}>${t('cal.fbExport')}</button>
      </div>
      <small class="cal-fb-hint">${t('cal.fbHint')}</small>
      ${days.map((day) => html`<section class="cal-fb-day" data-testid="fb-day" data-date=${isoDate(day)}>
        <div class="cal-fb-row cal-fb-scale"><b>${fmt(day, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
          <div class="cal-fb-track">${hours.map((h) => html`<span class="cal-fb-hour" style=${`left:${((h - fb.from) / (fb.to - fb.from)) * 100}%`}>${pad(h)}</span>`)}</div></div>
        ${cals.map((c) => html`<div class="cal-fb-row" data-testid="fb-row"><span class="cal-fb-name" style=${`--c:${c.color}`}>${c.name}${importedBusy(c).length ? html` <small>(${t('cal.fbImported')})</small>` : null}</span>
          <div class="cal-fb-track" style=${`--c:${c.color}`}>${bar(busy.get(c.id), day, 'busy', (x) => t(x.type === 'BUSY' ? 'cal.fbBusy' : 'cal.fbTentative'))}</div></div>`)}
        <div class="cal-fb-row"><span class="cal-fb-name free">${t('cal.fbFree')}</span>
          <div class="cal-fb-track">${bar(slots.filter((x) => sameDay(new Date(x.start), day)), day, 'free', () => '', plan)}</div></div>
      </section>`)}
      <h4>${t('cal.fbSlots', fb.minutes)}</h4>
      ${slots.length ? html`<ul class="cal-fb-slots">${slots.map((x) => html`<li><button class="secondary outline" data-testid="fb-slot" onClick=${() => plan(x)}>
        ${fmt(new Date(x.start), { weekday: 'short', day: 'numeric', month: 'short' })} ${fmtTime(x.start)}–${fmtTime(x.end)}</button></li>`)}</ul>` : html`<p class="cal-empty">${t('cal.fbNone')}</p>`}
    </div>`;
  }

  // ---- UI: dialogs ----------------------------------------------------------------------------------------------------

  const ZONES = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch (e) { return []; } })();
  const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

  function RepeatFields({ d }) {
    const rp = d.repeat;
    const [y, m, day] = d.startDate.split('-').map(Number);
    const wd = new Date(y, m - 1, day).getDay();
    const set = (patch) => { Object.assign(rp, patch); render(); };
    if (rp.custom && rp.freq !== 'NONE') {
      return html`<p class="cal-custom" data-testid="ev-custom-rule">${t('cal.custom', rp.custom)}</p>
        <button type="button" class="secondary outline" onClick=${() => set({ custom: null })}>✎</button>`;
    }
    return html`<div class="cal-repeat">
      <select data-testid="ev-repeat" onChange=${(e) => set({ freq: e.target.value })}>
        ${['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].map((f) => html`<option value=${f} selected=${rp.freq === f}>${t(`cal.${f === 'NONE' ? 'never' : f.toLowerCase()}`)}</option>`)}</select>
      ${rp.freq !== 'NONE' ? html`
        <label class="cal-inline">${t('cal.every')}<input type="number" min="1" max="99" value=${rp.interval} data-testid="ev-interval" onInput=${(e) => { rp.interval = +e.target.value || 1; }} /></label>
        ${rp.freq === 'WEEKLY' ? html`<div class="cal-weekdays" data-testid="ev-weekdays">${WEEKDAYS.map((w) => html`<label><input type="checkbox" checked=${rp.days.includes(w)} data-testid=${`ev-day-${w}`}
          onChange=${(e) => set({ days: e.target.checked ? [...rp.days, w] : rp.days.filter((x) => x !== w) })} />${fmt(new Date(2024, 0, 7 + w), { weekday: 'short' })}</label>`)}</div>` : null}
        ${rp.freq === 'MONTHLY' ? html`<select data-testid="ev-monthly" onChange=${(e) => set({ monthly: e.target.value })}>
          <option value="day" selected=${rp.monthly === 'day'}>${t('cal.byMonthDay', day)}</option>
          <option value="weekday" selected=${rp.monthly === 'weekday'}>${t('cal.byWeekday', t(`cal.nth${nthOf(day)}`), fmt(new Date(2024, 0, 7 + wd), { weekday: 'long' }))}</option></select>` : null}
        <label class="cal-inline">${t('cal.ends')}<select data-testid="ev-ends" onChange=${(e) => set({ ends: e.target.value })}>
          <option value="never" selected=${rp.ends === 'never'}>${t('cal.endsNever')}</option>
          <option value="count" selected=${rp.ends === 'count'}>${t('cal.endsAfter')}</option>
          <option value="until" selected=${rp.ends === 'until'}>${t('cal.endsOn')}</option></select>
          ${rp.ends === 'count' ? html`<input type="number" min="1" max="999" value=${rp.count} data-testid="ev-count" onInput=${(e) => { rp.count = +e.target.value || 1; }} /> ${t('cal.times')}` : null}
          ${rp.ends === 'until' ? html`<input type="date" value=${rp.until} data-testid="ev-until" onInput=${(e) => { rp.until = e.target.value; }} />` : null}</label>` : null}
    </div>`;
  }

  function EventDialog() {
    const d = state.dialog;
    if (!d) return null;
    const bind = (key) => ({ value: d[key], onInput: (e) => { d[key] = e.target.value; } });
    return html`<dialog open data-testid="event-dialog"><article class="cal-dialog">
      <form onSubmit=${(e) => { e.preventDefault(); saveDialog(); }}>
        <input class="cal-ev-title" data-spell placeholder=${t('cal.title')} data-testid="ev-title" ...${bind('summary')} />
        <div class="cal-row">
          <label>${t('cal.calendar')}<select data-testid="ev-calendar" onChange=${(e) => { d.calId = +e.target.value; }}>
            ${state.cals.map((c) => html`<option value=${c.id} selected=${c.id === d.calId}>${c.name}</option>`)}</select></label>
          <label class="cal-check"><input type="checkbox" checked=${d.allDay} data-testid="ev-allday" onChange=${(e) => { d.allDay = e.target.checked; render(); }} /> ${t('cal.allDay')}</label>
        </div>
        <div class="cal-row">
          <label>${t('cal.start')}<span class="cal-dt"><input type="date" data-testid="ev-start-date" value=${d.startDate} onInput=${(e) => {
            if (!e.target.value) return;
            // keep the duration when the start date changes
            const diff = Math.round((new Date(e.target.value) - new Date(d.startDate)) / 86400000);
            if (diff) { const end = new Date(d.endDate); end.setUTCDate(end.getUTCDate() + diff); d.endDate = end.toISOString().slice(0, 10); }
            d.startDate = e.target.value; render();
          }} />${d.allDay ? null : html`<input type="time" step="300" data-testid="ev-start-time" ...${bind('startTime')} />`}</span></label>
          <label>${t('cal.end')}<span class="cal-dt"><input type="date" data-testid="ev-end-date" ...${bind('endDate')} />${d.allDay ? null : html`<input type="time" step="300" data-testid="ev-end-time" ...${bind('endTime')} />`}</span></label>
        </div>
        ${d.allDay ? null : html`<label>${t('cal.timeZone')}<select data-testid="ev-tz" onChange=${(e) => { d.tz = e.target.value; }}>
          <option value="floating" selected=${d.tz === 'floating'}>${t('cal.floating')}</option>
          ${[...new Set([d.tz, ical.localZone(), 'UTC', ...ZONES])].filter((z) => z && z !== 'floating').map((z) => html`<option value=${z} selected=${d.tz === z}>${z}${z === ical.localZone() ? ` (${t('cal.local')})` : ''}</option>`)}</select></label>`}
        <label>${t('cal.repeat')}<${RepeatFields} d=${d} /></label>
        <label>${t('cal.location')}<input data-testid="ev-location" ...${bind('location')} /></label>
        <label>${t('cal.description')}<textarea rows="3" data-testid="ev-description" onInput=${(e) => { d.description = e.target.value; }}>${d.description}</textarea></label>
        <label>${t('cal.categories')}<input data-testid="ev-categories" ...${bind('categories')} /></label>
        <label>🔔 ${t('cal.reminder')}<select data-testid="ev-reminder" onChange=${(e) => { d.reminder = e.target.value === '' ? null : +e.target.value; }}>
          ${[null, ...new Set([...REMINDERS, ...(d.reminder != null ? [d.reminder] : [])])].sort((a, b) => (a ?? -1) - (b ?? -1)).map((m) => html`<option value=${m ?? ''} selected=${m === d.reminder}>${reminderLabel(m)}</option>`)}</select></label>
        ${d.alarms - (d.original.reminder != null ? 1 : 0) > 0 ? html`<small>${t('cal.remOther', d.alarms - (d.original.reminder != null ? 1 : 0))}</small>` : null}
        <footer>
          ${d.isNew ? null : html`<button type="button" class="secondary outline" data-testid="ev-delete" onClick=${() => deleteEvent()}>${t('cal.delete')}</button>
            <button type="button" class="secondary outline" data-testid="ev-export" onClick=${exportEvent}>${t('cal.export')}</button>`}
          <button type="button" class="secondary" data-testid="ev-cancel" onClick=${() => { state.dialog = null; render(); }}>${t('cal.cancel')}</button>
          <button type="submit" data-testid="ev-save">${t('cal.saveEvent')}</button>
        </footer>
      </form>
    </article></dialog>`;
  }

  // ---- reminders (while the page is open) -------------------------------------------------------------------

  const REMINDERS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];
  function reminderLabel(m) {
    if (m == null) return t('cal.remNone');
    if (m === 0) return t('cal.remAt');
    if (m % 1440 === 0) return t('cal.remDay', m / 1440);
    if (m % 60 === 0) return t('cal.remHour', m / 60);
    return t('cal.remMin', m);
  }

  const reminded = new Set(); // occurrence keys already shown in this session
  const openedAt = Date.now();

  /** Show the reminders that are due (triggered since the page was opened, or up to 5 minutes before that). */
  function checkReminders(now = Date.now()) {
    const due = [];
    for (const o of occurrences(new Date(now - 3600000), new Date(now + 8 * 86400000))) {
      const minutes = o.event.reminder;
      if (minutes == null || o.start < now - 3600000) continue;
      const at = o.start - minutes * 60000;
      const key = `${o.cal.id}/${o.event.uid}/${o.key || o.start}/${minutes}`;
      if (at > now || at < openedAt - 300000 || reminded.has(key)) continue;
      reminded.add(key);
      due.push(o);
    }
    const inPage = [];
    for (const o of due) {
      const mins = Math.round((o.start - now) / 60000);
      const when = o.allDay ? new Date(o.start).toLocaleDateString(locale()) : `${new Date(o.start).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })} (${mins > 0 ? t('cal.remIn', mins) : t('cal.remNow')})`;
      const body = [when, o.event.location].filter(Boolean).join(' · ');
      let shown = false;
      if (state.notify && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(`🔔 ${o.event.summary || t('cal.title')}`, { body, tag: `${o.event.uid}/${o.start}` }); shown = true; } catch (e) { /* e.g. Android needs a service worker */ }
      }
      if (!shown) inPage.push(`🔔 ${o.event.summary || t('cal.title')} – ${body}`);
    }
    if (inPage.length) Suite.shell.banner(inPage.join('   '));
    return due.length;
  }

  async function toggleNotify() {
    if (state.notify) { state.notify = false; savePrefs(); render(); return; }
    let permission = typeof Notification === 'undefined' ? 'denied' : Notification.permission;
    if (permission === 'default') { try { permission = await Notification.requestPermission(); } catch (e) { permission = 'denied'; } }
    if (permission !== 'granted') { Suite.shell.toast(t('cal.remBlocked'), 'warning'); return; }
    state.notify = true;
    savePrefs();
    render();
  }

  setInterval(() => checkReminders(), 30000);

  function ScopeDialog() {
    const s = state.scope;
    if (!s) return null;
    return html`<dialog open data-testid="scope-dialog"><article>
      <header><strong>${t('cal.scopeTitle')}</strong></header>
      <p>${t(s.kind === 'delete' ? 'cal.scopeDelete' : 'cal.scopeEdit')}</p>
      <footer>
        <button class="secondary" data-testid="scope-cancel" onClick=${() => { state.scope = null; render(); }}>${t('cal.cancel')}</button>
        <button class="secondary outline" data-testid="scope-one" onClick=${() => s.run('one')}>${t('cal.thisOne')}</button>
        <button data-testid="scope-all" onClick=${() => s.run('all')}>${t('cal.all')}</button>
      </footer>
    </article></dialog>`;
  }

  /** Print the current view (month and week on landscape sheets); the browser's "Save as PDF" gives a PDF. */
  function printView() {
    const page = document.createElement('style');
    page.textContent = `@page { size: A4 ${state.view === 'month' || state.view === 'week' ? 'landscape' : 'portrait'}; margin: 10mm; }`;
    document.head.append(page);
    document.body.classList.add('cal-printing');
    const done = () => { page.remove(); document.body.classList.remove('cal-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(() => { if (page.isConnected && !window.matchMedia('print').matches) done(); }, 1000);
  }

  function Main() {
    let view;
    if (state.view === 'month') view = html`<${MonthView} />`;
    else if (state.view === 'week') { const s = startOfWeek(state.date); view = html`<${TimeGrid} days=${Array.from({ length: 7 }, (_, i) => addDaysDate(s, i))} />`; }
    else if (state.view === 'day') view = html`<${TimeGrid} days=${[startOfDay(state.date)]} />`;
    else if (state.view === 'freebusy') view = html`<${FreeBusyView} />`;
    else view = html`<${AgendaView} />`;
    return html`<div class="cal-layout"><${Sidebar} />${state.sidebar ? Suite.shell.backdrop(() => { state.sidebar = false; render(); }) : null}<div class=${`cal-main view-${state.view}`}><h2 class="cal-print-title" data-testid="print-title">${state.cals.filter((c) => c.visible).map((c) => c.name).join(', ')} · ${title()}</h2>${view}</div><${EventDialog} /><${ScopeDialog} /></div>`;
  }

  Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });

  Suite.files.dropZone(document.body, async (picked) => {
    for (const p of picked.filter((x) => /\.(ics|ical|ifb|icalendar)$/i.test(x.file.name) || x.file.type === 'text/calendar')) await openPicked(p);
  });

  document.addEventListener('keydown', (e) => {
    if (state.dialog || state.scope) { if (e.key === 'Escape') { state.dialog = null; state.scope = null; render(); } return; }
    const tag = document.activeElement && document.activeElement.tagName;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveAll(); return; }
    if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openFiles(); return; }
    const undoKey = Suite.UndoHistory.key(e);
    if (undoKey) { e.preventDefault(); step(undoKey === 'redo'); return; }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || mod || e.altKey) return;
    const k = e.key.toLowerCase();
    const views = { m: 'month', w: 'week', d: 'day', a: 'agenda', f: 'freebusy' };
    if (views[k]) { state.view = views[k]; savePrefs(); render(); } else if (k === 't') { state.date = startOfDay(new Date()); render(); } else if (e.key === 'ArrowLeft' || k === 'k') move(-1);
    else if (e.key === 'ArrowRight' || k === 'j') move(1);
    else if (k === 'n') { e.preventDefault(); const s = new Date(state.date); s.setHours(9, 0, 0, 0); newEventDraft(+s, +s + 3600000); } else if (k === '/') { e.preventDefault(); document.querySelector('[data-testid=search]')?.focus(); }
  });

  setInterval(() => { if (state.view === 'week' || state.view === 'day') render(); }, 60000); // the "now" line
  Suite.files.recent(APP).then((r) => { state.recent = r; render(); });

  Suite.bridge.receive((picked) => openPicked(picked), { app: 'calendar' }); // files opened from other apps ("Open with…")

  // for tests
  window.CAL = { state, history, step, calendarText, addCalendar, parseIcs, occurrences, checkReminders };
  document.body.dataset.ready = 'true';
})();
