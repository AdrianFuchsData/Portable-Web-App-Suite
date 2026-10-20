#!/usr/bin/env python3
"""Build the SSH/SFTP WebAssembly engine (engines/ssh) and vendor it to vendor/wasm/.

Needs a Go toolchain (`go` on the PATH or a portable copy in .tools/go). This is only required to
change or update the engine; the normal build (build.py) uses the committed vendor/wasm/ files.
The build is reproducible for the same Go version (-trimpath, no VCS stamping, stripped).

Usage:
    python3 tools/build_engine_ssh.py
"""
import json
import os
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENGINE = ROOT / "engines" / "ssh"
OUT = ROOT / "vendor" / "wasm"


def go_binary():
    local = ROOT / ".tools" / "go" / "bin" / "go"
    if local.exists():
        return str(local)
    found = shutil.which("go")
    if not found:
        raise SystemExit("Go toolchain not found (install Go or unpack it to .tools/go)")
    return found


def main():
    go = go_binary()
    env = dict(os.environ, GOOS="js", GOARCH="wasm", GOTOOLCHAIN="local", CGO_ENABLED="0")
    if (ROOT / ".tools").exists():
        env.setdefault("GOPATH", str(ROOT / ".tools" / "gopath"))
        env.setdefault("GOCACHE", str(ROOT / ".tools" / "gocache"))
    goroot = subprocess.run([go, "env", "GOROOT"], capture_output=True, text=True, check=True, env=env).stdout.strip()
    goversion = subprocess.run([go, "env", "GOVERSION"], capture_output=True, text=True, check=True, env=env).stdout.strip()
    OUT.mkdir(parents=True, exist_ok=True)
    subprocess.run([go, "build", "-trimpath", "-buildvcs=false", "-ldflags=-s -w", "-o", str(OUT / "ssh-engine.wasm"), "."],
                   cwd=ENGINE, env=env, check=True)
    exec_js = pathlib.Path(goroot) / "lib" / "wasm" / "wasm_exec.js"
    if not exec_js.exists():  # Go < 1.24
        exec_js = pathlib.Path(goroot) / "misc" / "wasm" / "wasm_exec.js"
    shutil.copy(exec_js, OUT / "wasm_exec.js")

    licenses = OUT / "licenses"
    licenses.mkdir(exist_ok=True)
    for old in licenses.glob("*"):
        old.unlink()
    shutil.copy(pathlib.Path(goroot) / "LICENSE", licenses / "go.LICENSE.txt")
    # only modules whose packages are linked into the engine (no test-only dependencies)
    listing = subprocess.run([go, "list", "-deps", "-f", "{{with .Module}}{{if not .Main}}{{.Path}} {{.Version}} {{.Dir}}{{end}}{{end}}", "."],
                             cwd=ENGINE, env=env, capture_output=True, text=True, check=True).stdout
    deps = {}
    for line in sorted(set(filter(None, listing.splitlines()))):
        path, version, directory = line.split(" ", 2)
        deps[path] = version
        for name in ("LICENSE", "LICENSE.txt", "LICENSE.md"):
            src = pathlib.Path(directory) / name
            if src.exists():
                shutil.copy(src, licenses / (path.replace("/", "_") + ".LICENSE.txt"))
                break
    info = {"engine": "ssh", "go": goversion, "modules": deps,
            "size": (OUT / "ssh-engine.wasm").stat().st_size}
    (OUT / "ssh-engine.json").write_text(json.dumps(info, indent=2) + "\n", encoding="utf-8")
    print(f"wrote vendor/wasm/ssh-engine.wasm ({info['size'] // 1024} KiB, {goversion})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
