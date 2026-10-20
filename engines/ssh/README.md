# SSH/SFTP engine (WebAssembly)

SSH client and SFTP client for the browser, written in Go with
[golang.org/x/crypto/ssh](https://pkg.go.dev/golang.org/x/crypto/ssh) and
[github.com/pkg/sftp](https://github.com/pkg/sftp) (both BSD licensed), compiled to WebAssembly.

The engine opens no network connections itself: the page passes a transport (normally a relay
connection from `shared/js/relay.js`). SSH is therefore encrypted end to end between the browser
and the server; the relay only forwards bytes.

The JavaScript API is documented at the top of [`main.go`](main.go). `shared/js/ssh.js` loads the
engine and connects it to the relay.

## Building

Only needed when the engine changes. The apps use the committed result in `vendor/wasm/`
(`ssh-engine.wasm`, Go's `wasm_exec.js`, `ssh-engine.json` with versions, `licenses/`).

```sh
python3 tools/build_engine_ssh.py
```

Needs a Go toolchain on the `PATH` or unpacked to `.tools/go` (git-ignored; no installation or root
rights needed). The build is reproducible for the same Go version.

## Notes

* Size: about 7.1 MB, about 1.9 MB gzip-compressed (as embedded by `build.py`).
* WebAssembly has no AES instructions, so the engine prefers `chacha20-poly1305@openssh.com`
  (about 3× faster than AES-GCM in the browser).
