"""shared/js/ical.js: parsing, writing, time zones and recurrence; checked against icalendar and dateutil."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import icalendar
import pytest
from dateutil.rrule import rrulestr

from helpers.paths import dist_url

VIENNA = ZoneInfo("Europe/Vienna")

SAMPLE = (
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nX-WR-CALNAME:Team\r\n"
    "BEGIN:VEVENT\r\nUID:a@test\r\nDTSTAMP:20260101T000000Z\r\nDTSTART;TZID=W. Europe Standard Time:20261025T090000\r\n"
    "DTEND;TZID=W. Europe Standard Time:20261025T100000\r\nSUMMARY:Meeting\\, important\r\n"
    "DESCRIPTION:Line one\\nLine two with a very long text that has to be folded because it is longer than seventy-five octets äöü\r\n"
    "ATTENDEE;CN=\"Doe, Jane\";ROLE=REQ-PARTICIPANT:mailto:jane@example.org\r\nX-CUSTOM:keep me\r\n"
    "BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\nDESCRIPTION:Reminder\r\nEND:VALARM\r\nEND:VEVENT\r\n"
    "BEGIN:VEVENT\r\nUID:b@test\r\nDTSTART;VALUE=DATE:20261224\r\nSUMMARY:Holiday\r\nEND:VEVENT\r\n"
    "BEGIN:VTODO\r\nUID:t@test\r\nSUMMARY:A task\r\nEND:VTODO\r\nEND:VCALENDAR\r\n"
)


@pytest.fixture
def bed(page):
    page.goto(dist_url("shared"))
    page.wait_for_selector("body[data-ready]")
    page.evaluate("Suite.i18n.setLanguage('en')")
    return page


def ms(dt):
    return int(dt.timestamp() * 1000)


def test_parse_events_and_round_trip(bed):
    info = bed.evaluate("""t => { const cal = Suite.ical.parse(t); const evs = Suite.ical.events(cal);
      return { evs: evs.map(e => ({ summary: e.summary, description: e.description, start: Suite.ical.toInstant(e.start), end: Suite.ical.toInstant(e.end),
        allDay: e.start.date, alarms: e.alarms })), out: Suite.ical.serialize(Suite.ical.buildCalendar(cal, evs)) }; }""", SAMPLE)
    a, b = info["evs"]
    assert a["summary"] == "Meeting, important" and a["description"].startswith("Line one\nLine two")
    assert a["start"] == ms(datetime(2026, 10, 25, 9, tzinfo=VIENNA)) and a["end"] - a["start"] == 3600000  # Windows zone name mapped
    assert b["allDay"] and a["alarms"] == 1
    out = info["out"]
    assert all(len(line.encode()) <= 75 for line in out.split("\r\n"))
    cal = icalendar.Calendar.from_ical(out)
    ev = [c for c in cal.walk("VEVENT")][0]
    assert str(ev["SUMMARY"]) == "Meeting, important" and str(ev["X-CUSTOM"]) == "keep me"
    assert ev["ATTENDEE"].params["CN"] == "Doe, Jane"
    assert len(list(ev.walk("VALARM"))) == 1 and len(list(cal.walk("VTODO"))) == 1
    assert "äöü" in str(ev["DESCRIPTION"])
    assert str(cal["X-WR-CALNAME"]) == "Team"


def test_time_zones_and_vtimezone(bed):
    r = bed.evaluate("""() => {
      const t = (v, tz) => Suite.ical.toInstant({ ...Suite.ical.parseDateValue({ value: v, params: tz ? { TZID: tz } : {} }) });
      const vtz = Suite.ical.serialize(Suite.ical.vtimezone('Europe/Vienna'));
      return { summer: t('20260710T120000', 'Europe/Vienna'), winter: t('20261210T120000', 'Europe/Vienna'), utc: t('20260710T120000Z'),
        mozilla: t('20260710T120000', '/mozilla.org/20070129_1/Europe/Vienna'), vtz,
        back: Suite.ical.fromInstant(Date.UTC(2026, 2, 29, 1, 30), 'Europe/Vienna') };
    }""")
    assert r["summer"] == ms(datetime(2026, 7, 10, 12, tzinfo=VIENNA)) == r["mozilla"]
    assert r["winter"] == ms(datetime(2026, 12, 10, 12, tzinfo=VIENNA))
    assert r["utc"] == ms(datetime(2026, 7, 10, 12, tzinfo=ZoneInfo("UTC")))
    assert (r["back"]["hh"], r["back"]["mm"]) == (3, 30)  # after the change to summer time
    tz = icalendar.Timezone.from_ical(r["vtz"])
    rules = {c.name: c for c in tz.subcomponents}
    assert dict(rules["DAYLIGHT"]["RRULE"]) == {"FREQ": ["YEARLY"], "BYMONTH": [3], "BYDAY": ["-1SU"]}
    assert dict(rules["STANDARD"]["RRULE"]) == {"FREQ": ["YEARLY"], "BYMONTH": [10], "BYDAY": ["-1SU"]}
    assert rules["DAYLIGHT"]["TZOFFSETTO"].td == timedelta(hours=2)


RULES = [
    "FREQ=DAILY;COUNT=10",
    "FREQ=DAILY;INTERVAL=3;UNTIL=20261231T000000Z",
    "FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261130T235959Z",
    "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;COUNT=12",
    "FREQ=MONTHLY;BYDAY=-1FR;COUNT=8",
    "FREQ=MONTHLY;BYMONTHDAY=31;COUNT=7",
    "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=6",
    "FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=5",
    "FREQ=YEARLY;BYMONTH=11;BYDAY=4TH;COUNT=4",
    "FREQ=YEARLY;COUNT=3",
]


@pytest.mark.parametrize("rule", RULES)
def test_recurrence_matches_dateutil(bed, rule):
    start = datetime(2026, 9, 30, 18, 30, tzinfo=VIENNA)  # crosses the DST change in October
    expected = [ms(d) for d in rrulestr(rule, dtstart=start) if d < datetime(2029, 1, 1, tzinfo=VIENNA)]
    got = bed.evaluate("""rule => { const ev = { start: { y: 2026, m: 9, d: 30, hh: 18, mm: 30, ss: 0, date: false, tz: 'Europe/Vienna' },
        end: { y: 2026, m: 9, d: 30, hh: 19, mm: 30, ss: 0, date: false, tz: 'Europe/Vienna' }, rrule: Suite.ical.parseRRule(rule), exdates: [] };
      return Suite.ical.expand(ev, Date.UTC(2026, 0, 1), Date.UTC(2029, 0, 1)).map(o => o.start); }""", rule)
    assert got == expected


def test_exdate_overrides_and_range(bed):
    r = bed.evaluate("""() => {
      const text = 'BEGIN:VCALENDAR\\r\\nVERSION:2.0\\r\\nBEGIN:VEVENT\\r\\nUID:r@x\\r\\nDTSTART;TZID=Europe/Vienna:20261005T090000\\r\\nDTEND;TZID=Europe/Vienna:20261005T093000\\r\\n' +
        'RRULE:FREQ=DAILY;COUNT=5\\r\\nEXDATE;TZID=Europe/Vienna:20261006T090000\\r\\nSUMMARY:Standup\\r\\nEND:VEVENT\\r\\n' +
        'BEGIN:VEVENT\\r\\nUID:r@x\\r\\nRECURRENCE-ID;TZID=Europe/Vienna:20261008T090000\\r\\nDTSTART;TZID=Europe/Vienna:20261008T140000\\r\\nDTEND;TZID=Europe/Vienna:20261008T150000\\r\\nSUMMARY:Moved\\r\\nEND:VEVENT\\r\\nEND:VCALENDAR\\r\\n';
      const [master, override] = Suite.ical.events(Suite.ical.parse(text));
      const occ = Suite.ical.expand(master, Date.UTC(2026, 9, 1), Date.UTC(2026, 9, 31), new Map([[override.recurrenceId, override]]));
      const inRange = Suite.ical.expand(master, Date.UTC(2026, 9, 7), Date.UTC(2026, 9, 8)).length;
      return { occ: occ.map(o => [Suite.ical.fromInstant(o.start, 'Europe/Vienna').d, Suite.ical.fromInstant(o.start, 'Europe/Vienna').hh, o.event.summary]), inRange };
    }""")
    assert r["occ"] == [[5, 9, "Standup"], [7, 9, "Standup"], [8, 14, "Moved"], [9, 9, "Standup"]]
    assert r["inRange"] == 1


def test_written_event_parses_with_icalendar(bed):
    out = bed.evaluate("""() => {
      const cal = Suite.ical.newCalendar('Mine');
      const ev = { uid: 'n@x', summary: 'Weekly; review', description: 'a\\nb', location: 'Room, 1',
        start: { y: 2026, m: 11, d: 2, hh: 10, mm: 0, ss: 0, date: false, tz: 'Europe/Vienna' }, end: { y: 2026, m: 11, d: 2, hh: 11, mm: 0, ss: 0, date: false, tz: 'Europe/Vienna' },
        rrule: Suite.ical.parseRRule('FREQ=WEEKLY;BYDAY=MO;COUNT=4'), exdates: [{ y: 2026, m: 11, d: 9, hh: 10, mm: 0, ss: 0, date: false, tz: 'Europe/Vienna' }], categories: ['Work', 'Team'] };
      return Suite.ical.serialize(Suite.ical.buildCalendar(cal, [ev]));
    }""")
    cal = icalendar.Calendar.from_ical(out)
    ev = list(cal.walk("VEVENT"))[0]
    assert str(ev["SUMMARY"]) == "Weekly; review" and str(ev["LOCATION"]) == "Room, 1" and str(ev["DESCRIPTION"]) == "a\nb"
    assert ev["DTSTART"].dt == datetime(2026, 11, 2, 10, tzinfo=ev["DTSTART"].dt.tzinfo) and str(ev["DTSTART"].params["TZID"]) == "Europe/Vienna"
    assert ev["RRULE"]["FREQ"] == ["WEEKLY"] and ev["RRULE"]["COUNT"] == [4]
    assert [d.dt.day for d in ev["EXDATE"].dts] == [9]
    assert len(list(cal.walk("VTIMEZONE"))) == 1
    assert [str(c) for c in ev["CATEGORIES"].cats] == ["Work", "Team"]
