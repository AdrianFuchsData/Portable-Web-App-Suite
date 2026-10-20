#!/usr/bin/env python3
"""Hosted PWA variant of the suite: the built single-file apps (dist/) plus what a web server needs to install them.

For every app <app>.html the output directory gets
  - <app>.html: the built file with a link to its manifest and the registration of the service worker (only on http/https;
    the Content-Security-Policy additionally allows manifest-src and worker-src 'self'),
  - <app>.webmanifest: name, icon, standalone display and, for Chromium, file_handlers with the extensions the app opens
    (from the app list of shared/js/bridge.js); opened files arrive through window.launchQueue (shared/js/bridge.js),
  - icons/<app>.svg: the favicon of the app.
Further: sw.js (service worker), index.html (forwards to the overview app).

The service worker keeps one cache ("suite"): the overview, the manifests and icons are stored on installation, every
other file the first time it is loaded; afterwards files come from the cache (offline) and are refreshed in the background
when the network is available (stale-while-revalidate: an update is used from the next start on).

Only the Python standard library is used.

Usage:
    python3 tools/build_pwa.py [output directory]        # default: build/pwa (from dist/, or $SUITE_DIST)
"""
import hashlib
import json
import os
import pathlib
import re
import shutil
import sys
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = pathlib.Path(os.environ.get("SUITE_DIST", ROOT / "dist")).resolve()
APPS = sorted(p.parent.parent.name for p in (ROOT / "apps").glob("*/src/index.html"))

REGISTER = ("<script>if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) "
            "navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker', e));</script>")

SERVICE_WORKER = """/* Service worker of the hosted suite (tools/build_pwa.py): offline use, stale-while-revalidate. Version %(version)s */
const CACHE = 'suite';
const PRECACHE = %(precache)s;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const key = url.pathname.endsWith('/') ? new Request(new URL('index.html', url)) : new Request(url.origin + url.pathname);
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(key);
    const refresh = fetch(request).then((response) => {
      if (response.ok) cache.put(key, response.clone());
      return response;
    });
    if (cached) { event.waitUntil(refresh.catch(() => {})); return cached; }
    return refresh;
  }));
});
"""

INDEX = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0; url=overview.html"><title>Portable Web App Suite</title></head>
<body><p><a href="overview.html">Portable Web App Suite</a></p></body></html>
"""


def bridge_apps():
    """{id: {"name": English name, "ext": [...]}} from the app list in shared/js/bridge.js."""
    source = (ROOT / "shared/js/bridge.js").read_text(encoding="utf-8")
    text = re.search(r"const TEXT = \[([^\]]*)\]", source).group(1)
    lists = {"TEXT": re.findall(r"'([^']+)'", text)}
    out = {}
    for m in re.finditer(r"\{ id: '([^']+)', icon: '[^']*', name: \{ en: '([^']+)'[^}]*\}, ext: (\[[^\]]*\]|\w+) \}", source):
        ext = lists[m.group(3)] if m.group(3) in lists else re.findall(r"'([^']+)'", m.group(3))
        out[m.group(1)] = {"name": m.group(2), "ext": [e for e in ext if e != "*"]}
    return out


def icon_of(html):
    m = re.search(r'<link rel="icon" href="data:image/svg\+xml,([^"]+)"', html)
    return urllib.parse.unquote(m.group(1)) if m else None


def title_of(html):
    m = re.search(r"<title>([^<]*)</title>", html)
    return m.group(1).strip() if m else "App"


def patch_html(html, app):
    def csp(m):
        policy = m.group(1)
        policy = re.sub(r"worker-src ([^;]*)", lambda w: f"worker-src 'self' {w.group(1)}", policy) if "worker-src" in policy else policy + "; worker-src 'self' blob:"
        policy = re.sub(r"img-src ([^;]*)", lambda w: f"img-src 'self' {w.group(1)}", policy)
        return f'content="{policy}; manifest-src \'self\'"'
    html, n = re.subn(r'content="(default-src[^"]*)"', csp, html, count=1)
    if not n:
        raise SystemExit(f"{app}: no Content-Security-Policy found")
    return html.replace("</head>", f'  <link rel="manifest" href="{app}.webmanifest">\n  {REGISTER}\n</head>', 1)


def manifest(app, name, ext):
    data = {
        "id": f"./{app}.html", "name": name, "short_name": name, "start_url": f"./{app}.html", "scope": "./",
        "display": "standalone", "background_color": "#ffffff", "theme_color": "#0172ad",
        "icons": [{"src": f"icons/{app}.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any"}],
    }
    if ext:
        data["file_handlers"] = [{"action": f"./{app}.html", "accept": {"application/octet-stream": [f".{e}" for e in ext]}}]
    return data


def main():
    out = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "build" / "pwa"
    if out.exists():
        shutil.rmtree(out)
    (out / "icons").mkdir(parents=True)
    known = bridge_apps()
    digest = hashlib.sha256()
    precache = ["./", "index.html", "overview.html"]
    for app in APPS:
        src = DIST / f"{app}.html"
        if not src.exists():
            raise SystemExit(f"{src} is missing: run build.py first")
        html = src.read_text(encoding="utf-8")
        info = known.get(app, {"name": title_of(html), "ext": []})
        page = patch_html(html, app)
        (out / f"{app}.html").write_text(page, encoding="utf-8")
        digest.update(page.encode("utf-8"))
        icon = icon_of(html)
        if icon:
            (out / "icons" / f"{app}.svg").write_text(icon, encoding="utf-8")
            precache.append(f"icons/{app}.svg")
        (out / f"{app}.webmanifest").write_text(json.dumps(manifest(app, info["name"] if app != "overview" else "Portable Web App Suite", info["ext"]), indent=2) + "\n", encoding="utf-8")
        precache.append(f"{app}.webmanifest")
    (out / "index.html").write_text(INDEX, encoding="utf-8")
    (out / "sw.js").write_text(SERVICE_WORKER % {"version": digest.hexdigest()[:16], "precache": json.dumps(precache)}, encoding="utf-8")
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    print(f"PWA with {len(APPS)} apps in {out} ({size // (1024 * 1024)} MiB)")


if __name__ == "__main__":
    main()
