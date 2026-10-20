# HTTP analyzer

The HTTP analyzer (`http.html`) sends HTTP requests and shows the responses, like Postman: for testing APIs, web services and web
servers. Requests are organised in collections that are stored as **Postman collection v2.1** files.

## Sending requests

1. Choose the **method** (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS) and enter the **URL**.
2. Optionally fill in the tabs:
   - **Params**: query parameters (kept in sync with the URL);
   - **Headers**: request headers;
   - **Body**: *raw* (JSON, XML, text, HTML, JavaScript, with syntax highlighting), *x-www-form-urlencoded*, *form-data* (text fields and
     files, sent as multipart) or a *file*; the matching `Content-Type` is set unless you set your own;
   - **Auth**: Basic (user and password) or a Bearer token.
   Rows can be switched off with their checkbox; × removes a row; type into the empty last row to add one.
3. **Send** (`Ctrl+Enter`).

**Send via** chooses the way:

- **Relay** (recommended): the request is sent by the local relay (see the user guide, "Network functions and the relay"). There are no browser
  limits: every method, every header (also `Cookie`, `Host`, …) and every response header (also `Set-Cookie`) works, and servers without CORS
  headers can be reached. Options in **Environments… → Relay**: accept untrusted certificates, follow redirects.
- **Browser**: the request is sent by the browser itself. This works without the relay, but only for servers that allow it with CORS headers;
  the browser hides some headers.

## Responses

The status line shows the status code (coloured), the time and the size. **Body** shows the content: **Pretty** (JSON formatted, syntax
highlighting), **Raw**, or **Preview** (images, HTML in a sandbox without scripts). **Headers** lists all response headers. **Save body**
downloads the content.

## Variables and environments

Write `{{name}}` in the URL, headers, body or auth fields to use a variable. **Environments…** manages environments (e.g. *test* and
*production*), each with its own variables; the list in the toolbar chooses the active one. Collection variables (stored in the collection
file) are used when the environment has no variable of that name.

Environments and the relay settings are kept in a connections file (KeePass database or JSON file, **Save** and **Open…** in the left
panel), so tokens and passwords can be stored encrypted.

## Scripts and tests

The **Scripts** tab of a request holds two JavaScript snippets in the style of Postman (collections from Postman keep them):

- **Pre-request** runs before sending, e.g. to compute a value: `pm.environment.set('stamp', Date.now())`,
  `pm.variables.set('page', 2)` (only for this request), `pm.request.headers.add({ key: 'X-Id', value: '1' })`.
- **Tests** run after the response: `pm.test('status', () => pm.response.to.have.status(200))`,
  `pm.test('name', () => pm.expect(pm.response.json().name).to.equal('Anna'))`. Results appear in the **Tests** tab of the
  response (✓/✗ with the reason), together with `console.log` output. Tests can also save values for the next request,
  e.g. a login token: `pm.environment.set('token', pm.response.json().token)`.

Available: `pm.environment`, `pm.collectionVariables`, `pm.variables` (`get`, `set`, `unset`, `has`), `pm.request` (`method`,
`url`, `headers`), `pm.response` (`code`, `status`, `responseTime`, `headers.get()`, `text()`, `json()`, `to.have.status()`,
`to.have.header()`, `to.be.ok`, `to.be.json`), `pm.test()` and `pm.expect()` with the usual assertions (`to.equal`, `to.eql`,
`to.include`, `to.have.property`, `to.be.above`/`below`, `to.match`, `to.be.oneOf`, `to.be.true`, `to.exist`, `to.be.empty`, `.not`, …).
Scripts run isolated from the suite (no access to its storage, files or passwords) and are stopped after five seconds.

## WebSocket

A URL starting with `ws://` or `wss://` turns the request into a WebSocket connection: **Connect** opens it, the lower half
shows the messages (↑ sent, ↓ received, with time; binary messages as hex) and a field to write messages (**Send** or
`Ctrl+Enter`, `{{variables}}` are replaced); **Disconnect** closes it, the close code and reason are shown. A header
`Sec-WebSocket-Protocol` requests subprotocols. WebSockets are opened directly by the browser, not through the relay.

## OpenAPI

**Open collection…** also reads OpenAPI 3 and Swagger 2 descriptions (JSON or YAML) and creates a collection from them:
one folder per tag and one request per operation with `{{baseUrl}}` (from the first server), path parameters as variables
(`/pets/{{petId}}`), required query parameters and headers with their examples, an example JSON body built from the schema,
and Basic/Bearer authorization or API-key headers from the security schemes (`{{token}}`, `{{username}}`, …). Fill in the
variable values in the collection, then save it (as a Postman collection).

## Collections

- The left panel shows the collection: **+ New request**, **+ New folder**; point at an entry for ⧉ duplicate, ✎ rename and × delete.
- **Open collection…** (`Ctrl+O`) opens a Postman collection (v2.1 JSON); **Save collection** (`Ctrl+S`) saves it (directly into the file in
  Chrome/Edge on the desktop, as a download in Firefox and on Android).
- **History** lists the requests sent in this session; a click copies one into the collection.

Undo (↶, `Ctrl+Z`) and redo (↷, `Ctrl+Y`) cover all changes to the collection: requests, folders, URL, headers, body, authentication. Typing into one field counts as one step.

## cURL

- **Import cURL…** turns a `curl` command (e.g. "Copy as cURL" from the browser developer tools) into a request: method, URL, headers, data,
  form fields, `-u` user, and more.
- **cURL** next to the tabs shows the current request as a `curl` command (with variables resolved) to copy it.

## Keyboard shortcuts

On a Mac, use Cmd instead of Ctrl. `F1` (or `?`) shows this list in the application.

### Files

| Keys | Function |
|---|---|
| `Ctrl+O` | Open a collection |
| `Ctrl+S` | Save the collection |
| `Ctrl+Shift+S` | Save as |

### Request

| Keys | Function |
|---|---|
| `Ctrl+Enter` | Send the request |

### Editing

| Keys | Function |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |

### Help

| Keys | Function |
|---|---|
| `F1` / `?` | show this list (outside of text fields) |

## On phones and tablets

☰ opens the collection. The request is shown above the response.
