"""The notebook's shell (shared/js/python-shell.py, suite.shell) run with CPython in a temporary folder: parsing (shlex,
quotes, variables, globs, pipes, redirections, && || ;), the commands and scripts. The Terminal tab is tested in
tests/apps/test_notebook_shell.py."""
import asyncio
import concurrent.futures
import importlib.util
import io
import os
import tarfile
import zipfile

import pytest

from helpers.paths import ROOT

spec = importlib.util.spec_from_file_location("suite_shell", ROOT / "shared" / "js" / "python-shell.py")
shell_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shell_module)


@pytest.fixture()
def sh(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    s = shell_module.Shell()
    s.env["HOME"] = str(tmp_path)

    def run(line):
        out, err = io.StringIO(), io.StringIO()
        # (in a thread of its own: Playwright's synchronous API keeps an event loop running in the main thread)
        with concurrent.futures.ThreadPoolExecutor(1) as pool:
            status = pool.submit(lambda: asyncio.run(s.run_line(line, out, err))).result()
        return out.getvalue(), err.getvalue(), status
    run.shell = s
    return run


def write(name, text):
    os.makedirs(os.path.dirname(name) or ".", exist_ok=True)
    with open(name, "w", encoding="utf-8") as f:
        f.write(text)


def read(name):
    with open(name, encoding="utf-8") as f:
        return f.read()


def test_parsing_quotes_variables_operators(sh):
    assert sh("echo 'single $HOME' \"double $NAME\" plain")[0] == "single $HOME double  plain\n"
    sh("NAME=world")
    assert sh('echo "hello $NAME" ${NAME}!')[0] == "hello world world!\n"
    assert sh("false && echo no || echo yes; echo $?")[0] == "yes\n0\n"
    assert sh("echo a # a comment")[0] == "a\n"
    out, err, status = sh("nosuchcommand")
    assert status == 127 and "command not found" in err
    assert sh("echo one\\ word")[0] == "one word\n"
    assert sh('echo "a|b" \'c;d\'')[0] == "a|b c;d\n"


def test_globs_and_quoted_wildcards(sh):
    for n in ("a.txt", "b.txt", "c.md"):
        write(n, n)
    assert sh("echo *.txt")[0] == "a.txt b.txt\n"
    assert sh("echo '*.txt'")[0] == "*.txt\n"
    assert sh("echo *.none")[0] == "*.none\n"


def test_pipes_and_redirections(sh):
    write("in.txt", "banana\napple\ncherry\napple\n")
    assert sh("cat in.txt | sort | uniq -c | sort -rn | head -1")[0].split() == ["2", "apple"]
    sh("sort < in.txt > sorted.txt")
    assert read("sorted.txt") == "apple\napple\nbanana\ncherry\n"
    sh("echo more >> sorted.txt")
    assert read("sorted.txt").endswith("cherry\nmore\n")
    sh("ls missing 2> err.txt")
    assert "No such file" in read("err.txt")
    out, _, _ = sh("ls missing 2>&1 | wc -l")
    assert out.strip() == "1"


def test_files_commands(sh, tmp_path):
    sh("mkdir -p a/b/c && touch a/b/c/x.txt a/y.txt")
    assert sh("find a -type f")[0].split() == ["a/y.txt", "a/b/c/x.txt"] or sorted(sh("find a -type f")[0].split()) == ["a/b/c/x.txt", "a/y.txt"]
    assert sh("find . -name '*.txt' -maxdepth 2")[0].split() == ["./a/y.txt"]
    write("f.txt", "hello\n")
    sh("cp f.txt g.txt && mv g.txt a/ && cp -r a acopy")
    assert read("acopy/g.txt") == "hello\n" and read("a/g.txt") == "hello\n"
    out, err, status = sh("rm acopy")
    assert status == 1 and "rm -r" in err
    sh("rm -r acopy && rmdir a/b/c && rm a/b/c/x.txt")
    assert not os.path.exists("acopy")
    sh("cd a && pwd")
    assert sh("pwd")[0].strip() == str(tmp_path / "a")
    assert "y.txt" in sh("ls")[0]
    sh("cd ..")
    assert sh("ls -l f.txt")[0].startswith("-rw")
    assert sh("du -s .")[1] == ""


def test_text_commands(sh):
    write("data.csv", "name,city,age\nanna,wien,31\nbernd,graz,45\nclara,wien,28\n")
    assert sh("head -n 2 data.csv")[0] == "name,city,age\nanna,wien,31\n"
    assert sh("tail -2 data.csv")[0] == "bernd,graz,45\nclara,wien,28\n"
    assert sh("tail -n +2 data.csv | wc -l")[0].strip() == "3"
    assert sh("grep -c wien data.csv")[0] == "2\n"
    assert sh("grep -in '^B' data.csv")[0] == "3:bernd,graz,45\n"
    assert sh("grep -v wien data.csv | cut -d, -f1")[0] == "name\nbernd\n"
    assert sh("cut -c1-3 data.csv | head -1")[0] == "nam\n"
    assert sh("tail -n +2 data.csv | sort -t, -k3 -n | cut -d, -f1 | tr a-z A-Z")[0] == "CLARA\nANNA\nBERND\n"
    assert sh("echo hello | tr -d l")[0] == "heo\n"
    assert sh("wc -w data.csv")[0].split()[0] == "4"
    out, _, status = sh("grep nobody data.csv")
    assert status == 1 and out == ""


def test_sed_subset(sh):
    write("t.txt", "one\ntwo\nthree\nfour\nfive\n")
    assert sh("sed 's/o/0/g' t.txt")[0] == "0ne\ntw0\nthree\nf0ur\nfive\n"
    assert sh("sed -n '2,3p' t.txt")[0] == "two\nthree\n"
    assert sh("sed '/^t/d' t.txt")[0] == "one\nfour\nfive\n"
    assert sh("sed -n '/two/,/four/p' t.txt")[0] == "two\nthree\nfour\n"
    assert sh("sed '$d' t.txt | tail -1")[0] == "four\n"
    assert sh("sed -E 's/(o)(n)/\\2\\1/' t.txt | head -1")[0] == "noe\n"
    assert sh("sed 's/e/E/2' t.txt | sed -n 3p")[0] == "threE\n"
    sh("sed -i 's/five/5/' t.txt")
    assert read("t.txt").endswith("5\n")


def test_diff(sh):
    write("a.txt", "one\ntwo\nthree\n")
    write("b.txt", "one\n2\nthree\n")
    out, _, status = sh("diff -u a.txt b.txt")
    assert status == 1 and "-two" in out and "+2" in out
    assert sh("diff a.txt a.txt")[2] == 0
    assert sh("diff a.txt b.txt")[0].startswith("2c2")


def test_archives(sh):
    write("dir/one.txt", "1")
    write("dir/two.txt", "2")
    sh("tar -czf out.tgz dir && zip -r out.zip dir")
    with tarfile.open("out.tgz") as t:
        assert sorted(t.getnames()) == ["dir", "dir/one.txt", "dir/two.txt"]
    with zipfile.ZipFile("out.zip") as z:
        assert sorted(z.namelist()) == ["dir/one.txt", "dir/two.txt"]
    sh("mkdir x y && tar -xzf out.tgz -C x && unzip -q out.zip -d y")
    assert read("x/dir/two.txt") == "2" and read("y/dir/one.txt") == "1"
    assert "dir/two.txt" in sh("tar -tzf out.tgz")[0]
    assert "dir/one.txt" in sh("unzip -l out.zip")[0]


def test_scripts_python_and_history(sh):
    write("hello.py", "import sys\nprint('hi', sys.argv[1:])\nprint(input())\n")
    assert sh("echo from-stdin | python hello.py a b")[0] == "hi ['a', 'b']\nfrom-stdin\n"
    assert sh("python -c 'print(6 * 7)'")[0] == "42\n"
    write("build.sh", "#!/bin/sh\n# a script\nNAME=$1\nmkdir -p out\necho \"hello $NAME\" > out/greeting.txt\ncat out/greeting.txt | tr a-z A-Z\n")
    assert sh("sh build.sh anna")[0] == "HELLO ANNA\n"
    assert sh("./build.sh bernd")[0] == "HELLO BERND\n"
    write("fail.sh", "set -e\nfalse\necho not reached\n")
    out, _, status = sh("sh fail.sh")
    assert status == 1 and out == ""
    sh.shell.history.extend(["echo first", "echo second"])
    assert sh("!1")[0] == "echo first\nfirst\n"
    assert "echo second" in sh("history")[0]


def test_completion(sh):
    write("report-2026.txt", "")
    os.mkdir("reports")
    word, candidates = sh.shell.complete("cat rep")
    assert word == "rep" and set(candidates) == {"report-2026.txt ", "reports/"}
    word, candidates = sh.shell.complete("gr")
    assert "grep " in candidates
    assert sh.shell.complete("ls reports/")[1] == []


@pytest.mark.parametrize("lang,report,backup", [("en", "report.sh", "backup.sh"), ("de", "bericht.sh", "sicherung.sh")])
def test_example_scripts(sh, lang, report, backup):
    for name in (report, backup):
        write(name, (ROOT / "examples" / lang / "notebook" / name).read_text(encoding="utf-8"))
    out, err, status = sh(f"sh {report}")
    assert status == 0 and err == "", err
    lines = out.splitlines()
    assert "20" in lines[1] and lines[6] == "2" and lines[-1].isupper()
    folder = "report" if lang == "en" else "bericht"
    out, err, status = sh(f"sh {backup} {folder}")
    assert status == 0 and err == "", err
    assert os.path.exists(f"{folder}-{'backup' if lang == 'en' else 'sicherung'}.tgz")
