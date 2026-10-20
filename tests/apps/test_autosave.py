"""Recovery copies of unsaved work (shared/js/autosave.js): a change is stored while the app is dirty; the app opened
again in the same browser profile offers to restore it."""
import pytest
from playwright.sync_api import expect

from helpers.paths import dist_url

# app: (JavaScript that changes the document, JavaScript that is true after restoring, ready selector)
CASES = {
    "texteditor": ("TE.app.view.dispatch({ changes: { from: 0, insert: 'Recovered text' } })",
                   "TE.app.docs.some((d) => d.state.doc.toString().includes('Recovered text') && TE.app.isDirty(d))"),
    "hexeditor": ("(() => { HE.app.load('data.bin', new Uint8Array([1, 2, 3]), null); HE.app.state.buffer.replace(0, new Uint8Array([0x41])); Suite.shell.setDirty(true); })()",
                  "HE.app.state.name === 'data.bin' && HE.app.state.buffer.bytes()[0] === 0x41 && HE.app.state.buffer.dirty"),
    "diagram": ("document.querySelector('[data-testid=shape-rect]').click()",
                "DG.page().shapes.length === 1 && DG.app.dirty"),
    "presentation": ("(() => { PR.state.deck.slides.push(structuredClone(PR.state.deck.slides[0])); PR.state.dirty = true; Suite.shell.setDirty(true); })()",
                     "PR.state.deck.slides.length === 2 && PR.state.dirty"),
    "reveal": ("(() => { RV.state.deck.title = 'Recovered deck'; RV.state.dirty = true; Suite.shell.setDirty(true); })()",
               "RV.state.deck.title === 'Recovered deck' && RV.state.dirty"),
    "notebook": ("(() => { NB.setCells(NB.fromNotebook({ nbformat: 4, nbformat_minor: 5, metadata: {}, cells: [{ cell_type: 'markdown', metadata: {}, source: '# Recovered' }] }), 'r.ipynb', null); NB.state.dirty = true; Suite.shell.setDirty(true); })()",
                 "JSON.stringify(NB.toNotebook()).includes('Recovered') && NB.state.dirty"),
    "audioeditor": ("(() => { AE.state.rate = 8000; AE.state.tracks.push({ id: 99, name: 'Tone', clips: [AE.clips.makeClip(AE.dsp.tone(8000, 1, 0.5, {}), 0, { name: 'Tone' })], gain: 0, pan: 0, mute: false, solo: false, version: 1 }); AE.state.dirty = true; Suite.shell.setDirty(true); })()",
                    "AE.state.tracks.length === 1 && AE.clips.trackEnd(AE.state.tracks[0].clips) === 4000 && AE.state.rate === 8000 && AE.state.dirty"),
    "calendar": ("(() => { const c = CAL.addCalendar({ ...CAL.parseIcs('BEGIN:VCALENDAR\\r\\nVERSION:2.0\\r\\nPRODID:x\\r\\nBEGIN:VEVENT\\r\\nUID:r1\\r\\nDTSTAMP:20260101T000000Z\\r\\nDTSTART:20261020T100000Z\\r\\nSUMMARY:Recovered event\\r\\nEND:VEVENT\\r\\nEND:VCALENDAR\\r\\n', 'Rec'), fileName: 'rec.ics' }); c.dirty = true; Suite.shell.setDirty(true); })()",
                 "CAL.state.cals.some((c) => c.dirty && CAL.calendarText(c).includes('Recovered event'))"),
    "http": ("(() => { HTTP.state.collection.name = 'Recovered collection'; HTTP.state.dirty = true; Suite.shell.setDirty(true); })()",
             "HTTP.state.collection.name === 'Recovered collection' && HTTP.state.dirty"),
    "dbtool": ("(async () => { document.querySelector('[data-testid=new-sqlite]').click(); while (!DB.session()) await new Promise((r) => setTimeout(r, 50)); DB.setEditorText('create table t (x); insert into t values (42);'); await DB.execute('create table t (x); insert into t values (42);'); })()",
               "DB.state.sessions.length === 1 && DB.session().dirty && DB.session().driver.export().length > 1000"),
    "spreadsheet": ("(() => { SS.workbook.getActiveSheet().getRange('A1').setValue('Recovered'); SS.state.dirty = true; Suite.shell.setDirty(true); })()",
                    "SS.workbook.getActiveSheet().getRange('A1').getValue() === 'Recovered' && SS.state.dirty"),
    "document": ("(() => { DOC.load(DOC.fromText('Recovered paragraph'), 'r.docx'); DOC.state.dirty = true; Suite.shell.setDirty(true); })()",
                 "DOC.toText(DOC.doc.save()).includes('Recovered paragraph') && DOC.state.dirty"),
    "archive": ("(async () => { document.querySelector('[data-testid=welcome-new]').click(); while (!AR.app.state.entries) await new Promise((r) => setTimeout(r, 50)); await AR.app.addFiles([{ file: new File(['recovered'], 'r.txt'), path: 'r.txt' }]); })()",
                "!!AR.app.state.entries && AR.app.state.entries.some((e) => e.path === 'r.txt') && AR.app.state.dirty"),
    "pdfviewer": ("async (b64) => { await PV.openBytes('t.pdf', Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))); await PV.pageAction('rotateRight'); }",
                  "PV.state.modified && PV.state.pages === 3 && PV.state.dirty"),
    "videoeditor": ("(() => { VE.state.project.recovered = 'yes'; VE.state.dirty = true; Suite.shell.setDirty(true); })()",
                    "VE.state.project.recovered === 'yes' && VE.state.dirty"),
    "imageeditor": ("(() => { IE.ed.doc.layers[0].canvas.getContext('2d').fillRect(0, 0, 10, 10); IE.ed.doc.addLayer(null); IE.ed.doc.dirty = true; Suite.shell.setDirty(true); })()",
                    "IE.ed.doc.layers.length === 2 && IE.ed.doc.dirty"),
}


def open_page(context, app):
    page = context.new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    page.goto(dist_url(app))
    page.wait_for_selector("body[data-ready]", timeout=60000)
    return page


@pytest.mark.parametrize("app", sorted(CASES))
def test_restore_after_a_crash(app, browser):
    change, check = CASES[app]
    context = browser.new_context()
    context.add_init_script("localStorage.setItem('suite.lang', 'en'); localStorage.setItem('suite.autosave.interval', '300');")
    page = open_page(context, app)
    if app == "pdfviewer":  # needs a PDF
        import base64
        import tempfile
        from helpers import office_samples
        with tempfile.TemporaryDirectory() as d:
            pdf = office_samples.make_pdf(__import__("pathlib").Path(d) / "t.pdf")
            page.evaluate(change, base64.b64encode(pdf.read_bytes()).decode())
    else:
        page.evaluate(change)
    page.wait_for_function("() => document.body.dataset.autosaved", timeout=15000)
    page.close(run_before_unload=False)  # like a crash: no saving
    page = open_page(context, app)
    expect(page.locator("[data-testid=banner]")).to_contain_text("was recovered")
    page.click("[data-testid=autosave-restore]")
    page.wait_for_function(f"() => {check}", timeout=30000)
    expect(page.locator("[data-testid=toast]").last).to_contain_text("restored")
    assert page.errors == []
    # discarding removes the copy
    page.close(run_before_unload=False)
    page = open_page(context, app)
    page.click("[data-testid=autosave-discard]")
    page.wait_for_function("() => document.body.dataset.autosaved === ''")  # the copy is deleted
    page.close(run_before_unload=False)
    page = open_page(context, app)
    page.wait_for_timeout(500)
    expect(page.locator("[data-testid=banner]")).to_have_count(0)
    context.close()
