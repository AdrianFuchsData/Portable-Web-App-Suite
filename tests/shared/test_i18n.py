"""shared/js/i18n.js: strings, placeholders, language switching, localized errors."""
from helpers.paths import dist_url


def open_testbed(page, locale_page=None):
    page.goto(dist_url("shared"))
    page.wait_for_selector("body[data-ready]")


def test_translate_and_switch(page):
    open_testbed(page)
    page.evaluate("Suite.i18n.register({en: {'x.hello': 'Hello {0}, {1}'}, de: {'x.hello': 'Hallo {0}, {1}'}})")
    page.evaluate("Suite.i18n.setLanguage('en')")
    assert page.evaluate("Suite.t('x.hello', 'Anna', 3)") == "Hello Anna, 3"
    changes = page.evaluate("""() => { const seen = []; Suite.i18n.onChange((l) => seen.push(l)); Suite.i18n.setLanguage('de');
                               return [seen, Suite.t('x.hello', 'Anna', 3), document.documentElement.lang, Suite.t('common.cancel')]; }""")
    assert changes == [["de"], "Hallo Anna, 3", "de", "Abbrechen"]
    assert page.evaluate("Suite.t('x.missing')") == "x.missing"
    # the choice is remembered
    page.reload()
    page.wait_for_selector("body[data-ready]")
    assert page.evaluate("Suite.i18n.language") == "de"
    page.evaluate("Suite.i18n.setLanguage('en')")


def test_localized_error(page):
    open_testbed(page)
    page.evaluate("Suite.i18n.setLanguage('en')")
    result = page.evaluate("""() => { const e = new Suite.LocalizedError('err.unknown', 'boom'); const en = e.localized();
                              Suite.i18n.setLanguage('de'); const de = e.localized(); const plain = Suite.i18n.describe(new Error('x'));
                              Suite.i18n.setLanguage('en'); return [en, de, plain]; }""")
    assert result == ["Error: boom", "Fehler: boom", "Fehler: x"]
    assert page.errors == [] and page.requests == []
