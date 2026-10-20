# Web inspector

The web inspector (`webinspector.html`) is the suite's "browser in the browser" in the reduced form of decision D-004:
it loads web pages and shows what they consist of, opens HAR files, and offers a developer-tools bookmarklet for devices
where the browser's own developer tools are missing or disabled.

Loading pages needs the [relay](../user-guide.md#network-functions-and-the-relay) for most sites (browsers only allow
pages to read other sites that permit it with CORS). HAR files, HTML files, pasted sources and the bookmarklet work
without it.

## Page

Enter an address and press **Load** (`https://` is added if missing). Choose the **user agent** (the relay's default, a
desktop or a mobile browser) and whether redirects are followed. **Open HTML file** and **Paste source** analyse a page
without loading it (optionally with its address, so that relative links work).

- **Preview** shows the page **without scripts**, frames and plug-ins; forms do not send. Through the relay, stylesheets,
  images, background images and fonts are loaded and embedded (up to 80 resources). Click a link to load that page; **←**
  returns to the previous page. The **preview size** shows the page as on a phone (390 × 844), a tablet (820 × 1180) or a
  desktop (1366 × 768) instead of the full width; ⟳ turns the device. The page's CSS media queries react to the size.
- **Headers & security** lists the response headers and checks HTTPS/HSTS, Content Security Policy (also weakening
  `'unsafe-inline'`/`'unsafe-eval'`), protection against framing, `nosniff`, Referrer and Permissions Policy, the
  cross-origin policies, cookie flags (`Secure`, `HttpOnly`, `SameSite`) and version disclosure. ✅ fine, ⚠️ to improve,
  ❌ missing protection, ℹ️ information.
- **Source** shows the HTML with line numbers and highlighting; the search field filters lines; **Save source** downloads
  the file.
- **Structure** shows title, language, character set, meta tags, the heading outline, links (internal/external), images,
  scripts, stylesheets, forms and frames, and hints: missing `lang`, title or viewport, images without alt text, several
  or no h1, skipped heading levels, form fields without labels, links without text, mixed content.
- **Requests** lists every request made for the page and its preview. **Save as HAR** saves them as a HAR file, **Show
  in HAR viewer** opens them in the HAR tab. **Block requests** takes one rule per line: a host (`ads.example.com`, also
  blocks its subdomains) or an address pattern with `*` (`*.woff2`, `*/tracking/*`); lines starting with `#` are comments.
  The rules apply to the resources of the preview (not to the page itself); **Apply and reload** loads them again, ⊘ next to
  a request blocks its host. Blocked requests are crossed out. The rules are remembered in this browser.
- **Cookies** lists the cookies the page and its resources set (name, value, domain, path, expiry, `Secure`/`HttpOnly`/
  `SameSite`, which request set them); cookies for other sites are rejected as in a browser. With **Keep cookies** they are
  stored and sent with later requests that match their domain, path and `Secure` flag – this way pages behind a login can
  be inspected after logging in elsewhere in the inspector, or a session cookie can be followed through a site. Stored cookies
  can be deleted one by one or all at once; they are kept only until the page is closed. Cookies are only visible through the
  relay (browsers hide `Set-Cookie` from pages). localStorage and similar storage are filled by scripts, which the preview
  does not run; the bookmarklet shows them in the real page.

## HAR viewer

A HAR file is the network log of a browser (in the developer tools: Network → "Save all as HAR"). **Open HAR file** (or
dropping it onto the window) shows all requests with method, file and host, status (errors in red), type, size, time and
a waterfall; the totals show the number of requests, the transferred bytes and the duration. Filter by text or type
(document, XHR/JSON, JS, CSS, images, fonts, media, other); click a column heading to sort.

Click a request for details: **Headers** (general, response and request headers), **Query** (parameters and request
body), **Body** (the response; JSON pretty-printed, images shown), **Cookies** and **Timing** (blocked, DNS, connect,
TLS, send, wait, receive). **Copy as cURL** copies the request as a curl command.

## Bookmarklet

The bookmarklet opens a small developer-tools panel at the bottom of any page:

- **Console**: `console.*` output and errors since the panel was opened, and an input line that runs JavaScript in the page.
- **Elements**: **Pick element**, then click an element of the page: CSS path, size and position, attributes, computed
  styles and HTML; **Parent** goes up.
- **Network**: the resources the page loaded (from the Resource Timing API) with size and time.
- **Storage**: cookies, localStorage and sessionStorage.
- **Info**: address, title, user agent, viewport, language and meta tags.

Install it by dragging the **🔍 Inspector** link to the bookmarks bar. On phones: **Copy code**, create a bookmark of any
page, edit it and replace its address with the copied code; then open the page to inspect and choose the bookmark (in
Chrome for Android, type the bookmark's name into the address bar and tap the suggestion). Choosing it again hides the
panel. **Try it on this page** opens it in the inspector itself.

Pages whose Content Security Policy forbids `eval()` still show the panel, but the console input cannot run code there.

## Limits

The preview is not a full browser: no scripts (pages that are built by JavaScript stay empty or incomplete), no logins
(unless cookies are kept), no forms. Pages behind a login can be analysed by saving them in the browser and opening the
HTML file, or by recording a HAR file.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |
