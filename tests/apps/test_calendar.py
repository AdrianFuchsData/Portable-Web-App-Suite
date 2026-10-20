"""Calendar (apps/calendar); calendars are checked with icalendar. The browser runs in Europe/Vienna on a fixed date."""
import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

import icalendar
import pytest
from playwright.sync_api import expect

from helpers.devices import phone_options
from helpers.paths import dist_url

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"
VIENNA = ZoneInfo("Europe/Vienna")
NOW = "2026-10-16T10:30:00+02:00"  # a Friday

TEAM = """BEGIN:VCALENDAR\r
VERSION:2.0\r
PRODID:-//Test//EN\r
X-WR-CALNAME:Team\r
BEGIN:VEVENT\r
UID:standup@x\r
DTSTART;TZID=Europe/Vienna:20261005T090000\r
DTEND;TZID=Europe/Vienna:20261005T091500\r
RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR\r
SUMMARY:Standup\r
BEGIN:VALARM\r
ACTION:DISPLAY\r
TRIGGER:-PT5M\r
DESCRIPTION:Standup\r
END:VALARM\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:review@x\r
DTSTART;TZID=Europe/Vienna:20261014T140000\r
DTEND;TZID=Europe/Vienna:20261014T153000\r
SUMMARY:Review\r
LOCATION:Room 1\r
ATTENDEE;CN=Jane:mailto:jane@example.org\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:trip@x\r
DTSTART;VALUE=DATE:20261019\r
DTEND;VALUE=DATE:20261022\r
SUMMARY:Trip\r
END:VEVENT\r
BEGIN:VTODO\r
UID:todo@x\r
SUMMARY:Buy tickets\r
END:VTODO\r
END:VCALENDAR\r
"""


@pytest.fixture
def cal_page(browser):
    contexts = []

    def open_app(lang="en", mobile=False):
        options = {"accept_downloads": True, "timezone_id": "Europe/Vienna", "locale": "en-GB"}
        if mobile:
            options.update(phone_options(browser))
        else:
            options.update(viewport={"width": 1280, "height": 800})
        context = browser.new_context(**options)
        context.add_init_script(f"try {{ localStorage.setItem('suite.lang', '{lang}'); }} catch (e) {{}}" + NO_PICKERS)
        contexts.append(context)
        page = context.new_page()
        page.errors = []
        page.on("pageerror", lambda e: page.errors.append(str(e)))
        page.clock.set_fixed_time(NOW)
        page.goto(dist_url("calendar"))
        page.wait_for_selector("body[data-ready]")
        return page

    yield open_app
    for c in contexts:
        c.close()


@pytest.fixture
def team_ics(tmp_path):
    path = tmp_path / "team.ics"
    path.write_bytes(TEAM.encode())
    return path


def open_ics(page, path):
    if page.locator("[data-testid=toggle-sidebar]").is_visible():
        page.click("[data-testid=toggle-sidebar]")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open]")
    chooser.value.set_files(str(path))
    expect(page.locator("[data-testid=calendar]")).not_to_have_count(0)


def save_calendar(page, tmp_path, index=0):
    with page.expect_download() as d:
        page.locator("[data-testid=cal-save]").nth(index).click()
    path = tmp_path / ("saved-" + d.value.suggested_filename)
    d.value.save_as(path)
    return icalendar.Calendar.from_ical(path.read_bytes())


def vevents(cal):
    return list(cal.walk("VEVENT"))


def day_cell(page, iso):
    return page.locator(f"[data-testid=day][data-date='{iso}']")


def column(page, iso):
    return page.locator(f"[data-testid=column][data-date='{iso}']")


def drag_in_column(page, iso, from_min, to_min):
    box = column(page, iso).bounding_box()
    x = box["x"] + box["width"] / 2
    page.mouse.move(x, box["y"] + from_min / 60 * 44 + 2)
    page.mouse.down()
    page.mouse.move(x, box["y"] + to_min / 60 * 44 - 2, steps=6)
    page.mouse.up()


def test_open_and_views(cal_page, team_ics):
    page = cal_page()
    assert page.title() == "Calendar"
    open_ics(page, team_ics)
    page.click("[data-testid=view-month]")
    expect(page.locator("[data-testid=title]")).to_have_text("October 2026")
    expect(day_cell(page, "2026-10-14").locator("[data-testid=event]")).to_have_text(["↻ 09:00 Standup", "14:00 Review"])
    expect(day_cell(page, "2026-10-17").locator("[data-testid=event]")).to_have_count(0)  # Saturday
    for d in ("2026-10-19", "2026-10-20", "2026-10-21"):
        expect(day_cell(page, d).locator("[data-testid=event]").first).to_have_text("Trip")
    expect(day_cell(page, "2026-10-22").locator("[data-testid=event]", has_text="Trip")).to_have_count(0)  # DTEND is exclusive

    page.click("[data-testid=view-week]")
    expect(page.locator("[data-testid=title]")).to_contain_text("12 Oct – 18 Oct 2026")
    review = column(page, "2026-10-14").locator("[data-testid=event]", has_text="Review")
    expect(review).to_have_attribute("style", re.compile(r"top: ?616px; height: ?66px"))  # 14:00–15:30
    page.click("[data-testid=view-agenda]")
    expect(page.locator("[data-testid=agenda] h4").first).to_have_text("Friday 16 October")
    page.fill("[data-testid=search]", "room 1")
    page.click("[data-testid=prev]")
    expect(page.locator("[data-testid=agenda] [data-testid=event]")).to_have_count(1)
    assert page.errors == []


def test_create_event_by_dragging_and_save(cal_page, tmp_path):
    page = cal_page()
    page.click("[data-testid=new-calendar]")
    page.click("[data-testid=view-week]")
    drag_in_column(page, "2026-10-15", 10 * 60, 11 * 60 + 30)
    expect(page.locator("[data-testid=event-dialog]")).to_be_visible()
    expect(page.locator("[data-testid=ev-start-time]")).to_have_value("10:00")
    expect(page.locator("[data-testid=ev-end-time]")).to_have_value("11:30")
    page.fill("[data-testid=ev-title]", "Planning")
    page.fill("[data-testid=ev-location]", "Room 2")
    page.fill("[data-testid=ev-description]", "Agenda:\n1. Budget")
    page.click("[data-testid=ev-save]")
    expect(column(page, "2026-10-15").locator("[data-testid=event]", has_text="Planning")).to_be_visible()

    cal = save_calendar(page, tmp_path)
    [ev] = vevents(cal)
    assert str(ev["SUMMARY"]) == "Planning" and str(ev["LOCATION"]) == "Room 2" and str(ev["DESCRIPTION"]) == "Agenda:\n1. Budget"
    assert ev["DTSTART"].dt == datetime(2026, 10, 15, 10, 0, tzinfo=VIENNA) and str(ev["DTSTART"].params["TZID"]) == "Europe/Vienna"
    assert ev["DTEND"].dt == datetime(2026, 10, 15, 11, 30, tzinfo=VIENNA)
    assert len(list(cal.walk("VTIMEZONE"))) == 1 and str(cal["X-WR-CALNAME"]) == "My calendar"


def test_recurring_edit_this_occurrence_and_all(cal_page, team_ics, tmp_path):
    page = cal_page()
    open_ics(page, team_ics)
    page.click("[data-testid=view-week]")
    column(page, "2026-10-14").locator("[data-testid=event]", has_text="Standup").click()
    page.fill("[data-testid=ev-start-time]", "09:30")
    page.fill("[data-testid=ev-end-time]", "09:45")
    page.click("[data-testid=ev-save]")
    page.click("[data-testid=scope-one]")
    expect(column(page, "2026-10-14").locator("[data-testid=event]", has_text="Standup")).to_contain_text("09:30")
    expect(column(page, "2026-10-13").locator("[data-testid=event]", has_text="Standup")).to_contain_text("09:00")

    column(page, "2026-10-15").locator("[data-testid=event]", has_text="Standup").click()
    page.fill("[data-testid=ev-title]", "Daily")
    page.click("[data-testid=ev-save]")
    page.click("[data-testid=scope-all]")
    expect(column(page, "2026-10-13").locator("[data-testid=event]", has_text="Daily")).to_be_visible()

    cal = save_calendar(page, tmp_path)
    series = [e for e in vevents(cal) if str(e["UID"]) == "standup@x"]
    master = next(e for e in series if "RECURRENCE-ID" not in e)
    override = next(e for e in series if "RECURRENCE-ID" in e)
    assert str(master["SUMMARY"]) == "Daily" and master["RRULE"]["BYDAY"] == ["MO", "TU", "WE", "TH", "FR"]
    assert len(list(master.walk("VALARM"))) == 1  # reminders are kept
    assert override["RECURRENCE-ID"].dt == datetime(2026, 10, 14, 9, 0, tzinfo=VIENNA)
    assert override["DTSTART"].dt == datetime(2026, 10, 14, 9, 30, tzinfo=VIENNA)
    assert any(str(e["UID"]) == "review@x" and "ATTENDEE" in e for e in vevents(cal))  # other properties are kept
    assert len(list(cal.walk("VTODO"))) == 1


def test_delete_occurrence_and_series(cal_page, team_ics, tmp_path):
    page = cal_page()
    open_ics(page, team_ics)
    page.click("[data-testid=view-week]")
    column(page, "2026-10-13").locator("[data-testid=event]", has_text="Standup").click()
    page.click("[data-testid=ev-delete]")
    page.click("[data-testid=scope-one]")
    expect(column(page, "2026-10-13").locator("[data-testid=event]")).to_have_count(0)
    expect(column(page, "2026-10-12").locator("[data-testid=event]")).to_have_count(1)
    cal = save_calendar(page, tmp_path)
    master = next(e for e in vevents(cal) if str(e["UID"]) == "standup@x")
    assert [d.dt for d in master["EXDATE"].dts] == [datetime(2026, 10, 13, 9, 0, tzinfo=VIENNA)]

    column(page, "2026-10-12").locator("[data-testid=event]").click()
    page.click("[data-testid=ev-delete]")
    page.click("[data-testid=scope-all]")
    expect(page.locator("[data-testid=timegrid] [data-testid=event]", has_text="Standup")).to_have_count(0)


def test_undo_redo(cal_page, team_ics, tmp_path):
    page = cal_page()
    open_ics(page, team_ics)
    page.click("[data-testid=view-week]")
    expect(page.locator("[data-testid=undo]")).to_be_disabled()
    column(page, "2026-10-13").locator("[data-testid=event]", has_text="Standup").click()
    page.click("[data-testid=ev-delete]")
    page.click("[data-testid=scope-all]")
    expect(page.locator("[data-testid=timegrid] [data-testid=event]", has_text="Standup")).to_have_count(0)
    page.keyboard.press("Control+z")
    expect(column(page, "2026-10-13").locator("[data-testid=event]", has_text="Standup")).to_have_count(1)
    page.click("[data-testid=redo]")
    expect(page.locator("[data-testid=timegrid] [data-testid=event]", has_text="Standup")).to_have_count(0)
    page.click("[data-testid=undo]")
    expect(page.locator("[data-testid=undo]")).to_be_disabled()
    # the restored series is still a working recurring event
    column(page, "2026-10-14").locator("[data-testid=event]", has_text="Standup").click()
    page.click("[data-testid=ev-delete]")
    page.click("[data-testid=scope-one]")
    expect(column(page, "2026-10-14").locator("[data-testid=event]", has_text="Standup")).to_have_count(0)
    expect(column(page, "2026-10-13").locator("[data-testid=event]", has_text="Standup")).to_have_count(1)
    cal = save_calendar(page, tmp_path)
    master = next(e for e in vevents(cal) if str(e["UID"]) == "standup@x")
    assert [d.dt for d in master["EXDATE"].dts] == [datetime(2026, 10, 14, 9, 0, tzinfo=VIENNA)]
    assert page.errors == []


def test_drag_move_and_resize(cal_page, team_ics, tmp_path):
    page = cal_page()
    open_ics(page, team_ics)
    page.click("[data-testid=view-week]")
    page.wait_for_function("() => (document.querySelector('.cal-tg-body')?.scrollTop ?? 0) > 0")  # scrolled to the morning (next frame)
    review = column(page, "2026-10-14").locator("[data-testid=event]", has_text="Review")
    box = review.bounding_box()
    target = column(page, "2026-10-15").bounding_box()
    page.mouse.move(box["x"] + 20, box["y"] + 10)
    page.mouse.down()
    page.mouse.move(target["x"] + 20, box["y"] + 10 + 44, steps=8)  # one day later, one hour later
    page.mouse.up()
    moved = column(page, "2026-10-15").locator("[data-testid=event]", has_text="Review")
    expect(moved).to_contain_text("15:00–16:30")
    handle = moved.locator("[data-testid=resize]").bounding_box()
    page.mouse.move(handle["x"] + 10, handle["y"] + 2)
    page.mouse.down()
    page.mouse.move(handle["x"] + 10, handle["y"] + 2 + 44, steps=5)
    page.mouse.up()
    expect(moved).to_contain_text("15:00–17:30")
    cal = save_calendar(page, tmp_path)
    ev = next(e for e in vevents(cal) if str(e["UID"]) == "review@x")
    assert ev["DTSTART"].dt == datetime(2026, 10, 15, 15, 0, tzinfo=VIENNA) and ev["DTEND"].dt == datetime(2026, 10, 15, 17, 30, tzinfo=VIENNA)


def test_month_drag_and_all_day(cal_page, team_ics, tmp_path):
    page = cal_page()
    open_ics(page, team_ics)
    page.click("[data-testid=view-month]")
    page.drag_and_drop("[data-testid=day][data-date='2026-10-19'] [data-testid=event]:has-text('Trip')", "[data-testid=day][data-date='2026-10-26']")
    expect(day_cell(page, "2026-10-28").locator("[data-testid=event]", has_text="Trip")).to_be_visible()
    expect(day_cell(page, "2026-10-19").locator("[data-testid=event]", has_text="Trip")).to_have_count(0)

    day_cell(page, "2026-10-30").dblclick(position={"x": 60, "y": 60})
    page.check("[data-testid=ev-allday]")
    page.fill("[data-testid=ev-title]", "Holiday")
    page.fill("[data-testid=ev-end-date]", "2026-11-01")
    page.click("[data-testid=ev-save]")
    cal = save_calendar(page, tmp_path)
    trip = next(e for e in vevents(cal) if str(e["UID"]) == "trip@x")
    assert trip["DTSTART"].dt == date(2026, 10, 26) and trip["DTEND"].dt == date(2026, 10, 29)
    holiday = next(e for e in vevents(cal) if str(e["SUMMARY"]) == "Holiday")
    assert holiday["DTSTART"].dt == date(2026, 10, 30) and holiday["DTEND"].dt == date(2026, 11, 2)  # exclusive end


@pytest.mark.parametrize("setup, expected", [
    ([("select", "ev-repeat", "WEEKLY"), ("check", "ev-day-3", None), ("select", "ev-ends", "count"), ("fill", "ev-count", "4")], {"FREQ": ["WEEKLY"], "BYDAY": ["MO", "WE"], "COUNT": [4]}),
    ([("select", "ev-repeat", "MONTHLY"), ("select", "ev-monthly", "weekday")], {"FREQ": ["MONTHLY"], "BYDAY": ["3MO"]}),
    ([("select", "ev-repeat", "DAILY"), ("fill", "ev-interval", "2"), ("select", "ev-ends", "until"), ("fill", "ev-until", "2026-10-31")], {"FREQ": ["DAILY"], "INTERVAL": [2]}),
])
def test_repeat_rules(cal_page, tmp_path, setup, expected):
    page = cal_page()
    page.click("[data-testid=new-calendar]")
    page.click("[data-testid=view-month]")
    day_cell(page, "2026-10-19").dblclick(position={"x": 60, "y": 60})  # the third Monday of October
    page.fill("[data-testid=ev-title]", "Series")
    for action, testid, value in setup:
        selector = f"[data-testid={testid}]"
        if action == "select":
            page.select_option(selector, value)
        elif action == "check":
            page.check(selector)
        else:
            page.fill(selector, value)
    page.click("[data-testid=ev-save]")
    [ev] = vevents(save_calendar(page, tmp_path))
    rule = dict(ev["RRULE"])
    for key, value in expected.items():
        assert rule[key] == value
    if "INTERVAL" in expected:
        assert rule["UNTIL"][0].astimezone(VIENNA).date() == date(2026, 10, 31)


def test_calendars_visibility_and_import(cal_page, team_ics, tmp_path):
    page = cal_page()
    open_ics(page, team_ics)
    page.click("[data-testid=new-calendar]")
    expect(page.locator("[data-testid=calendar]")).to_have_count(2)
    page.click("[data-testid=view-month]")
    page.locator("[data-testid=cal-visible]").first.uncheck()
    expect(page.locator("[data-testid=month] [data-testid=event]")).to_have_count(0)
    page.locator("[data-testid=cal-visible]").first.check()

    invite = tmp_path / "invite.ics"
    invite.write_text("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nUID:review@x\r\nDTSTART:20261014T150000Z\r\nDTEND:20261014T160000Z\r\nSUMMARY:Review (moved)\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n")
    page.locator("[data-testid=cal-name]").first.click()  # the Team calendar is the target
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=import]")
    chooser.value.set_files(str(invite))
    expect(page.locator("[data-testid=toast]").last).to_contain_text("1 event(s) imported into “Team”")
    expect(day_cell(page, "2026-10-14").locator("[data-testid=event]", has_text="Review")).to_have_text("17:00 Review (moved)")  # replaced by UID

    page.locator("[data-testid=cal-name]").nth(1).dblclick()
    page.fill("[data-testid=cal-name-input]", "Private")
    page.press("[data-testid=cal-name-input]", "Enter")
    expect(page.locator("[data-testid=cal-name]").nth(1)).to_contain_text("Private")


def test_german_interface(cal_page):
    page = cal_page(lang="de")
    expect(page.locator("[data-testid=today]")).to_have_text("Heute")
    page.click("[data-testid=view-month]")
    expect(page.locator("[data-testid=title]")).to_have_text("Oktober 2026")


def test_mobile_layout(cal_page, team_ics):
    page = cal_page(mobile=True)
    open_ics(page, team_ics)
    expect(page.locator("[data-testid=agenda]")).to_be_visible()  # the default view on phones
    expect(page.locator("[data-testid=sidebar]")).to_be_hidden()
    page.locator("[data-testid=agenda] [data-testid=event]").first.tap()
    expect(page.locator("[data-testid=event-dialog]")).to_be_visible()
    page.click("[data-testid=ev-cancel]")
    page.click("[data-testid=view-week]")
    expect(page.locator("[data-testid=timegrid]")).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.errors == []


def test_reminders(cal_page, team_ics, tmp_path):
    page = cal_page()
    open_ics(page, team_ics)
    page.click("[data-testid=view-week]")
    # the standup's alarm (-PT5M) is the reminder; nothing is due at 10:30
    column(page, "2026-10-16").locator("[data-testid=event]", has_text="Standup").click()
    expect(page.locator("[data-testid=ev-reminder] option:checked")).to_have_text("5 minutes before")
    page.click("[data-testid=ev-cancel]")
    assert page.evaluate("CAL.checkReminders()") == 0
    # a new event at 10:40 with a reminder 15 minutes before is due right away
    drag_in_column(page, "2026-10-16", 11 * 60, 12 * 60)
    page.fill("[data-testid=ev-start-time]", "10:40")
    page.fill("[data-testid=ev-title]", "Call Anna")
    page.select_option("[data-testid=ev-reminder]", "15")
    page.click("[data-testid=ev-save]")
    assert page.evaluate("CAL.checkReminders()") == 1
    expect(page.locator("[data-testid=banner]")).to_contain_text("Call Anna")
    expect(page.locator("[data-testid=banner]")).to_contain_text("in 10 min")
    assert page.evaluate("CAL.checkReminders()") == 0  # shown once
    # a reminder one day before the review; removing the standup's reminder
    column(page, "2026-10-14").locator("[data-testid=event]", has_text="Review").click()
    page.select_option("[data-testid=ev-reminder]", "1440")
    page.click("[data-testid=ev-save]")
    column(page, "2026-10-16").locator("[data-testid=event]", has_text="Standup").click()
    page.select_option("[data-testid=ev-reminder]", "")
    page.click("[data-testid=ev-save]")
    page.click("[data-testid=scope-all]")
    cal = save_calendar(page, tmp_path)
    alarms = {str(ev["SUMMARY"]): [a["TRIGGER"].dt for a in ev.walk("VALARM")] for ev in vevents(cal)}
    from datetime import timedelta
    assert alarms["Call Anna"] == [timedelta(minutes=-15)]
    assert alarms["Review"] == [timedelta(days=-1)]
    assert alarms["Standup"] == []
    assert page.errors == []


def test_print(cal_page, team_ics):
    page = cal_page()
    page.evaluate("window.print = () => { window.printed = document.body.className + '|' + [...document.querySelectorAll('style')].map((s) => s.textContent).filter((t) => t.includes('@page')).join(''); }")
    open_ics(page, team_ics)
    page.click("[data-testid=view-month]")
    page.click("[data-testid=print]")
    printed = page.evaluate("window.printed")
    assert "cal-printing" in printed and "A4 landscape" in printed
    page.emulate_media(media="print")
    expect(page.locator("[data-testid=print-title]")).to_be_visible()
    expect(page.locator("[data-testid=print-title]")).to_contain_text("Team · October 2026")
    expect(page.locator("[data-testid=sidebar]")).to_be_hidden()
    expect(page.locator("[data-testid=new-event]")).to_be_hidden()
    expect(page.locator("[data-testid=event]", has_text="Standup").first).to_be_visible()
    page.evaluate("window.dispatchEvent(new Event('afterprint'))")
    page.emulate_media(media="screen")
    expect(page.locator("[data-testid=print-title]")).to_be_hidden()
    assert "cal-printing" not in page.evaluate("document.body.className")
    # the agenda prints on portrait sheets
    page.click("[data-testid=view-agenda]")
    page.click("[data-testid=print]")
    assert "A4 portrait" in page.evaluate("window.printed")
    assert page.errors == []


OTHER = """BEGIN:VCALENDAR\r
VERSION:2.0\r
X-WR-CALNAME:Other\r
BEGIN:VEVENT\r
UID:meeting@y\r
DTSTART;TZID=Europe/Vienna:20261015T100000\r
DTEND;TZID=Europe/Vienna:20261015T120000\r
SUMMARY:Meeting\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:lunch@y\r
DTSTART;TZID=Europe/Vienna:20261015T130000\r
DTEND;TZID=Europe/Vienna:20261015T140000\r
TRANSP:TRANSPARENT\r
SUMMARY:Lunch (free)\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:maybe@y\r
DTSTART;TZID=Europe/Vienna:20261016T080000\r
DTEND;TZID=Europe/Vienna:20261016T170000\r
STATUS:TENTATIVE\r
SUMMARY:Workshop?\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:cancelled@y\r
DTSTART;TZID=Europe/Vienna:20261012T140000\r
DTEND;TZID=Europe/Vienna:20261012T180000\r
STATUS:CANCELLED\r
SUMMARY:Cancelled\r
END:VEVENT\r
END:VCALENDAR\r
"""
IFB = """BEGIN:VCALENDAR\r
VERSION:2.0\r
METHOD:PUBLISH\r
BEGIN:VFREEBUSY\r
DTSTART:20261012T000000Z\r
DTEND:20261019T000000Z\r
FREEBUSY:20261013T100000Z/PT2H\r
FREEBUSY;FBTYPE=FREE:20261013T140000Z/20261013T150000Z\r
END:VFREEBUSY\r
END:VCALENDAR\r
"""


def test_free_busy(cal_page, team_ics, tmp_path):
    page = cal_page()
    other, ifb = tmp_path / "other.ics", tmp_path / "jane.ifb"
    other.write_bytes(OTHER.encode())
    ifb.write_bytes(IFB.encode())
    for path in (team_ics, other, ifb):
        open_ics(page, path)
    expect(page.locator("[data-testid=calendar]")).to_have_count(3)
    page.keyboard.press("f")
    expect(page.locator("[data-testid=freebusy]")).to_be_visible()
    expect(page.locator("[data-testid=fb-day]")).to_have_count(5)  # Monday to Friday
    expect(page.locator("[data-testid=fb-row]")).to_have_count(15)
    page.fill("[data-testid=fb-minutes]", "120")
    page.press("[data-testid=fb-minutes]", "Enter")
    slots = page.locator("[data-testid=fb-slot]")
    # standups 9:00–9:15 every day, Jane busy Tue 12–14 (.ifb), review Wed 14–15:30, meeting Thu 10–12 (lunch is "free"),
    # the cancelled event does not count, the tentative workshop fills Friday
    expect(slots).to_have_count(6)
    texts = [s.strip() for s in slots.all_inner_texts()]
    assert texts == ["Mon 12 Oct 09:15–18:00", "Tue 13 Oct 09:15–12:00", "Tue 13 Oct 14:00–18:00", "Wed 14 Oct 09:15–14:00",
                     "Wed 14 Oct 15:30–18:00", "Thu 15 Oct 12:00–18:00"], texts
    expect(page.locator("[data-testid=fb-day][data-date='2026-10-16'] [data-testid=fb-busy].tentative")).to_have_count(1)
    expect(page.locator("[data-testid=fb-day][data-date='2026-10-16'] [data-testid=fb-free]")).to_have_count(0)
    # working hours and weekends
    page.fill("[data-testid=fb-to]", "17")
    page.press("[data-testid=fb-to]", "Enter")
    page.check("[data-testid=fb-weekends]")
    expect(page.locator("[data-testid=fb-day]")).to_have_count(7)
    expect(slots).to_have_count(7)  # Wednesday 15:30–17:00 is too short now, Saturday and Sunday are added
    expect(slots.last).to_have_text("Sun 18 Oct 08:00–17:00")
    # a free time becomes an event draft
    slots.first.click()
    expect(page.locator("[data-testid=event-dialog]")).to_be_visible()
    expect(page.locator("[data-testid=ev-start-time]")).to_have_value("09:15")
    expect(page.locator("[data-testid=ev-end-time]")).to_have_value("11:15")
    page.click("[data-testid=ev-cancel]")
    # export as .ifb
    with page.expect_download() as d:
        page.click("[data-testid=fb-export]")
    assert d.value.suggested_filename == "free-busy-2026-10-12.ifb"
    fb = icalendar.Calendar.from_ical(open(d.value.path(), "rb").read())
    periods = [(str(p.params.get("FBTYPE", "BUSY")), p.to_ical().decode()) for comp in fb.walk("VFREEBUSY") for p in (comp.get("FREEBUSY") if isinstance(comp.get("FREEBUSY"), list) else [comp.get("FREEBUSY")])]
    values = [v for _, v in periods]
    assert "20261014T120000Z/20261014T133000Z" in values  # review (14:00 Vienna = 12:00 UTC)
    assert "20261013T100000Z/20261013T120000Z" in values  # from the .ifb
    assert ("BUSY-TENTATIVE", "20261016T060000Z/20261016T150000Z") in periods
    assert not any(v.startswith("20261015T110000Z") or v.startswith("20261012T120000Z") for v in values)  # free lunch, cancelled
    # the .ifb calendar keeps its VFREEBUSY when saved
    saved = save_calendar(page, tmp_path, 2)
    assert len(list(saved.walk("VFREEBUSY"))) == 1
    assert page.errors == []


def test_free_busy_on_phone(cal_page, team_ics):
    page = cal_page(mobile=True)
    open_ics(page, team_ics)
    page.evaluate("CAL.state.view = 'freebusy'; CAL.state.sidebar = false")
    page.click("[data-testid=today]")
    expect(page.locator("[data-testid=fb-day]")).to_have_count(5)
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    page.locator("[data-testid=fb-free]").first.tap()
    expect(page.locator("[data-testid=event-dialog]")).to_be_visible()
    assert page.errors == []
