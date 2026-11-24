"""Calendar: tasks (VTODO) – list grouped by due date, quick add, done, editing, shown on their due day, written back."""
import icalendar
from playwright.sync_api import expect

from test_calendar import cal_page, open_ics, save_calendar  # noqa: F401 (fixture)

TASKS = """BEGIN:VCALENDAR\r
VERSION:2.0\r
PRODID:-//Test//EN\r
X-WR-CALNAME:Home\r
BEGIN:VTODO\r
UID:old@x\r
SUMMARY:Pay invoice\r
DUE;VALUE=DATE:20261012\r
PRIORITY:1\r
X-CUSTOM:kept\r
END:VTODO\r
BEGIN:VTODO\r
UID:today@x\r
SUMMARY:Call the plumber\r
DUE;TZID=Europe/Vienna:20261016T160000\r
STATUS:IN-PROCESS\r
PERCENT-COMPLETE:40\r
END:VTODO\r
BEGIN:VTODO\r
UID:next@x\r
SUMMARY:Buy tickets\r
DUE;VALUE=DATE:20261020\r
CATEGORIES:Travel\r
END:VTODO\r
BEGIN:VTODO\r
UID:someday@x\r
SUMMARY:Clean the attic\r
END:VTODO\r
BEGIN:VTODO\r
UID:done@x\r
SUMMARY:Renew passport\r
STATUS:COMPLETED\r
COMPLETED:20261001T090000Z\r
END:VTODO\r
END:VCALENDAR\r
"""


def todos(cal):
    return {str(t["UID"]): t for t in cal.walk("VTODO")}


def test_tasks_view(cal_page, tmp_path):  # noqa: F811
    page = cal_page()
    path = tmp_path / "home.ics"
    path.write_bytes(TASKS.encode())
    open_ics(page, path)
    page.click("[data-testid=view-tasks]")
    expect(page.locator("[data-testid=title]")).to_have_text("Tasks")
    groups = {g: page.locator(f"[data-testid=tasks-{g}] [data-testid=task]") for g in ("overdue", "today", "upcoming", "nodate")}
    expect(groups["overdue"]).to_have_count(1)
    expect(groups["overdue"].first).to_contain_text("Pay invoice")
    expect(groups["today"].first).to_contain_text("Call the plumber")
    expect(groups["today"].first).to_contain_text("40 %")
    expect(groups["today"].first.locator("[data-testid=task-due]")).to_have_text("Today 16:00")
    expect(groups["upcoming"].first).to_contain_text("Buy tickets")
    expect(groups["nodate"].first).to_contain_text("Clean the attic")
    expect(page.locator("[data-testid=tasks-done] [data-testid=task]")).to_have_count(1)
    # tick off, quick add, edit
    groups["overdue"].first.locator("[data-testid=task-done]").click()
    expect(page.locator("[data-testid=tasks-overdue]")).to_have_count(0)
    expect(page.locator("[data-testid=tasks-done] [data-testid=task]")).to_have_count(2)
    page.fill("[data-testid=task-new]", "Water the plants")
    page.press("[data-testid=task-new]", "Enter")
    expect(groups["nodate"]).to_have_count(2)
    groups["nodate"].filter(has_text="Water the plants").locator("[data-testid=task-open]").click()
    page.fill("[data-testid=task-due-date]", "2026-10-18")
    page.select_option("[data-testid=task-priority]", "1")
    page.fill("[data-testid=task-description]", "Balcony too")
    page.click("[data-testid=task-save]")
    expect(groups["upcoming"]).to_have_count(2)
    expect(groups["upcoming"].first).to_contain_text("Water the plants")  # due earlier than Buy tickets
    # undo the edit, redo it
    page.keyboard.press("Control+z")
    expect(groups["upcoming"]).to_have_count(1)
    page.keyboard.press("Control+y")
    expect(groups["upcoming"]).to_have_count(2)
    # search
    page.fill("[data-testid=search]", "tick")
    expect(page.locator("[data-testid=task]")).to_have_count(1)
    page.fill("[data-testid=search]", "")
    # the month view shows open tasks on their due day
    page.click("[data-testid=view-month]")
    expect(page.locator("[data-testid=day][data-date='2026-10-20'] [data-testid=task-chip]")).to_have_text("Buy tickets")
    expect(page.locator("[data-testid=day][data-date='2026-10-12'] [data-testid=task-chip]")).to_have_count(0)  # done
    page.locator("[data-testid=day][data-date='2026-10-18'] [data-testid=task-chip]").click()
    expect(page.locator("[data-testid=task-summary]")).to_have_value("Water the plants")
    page.click("[data-testid=task-delete]")
    expect(page.locator("[data-testid=task-chip]")).to_have_count(2)
    cal = save_calendar(page, tmp_path)
    t = todos(cal)
    assert set(t) == {"old@x", "today@x", "next@x", "someday@x", "done@x"}
    assert str(t["old@x"]["STATUS"]) == "COMPLETED" and t["old@x"].get("COMPLETED") and int(t["old@x"]["PERCENT-COMPLETE"]) == 100
    assert str(t["old@x"]["X-CUSTOM"]) == "kept" and int(t["old@x"]["PRIORITY"]) == 1
    assert t["today@x"]["DUE"].dt.hour == 16 and str(t["today@x"]["DUE"].params["TZID"]) == "Europe/Vienna"
    assert t["next@x"]["DUE"].dt.isoformat() == "2026-10-20" and "Travel" in t["next@x"]["CATEGORIES"].cats
    assert page.errors == []


def test_task_dialog_round_trip(cal_page, tmp_path):  # noqa: F811
    page = cal_page()
    page.click("[data-testid=new-calendar]") if page.locator("[data-testid=new-calendar]").is_visible() else (page.click("[data-testid=toggle-sidebar]"), page.click("[data-testid=new-calendar]"))
    page.click("[data-testid=view-tasks]")
    page.fill("[data-testid=task-new]", "Prepare slides")
    page.press("[data-testid=task-new]", "Enter")
    page.locator("[data-testid=task-open]").click()
    page.fill("[data-testid=task-due-date]", "2026-10-21")
    page.fill("[data-testid=task-due-time]", "09:30")
    page.select_option("[data-testid=task-status]", "IN-PROCESS")
    page.fill("[data-testid=task-percent]", "50")
    page.fill("[data-testid=task-categories]", "Work, Talk")
    page.click("[data-testid=task-save]")
    expect(page.locator("[data-testid=task-due]")).to_contain_text("21 Oct 09:30")
    with page.expect_download() as d:
        page.locator("[data-testid=cal-save]").first.click(force=True)
    path = tmp_path / "new.ics"
    d.value.save_as(path)
    cal = icalendar.Calendar.from_ical(path.read_bytes())
    (task,) = cal.walk("VTODO")
    assert str(task["SUMMARY"]) == "Prepare slides" and str(task["STATUS"]) == "IN-PROCESS" and int(task["PERCENT-COMPLETE"]) == 50
    assert task["DUE"].dt.isoformat().startswith("2026-10-21T09:30") and task["CATEGORIES"].cats == ["Work", "Talk"]
    assert any(c.name == "VTIMEZONE" for c in cal.subcomponents)
    assert page.errors == []
