"""Calendar: CSV import (Outlook/Google headers, English and German, date formats) and export (events in a period, tasks)."""
import csv
import io

from playwright.sync_api import expect

from test_calendar import cal_page, open_ics, save_calendar, team_ics, vevents  # noqa: F401 (fixtures)
from test_calendar_tasks import TASKS

GOOGLE = """Subject,Start Date,Start Time,End Date,End Time,All Day Event,Description,Location
Dentist,10/20/2026,2:30 PM,10/20/2026,3:15 PM,False,"Bring the card, please",Main street 1
Holiday,10/26/2026,,10/27/2026,,True,,
Broken,someday,,,,,,
"""

OUTLOOK_DE = """﻿"Betreff";"Beginnt am";"Beginnt um";"Endet am";"Endet um";"Ganztägiges Ereignis";"Beschreibung";"Ort";"Kategorien"
"Teamsitzung";"21.10.2026";"09:00:00";"21.10.2026";"10:30:00";"Aus";"Agenda folgt";"Raum 2";"Arbeit;Team"
"""

TASKS_CSV = """Subject,Due Date,Priority,Status,% Complete,Notes
File taxes,2026-10-31,High,In Progress,25,Ask Anna
Read book,,Low,Not Started,0,
"""


def import_csv(page, path):
    if page.locator("[data-testid=toggle-sidebar]").is_visible():
        page.click("[data-testid=toggle-sidebar]")
    with page.expect_file_chooser() as chooser:
        page.select_option("[data-testid=csv-menu]", "import")
    chooser.value.set_files(str(path))


def test_csv_import(cal_page, tmp_path):  # noqa: F811
    page = cal_page()
    page.click("[data-testid=new-calendar]") if page.locator("[data-testid=new-calendar]").is_visible() else None
    for name, text in (("google.csv", GOOGLE), ("outlook.csv", OUTLOOK_DE)):
        path = tmp_path / name
        path.write_text(text, encoding="utf-8")
        import_csv(page, path)
    expect(page.locator("[data-testid=toast]").first).to_contain_text("2 events imported")
    expect(page.locator("[data-testid=toast]").first).to_contain_text("1 rows without a readable date were skipped (lines 4)")
    path = tmp_path / "tasks.csv"
    path.write_text(TASKS_CSV, encoding="utf-8")
    import_csv(page, path)
    expect(page.locator("[data-testid=title]")).to_have_text("Tasks")
    expect(page.locator("[data-testid=task]")).to_have_count(2)
    cal = save_calendar(page, tmp_path)
    ev = {str(e["SUMMARY"]): e for e in vevents(cal)}
    assert ev["Dentist"]["DTSTART"].dt.isoformat() == "2026-10-20T14:30:00+02:00" and ev["Dentist"]["DTEND"].dt.isoformat() == "2026-10-20T15:15:00+02:00"
    assert str(ev["Dentist"]["DESCRIPTION"]) == "Bring the card, please" and str(ev["Dentist"]["LOCATION"]) == "Main street 1"
    assert ev["Holiday"]["DTSTART"].dt.isoformat() == "2026-10-26" and ev["Holiday"]["DTEND"].dt.isoformat() == "2026-10-28"
    team = ev["Teamsitzung"]
    assert team["DTSTART"].dt.isoformat() == "2026-10-21T09:00:00+02:00" and team["DTEND"].dt.isoformat() == "2026-10-21T10:30:00+02:00"
    assert team["CATEGORIES"].cats == ["Arbeit", "Team"] and str(team["LOCATION"]) == "Raum 2"
    t = {str(x["SUMMARY"]): x for x in cal.walk("VTODO")}
    assert t["File taxes"]["DUE"].dt.isoformat() == "2026-10-31" and int(t["File taxes"]["PRIORITY"]) == 1 and str(t["File taxes"]["STATUS"]) == "IN-PROCESS"
    assert int(t["File taxes"]["PERCENT-COMPLETE"]) == 25 and str(t["File taxes"]["DESCRIPTION"]) == "Ask Anna" and int(t["Read book"]["PRIORITY"]) == 9
    assert page.errors == []


def export_csv(page, tmp_path, **choices):
    if page.locator("[data-testid=toggle-sidebar]").is_visible():
        page.click("[data-testid=toggle-sidebar]")
    page.select_option("[data-testid=csv-menu]", "export")
    for key, value in choices.items():
        if key in ("from", "to"):
            page.fill(f"[data-testid=csv-{key}]", value)
        else:
            page.select_option(f"[data-testid=csv-{key}]", value)
    with page.expect_download() as d:
        page.click("[data-testid=csv-ok]")
    path = tmp_path / d.value.suggested_filename
    d.value.save_as(path)
    return list(csv.reader(io.StringIO(path.read_text(encoding="utf-8-sig"), newline="")))


def test_csv_export(cal_page, team_ics, tmp_path):  # noqa: F811
    page = cal_page()
    open_ics(page, team_ics)
    rows = export_csv(page, tmp_path, **{"from": "2026-10-01", "to": "2026-10-31", "style": "iso"})
    assert rows[0] == ["Subject", "Start Date", "Start Time", "End Date", "End Time", "All Day Event", "Description", "Location", "Categories", "Calendar"]
    assert len(rows) > 2 and all(r[1].startswith("2026-10-") for r in rows[1:]) and all(r[9] == "Team" for r in rows[1:])
    # the same rows read back by the import parser (US style)
    rows_us = export_csv(page, tmp_path, **{"from": "2026-10-01", "to": "2026-10-31", "style": "us"})
    assert len(rows_us) == len(rows) and all(r[2] == "" or r[2].endswith(("AM", "PM")) for r in rows_us[1:])
    parsed = page.evaluate("(rows) => CALCSV.records(rows).items.map((i) => [i.summary, i.start.y, i.start.m, i.start.d, i.allDay])", rows_us)
    assert [(p[0], p[1], p[2], p[3]) for p in parsed] == [(r[0], int(r[1].split("/")[2]), int(r[1].split("/")[0]), int(r[1].split("/")[1])) for r in rows_us[1:]]
    # tasks
    path = tmp_path / "home.ics"
    path.write_bytes(TASKS.encode())
    open_ics(page, path)
    rows = export_csv(page, tmp_path, what="tasks", which="active", style="eu")
    assert rows[0][:6] == ["Subject", "Due Date", "Due Time", "Priority", "Status", "% Complete"]
    by = {r[0]: r for r in rows[1:]}
    assert by["Pay invoice"][1:5] == ["12.10.2026", "", "High", "Not Started"] and by["Call the plumber"][1:3] == ["16.10.2026", "16:00"]
    assert by["Renew passport"][4:6] == ["Completed", "100"] and len(by) == 5
    assert page.errors == []
