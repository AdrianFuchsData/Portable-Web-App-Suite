"""A bash-like shell on the notebook's Pyodide file system (shared/js/python-worker.js installs this file as suite.shell).

The notebook's Terminal tab runs it; in cells it is used with  await suite.shell.run("ls -l | head -3").

Command lines are split with shlex after a pre-pass that expands variables ($NAME, ${NAME}, $?, $HOME …) outside single
quotes and protects quoted wildcards; then come pipes (|), redirections (>, >>, <, 2>, 2>&1), the operators &&, || and ;,
globs (*, ?, [..]), NAME=value assignments, comments (#) and the backslash. Commands:

    cd pwd ls cat cp mv rm mkdir rmdir touch find du head tail wc grep sed sort uniq cut tr diff echo printf tar zip unzip
    env export unset history clear true false sh/bash/source (scripts) python pip mount umount less nano help which basename
    dirname date sleep

There are no control structures (if/for/while), no background jobs and no other programs. less and nano are interactive in
the Terminal tab (handed to it as a request); in cells, less prints the text and nano is not available.
"""
import asyncio
import contextlib
import datetime
import difflib
import fnmatch
import glob as _glob
import io
import json
import os
import re
import runpy
import shlex
import shutil
import stat
import sys
import tarfile
import time
import zipfile

__all__ = ["run", "Shell", "shell"]

_Q = {"*": "\ue000", "?": "\ue001", "[": "\ue002", "]": "\ue003"}  # quoted wildcards, protected from glob expansion
_UNQ = {v: k for k, v in _Q.items()}
TERMINAL_MIME = "application/vnd.suite.terminal+json"


class ShellError(Exception):
    def __init__(self, message, code=1):
        super().__init__(message)
        self.code = code


class Shell:
    def __init__(self):
        home = os.path.expanduser("~") if os.path.isdir(os.path.expanduser("~")) else "/home/pyodide"
        self.env = {"HOME": home, "USER": "pyodide", "SHELL": "/bin/sh", "PATH": "/bin", "PWD": os.getcwd(), "OLDPWD": os.getcwd()}
        self.status = 0
        self.history = []
        self.interactive = None  # set by a command for the terminal: {"action": "less"|"nano", ...}

    # ---- expansion and parsing -----------------------------------------------------------------------------------------

    def expand_vars(self, line):
        out, i, quote = [], 0, None
        while i < len(line):
            c = line[i]
            if c == "\\" and quote != "'" and i + 1 < len(line):
                out.append(c + line[i + 1])
                i += 2
                continue
            if c in "'\"":
                if quote is None:
                    quote = c
                elif quote == c:
                    quote = None
                out.append(c)
                i += 1
                continue
            if c == "$" and quote != "'":
                m = re.match(r"\$(\{([A-Za-z_][A-Za-z0-9_]*|\d)\}|([A-Za-z_][A-Za-z0-9_]*|\d|#|@)|(\?)|(\$))", line[i:])
                if m:
                    name = m.group(2) or m.group(3)
                    value = str(self.status) if m.group(4) else str(os.getpid() if hasattr(os, "getpid") else 1) if m.group(5) else self.env.get(name, os.environ.get(name, ""))
                    out.append(value if quote else value.replace("\\", "\\\\"))
                    i += len(m.group(0))
                    continue
            if quote and c in _Q:
                out.append(_Q[c])
            elif c == "~" and quote is None and (i == 0 or line[i - 1] in " \t=:") and (i + 1 == len(line) or line[i + 1] in "/ \t"):
                out.append(self.env["HOME"])
            else:
                out.append(c)
            i += 1
        return "".join(out)

    def tokens(self, line):
        lex = shlex.shlex(self.expand_vars(line), posix=True, punctuation_chars="|&;<>")
        lex.whitespace_split = True
        lex.commenters = "#"
        try:
            return list(lex)
        except ValueError as e:
            raise ShellError(f"syntax error: {e}", 2)

    def globbed(self, word):
        if any(ch in word for ch in "*?[") and not word.startswith("-"):
            matches = sorted(_glob.glob(word))
            if matches:
                return matches
        return [word.translate(str.maketrans(_UNQ))]

    def parse(self, line):
        """[(operator before it or None, [pipeline commands: {"argv", "in", "out", "append", "err"}])]"""
        items, current, pipeline = [], {"argv": [], "in": None, "out": None, "append": False, "err": None}, []
        op = None
        toks = self.tokens(line)
        i = 0
        while i < len(toks):
            t = toks[i]
            if t in ("|",):
                pipeline.append(current)
                current = {"argv": [], "in": None, "out": None, "append": False, "err": None}
            elif t in ("&&", "||", ";"):
                pipeline.append(current)
                items.append((op, pipeline))
                op, pipeline = t, []
                current = {"argv": [], "in": None, "out": None, "append": False, "err": None}
            elif t in (">", ">>", "<", "2>", ">&"):
                if i + 1 >= len(toks):
                    raise ShellError(f"syntax error near {t}", 2)
                target = toks[i + 1].translate(str.maketrans(_UNQ))
                if t == "<":
                    current["in"] = target
                else:
                    current["out"], current["append"] = target, t == ">>"
                i += 1
            elif t == "&":
                raise ShellError("background jobs (&) are not supported", 2)
            else:
                # 2>, 2>&1 arrive as the word "2" followed by > …
                if t == "2" and i + 1 < len(toks) and toks[i + 1] in (">", ">&"):
                    nxt = toks[i + 2] if i + 2 < len(toks) else ""
                    if toks[i + 1] == ">&" and nxt == "1":
                        current["err"] = "&1"
                    else:
                        current["err"] = nxt.translate(str.maketrans(_UNQ))
                    i += 3
                    continue
                if t == ">&" or t == "&>":
                    i += 1
                    continue
                current["argv"].extend(self.globbed(t))
            i += 1
        pipeline.append(current)
        items.append((op, pipeline))
        return [(o, [c for c in p if c["argv"] or c["out"] or c["in"]]) for o, p in items if any(c["argv"] for c in p)]

    # ---- running -----------------------------------------------------------------------------------------------------

    async def run_line(self, line, out=None, err=None):
        """Run a command line; output goes to out/err (default: sys.stdout/sys.stderr); returns the exit status."""
        out, err = out or sys.stdout, err or sys.stderr
        line = line.strip()
        if not line:
            return self.status
        if line.startswith("!") and line[1:].strip().isdigit():  # !N: a line of the history
            n = int(line[1:])
            if not 1 <= n <= len(self.history):
                print(f"!{n}: event not found", file=err)
                self.status = 1
                return 1
            line = self.history[n - 1]
            print(line, file=out)
        try:
            items = self.parse(line)
        except ShellError as e:
            print(f"sh: {e}", file=err)
            self.status = e.code
            return self.status
        for op, pipeline in items:
            if op == "&&" and self.status != 0 or op == "||" and self.status == 0:
                continue
            self.status = await self.run_pipeline(pipeline, out, err)
        return self.status

    async def run_pipeline(self, pipeline, out, err):
        data = None
        status = 0
        for n, cmd in enumerate(pipeline):
            last = n == len(pipeline) - 1
            stdin = data
            if cmd["in"]:
                try:
                    with open(cmd["in"], encoding="utf-8", errors="replace") as f:
                        stdin = f.read()
                except OSError as e:
                    print(f"sh: {cmd['in']}: {e.strerror}", file=err)
                    return 1
            buf = io.StringIO()
            target_out = buf if (not last or cmd["out"]) else out
            target_err = err
            err_file = None
            if cmd["err"] == "&1":
                target_err = target_out
            elif cmd["err"]:
                err_file = io.StringIO()
                target_err = err_file
            argv = cmd["argv"]
            # NAME=value (only assignments: set the variables)
            while argv and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", argv[0]):
                name, _, value = argv[0].partition("=")
                if len(argv) == 1:
                    self.env[name] = value
                argv = argv[1:]
            status = await self.command(argv, stdin, target_out, target_err) if argv else 0
            if err_file is not None:
                self.write_file(cmd["err"], err_file.getvalue(), False)
            if cmd["out"]:
                try:
                    self.write_file(cmd["out"], buf.getvalue(), cmd["append"])
                except OSError as e:
                    print(f"sh: {cmd['out']}: {e.strerror}", file=err)
                    return 1
                data = ""
            else:
                data = buf.getvalue()
        return status

    @staticmethod
    def write_file(path, text, append):
        with open(path, "a" if append else "w", encoding="utf-8") as f:
            f.write(text)

    async def command(self, argv, stdin, out, err):
        name, args = argv[0], argv[1:]
        if name.startswith("./") or name.startswith("/") and name.endswith((".sh", ".py")):
            if name.endswith(".py"):
                return await self.c_python([name] + args, stdin, out, err)
            return await self.c_sh([name] + args, stdin, out, err)
        fn = getattr(self, "c_" + name.replace("-", "_"), None) if re.fullmatch(r"[a-z][a-z0-9_-]*", name) else None
        if fn is None:
            print(f"sh: {name}: command not found (help lists the commands)", file=err)
            return 127
        try:
            result = fn(args, stdin, out, err)
            if asyncio.iscoroutine(result):
                result = await result
            return int(result or 0)
        except ShellError as e:
            print(f"{name}: {e}", file=err)
            return e.code
        except FileNotFoundError as e:
            print(f"{name}: {e.filename}: No such file or directory", file=err)
            return 1
        except IsADirectoryError as e:
            print(f"{name}: {e.filename}: Is a directory", file=err)
            return 1
        except OSError as e:
            print(f"{name}: {getattr(e, 'filename', '') or ''}{': ' if getattr(e, 'filename', None) else ''}{e.strerror or e}", file=err)
            return 1
        except KeyboardInterrupt:
            raise
        except Exception as e:  # (a bug in a command must not end the shell)
            print(f"{name}: {type(e).__name__}: {e}", file=err)
            return 1

    # ---- helpers -----------------------------------------------------------------------------------------------------

    @staticmethod
    def options(args, flags="", valued=""):
        """Short options (-abc, -n 5, -n5) and --long ones (returned by name); the rest are operands."""
        opts, rest, i = {}, [], 0
        while i < len(args):
            a = args[i]
            if a == "--":
                rest.extend(args[i + 1:])
                break
            if a.startswith("--") and len(a) > 2:
                k, _, v = a[2:].partition("=")
                opts[k] = v or True
            elif a.startswith("-") and len(a) > 1 and not re.fullmatch(r"-\d+", a) or (re.fullmatch(r"-\d+", a) and "n" in valued):
                if re.fullmatch(r"-\d+", a):  # head -5
                    opts["n"] = a[1:]
                else:
                    j = 1
                    while j < len(a):
                        c = a[j]
                        if c in valued:
                            v = a[j + 1:] or (args[i + 1] if i + 1 < len(args) else None)
                            if v is None:
                                raise ShellError(f"option -{c} needs a value", 2)
                            if not a[j + 1:]:
                                i += 1
                            opts[c] = v
                            break
                        if c not in flags:
                            raise ShellError(f"unknown option -{c}", 2)
                        opts[c] = True
                        j += 1
            else:
                rest.append(a)
            i += 1
        return opts, rest

    @staticmethod
    def read_inputs(files, stdin, err=None):
        if not files or files == ["-"]:
            return [("-", stdin or "")]
        out = []
        for f in files:
            if f == "-":
                out.append(("-", stdin or ""))
                continue
            if os.path.isdir(f):
                raise IsADirectoryError(21, "Is a directory", f)
            with open(f, encoding="utf-8", errors="replace") as fh:
                out.append((f, fh.read()))
        return out

    @staticmethod
    def human(n):
        for unit in ("", "K", "M", "G"):
            if n < 1024 or unit == "G":
                return f"{n:.0f}{unit}" if unit == "" or n >= 10 else f"{n:.1f}{unit}"
            n /= 1024

    # ---- built-ins ---------------------------------------------------------------------------------------------------

    def c_help(self, args, stdin, out, err):
        names = sorted(n[2:] for n in dir(self) if n.startswith("c_"))
        print("Commands: " + " ".join(names), file=out)
        print("Pipes |, redirections > >> < 2> 2>&1, && || ;, globs, $VARIABLES, NAME=value, history (!N), sh script.sh", file=out)

    def c_which(self, args, stdin, out, err):
        status = 0
        for a in args:
            if hasattr(self, "c_" + a.replace("-", "_")):
                print(f"{a}: shell command", file=out)
            else:
                status = 1
        return status

    def c_cd(self, args, stdin, out, err):
        target = args[0] if args else self.env["HOME"]
        if target == "-":
            target = self.env.get("OLDPWD", self.env["HOME"])
            print(target, file=out)
        old = os.getcwd()
        os.chdir(target)
        self.env["OLDPWD"], self.env["PWD"] = old, os.getcwd()

    def c_pwd(self, args, stdin, out, err):
        print(os.getcwd(), file=out)

    def c_echo(self, args, stdin, out, err):
        newline, escapes = True, False
        while args and args[0] in ("-n", "-e", "-ne", "-en"):
            newline = newline and "n" not in args[0][1:]
            escapes = escapes or "e" in args[0]
            args = args[1:]
        text = " ".join(args)
        if escapes:
            text = text.encode("utf-8").decode("unicode_escape")
        out.write(text + ("\n" if newline else ""))

    def c_printf(self, args, stdin, out, err):
        if not args:
            return 1
        fmt = args[0].encode("utf-8").decode("unicode_escape")
        values = args[1:]
        try:
            out.write(fmt % tuple(int(v) if re.fullmatch(r"-?\d+", v) else v for v in values) if values else fmt)
        except (TypeError, ValueError):
            out.write(fmt)

    def c_env(self, args, stdin, out, err):
        for k, v in sorted(self.env.items()):
            print(f"{k}={v}", file=out)

    def c_export(self, args, stdin, out, err):
        for a in args:
            name, eq, value = a.partition("=")
            if eq:
                self.env[name] = value
            os.environ[name] = self.env.get(name, "")

    def c_unset(self, args, stdin, out, err):
        for a in args:
            self.env.pop(a, None)
            os.environ.pop(a, None)

    def c_history(self, args, stdin, out, err):
        if args and args[0] == "-c":
            self.history.clear()
            return
        for n, line in enumerate(self.history, start=1):
            print(f"{n:5}  {line}", file=out)

    def c_clear(self, args, stdin, out, err):
        out.write("\x1b[2J\x1b[H")

    def c_true(self, args, stdin, out, err):
        return 0

    def c_false(self, args, stdin, out, err):
        return 1

    def c_sleep(self, args, stdin, out, err):
        time.sleep(float(args[0]) if args else 0)

    def c_date(self, args, stdin, out, err):
        now = datetime.datetime.now()
        print(now.strftime(args[0][1:]) if args and args[0].startswith("+") else now.strftime("%a %b %d %H:%M:%S %Y"), file=out)

    def c_basename(self, args, stdin, out, err):
        name = os.path.basename(args[0].rstrip("/")) if args else ""
        if len(args) > 1 and name.endswith(args[1]):
            name = name[: -len(args[1])]
        print(name, file=out)

    def c_dirname(self, args, stdin, out, err):
        print(os.path.dirname(args[0].rstrip("/")) or "." if args else ".", file=out)

    # ---- files -------------------------------------------------------------------------------------------------------

    def c_ls(self, args, stdin, out, err):
        opts, paths = self.options(args, "laAhR1dtrS")
        paths = paths or ["."]
        status = 0

        def entries(path):
            names = os.listdir(path)
            if not (opts.get("a") or opts.get("A")):
                names = [n for n in names if not n.startswith(".")]
            items = [(n, os.lstat(os.path.join(path, n))) for n in names]
            if opts.get("t"):
                items.sort(key=lambda x: -x[1].st_mtime)
            elif opts.get("S"):
                items.sort(key=lambda x: -x[1].st_size)
            else:
                items.sort(key=lambda x: x[0].lower())
            if opts.get("r"):
                items.reverse()
            return items

        def show(items, base=""):
            if opts.get("l"):
                for n, st in items:
                    size = self.human(st.st_size) if opts.get("h") else str(st.st_size)
                    mtime = datetime.datetime.fromtimestamp(st.st_mtime).strftime("%b %d %H:%M")
                    print(f"{stat.filemode(st.st_mode)} 1 pyodide pyodide {size:>8} {mtime} {n}{'/' if stat.S_ISDIR(st.st_mode) else ''}", file=out)
            elif items:
                # (one per line into pipes and files, as ls does; side by side on the terminal)
                sep = "\n" if opts.get("1") or isinstance(out, io.StringIO) else "  "
                print(sep.join(n + ("/" if stat.S_ISDIR(st.st_mode) else "") for n, st in items), file=out)

        files = [p for p in paths if not os.path.isdir(p) or opts.get("d")]
        dirs = [p for p in paths if os.path.isdir(p) and not opts.get("d")]
        for p in files:
            if not os.path.lexists(p):
                print(f"ls: {p}: No such file or directory", file=err)
                status = 1
        show([(p, os.lstat(p)) for p in files if os.path.lexists(p)])
        for d in dirs:
            walk = [d]
            while walk:
                current = walk.pop(0)
                if len(paths) > 1 or opts.get("R") or files:
                    print(f"\n{current}:" if current != dirs[0] or files else f"{current}:", file=out)
                items = entries(current)
                show(items)
                if opts.get("R"):
                    walk.extend(os.path.join(current, n) for n, st in items if stat.S_ISDIR(st.st_mode))
        return status

    def c_cat(self, args, stdin, out, err):
        opts, files = self.options(args, "n")
        n = 0
        for _, text in self.read_inputs(files, stdin):
            if opts.get("n"):
                for line in text.splitlines(True):
                    n += 1
                    out.write(f"{n:6}\t{line}")
            else:
                out.write(text)

    def c_touch(self, args, stdin, out, err):
        for f in args:
            if os.path.exists(f):
                os.utime(f)
            else:
                open(f, "a").close()

    def c_mkdir(self, args, stdin, out, err):
        opts, dirs = self.options(args, "pv")
        for d in dirs:
            os.makedirs(d, exist_ok=True) if opts.get("p") else os.mkdir(d)

    def c_rmdir(self, args, stdin, out, err):
        for d in args:
            os.rmdir(d)

    def c_rm(self, args, stdin, out, err):
        opts, files = self.options(args, "rRfiv")
        status = 0
        for f in files:
            if os.path.isdir(f) and not os.path.islink(f):
                if not (opts.get("r") or opts.get("R")):
                    print(f"rm: {f}: is a directory (use rm -r)", file=err)
                    status = 1
                    continue
                shutil.rmtree(f)
            elif os.path.lexists(f):
                os.remove(f)
            elif not opts.get("f"):
                print(f"rm: {f}: No such file or directory", file=err)
                status = 1
        return status

    def c_cp(self, args, stdin, out, err):
        opts, paths = self.options(args, "rRavpf")
        if len(paths) < 2:
            raise ShellError("usage: cp [-r] SOURCE... TARGET", 2)
        *sources, target = paths
        if len(sources) > 1 and not os.path.isdir(target):
            raise ShellError(f"{target}: not a directory")
        for src in sources:
            dst = os.path.join(target, os.path.basename(src.rstrip("/"))) if os.path.isdir(target) else target
            if os.path.isdir(src):
                if not (opts.get("r") or opts.get("R") or opts.get("a")):
                    raise ShellError(f"{src}: is a directory (use cp -r)")
                shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                shutil.copy2(src, dst)

    def c_mv(self, args, stdin, out, err):
        opts, paths = self.options(args, "fvin")
        if len(paths) < 2:
            raise ShellError("usage: mv SOURCE... TARGET", 2)
        *sources, target = paths
        for src in sources:
            shutil.move(src, os.path.join(target, os.path.basename(src.rstrip("/"))) if os.path.isdir(target) else target)

    def c_find(self, args, stdin, out, err):
        roots = []
        while args and not args[0].startswith("-"):
            roots.append(args.pop(0))
        roots = roots or ["."]
        name = iname = kind = None
        maxdepth = None
        while args:
            a = args.pop(0)
            if a in ("-name", "-iname", "-type", "-maxdepth") and not args:
                raise ShellError(f"{a} needs a value", 2)
            if a == "-name":
                name = args.pop(0).translate(str.maketrans(_UNQ))
            elif a == "-iname":
                iname = args.pop(0).translate(str.maketrans(_UNQ)).lower()
            elif a == "-type":
                kind = args.pop(0)
            elif a == "-maxdepth":
                maxdepth = int(args.pop(0))
            elif a == "-print":
                pass
            else:
                raise ShellError(f"unknown predicate {a} (supported: -name, -iname, -type f|d, -maxdepth N)", 2)

        def match(path, is_dir):
            base = os.path.basename(path.rstrip("/")) or path
            if kind == "f" and is_dir or kind == "d" and not is_dir:
                return False
            if name and not fnmatch.fnmatchcase(base, name):
                return False
            if iname and not fnmatch.fnmatch(base.lower(), iname):
                return False
            return True

        for root in roots:
            if not os.path.exists(root):
                raise FileNotFoundError(2, "No such file or directory", root)
            if match(root, os.path.isdir(root)):
                print(root, file=out)
            for dirpath, dirnames, filenames in os.walk(root):
                depth = 0 if dirpath == root else dirpath[len(root):].strip(os.sep).count(os.sep) + 1
                if maxdepth is not None and depth >= maxdepth:
                    dirnames[:] = []
                    continue
                dirnames.sort()
                listed = list(dirnames)
                if maxdepth is not None and depth + 1 >= maxdepth:
                    dirnames[:] = []  # (the entries of this folder are the deepest ones)
                for d in listed:
                    p = os.path.join(dirpath, d)
                    if match(p, True):
                        print(p, file=out)
                for f in sorted(filenames):
                    p = os.path.join(dirpath, f)
                    if match(p, False):
                        print(p, file=out)

    def c_du(self, args, stdin, out, err):
        opts, paths = self.options(args, "shac")
        total_all = 0
        for root in paths or ["."]:
            sizes = {}
            total = 0
            if os.path.isfile(root):
                total = os.path.getsize(root)
            else:
                for dirpath, _, filenames in os.walk(root, topdown=False):
                    size = sum(os.path.getsize(os.path.join(dirpath, f)) for f in filenames if os.path.isfile(os.path.join(dirpath, f)))
                    size += sum(v for k, v in sizes.items() if os.path.dirname(k) == dirpath)
                    sizes[dirpath] = size
                total = sizes.get(root, 0)
            total_all += total
            fmt = (lambda n: self.human(n)) if opts.get("h") else (lambda n: str((n + 1023) // 1024))
            if not opts.get("s"):
                for d, size in sorted(sizes.items()):
                    if d != root:
                        print(f"{fmt(size)}\t{d}", file=out)
            print(f"{fmt(total)}\t{root}", file=out)
        if opts.get("c"):
            print(f"{self.human(total_all) if opts.get('h') else (total_all + 1023) // 1024}\ttotal", file=out)

    # ---- text --------------------------------------------------------------------------------------------------------

    def c_head(self, args, stdin, out, err):
        opts, files = self.options(args, "q", "nc")
        inputs = self.read_inputs(files, stdin)
        for i, (name, text) in enumerate(inputs):
            if len(inputs) > 1:
                print(f"{'' if i == 0 else chr(10)}==> {name} <==", file=out)
            if "c" in opts:
                out.write(text[: int(opts["c"])])
            else:
                out.write("".join(text.splitlines(True)[: int(opts.get("n", 10))]))

    def c_tail(self, args, stdin, out, err):
        opts, files = self.options(args, "q", "nc")
        inputs = self.read_inputs(files, stdin)
        for i, (name, text) in enumerate(inputs):
            if len(inputs) > 1:
                print(f"{'' if i == 0 else chr(10)}==> {name} <==", file=out)
            lines = text.splitlines(True)
            n = str(opts.get("n", "10"))
            if "c" in opts:
                out.write(text[-int(opts["c"]):])
            elif n.startswith("+"):
                out.write("".join(lines[int(n[1:]) - 1:]))
            else:
                out.write("".join(lines[-int(n):]) if int(n) else "")

    def c_wc(self, args, stdin, out, err):
        opts, files = self.options(args, "lwcm")
        sel = [k for k in "lwc" if opts.get(k) or (k == "c" and opts.get("m"))] or ["l", "w", "c"]
        totals = [0, 0, 0]
        inputs = self.read_inputs(files, stdin)
        for name, text in inputs:
            counts = [text.count("\n"), len(text.split()), len(text.encode("utf-8")) if not opts.get("m") else len(text)]
            totals = [a + b for a, b in zip(totals, counts)]
            values = [counts["lwc".index(k)] for k in sel]
            print(" ".join(f"{v:7}" for v in values) + ("" if name == "-" else f" {name}"), file=out)
        if len(inputs) > 1:
            print(" ".join(f"{totals['lwc'.index(k)]:7}" for k in sel) + " total", file=out)

    def c_grep(self, args, stdin, out, err):
        opts, rest = self.options(args, "ivnclrRhHoEFwxs", "e")
        pattern = opts.get("e") or (rest.pop(0) if rest else None)
        if pattern is None:
            raise ShellError("usage: grep [-ivnclrhoEFwx] PATTERN [FILE...]", 2)
        if opts.get("F"):
            pattern = re.escape(pattern)
        if opts.get("w"):
            pattern = rf"\b(?:{pattern})\b"
        if opts.get("x"):
            pattern = rf"^(?:{pattern})$"
        try:
            rx = re.compile(pattern, re.IGNORECASE if opts.get("i") else 0)
        except re.error as e:
            raise ShellError(f"invalid pattern: {e}", 2)
        files = rest
        if opts.get("r") or opts.get("R"):
            expanded = []
            for f in files or ["."]:
                if os.path.isdir(f):
                    for dirpath, dirnames, filenames in os.walk(f):
                        dirnames.sort()
                        expanded.extend(os.path.join(dirpath, n) for n in sorted(filenames))
                else:
                    expanded.append(f)
            files = expanded
        multi = len(files) > 1 or opts.get("r") or opts.get("R")
        found = False
        for name, text in self.read_inputs(files, stdin):
            count = 0
            for n, line in enumerate(text.splitlines(), start=1):
                hit = rx.search(line)
                if bool(hit) == bool(opts.get("v")):
                    continue
                count += 1
                found = True
                if opts.get("l") or opts.get("c") or opts.get("s") and False:
                    continue
                prefix = (f"{name}:" if (multi and not opts.get("h")) or opts.get("H") else "") + (f"{n}:" if opts.get("n") else "")
                if opts.get("o") and not opts.get("v"):
                    for m in rx.finditer(line):
                        print(prefix + m.group(0), file=out)
                else:
                    print(prefix + line, file=out)
            if opts.get("l") and count:
                print(name, file=out)
            elif opts.get("c"):
                print((f"{name}:" if multi else "") + str(count), file=out)
        return 0 if found else 1

    def c_sort(self, args, stdin, out, err):
        opts, files = self.options(args, "rnufb", "kt")
        lines = []
        for _, text in self.read_inputs(files, stdin):
            lines.extend(text.splitlines())
        sep = opts.get("t")

        def key(line):
            value = line
            if "k" in opts:
                field = int(str(opts["k"]).split(",")[0].split(".")[0]) - 1
                parts = line.split(sep) if sep else line.split()
                value = parts[field] if field < len(parts) else ""
            if opts.get("b"):
                value = value.strip()
            if opts.get("f"):
                value = value.lower()
            if opts.get("n"):
                m = re.match(r"\s*-?\d+(\.\d+)?", value)
                return (0, float(m.group(0)) if m else 0.0, value)
            return (0, 0, value)

        lines.sort(key=key, reverse=bool(opts.get("r")))
        if opts.get("u"):
            seen, unique = set(), []
            for line in lines:
                k = key(line)
                if k not in seen:
                    seen.add(k)
                    unique.append(line)
            lines = unique
        out.write("".join(line + "\n" for line in lines))

    def c_uniq(self, args, stdin, out, err):
        opts, files = self.options(args, "cdui")
        lines = self.read_inputs(files[:1], stdin)[0][1].splitlines()
        groups = []
        for line in lines:
            same = groups and (groups[-1][0].lower() == line.lower() if opts.get("i") else groups[-1][0] == line)
            if same:
                groups[-1][1] += 1
            else:
                groups.append([line, 1])
        for line, count in groups:
            if opts.get("d") and count < 2 or opts.get("u") and count > 1:
                continue
            print(f"{count:7} {line}" if opts.get("c") else line, file=out)

    @staticmethod
    def ranges(spec):
        """1,3-5,7- -> a function telling whether a 1-based position is selected"""
        parts = []
        for p in spec.split(","):
            a, dash, b = p.partition("-")
            lo = int(a) if a else 1
            hi = (int(b) if b else 10 ** 9) if dash else lo
            parts.append((lo, hi))
        return lambda i: any(lo <= i <= hi for lo, hi in parts)

    def c_cut(self, args, stdin, out, err):
        opts, files = self.options(args, "s", "dfc")
        for _, text in self.read_inputs(files, stdin):
            for line in text.splitlines():
                if "c" in opts:
                    sel = self.ranges(opts["c"])
                    print("".join(ch for i, ch in enumerate(line, start=1) if sel(i)), file=out)
                elif "f" in opts:
                    delim = opts.get("d", "\t")
                    if delim not in line:
                        if not opts.get("s"):
                            print(line, file=out)
                        continue
                    sel = self.ranges(opts["f"])
                    print(delim.join(f for i, f in enumerate(line.split(delim), start=1) if sel(i)), file=out)
                else:
                    raise ShellError("usage: cut -f LIST [-d DELIM] | -c LIST", 2)

    @staticmethod
    def char_set(spec):
        spec = spec.encode("utf-8").decode("unicode_escape")
        classes = {"[:lower:]": "abcdefghijklmnopqrstuvwxyz", "[:upper:]": "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "[:digit:]": "0123456789",
                   "[:space:]": " \t\n\r\f\v", "[:alpha:]": "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
                   "[:alnum:]": "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", "[:punct:]": "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"}
        for k, v in classes.items():
            spec = spec.replace(k, v)
        chars, i = [], 0
        while i < len(spec):
            if i + 2 < len(spec) and spec[i + 1] == "-":
                chars.extend(chr(c) for c in range(ord(spec[i]), ord(spec[i + 2]) + 1))
                i += 3
            else:
                chars.append(spec[i])
                i += 1
        return chars

    def c_tr(self, args, stdin, out, err):
        opts, sets = self.options(args, "dsc")
        text = stdin or ""
        if not sets:
            raise ShellError("usage: tr [-d] SET1 [SET2]", 2)
        s1 = self.char_set(sets[0])
        if opts.get("d"):
            out.write("".join(ch for ch in text if (ch in s1) == bool(opts.get("c"))))
            return
        if len(sets) < 2:
            if opts.get("s"):
                out.write(re.sub("([" + re.escape("".join(s1)) + "])\\1+", r"\1", text))
                return
            raise ShellError("missing SET2", 2)
        s2 = self.char_set(sets[1])
        s2 = s2 + [s2[-1]] * (len(s1) - len(s2)) if s2 else s2
        result = text.translate({ord(a): b for a, b in zip(s1, s2)})
        if opts.get("s"):
            result = re.sub("([" + re.escape("".join(s2)) + "])\\1+", r"\1", result)
        out.write(result)

    def c_diff(self, args, stdin, out, err):
        opts, files = self.options(args, "uqbiw", "U")
        if len(files) != 2:
            raise ShellError("usage: diff [-u] FILE1 FILE2", 2)
        (n1, a), (n2, b) = self.read_inputs(files[:1], stdin)[0], self.read_inputs(files[1:], stdin)[0]
        if opts.get("i"):
            a, b = a.lower(), b.lower()
        if opts.get("w"):
            a, b = re.sub(r"[ \t]+", "", a), re.sub(r"[ \t]+", "", b)
        if a == b:
            return 0
        if opts.get("q"):
            print(f"Files {n1} and {n2} differ", file=out)
            return 1
        if opts.get("u") or "U" in opts:
            out.writelines(difflib.unified_diff(a.splitlines(True), b.splitlines(True), n1, n2, n=int(opts.get("U", 3))))
        else:
            sm = difflib.SequenceMatcher(None, a.splitlines(True), b.splitlines(True))
            la, lb = a.splitlines(True), b.splitlines(True)
            rng = lambda i, j: f"{i + 1}" if j - i == 1 else f"{i + 1},{j}" if j > i else f"{i}"
            for tag, i1, i2, j1, j2 in sm.get_opcodes():
                if tag == "equal":
                    continue
                print(f"{rng(i1, i2)}{ {'replace': 'c', 'delete': 'd', 'insert': 'a'}[tag] }{rng(j1, j2)}", file=out)
                out.writelines("< " + line for line in la[i1:i2])
                if tag == "replace":
                    print("---", file=out)
                out.writelines("> " + line for line in lb[j1:j2])
        return 1

    # sed: the common subset – s///flags, d, p, = with addresses N, $, /re/ and ranges A,B; -n, -e, -i, -E
    def parse_sed(self, script):
        commands, i = [], 0

        def address():
            nonlocal i
            if i < len(script) and script[i].isdigit():
                m = re.match(r"\d+", script[i:])
                i += len(m.group(0))
                return ("line", int(m.group(0)))
            if i < len(script) and script[i] == "$":
                i += 1
                return ("last", None)
            if i < len(script) and script[i] == "/":
                j = i + 1
                while j < len(script) and script[j] != "/":
                    j += 2 if script[j] == "\\" else 1
                rx = re.compile(script[i + 1:j])
                i = j + 1
                return ("re", rx)
            return None

        while i < len(script):
            while i < len(script) and script[i] in " ;\n\t":
                i += 1
            if i >= len(script):
                break
            a1 = address()
            a2 = None
            if a1 and i < len(script) and script[i] == ",":
                i += 1
                a2 = address()
            negate = False
            if i < len(script) and script[i] == "!":
                negate = True
                i += 1
            if i >= len(script):
                raise ShellError("missing command", 1)
            c = script[i]
            i += 1
            if c == "s":
                d = script[i]
                parts, j, buf = [], i + 1, ""
                while j < len(script) and len(parts) < 2:
                    if script[j] == "\\" and j + 1 < len(script) and script[j + 1] == d:
                        buf += d
                        j += 2
                        continue
                    if script[j] == d:
                        parts.append(buf)
                        buf = ""
                    else:
                        buf += script[j]
                    j += 1
                if len(parts) < 2:
                    raise ShellError("unterminated `s' command", 1)
                m = re.match(r"[gIip0-9]*", script[j:])
                flags = m.group(0)
                i = j + len(flags)
                repl = re.sub(r"\\(\d)", r"\\g<\1>", parts[1]).replace("&", "\\g<0>").replace("\\\\g<0>", "&")
                count = int(re.sub(r"\D", "", flags) or 0)
                rx = re.compile(parts[0], re.IGNORECASE if ("I" in flags or "i" in flags) else 0)
                commands.append((a1, a2, negate, "s", (rx, repl, "g" in flags, count, "p" in flags)))
            elif c in "dp=q":
                commands.append((a1, a2, negate, c, None))
            else:
                raise ShellError(f"unsupported command '{c}' (supported: s, d, p, =, q)", 1)
        return commands

    def c_sed(self, args, stdin, out, err):
        opts, rest = self.options(args, "niEr", "e")
        script = opts.get("e") or (rest.pop(0) if rest else None)
        if script is None:
            raise ShellError("usage: sed [-n] [-i] SCRIPT [FILE...]", 2)
        commands = self.parse_sed(script)

        def process(text):
            lines = text.splitlines(True)
            result = []
            active = {}
            for n, line in enumerate(lines, start=1):
                last = n == len(lines)
                body = line.rstrip("\n")
                end = line[len(body):]
                deleted = False
                for k, (a1, a2, negate, c, arg) in enumerate(commands):
                    def hit(a):
                        return bool(a is None or a[0] == "line" and a[1] == n or a[0] == "last" and last or a[0] == "re" and a[1].search(body))
                    if a2 is None:
                        selected = a1 is None or hit(a1)
                    elif active.get(k):
                        selected = True
                        if a2[0] == "line" and n >= a2[1] or hit(a2) and a2[0] != "line":
                            active[k] = False
                    elif hit(a1):
                        selected = True
                        active[k] = not (a2[0] == "line" and n >= a2[1])
                    else:
                        selected = False
                    if selected == negate:
                        continue
                    if c == "s":
                        rx, repl, all_, count, printing = arg
                        new, done = (rx.subn(repl, body) if all_ else rx.subn(repl, body, count=1)) if not count else (body, 0)
                        if count:
                            matches = list(rx.finditer(body))
                            if len(matches) >= count:
                                m = matches[count - 1]
                                new, done = body[:m.start()] + m.expand(repl) + body[m.end():], 1
                        body = new
                        if done and printing:
                            result.append(body + end)
                    elif c == "d":
                        deleted = True
                        break
                    elif c == "p":
                        result.append(body + end)
                    elif c == "=":
                        result.append(f"{n}\n")
                    elif c == "q":
                        if not opts.get("n"):
                            result.append(body + end)
                        return "".join(result)
                if not deleted and not opts.get("n"):
                    result.append(body + end)
            return "".join(result)

        if opts.get("i"):
            for f in rest:
                with open(f, encoding="utf-8") as fh:
                    text = fh.read()
                with open(f, "w", encoding="utf-8") as fh:
                    fh.write(process(text))
            return
        for _, text in self.read_inputs(rest, stdin):
            out.write(process(text))

    # ---- archives ----------------------------------------------------------------------------------------------------

    def c_tar(self, args, stdin, out, err):
        flags = args[0].lstrip("-") if args else ""
        opts, rest = self.options(["-" + flags] + args[1:] if args and not args[0].startswith("-") else args, "cxtvzjJ", "fC")
        archive = opts.get("f")
        if not archive:
            raise ShellError("usage: tar -c|-x|-t [-z|-j|-J] -f ARCHIVE [-C DIR] [FILES]", 2)
        mode = "gz" if opts.get("z") else "bz2" if opts.get("j") else "xz" if opts.get("J") else ""
        if opts.get("c"):
            with tarfile.open(archive, f"w:{mode}" if mode else "w") as t:
                for f in rest:
                    t.add(f)
                    if opts.get("v"):
                        print(f, file=out)
        elif opts.get("x") or opts.get("t"):
            with tarfile.open(archive, "r:*") as t:
                if opts.get("t"):
                    for m in t.getmembers():
                        print(m.name + ("/" if m.isdir() else ""), file=out)
                else:
                    members = [m for m in t.getmembers() if not rest or m.name in rest]
                    kw = {"filter": "data"} if hasattr(tarfile, "data_filter") else {}
                    t.extractall(opts.get("C", "."), members=members, **kw)
                    if opts.get("v"):
                        for m in members:
                            print(m.name, file=out)
        else:
            raise ShellError("one of -c, -x, -t is needed", 2)

    def c_zip(self, args, stdin, out, err):
        opts, rest = self.options(args, "rqj")
        if len(rest) < 2:
            raise ShellError("usage: zip [-r] ARCHIVE FILES...", 2)
        archive, files = rest[0], rest[1:]
        with zipfile.ZipFile(archive, "a" if os.path.exists(archive) else "w", zipfile.ZIP_DEFLATED) as z:
            for f in files:
                paths = [f]
                if os.path.isdir(f):
                    if not opts.get("r"):
                        print(f"zip: {f} is a directory (use zip -r)", file=err)
                        continue
                    paths = [os.path.join(dp, n) for dp, _, names in os.walk(f) for n in sorted(names)]
                for p in paths:
                    z.write(p, os.path.basename(p) if opts.get("j") else p)
                    if not opts.get("q"):
                        print(f"  adding: {p}", file=out)

    def c_unzip(self, args, stdin, out, err):
        opts, rest = self.options(args, "loq", "d")
        if not rest:
            raise ShellError("usage: unzip [-l] [-d DIR] ARCHIVE [FILES]", 2)
        with zipfile.ZipFile(rest[0]) as z:
            if opts.get("l"):
                total = 0
                for info in z.infolist():
                    total += info.file_size
                    print(f"{info.file_size:>9}  {datetime.datetime(*info.date_time):%Y-%m-%d %H:%M}   {info.filename}", file=out)
                print(f"{total:>9}  {len(z.infolist())} files", file=out)
                return
            names = rest[1:] or z.namelist()
            target = opts.get("d", ".")
            for n in names:
                if not opts.get("o") and os.path.exists(os.path.join(target, n)) and not n.endswith("/"):
                    pass  # (overwritten, as unzip -o; there is no question)
                z.extract(n, target)
                if not opts.get("q"):
                    print(f"  inflating: {os.path.join(target, n)}", file=out)

    # ---- programs, scripts, packages ---------------------------------------------------------------------------------

    async def c_sh(self, args, stdin, out, err):
        """sh script.sh [args] – also bash, source and ./script.sh: the lines of a script, in this shell."""
        if not args:
            raise ShellError("usage: sh SCRIPT [ARGS]", 2)
        path, params = args[0], args[1:]
        with open(path, encoding="utf-8") as f:
            lines = f.read().splitlines()
        saved = {k: self.env.get(k) for k in ["0"] + [str(i) for i in range(1, 10)] + ["#", "@"]}
        self.env.update({"0": path, "#": str(len(params)), "@": " ".join(params)})
        for i in range(1, 10):
            self.env[str(i)] = params[i - 1] if i <= len(params) else ""
        status = 0
        try:
            buffered = ""
            for line in lines:
                if line.rstrip().endswith("\\"):
                    buffered += line.rstrip()[:-1] + " "
                    continue
                line, buffered = buffered + line, ""
                if line.strip().startswith("#") or not line.strip():
                    continue
                if line.strip() == "set -e":
                    self.env["__errexit"] = "1"
                    continue
                if line.strip().split()[0] == "exit":
                    parts = line.split()
                    return int(parts[1]) if len(parts) > 1 else self.status
                status = await self.run_line(line, out, err)
                if status and self.env.get("__errexit"):
                    return status
        finally:
            self.env.pop("__errexit", None)
            for k, v in saved.items():
                if v is None:
                    self.env.pop(k, None)
                else:
                    self.env[k] = v
        return status

    c_bash = c_sh
    c_source = c_sh

    async def c_python(self, args, stdin, out, err):
        """python script.py [args] or python -c CODE: runs in this Python (the notebook's interpreter)."""
        if not args:
            raise ShellError("usage: python SCRIPT [ARGS] | python -c CODE", 2)
        old_argv, old_in = sys.argv, sys.stdin
        try:
            sys.stdin = io.StringIO(stdin or "")
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                if args[0] == "-c":
                    sys.argv = ["-c"] + args[2:]
                    exec(compile(args[1] if len(args) > 1 else "", "<string>", "exec"), {"__name__": "__main__"})
                elif args[0] == "-m" and len(args) > 1:
                    sys.argv = [args[1]] + args[2:]
                    runpy.run_module(args[1], run_name="__main__", alter_sys=True)
                else:
                    sys.argv = args
                    runpy.run_path(args[0], run_name="__main__")
        except SystemExit as e:
            return e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
        finally:
            sys.argv, sys.stdin = old_argv, old_in
        return 0

    c_python3 = c_python

    async def c_pip(self, args, stdin, out, err):
        """pip install PACKAGE... (micropip: Pyodide's packages, pure-Python wheels from PyPI or URLs; needs the network)."""
        if not args or args[0] not in ("install", "list"):
            raise ShellError("usage: pip install PACKAGE... | pip list", 2)
        import micropip
        if args[0] == "list":
            for name, pkg in sorted(micropip.list().items()):
                print(f"{name:30} {pkg.version}", file=out)
            return
        packages = [a for a in args[1:] if not a.startswith("-")]
        await micropip.install(packages)
        print("Installed: " + " ".join(packages), file=out)

    async def c_mount(self, args, stdin, out, err):
        """mount [ARCHIVE]: mount an archive of the archive manager below /mnt (suite.archives); without a name, list them."""
        import suite
        if not args:
            for m in await suite.archives.mounted():
                print(f"{m['name']} on {m['path']}{' (closed)' if m['closed'] else ''}", file=out)
            return
        print(await suite.archives.mount(args[0]), file=out)

    async def c_umount(self, args, stdin, out, err):
        import suite
        for a in args:
            await suite.archives.unmount(a)

    # ---- interactive (terminal) --------------------------------------------------------------------------------------

    def c_less(self, args, stdin, out, err):
        name, text = self.read_inputs(args[:1], stdin)[0]
        if self.terminal:
            self.interactive = {"action": "less", "title": name if name != "-" else "(stdin)", "text": text}
        else:
            out.write(text)

    c_more = c_less

    def c_nano(self, args, stdin, out, err):
        if not args:
            raise ShellError("usage: nano FILE", 2)
        if not self.terminal:
            raise ShellError("nano works in the Terminal tab", 1)
        path = os.path.abspath(args[0])
        text = ""
        if os.path.exists(path):
            with open(path, encoding="utf-8", errors="replace") as f:
                text = f.read()
        self.interactive = {"action": "nano", "path": path, "text": text}

    terminal = False

    # ---- completion --------------------------------------------------------------------------------------------------

    def complete(self, line):
        """Completions for the last word of a line: commands for the first word, paths otherwise; (prefix, [candidates])."""
        word = "" if not line or line[-1].isspace() else re.split(r"[\s|;&<>]", line)[-1]
        first = not re.search(r"[^\s|;&]", line[: len(line) - len(word)].split("|")[-1].split(";")[-1].split("&")[-1])
        if first and "/" not in word:
            names = sorted({n[2:] for n in dir(self) if n.startswith("c_")})
            return word, [n + " " for n in names if n.startswith(word)]
        directory, prefix = os.path.split(word)
        base = os.path.expanduser(directory) if directory else "."
        try:
            names = sorted(os.listdir(base))
        except OSError:
            return word, []
        out = []
        for n in names:
            if n.startswith(prefix) and (prefix.startswith(".") or not n.startswith(".")):
                full = os.path.join(directory, n) if directory else n
                out.append(full + ("/" if os.path.isdir(os.path.join(base, n)) else " "))
        return word, out


shell = Shell()


async def run(line):
    """Run a command line in a cell (output printed); returns the exit status."""
    return await shell.run_line(line)


async def _terminal(line):
    """The Terminal tab: run a line (added to the history), then hand an interactive program to the page."""
    shell.terminal = True
    shell.interactive = None
    if line.strip():
        shell.history.append(line)
    try:
        status = await shell.run_line(line)
    finally:
        shell.terminal = False
    sys.stdout.flush()
    request = shell.interactive
    shell.interactive = None
    _answer({"status": status, "cwd": os.getcwd(), "interactive": request})


def _complete(line):
    word, candidates = shell.complete(line)
    _answer({"word": word, "candidates": candidates})


def _answer(data):
    """An answer for the Terminal tab: an output of its own type (not shown in cells)."""
    import __main__
    __main__._emit({"output_type": "display_data", "data": {TERMINAL_MIME: data}, "metadata": {}})
