"""Helpers for hardening tests: payloads that try to run code in an app, dropping files into an app, and the check that no code
ran and no executable markup was injected.

A payload that runs sets window.top.__pwned. After opening a file, `assert_safe()` checks that it is unset and scans the page
and every frame that can run scripts in the app's origin for event handler attributes and scripts of a payload, and for
javascript: URLs. Markup in a document whose Content Security Policy blocks inline scripts cannot run and is left out."""
import base64

JS = "top.__pwned=(top.__pwned||0)+1"
# markup with every common way to run script
HTML = (f'<img src="x" onerror="{JS}"><script>{JS}</script><svg onload="{JS}"><circle r="1"/></svg>'
        f'<a href="javascript:{JS}">link</a><iframe srcdoc="&lt;script&gt;{JS}&lt;/script&gt;"></iframe>'
        f'<details open ontoggle="{JS}"></details><math><mtext></mtext><mglyph><style><img src=x onerror="{JS}"></style></mglyph></math>')
# breaking out of an attribute or element into markup
TEXT = f'"><img src=x onerror="{JS}"><script>{JS}</script>\'<svg/onload="{JS}">'
URL = f"javascript:{JS}"
# a file name with markup (allowed on Linux)
NAME = 'x"><img src=x onerror="top.__pwned=1">'

SCAN = r"""() => {
  const found = [];
  // a document whose Content Security Policy blocks inline scripts (and with them event handlers and javascript: URLs)
  const inert = (doc) => {
    if (!doc.querySelector('meta[http-equiv="Content-Security-Policy" i]')) return false;
    const w = doc.defaultView;
    w.__probe = 0;
    const s = doc.createElement('script');
    s.textContent = 'window.__probe = 1';
    doc.head.append(s);
    s.remove();
    return !w.__probe;
  };
  const scan = (doc, where) => {
    if (inert(doc)) return;
    for (const el of doc.querySelectorAll('*')) {
      for (const a of el.attributes) {
        if (/^on/i.test(a.name) && /__pwned/.test(a.value)) found.push(`${where}: <${el.tagName.toLowerCase()} ${a.name}>`);
        // (javascript: URLs of the app itself, such as the web inspector's bookmarklet, carry no payload)
        if (/^(href|src|xlink:href|action|formaction|data)$/i.test(a.name) && /^\s*javascript:/i.test(a.value) && /__pwned/.test(decodeURIComponent(a.value))) found.push(`${where}: <${el.tagName.toLowerCase()} ${a.name}="javascript:…">`);
      }
      if (el.tagName === 'SCRIPT' && /__pwned/.test(el.textContent)) found.push(`${where}: <script>`);
      if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
        const sandbox = el.getAttribute('sandbox');
        if (sandbox !== null && !/allow-scripts/.test(sandbox)) continue; // nothing can run in it
        let d = null;
        try { d = el.contentDocument; } catch (e) { /* another origin */ }
        if (d) scan(d, `${where} > iframe`);
      }
    }
  };
  scan(document, 'page');
  return { pwned: window.__pwned || 0, found };
}"""


def drop_file(page, name, data, mime="application/octet-stream", target="body"):
    """Drop a file onto the app, like a user would."""
    page.evaluate("""([name, b64, mime, target]) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], name, { type: mime }));
      const el = document.querySelector(target) || document.body;
      for (const type of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }""", [name, base64.b64encode(data).decode(), mime, target])


def open_with_dialog(page, path, button="[data-testid=open]"):
    """Open a file through the app's Open button (the browser's file dialog)."""
    with page.expect_file_chooser() as chooser:
        page.click(button)
    chooser.value.set_files(str(path))


def check(page, *frames):
    """{ pwned, found } for the page (and further pages, e.g. pop-up windows)."""
    result = page.evaluate(SCAN)
    for other in frames:
        r = other.evaluate(SCAN)
        result["pwned"] += r["pwned"]
        result["found"] += r["found"]
    return result


def assert_safe(page, *others, settle=600):
    page.wait_for_timeout(settle)  # handlers of loaded images, frames and animations
    result = check(page, *others)
    assert result["pwned"] == 0 and not result["found"], f"code could be injected: {result}"
