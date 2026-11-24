"""Calendar: CalDAV through the relay – discovery (well-known, principal, home), loading events and tasks, writing changes back
(PUT only what changed, new objects with If-None-Match, DELETE), conflicts (412) and reloading. Server: helpers/caldav_server.py."""
import pytest
from playwright.sync_api import expect

from helpers import caldav_server as dav
from test_calendar import cal_page  # noqa: F401 (fixture)

TZ = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Server//EN\r\n{}END:VCALENDAR\r\n"
MEETING = TZ.format("BEGIN:VEVENT\r\nUID:meeting@x\r\nDTSTAMP:20261001T000000Z\r\nDTSTART:20261019T080000Z\r\nDTEND:20261019T090000Z\r\nSUMMARY:Planning\r\nX-SERVER:kept\r\nEND:VEVENT\r\n")
LUNCH = TZ.format("BEGIN:VEVENT\r\nUID:lunch@x\r\nDTSTAMP:20261001T000000Z\r\nDTSTART:20261020T110000Z\r\nDTEND:20261020T120000Z\r\nSUMMARY:Lunch\r\nEND:VEVENT\r\n")
TODO = TZ.format("BEGIN:VTODO\r\nUID:todo@x\r\nDTSTAMP:20261001T000000Z\r\nSUMMARY:Send report\r\nDUE;VALUE=DATE:20261021\r\nEND:VTODO\r\n")
HOLIDAY = TZ.format("BEGIN:VEVENT\r\nUID:holiday@x\r\nDTSTAMP:20261001T000000Z\r\nDTSTART;VALUE=DATE:20261026\r\nDTEND;VALUE=DATE:20261027\r\nSUMMARY:National day\r\nEND:VEVENT\r\n")


@pytest.fixture
def server():
    calendars = {
        "work": {"name": "Work", "color": "#ff8800ff", "objects": {}},
        "personal": {"name": "Personal", "color": "#3366ccff", "components": ["VEVENT"], "objects": {}},
    }
    s = dav.start(calendars)
    dav.put_object(s, "work", "meeting.ics", MEETING)
    dav.put_object(s, "work", "lunch.ics", LUNCH)
    dav.put_object(s, "work", "todo.ics", TODO)
    dav.put_object(s, "personal", "holiday.ics", HOLIDAY)
    yield s
    s.shutdown()


def connect(page, relay, server, password=dav.PASSWORD):
    page.evaluate("r => { CAL.data.relay = r; }", {"url": relay["url"], "token": relay["token"]})
    if page.locator("[data-testid=toggle-sidebar]").is_visible():
        page.click("[data-testid=toggle-sidebar]")
    page.click("[data-testid=caldav]")
    page.click("[data-testid=caldav-add]")
    page.fill("[data-testid=caldav-name]", "Test server")
    page.fill("[data-testid=caldav-url]", f"http://127.0.0.1:{server.server_address[1]}/")
    page.fill("[data-testid=caldav-user]", dav.USER)
    page.fill("[data-testid=caldav-password]", password)
    page.click("[data-testid=caldav-save]")
    page.click("[data-testid=caldav-connect]")


def test_caldav_load_edit_sync(cal_page, relay, server):  # noqa: F811
    page = cal_page()
    connect(page, relay, server)
    found = page.locator("[data-testid=caldav-calendar]")
    expect(found).to_have_count(2)  # (not the contacts collection)
    expect(found.nth(0)).to_contain_text("Work")
    expect(found.nth(1)).to_contain_text("Personal")
    assert ("PROPFIND", "/.well-known/caldav", "0") in server.log or ("PROPFIND", "/dav/", "0") in server.log
    found.nth(0).locator("[data-testid=caldav-open]").click()
    expect(page.locator("[data-testid=caldav-dialog]")).to_have_count(0)
    expect(page.locator("[data-testid=toast]").last).to_contain_text("“Work” loaded: 2 events, 1 tasks")
    expect(page.locator("[data-testid=cal-name]")).to_have_text("Work")
    assert page.evaluate("CAL.state.cals[0].color") == "#ff8800"
    # change an event, tick off the task, add a task, delete an event
    page.click("[data-testid=view-agenda]")
    page.locator("[data-testid=event]", has_text="Planning").click()
    page.fill("[data-testid=ev-title]", "Planning (room 4)")
    page.click("[data-testid=ev-save]")
    page.locator("[data-testid=event]", has_text="Lunch").click()
    page.click("[data-testid=ev-delete]")
    if page.locator("[data-testid=confirm-ok]").count():
        page.click("[data-testid=confirm-ok]")
    page.click("[data-testid=view-tasks]")
    page.locator("[data-testid=task]", has_text="Send report").locator("[data-testid=task-done]").click()
    page.fill("[data-testid=task-new]", "Book flights")
    page.press("[data-testid=task-new]", "Enter")
    expect(page.locator("[data-testid=cal-name]")).to_have_text("Work •")
    server.log.clear()
    if page.locator("[data-testid=toggle-sidebar]").is_visible():
        page.click("[data-testid=toggle-sidebar]")
    page.click("[data-testid=cal-save]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("“Work” is up to date on the server (3 written, 1 deleted)")
    expect(page.locator("[data-testid=cal-name]")).to_have_text("Work")
    objects = server.calendars["work"]["objects"]
    assert "lunch.ics" not in objects
    assert "SUMMARY:Planning (room 4)" in objects["meeting.ics"][1] and "X-SERVER:kept" in objects["meeting.ics"][1]
    assert "STATUS:COMPLETED" in objects["todo.ics"][1]
    new = [n for n in objects if n not in ("meeting.ics", "todo.ics")]
    assert len(new) == 1 and "SUMMARY:Book flights" in objects[new[0]][1]
    puts = [x for x in server.log if x[0] == "PUT"]
    assert len(puts) == 3 and all(x[2] for x in puts if not x[1].endswith(new[0])) and any(x[3] == "*" for x in puts)
    assert [x[0] for x in server.log if x[0] == "DELETE"] == ["DELETE"]
    # nothing changed: nothing is written
    server.log.clear()
    page.evaluate("CAL.state.cals[0].dirty = true")
    page.click("[data-testid=cal-save]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("(0 written, 0 deleted)")
    assert not [x for x in server.log if x[0] in ("PUT", "DELETE")]
    assert page.errors == []


def test_caldav_conflict_and_reload(cal_page, relay, server):  # noqa: F811
    page = cal_page()
    connect(page, relay, server)
    page.locator("[data-testid=caldav-calendar]").nth(0).locator("[data-testid=caldav-open]").click()
    expect(page.locator("[data-testid=cal-name]")).to_have_text("Work")
    # someone else changes the meeting on the server
    dav.put_object(server, "work", "meeting.ics", MEETING.replace("SUMMARY:Planning", "SUMMARY:Planning (moved)"))
    page.click("[data-testid=view-agenda]")
    page.locator("[data-testid=event]", has_text="Planning").click()
    page.fill("[data-testid=ev-title]", "Planning (mine)")
    page.click("[data-testid=ev-save]")
    if page.locator("[data-testid=toggle-sidebar]").is_visible():
        page.click("[data-testid=toggle-sidebar]")
    page.click("[data-testid=cal-save]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("changed on the server in the meantime")
    assert "Planning (moved)" in server.calendars["work"]["objects"]["meeting.ics"][1]
    page.click("[data-testid=cal-reload]")
    page.click("[data-testid=confirm-ok]")
    expect(page.locator("[data-testid=cal-name]")).to_have_text("Work")
    page.keyboard.press("Escape")
    expect(page.locator("[data-testid=event]", has_text="Planning (moved)")).to_have_count(1)
    assert page.errors == []


def test_caldav_wrong_password(cal_page, relay, server):  # noqa: F811
    page = cal_page()
    connect(page, relay, server, password="wrong")
    expect(page.locator("[data-testid=caldav-error]")).to_contain_text("refused the user name or password")
    assert page.errors == []
